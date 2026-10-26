import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { BrandClient } from "../server/brand-client.ts";
import { GroupManager } from "../server/groups.ts";
import { readConfig } from "../server/config.ts";
test("local API serves the brand and no longer exposes service endpoints", async () => {
  const config = readConfig({});
  const server = createApp(
    new BrandClient(config),
    new GroupManager(config),
  ).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  try {
    const brand = await fetch(`${base}/api/brand?brandId=18619889`);
    assert.equal(brand.status, 200);
    assert.equal(((await brand.json()) as any).brand.id, 18619889);
    assert.equal((await fetch(`${base}/api/services`)).status, 404);
    assert.equal(
      (await fetch(`${base}/api/groups/execute`, { method: "POST" })).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/api/execute`, { method: "POST" })).status,
      405,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
