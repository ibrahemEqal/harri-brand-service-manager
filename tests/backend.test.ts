import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CatalogClient,
  CATALOG_URL,
  type ContextFactory,
} from "../server/catalog.ts";
import { readConfig } from "../server/config.ts";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/services.json", import.meta.url), "utf8"),
);
const config = readConfig({
  HARRI_MODE: "live",
  HARRI_ALLOW_REAL_REQUESTS: "true",
  HARRI_AUTH_HEADER_NAME: "X-Approved-Session",
  HARRI_AUTH_HEADER_VALUE: "test-secret",
});
test("mock mode works immediately and never constructs a Playwright context", async () => {
  const client = new CatalogClient(readConfig({}), async () => {
    throw new Error("External request attempted");
  });
  const result = await client.load();
  assert.equal(result.services.length, 166);
  assert.equal(result.mode, "mock");
  assert.equal(result.scope, "global");
});
test("live mode requires explicit opt-in and configurable auth; invalid config fails closed", () => {
  for (const env of [
    { HARRI_MODE: "invalid" },
    { HARRI_MODE: "live" },
    { HARRI_MODE: "live", HARRI_ALLOW_REAL_REQUESTS: "true" },
    {
      ...{
        HARRI_MODE: "live",
        HARRI_ALLOW_REAL_REQUESTS: "true",
        HARRI_AUTH_HEADER_VALUE: "x",
      },
      HARRI_AUTH_HEADER_NAME: "Host",
    },
    { HARRI_MODE: "mock", PORT: "0" },
  ])
    assert.throws(() => readConfig(env));
  assert.deepEqual(config.headers, { "X-Approved-Session": "test-secret" });
  assert.throws(() =>
    readConfig({
      HARRI_MODE: "live",
      HARRI_ALLOW_REAL_REQUESTS: "true",
      HARRI_AUTH_HEADER_NAME: "Authorization",
      HARRI_AUTH_HEADER_VALUE: "abc\r\nx",
    }),
  );
});
test("live adapter performs exactly one GET to confirmed endpoint and disposes context", async () => {
  let calls = 0,
    disposed = false;
  const factory: ContextFactory = async (options) => {
    assert.equal(options.timeout, 15000);
    assert.equal(options.ignoreHTTPSErrors, false);
    assert.deepEqual(options.extraHTTPHeaders, config.headers);
    return {
      get: async (url, opts) => {
        calls++;
        assert.equal(url, CATALOG_URL);
        assert.deepEqual(opts, { maxRedirects: 0 });
        return { ok: () => true, status: () => 200, json: async () => fixture };
      },
      dispose: async () => {
        disposed = true;
      },
    };
  };
  const result = await new CatalogClient(config, factory).load();
  assert.equal(calls, 1);
  assert.ok(disposed);
  assert.equal(result.mode, "live");
  assert.equal(result.services.length, 166);
  assert.ok(!JSON.stringify(result).includes("test-secret"));
});
for (const [status, code] of [
  [401, "AUTHENTICATION_ERROR"],
  [403, "ACCESS_DENIED"],
  [302, "AUTHENTICATION_ERROR"],
  [429, "UPSTREAM_ERROR"],
  [500, "UPSTREAM_ERROR"],
] as const) {
  test(`upstream HTTP ${status} maps to ${code}, without exposing body or headers`, async () => {
    let disposed = false;
    const client = new CatalogClient(config, async () => ({
      get: async () => ({
        ok: () => false,
        status: () => status,
        json: async () => ({ token: "test-secret" }),
      }),
      dispose: async () => {
        disposed = true;
      },
    }));
    await assert.rejects(
      () => client.load(),
      (e: any) => e.code === code && !e.message.includes("test-secret"),
    );
    assert.ok(disposed);
  });
}
test("timeouts, non-JSON, and malformed response schemas are safely reported and cleaned up", async () => {
  for (const [get, code] of [
    [
      async () => {
        throw new Error("test-secret");
      },
      "REQUEST_FAILED",
    ],
    [
      async () => ({
        ok: () => true,
        status: () => 200,
        json: async () => {
          throw new Error("test-secret");
        },
      }),
      "INVALID_RESPONSE",
    ],
    [
      async () => ({
        ok: () => true,
        status: () => 200,
        json: async () => ({ data: {} }),
      }),
      "INVALID_RESPONSE",
    ],
  ] as const) {
    let disposed = false;
    const client = new CatalogClient(config, async () => ({
      get,
      dispose: async () => {
        disposed = true;
      },
    }));
    await assert.rejects(
      () => client.load(),
      (e: any) => e.code === code && !e.message.includes("test-secret"),
    );
    assert.ok(disposed);
  }
});
test("unapproved live client cannot construct a network context even if instantiated directly", async () => {
  const client = new CatalogClient({ ...config, approved: false }, async () => {
    throw new Error("should not run");
  });
  await assert.rejects(
    () => client.load(),
    (e: any) => e.code === "LIVE_DISABLED",
  );
});
