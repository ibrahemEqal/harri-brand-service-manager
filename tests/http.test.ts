import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { CatalogClient, ApiError } from "../server/catalog.ts";
import { readConfig } from "../server/config.ts";
async function serve(
  client: Parameters<typeof createApp>[0],
  run: (base: string) => Promise<void>,
) {
  const server = createApp(client).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}
test("HTTP integration returns full catalog and rejects every write method, including old activation paths", async () => {
  await serve(new CatalogClient(readConfig({})), async (base) => {
    const response = await fetch(`${base}/api/services`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.services.length, 166);
    assert.equal(body.scope, "global");
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
      for (const path of ["/api/services", "/api/execute", "/api/preview"]) {
        const res = await fetch(`${base}${path}`, { method });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get("allow"), "GET, HEAD");
      }
    assert.equal((await fetch(`${base}/api/brand?brandId=abc`)).status, 400);
    const brand = await fetch(`${base}/api/brand?brandId=18619752`);
    assert.equal(brand.status, 404);
    assert.equal(((await brand.json()) as any).code, "MOCK_BRAND_NOT_FOUND");
    const found = await fetch(`${base}/api/brand?brandId=18619889`);
    assert.equal(found.status, 200);
    assert.equal(((await found.json()) as any).brand.name, "sds");
    const denied = await fetch(`${base}/api/services`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(denied.status, 403);
  });
});
test("status, HEAD and missing routes do not call upstream", async () => {
  let calls = 0;
  const loadBrand = async () => {
    throw new ApiError(404, "BRAND_NOT_FOUND", "Missing test Brand");
  };
  await serve(
    {
      mode: "live",
      loadBrand,
      load: async () => {
        calls++;
        throw new ApiError(
          401,
          "AUTHENTICATION_ERROR",
          "Configure server session.",
        );
      },
    },
    async (base) => {
      const status = (await (await fetch(`${base}/api/status`)).json()) as any;
      assert.equal(status.capabilities.brandLookup, true);
      await fetch(`${base}/api/services`, { method: "HEAD" });
      await fetch(`${base}/api/nope`);
      await fetch(`${base}/api/brand?brandId=1`);
      assert.equal(calls, 0);
      const res = await fetch(`${base}/api/services`);
      assert.equal(res.status, 401);
      assert.equal(((await res.json()) as any).code, "AUTHENTICATION_ERROR");
      assert.equal(calls, 1);
    },
  );
});
