import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadRuntimeConfig,
  safeAuthSummary,
} from "../server/runtime-config.ts";
import { BrandClient } from "../server/brand-client.ts";
import { readConfig } from "../server/config.ts";
test("project .env overrides stale inherited tool settings, without exposing credential values", () => {
  const dir = mkdtempSync(join(tmpdir(), "harri-config-"));
  try {
    const file = join(dir, ".env");
    writeFileSync(
      file,
      'HARRI_MODE=live\nHARRI_ALLOW_REAL_REQUESTS=true\nHARRI_AUTH_HEADER_NAME=Authorization\nHARRI_AUTH_HEADER_VALUE="Bearer local-test-secret"\nHARRI_COOKIE="session=cookie-test-secret"\nPATH=ignored\n',
    );
    const loaded = loadRuntimeConfig(
      { HARRI_MODE: "mock", HARRI_AUTH_HEADER_VALUE: "stale" },
      pathToFileURL(file),
    );
    assert.equal(loaded.config.mode, "live");
    assert.equal(loaded.source, "project .env");
    assert.equal(
      loaded.config.headers.Authorization,
      "Bearer local-test-secret",
    );
    const summary = safeAuthSummary(loaded.config);
    assert.deepEqual(summary, {
      headerName: "Authorization",
      cookieConfigured: true,
      bearerFormatValid: true,
    });
    assert.ok(!JSON.stringify(summary).includes("secret"));
    const fallback = loadRuntimeConfig(
      {},
      pathToFileURL(join(dir, "missing.env")),
    );
    assert.equal(fallback.config.mode, "mock");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("duplicate Cookie sources fail explicitly instead of silently replacing a value", () => {
  assert.throws(
    () =>
      readConfig({
        HARRI_MODE: "live",
        HARRI_ALLOW_REAL_REQUESTS: "true",
        HARRI_AUTH_HEADER_NAME: "cookie",
        HARRI_AUTH_HEADER_VALUE: "one",
        HARRI_COOKIE: "two",
      }),
    /configured twice/,
  );
});
test("401 and redirects expose exact status while hiding all response/header content", async () => {
  const config = readConfig({
    HARRI_MODE: "live",
    HARRI_ALLOW_REAL_REQUESTS: "true",
    HARRI_AUTH_HEADER_NAME: "Authorization",
    HARRI_AUTH_HEADER_VALUE: "Bearer test-secret",
  });
  for (const [status, code] of [
    [401, "AUTHENTICATION_ERROR"],
    [301, "UPSTREAM_REDIRECT"],
    [302, "UPSTREAM_REDIRECT"],
    [307, "UPSTREAM_REDIRECT"],
  ] as const) {
    const client = new BrandClient(config, async () => ({
      get: async () => ({
        ok: () => false,
        status: () => status,
        json: async () => {
          throw new Error("Should not inspect body");
        },
      }),
      dispose: async () => {},
    }));
    await assert.rejects(
      () => client.loadBrand("18619811"),
      (e: any) =>
        e.code === code &&
        e.message.includes(`HTTP ${status}`) &&
        !e.message.includes("test-secret"),
    );
  }
});
