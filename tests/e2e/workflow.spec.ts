import { test, expect } from "@playwright/test";
test("readable Brand overview and searchable dropdown replace the full catalog grid", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Unexpected external request");
    if (url.pathname.startsWith("/api/"))
      methods.push(route.request().method());
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("Brand ID", { exact: true }).fill("18619889");
  await page.getByRole("button", { name: "Load Services" }).click();
  await expect(
    page.getByRole("heading", { name: "sds", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: "Search and select a service",
  });
  await trigger.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(166);
  const search = page.getByRole("combobox", { name: "Search services" });
  expect(
    await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await search.fill("HARRI_AI_SUMMARY");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Group 5", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill("");
  await page.getByLabel("Platform", { exact: true }).selectOption("TEAM");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(64);
  await page
    .getByLabel("Service mode", { exact: true })
    .selectOption("STANDARD");
  await page.getByLabel("Sort services").selectOption("desc");
  await search.fill("no-such-service-xyz");
  await expect(
    page.getByText("No matching services. Try another search or filter."),
  ).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(methods.every((method) => method === "GET")).toBe(true);
});
test("unknown mock Brand does not fake a lookup and global services stay in dropdown", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brand ID", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Load Services" }).click();
  await expect(page.getByRole("alert")).toContainText("Brand lookup failed");
  await expect(
    page.getByRole("heading", { name: "sds", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Search and select a service" }),
  ).toBeVisible();
});
for (const state of ["empty", "auth", "failure"] as const)
  test(`catalog ${state} state is explicit`, async ({ page }) => {
    await page.route("**/api/services", async (route) => {
      if (state === "empty")
        await route.fulfill({
          json: {
            mode: "mock",
            scope: "global",
            source: "attached-fixture",
            fetchedAt: new Date().toISOString(),
            services: [],
          },
        });
      else
        await route.fulfill({
          status: state === "auth" ? 401 : 502,
          json: {
            code: state === "auth" ? "AUTHENTICATION_ERROR" : "REQUEST_FAILED",
            error: "Test error: configure server session or connectivity.",
          },
        });
    });
    await page.goto("/");
    await page.getByLabel("Brand ID", { exact: true }).fill("18619889");
    await page.getByRole("button", { name: "Load Services" }).click();
    await expect(
      page.getByRole("heading", {
        name:
          state === "empty"
            ? "The catalog is empty"
            : state === "auth"
              ? "Authentication required"
              : "Unable to load the catalog",
      }),
    ).toBeVisible();
  });
