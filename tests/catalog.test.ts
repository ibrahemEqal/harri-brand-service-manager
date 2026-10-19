import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCatalog,
  filterServices,
  hasRelationships,
} from "../shared/catalog.ts";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/services.json", import.meta.url), "utf8"),
);
const services = parseCatalog(fixture);
const filters = { query: "", platform: "", mode: "", sort: "asc" as const };
test("parses all 166 attached services without losing confirmed nested data", () => {
  assert.equal(services.length, 166);
  assert.deepEqual(services, fixture.data.services);
  assert.equal(services.filter((s) => s.platform === "HARRI").length, 102);
  assert.equal(services.filter((s) => s.platform === "TEAM").length, 64);
  assert.ok(services.some((s) => s.description === null));
  assert.ok(services.some((s) => s.prerequisite_groups.length > 1));
});
test("rejects malformed top level, null arrays, invalid nested references and duplicate identities", () => {
  for (const input of [null, {}, { data: [] }, { data: { services: null } }])
    assert.throws(() => parseCatalog(input));
  for (const change of [
    (s: any) => (s.prerequisites = null),
    (s: any) => (s.mode = 42),
    (s: any) => (s.description = {}),
    (s: any) =>
      (s.mutual_exclusives = [{ mutual_exclusive_service: { id: 2 } }]),
    (s: any) =>
      (s.prerequisite_groups = [
        { prerequisite_group_services: [{ service: {} }] },
      ]),
  ]) {
    const value = structuredClone(fixture);
    change(value.data.services[0]);
    assert.throws(() => parseCatalog(value));
  }
  assert.throws(() =>
    parseCatalog({ data: { services: [services[0], services[0]] } }),
  );
});
test("accepts an empty catalog and future non-empty platform/mode strings", () => {
  assert.deepEqual(parseCatalog({ data: { services: [] } }), []);
  const value = structuredClone(fixture);
  value.data.services[0].platform = "FUTURE";
  value.data.services[0].mode = "FUTURE_MODE";
  assert.equal(parseCatalog(value)[0].platform, "FUTURE");
});
test("search covers names, codes, descriptions, whitespace and case; null descriptions are safe", () => {
  const pos = filterServices(services, { ...filters, query: " pos " });
  assert.ok(pos.some((s) => s.code === "POS"));
  const atr = services.find((s) => s.code === "ATR")!;
  assert.ok(
    filterServices(services, {
      ...filters,
      query: atr.description!.slice(0, 30).toUpperCase(),
    }).some((s) => s.id === atr.id),
  );
  assert.equal(
    filterServices(services, {
      ...filters,
      query: "not-a-real-service-code-xyz",
    }).length,
    0,
  );
});
test("platform and mode filters intersect with search; sorting does not mutate input", () => {
  const ids = services.map((s) => s.id);
  const subset = filterServices(services, {
    ...filters,
    platform: "TEAM",
    mode: "HIGHEST_LEVEL_ONLY",
  });
  assert.ok(subset.length > 1);
  assert.ok(
    subset.every(
      (s) => s.platform === "TEAM" && s.mode === "HIGHEST_LEVEL_ONLY",
    ),
  );
  const asc = filterServices(services, filters),
    desc = filterServices(services, { ...filters, sort: "desc" });
  assert.deepEqual(
    desc.map((s) => s.id),
    asc.map((s) => s.id).reverse(),
  );
  assert.deepEqual(
    services.map((s) => s.id),
    ids,
  );
  assert.equal(
    filterServices(services, { ...filters, platform: "MISSING" }).length,
    0,
  );
});
test("relationship classification includes groups, exclusions and dependencies", () => {
  assert.equal(hasRelationships(services[0]), false);
  for (const key of [
    "prerequisites",
    "mutual_exclusives",
    "implicit_dependencies",
    "prerequisite_groups",
  ] as const)
    assert.equal(hasRelationships(services.find((s) => s[key].length)!), true);
});
