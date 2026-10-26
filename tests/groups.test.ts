import { test } from "node:test";
import assert from "node:assert/strict";
import { GroupManager, type GroupContextFactory } from "../server/groups.ts";
import { BrandClient } from "../server/brand-client.ts";
import { readConfig } from "../server/config.ts";
import { createApp } from "../server/app.ts";
const makeLive = (extra: Record<string, string> = {}) =>
  readConfig({
    HARRI_MODE: "live",
    HARRI_ALLOW_REAL_REQUESTS: "true",
    HARRI_AUTH_HEADER_NAME: "Authorization",
    HARRI_AUTH_HEADER_VALUE: "Bearer test-only",
    HARRI_ALLOW_GROUP_CREATION: "true",
    HARRI_GROUP_ALLOWED_BRAND_ID: "18606124",
    ...extra,
  });
test("mock preview reproduces observed values with no locations and requires explicit confirmation", async () => {
  let calls = 0;
  const manager = new GroupManager(readConfig({}), async () => {
    calls++;
    throw new Error("unexpected external call");
  });
  const plan = manager.preview("18619889");
  assert.match(plan.payload.name, /^Auto Group /);
  assert.deepEqual(plan.payload.brands, []);
  assert.deepEqual(plan.payload.settings.business_day, {
    open_time: 28800,
    close_time: 72000,
    close_time_extension: 3600,
  });
  assert.equal(plan.payload.settings.auto_assign.length, 15);
  assert.deepEqual(plan.payload.settings.employee_payment_types, [
    {
      type: "SALARIED",
      track_mode: "HOURLY",
      cross_location_edit_mode: "NONE",
    },
  ]);
  await assert.rejects(() => manager.execute(plan.id, "18619889", false));
  await assert.rejects(() => manager.execute(plan.id, "1", true));
  const report = await manager.execute(plan.id, "18619889", true);
  assert.equal(report.status, "mock_success");
  assert.equal(calls, 0);
  assert.deepEqual(await manager.execute(plan.id, "18619889", true), report);
});
test("live group creation requires separate opt-in and exact approved Brand ID", async () => {
  const disabled = new GroupManager(
    makeLive({ HARRI_ALLOW_GROUP_CREATION: "false" }),
    async () => {
      throw new Error("must not call");
    },
  );
  const disabledPlan = disabled.preview("18606124");
  await assert.rejects(
    () => disabled.execute(disabledPlan.id, "18606124", true),
    /disabled/,
  );
  const enabled = new GroupManager(makeLive(), async () => {
    throw new Error("must not call");
  });
  assert.throws(() => enabled.preview("18619889"), /not the configured/);
  assert.throws(
    () =>
      readConfig({
        HARRI_MODE: "live",
        HARRI_ALLOW_REAL_REQUESTS: "true",
        HARRI_AUTH_HEADER_NAME: "Authorization",
        HARRI_AUTH_HEADER_VALUE: "Bearer x",
        HARRI_ALLOW_GROUP_CREATION: "true",
      }),
    /BRAND_ID/,
  );
});
test("live transport posts confirmed payload once, checks acknowledgement and never asserts independent verification", async () => {
  let calls = 0,
    disposed = 0;
  const factory: GroupContextFactory = async (options) => {
    assert.equal(options.ignoreHTTPSErrors, false);
    assert.equal(options.timeout, 15000);
    assert.deepEqual(options.extraHTTPHeaders, {
      Authorization: "Bearer test-only",
    });
    return {
      post: async (url, opts) => {
        calls++;
        assert.equal(
          url,
          "https://gateway.harriprep.com/scheduling/api/v1/admin/brands/18606124/settings/groups",
        );
        assert.equal(opts.maxRedirects, 0);
        assert.deepEqual((opts.data as any).brands, []);
        return {
          ok: () => true,
          status: () => 200,
          json: async () => ({
            data: "Success",
            status: "SUCCESS",
            status_code: 200,
          }),
        };
      },
      dispose: async () => {
        disposed++;
      },
    };
  };
  const manager = new GroupManager(makeLive(), factory);
  const plan = manager.preview("18606124");
  const report = await manager.execute(plan.id, "18606124", true);
  assert.equal(report.status, "acknowledged");
  assert.equal(report.verification, "not_supported");
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
  assert.deepEqual(await manager.execute(plan.id, "18606124", true), report);
  assert.equal(calls, 1);
  const second = manager.preview("18606124");
  assert.notEqual(second.payload.name, plan.payload.name);
});
test("timeouts and malformed success are uncertain and not automatically retried", async () => {
  for (const post of [
    async () => {
      throw new Error("secret");
    },
    async () => ({
      ok: () => true,
      status: () => 200,
      json: async () => ({ unexpected: true }),
    }),
  ]) {
    let calls = 0;
    const manager = new GroupManager(makeLive(), async () => ({
      post: async () => {
        calls++;
        return post();
      },
      dispose: async () => {},
    }));
    const plan = manager.preview("18606124");
    const report = await manager.execute(plan.id, "18606124", true);
    assert.equal(report.status, "uncertain");
    assert.ok(!JSON.stringify(report).includes("secret"));
    assert.deepEqual(await manager.execute(plan.id, "18606124", true), report);
    assert.equal(calls, 1);
  }
});
test("concurrent execution of one preview cannot post twice", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const manager = new GroupManager(makeLive(), async () => ({
    post: async () => {
      calls++;
      await gate;
      return {
        ok: () => true,
        status: () => 200,
        json: async () => ({
          data: "Success",
          status: "SUCCESS",
          status_code: 200,
        }),
      };
    },
    dispose: async () => {},
  }));
  const p1 = manager.preview("18606124"),
    p2 = p1;
  const first = manager.execute(p1.id, "18606124", true);
  await assert.rejects(() => manager.execute(p2.id, "18606124", true));
  release();
  await first;
  assert.equal(calls, 1);
});
test("expired previews are rejected without requests", async () => {
  let now = 0;
  const manager = new GroupManager(
    readConfig({}),
    async () => {
      throw new Error("unexpected");
    },
    () => now,
  );
  const p = manager.preview("1");
  now = 300001;
  await assert.rejects(() => manager.execute(p.id, "1", true));
});
test("local Group endpoints enforce Origin and reject all other write routes", async () => {
  const config = readConfig({});
  const app = createApp(new BrandClient(config), new GroupManager(config));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  try {
    const headers = {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    };
    assert.equal(
      (
        await fetch(`${base}/api/groups/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/groups/preview`, {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: "{}",
        })
      ).status,
      403,
    );
    const result = await fetch(`${base}/api/groups/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ brandId: "18619889" }),
    });
    assert.equal(result.status, 200);
    const plan = (await result.json()) as { id: string };
    const execute = await fetch(`${base}/api/groups/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        previewId: plan.id,
        confirmation: "18619889",
        acknowledgeNoLocations: true,
      }),
    });
    assert.equal(execute.status, 200);
    assert.equal(((await execute.json()) as any).status, "mock_success");
    assert.equal(
      (
        await fetch(`${base}/api/execute`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      405,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("edited fields are bound to the preview and the confirmed POST uses exactly that snapshot", async () => {
  let sent: any;
  const manager = new GroupManager(makeLive(), async () => ({
    post: async (_url, options) => {
      sent = options.data;
      return {
        ok: () => true,
        status: () => 200,
        json: async () => ({
          data: "Success",
          status: "SUCCESS",
          status_code: 200,
        }),
      };
    },
    dispose: async () => {},
  }));
  const initial = manager.preview("18606124");
  const edited: any = structuredClone(initial.payload);
  edited.name = "Edited QA Group";
  edited.settings.country_code = "ES";
  edited.settings.time_zone_name = "Europe/Madrid";
  edited.settings.business_day.open_time = 32400;
  edited.settings.auto_assign[0].value = false;
  const plan = manager.preview("18606124", edited);
  edited.name = "Changed after preview";
  edited.settings.auto_assign[0].value = true;
  const report = await manager.execute(plan.id, "18606124", true);
  assert.equal(report.status, "acknowledged");
  assert.equal(sent.name, "Edited QA Group");
  assert.equal(sent.settings.country_code, "ES");
  assert.equal(sent.settings.business_day.open_time, 32400);
  assert.equal(sent.settings.auto_assign[0].value, false);
  assert.deepEqual(sent.brands, []);
});
test("invalid edited data and unconfirmed non-empty locations cannot trigger a Harri request", async () => {
  let calls = 0;
  const manager = new GroupManager(makeLive(), async () => {
    calls++;
    throw new Error("unexpected");
  });
  const original = manager.preview("18606124").payload;
  const withLocations: any = structuredClone(original);
  withLocations.brands = [{ id: 123 }];
  assert.throws(
    () => manager.preview("18606124", withLocations),
    (e: any) => e.code === "LOCATIONS_UNAVAILABLE",
  );
  const missing: any = structuredClone(original);
  delete missing.settings.business_day.open_time;
  assert.throws(() => manager.preview("18606124", missing));
  const extra: any = structuredClone(original);
  extra.settings.unconfirmed = true;
  assert.throws(() => manager.preview("18606124", extra));
  const invalidTime: any = structuredClone(original);
  invalidTime.settings.business_day.open_time = 90000;
  assert.throws(() => manager.preview("18606124", invalidTime));
  assert.equal(calls, 0);
});
