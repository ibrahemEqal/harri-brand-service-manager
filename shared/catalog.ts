/** Fields confirmed by the supplied Harri catalog response. */
export interface ServiceReference {
  id: number;
  name: string;
  code: string;
  platform: string;
  apply_to_children_mode: string;
}
export interface Service extends ServiceReference {
  mode: string;
  description: string | null;
  prerequisites: { prerequisite_service: ServiceReference }[];
  mutual_exclusives: { mutual_exclusive_service: ServiceReference }[];
  implicit_dependencies: { dependency_service: ServiceReference }[];
  prerequisite_groups: {
    prerequisite_group_services: { service: ServiceReference }[];
  }[];
}
export type OperatingMode = "mock" | "live";
export interface CatalogResponse {
  mode: OperatingMode;
  scope: "global";
  source: "attached-fixture" | "harri-prep" | "attached-fixture-fallback";
  warning?: string;
  fetchedAt: string;
  services: Service[];
}
export class CatalogValidationError extends Error {}
function invalid(path: string): never {
  throw new CatalogValidationError(`Invalid catalog response at ${path}.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path);
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(path);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}
function reference(value: unknown, path: string): ServiceReference {
  const item = object(value, path);
  if (
    typeof item.id !== "number" ||
    !Number.isSafeInteger(item.id) ||
    item.id < 1
  )
    invalid(`${path}.id`);
  return {
    id: item.id,
    name: string(item.name, `${path}.name`),
    code: string(item.code, `${path}.code`),
    platform: string(item.platform, `${path}.platform`),
    apply_to_children_mode: string(
      item.apply_to_children_mode,
      `${path}.apply_to_children_mode`,
    ),
  };
}
export function parseCatalog(body: unknown): Service[] {
  const root = object(body, "response");
  const data = object(root.data, "data");
  const seenIds = new Set<number>();
  const seenCodes = new Set<string>();
  return array(data.services, "data.services").map((value, index) => {
    const path = `data.services[${index}]`;
    const item = object(value, path);
    const ref = reference(item, path);
    if (seenIds.has(ref.id) || seenCodes.has(ref.code))
      invalid(`${path}.identity`);
    seenIds.add(ref.id);
    seenCodes.add(ref.code);
    if (item.description !== null && typeof item.description !== "string")
      invalid(`${path}.description`);
    return {
      ...ref,
      mode: string(item.mode, `${path}.mode`),
      description: item.description as string | null,
      prerequisites: array(item.prerequisites, `${path}.prerequisites`).map(
        (v, i) => ({
          prerequisite_service: reference(
            object(v, `${path}.prerequisites[${i}]`).prerequisite_service,
            `${path}.prerequisites[${i}].prerequisite_service`,
          ),
        }),
      ),
      mutual_exclusives: array(
        item.mutual_exclusives,
        `${path}.mutual_exclusives`,
      ).map((v, i) => ({
        mutual_exclusive_service: reference(
          object(v, `${path}.mutual_exclusives[${i}]`).mutual_exclusive_service,
          `${path}.mutual_exclusives[${i}].mutual_exclusive_service`,
        ),
      })),
      implicit_dependencies: array(
        item.implicit_dependencies,
        `${path}.implicit_dependencies`,
      ).map((v, i) => ({
        dependency_service: reference(
          object(v, `${path}.implicit_dependencies[${i}]`).dependency_service,
          `${path}.implicit_dependencies[${i}].dependency_service`,
        ),
      })),
      prerequisite_groups: array(
        item.prerequisite_groups,
        `${path}.prerequisite_groups`,
      ).map((v, i) => {
        const groupPath = `${path}.prerequisite_groups[${i}]`;
        const group = object(v, groupPath);
        return {
          prerequisite_group_services: array(
            group.prerequisite_group_services,
            `${groupPath}.prerequisite_group_services`,
          ).map((entry, j) => ({
            service: reference(
              object(entry, `${groupPath}[${j}]`).service,
              `${groupPath}[${j}].service`,
            ),
          })),
        };
      }),
    };
  });
}
export interface CatalogFilters {
  query: string;
  platform: string;
  mode: string;
  sort: "asc" | "desc";
}
export function filterServices(
  services: readonly Service[],
  filters: CatalogFilters,
): Service[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return services
    .filter(
      (service) =>
        (!query ||
          [service.name, service.code, service.description ?? ""].some(
            (value) => value.toLocaleLowerCase().includes(query),
          )) &&
        (!filters.platform || service.platform === filters.platform) &&
        (!filters.mode || service.mode === filters.mode),
    )
    .sort(
      (a, b) =>
        (a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
          a.code.localeCompare(b.code)) * (filters.sort === "desc" ? -1 : 1),
    );
}
export function hasRelationships(service: Service): boolean {
  return !!(
    service.prerequisites.length +
    service.mutual_exclusives.length +
    service.implicit_dependencies.length +
    service.prerequisite_groups.length
  );
}
