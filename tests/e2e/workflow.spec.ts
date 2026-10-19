import { test, expect } from "@playwright/test";
test("functional Brand snapshot, complete catalog, filters and nested drawer stay read-only", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Unexpected external browser request");
    if (url.pathname.startsWith("/api/"))
      methods.push(route.request().method());
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("MOCK MODE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load Services" }),
  ).toBeDisabled();
  await page.getByLabel("Brand ID", { exact: true }).fill("18619889");
  await page.getByRole("button", { name: "Load Services" }).click();
  await expect(
    page.getByRole("heading", { name: "sds", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("MOCK SNAPSHOT — NOT LIVE")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^View .* details$/ }),
  ).toHaveCount(166);
  await page.getByLabel("Search services").fill("HARRI_AI_SUMMARY");
  await expect(
    page.getByRole("button", { name: "View Harri AI Summary details" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View Harri AI Summary details" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prerequisite groups" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Group 5", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search services").fill("");
  await page.getByLabel("Platform", { exact: true }).selectOption("TEAM");
  await expect(
    page.getByRole("button", { name: /^View .* details$/ }),
  ).toHaveCount(64);
  await page
    .getByLabel("Service mode", { exact: true })
    .selectOption("STANDARD");
  await page.getByLabel("Sort services").selectOption("desc");
  await page.getByLabel("Search services").fill("no-such-service-xyz");
  await expect(
    page.getByRole("heading", { name: "No matching services" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).last().click();
  await expect(
    page.getByRole("button", { name: /^View .* details$/ }),
  ).toHaveCount(166);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(methods.length).toBeGreaterThan(2);
  expect(methods.every((method) => method === "GET")).toBe(true);
});
test("unknown mock Brand does not fake a lookup; catalog remains global", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brand ID", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Load Services" }).click();
  await expect(page.getByRole("alert")).toContainText("Brand lookup failed");
  await expect(
    page.getByRole("heading", { name: "sds", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^View .* details$/ }),
  ).toHaveCount(166);
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
