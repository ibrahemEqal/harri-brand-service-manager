import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBrand } from "../shared/brand.ts";
import { BrandClient } from "../server/brand-client.ts";
import { readConfig } from "../server/config.ts";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/brand.json", import.meta.url), "utf8"),
);
const config = readConfig({
  HARRI_MODE: "live",
  HARRI_ALLOW_REAL_REQUESTS: "true",
  HARRI_AUTH_HEADER_NAME: "X-Approved-Auth",
  HARRI_AUTH_HEADER_VALUE: "unit-test-only-secret",
});
test("Brand parser accepts both supplied response wrappers and returns only validated display fields", () => {
  const wrapped = parseBrand(fixture, "18619889");
  assert.equal(wrapped.name, "sds");
  assert.equal(wrapped.general_settings?.time_zone?.name, "Europe/Berlin");
  assert.deepEqual(parseBrand(fixture.data, "18619889"), wrapped);
  assert.ok(
    !(
      "business_identifier" in
      parseBrand(
        {
          data: {
            ...fixture.data,
            business_identifier: "not-for-ui",
            token: "secret",
          },
        },
        "18619889",
      )
    ),
  );
});
test("Brand parser rejects ID mismatch, null/incorrect required fields and malformed nested data", () => {
  assert.throws(() => parseBrand(fixture, "18619752"));
  for (const value of [
    null,
    { data: null },
    { data: { ...fixture.data, id: "18619889" } },
    { data: { ...fixture.data, name: "" } },
    { data: { ...fixture.data, currency: { code: "USD" } } },
    {
      data: {
        ...fixture.data,
        general_settings: { time_zone: { name: "bad" } },
      },
    },
  ])
    assert.throws(() => parseBrand(value, "18619889"));
});
test("mock Brand IDs are functional: one supplied snapshot, unknown IDs return explicit mock 404", async () => {
  const client = new BrandClient(readConfig({}), async () => {
    throw new Error("No external calls");
  });
  const result = await client.loadBrand("18619889");
  assert.equal(result.brand.id, 18619889);
  assert.equal(result.mode, "mock");
  assert.equal(result.source, "provided-fixture");
  await assert.rejects(
    () => client.loadBrand("999"),
    (e: any) => e.code === "MOCK_BRAND_NOT_FOUND" && e.status === 404,
  );
  for (const id of ["../service", "0", "-1", "1/2", "9007199254740993"])
    await assert.rejects(
      () => client.loadBrand(id),
      (e: any) => e.status === 400,
    );
});
test("live Brand adapter uses exactly confirmed path and GET and validates requested ID", async () => {
  let calls = 0,
    disposed = 0;
  const client = new BrandClient(config, async () => ({
    get: async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://gateway.harriprep.com/account-management/api/v1/admin/brands/18619889",
      );
      assert.deepEqual(options, { maxRedirects: 0 });
      return { ok: () => true, status: () => 200, json: async () => fixture };
    },
    dispose: async () => {
      disposed++;
    },
  }));
  const result = await client.loadBrand("18619889");
  assert.equal(result.brand.name, "sds");
  assert.equal(result.mode, "live");
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
});
for (const [status, code] of [
  [401, "AUTHENTICATION_ERROR"],
  [403, "ACCESS_DENIED"],
  [404, "BRAND_NOT_FOUND"],
] as const) {
  test(`Brand HTTP ${status} is distinguished as ${code}`, async () => {
    const client = new BrandClient(config, async () => ({
      get: async () => ({
        ok: () => false,
        status: () => status,
        json: async () => ({ sensitive: "not-returned" }),
      }),
      dispose: async () => {},
    }));
    await assert.rejects(
      () => client.loadBrand("18619889"),
      (e: any) =>
        e.status === status &&
        e.code === code &&
        !e.message.includes("not-returned"),
    );
  });
}
test("live mismatched Brand data fails closed rather than displaying a different Brand", async () => {
  const client = new BrandClient(config, async () => ({
    get: async () => ({
      ok: () => true,
      status: () => 200,
      json: async () => fixture,
    }),
    dispose: async () => {},
  }));
  await assert.rejects(
    () => client.loadBrand("18619752"),
    (e: any) => e.code === "INVALID_BRAND_RESPONSE",
  );
});
