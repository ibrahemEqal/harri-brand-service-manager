import { test, expect } from "@playwright/test";
test("auto generate and simulate one-click export without Harri requests", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Unexpected external request");
    if (url.pathname.startsWith("/api/"))
      requests.push(`${route.request().method()} ${url.pathname}`);
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", {name: "Scheduling Group"}).click();
  await expect(page.getByText("MOCK MODE")).toBeVisible();
  await page.getByLabel("Brand ID").fill("18619889");
  await page.getByRole("button", { name: "Load Brand" }).click();
  await expect(page.getByRole("heading", { name: "sds" })).toBeVisible();
  await expect(page.getByLabel("Group name")).toHaveValue(/^Auto Group /);
  await page.getByLabel("Group name").fill("Edited Mock Group");
  await page.getByLabel("Country code").fill("ES");
  await expect(
    page.getByRole("button", { name: "Simulate Export" }),
  ).toBeVisible();
  expect(
    requests.filter((item) => item === "POST /api/groups/execute"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Simulate Export" }).click();
  await expect(page.getByText("Simulation complete")).toBeVisible();
  await expect(
    page.getByText("Simulated only. No Group was created in Harri."),
  ).toBeVisible();
  expect(
    requests.filter((item) => item === "POST /api/groups/execute"),
  ).toHaveLength(1);
  expect(requests.some((item) => item.includes("/api/services"))).toBe(false);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^group-18619889-.*\.json$/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid Brand never generates a group", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", {name: "Scheduling Group"}).click();
  await page.getByLabel("Brand ID").fill("999");
  await page.getByRole("button", { name: "Load Brand" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "mock snapshot contains only Brand",
  );
  await expect(
    page.getByRole("button", { name: "Simulate Export" }),
  ).toHaveCount(0);
});
