import type { OperatingMode } from "./catalog.ts";
export interface Brand {
  id: number;
  name: string;
  type: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  slug?: string | null;
  created?: string | null;
  updated?: string | null;
  url?: string | null;
  group_id?: number | null;
  is_archived?: boolean;
  currency?: { id: number; name: string; code: string } | null;
  general_settings?: {
    start_day_of_week?: number | string | null;
    is_billable?: boolean;
    time_zone?: { id: number; name: string } | null;
  } | null;
  hecs?: { id: number; name: string; code: string }[];
}
export interface BrandResponse {
  mode: OperatingMode;
  source: "provided-fixture" | "harri-prep";
  fetchedAt: string;
  brand: Brand;
}
export class BrandValidationError extends Error {}
function fail(): never {
  throw new BrandValidationError(
    "Brand response does not match the confirmed contract or requested ID.",
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) fail();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail();
  return value;
}
export function parseBrand(response: unknown, requestedId: string): Brand {
  const root = object(response);
  const value = "data" in root ? object(root.data) : root;
  const id = integer(value.id);
  if (String(id) !== requestedId) fail();
  const brand: Brand = {
    id,
    name: text(value.name),
    type: text(value.type),
    status: text(value.status),
  };
  const keys = [
    "email",
    "phone",
    "description",
    "slug",
    "created",
    "updated",
    "url",
  ] as const;
  for (const key of keys)
    if (key in value) {
      if (value[key] !== null && typeof value[key] !== "string") fail();
      brand[key] = value[key] as string | null;
    }
  if ("group_id" in value)
    brand.group_id = value.group_id === null ? null : integer(value.group_id);
  if ("is_archived" in value) {
    if (typeof value.is_archived !== "boolean") fail();
    brand.is_archived = value.is_archived;
  }
  if ("currency" in value) {
    if (value.currency === null) brand.currency = null;
    else {
      const currency = object(value.currency);
      brand.currency = {
        id: integer(currency.id),
        name: text(currency.name),
        code: text(currency.code),
      };
    }
  }
  if ("general_settings" in value) {
    if (value.general_settings === null) brand.general_settings = null;
    else {
      const settings = object(value.general_settings);
      const output: NonNullable<Brand["general_settings"]> = {};
      if ("is_billable" in settings) {
        if (typeof settings.is_billable !== "boolean") fail();
        output.is_billable = settings.is_billable;
      }
      if ("start_day_of_week" in settings) {
        const day = settings.start_day_of_week;
        if (day !== null && typeof day !== "string" && typeof day !== "number")
          fail();
        output.start_day_of_week = day as number | string | null;
      }
      if ("time_zone" in settings) {
        if (settings.time_zone === null) output.time_zone = null;
        else {
          const zone = object(settings.time_zone);
          output.time_zone = { id: integer(zone.id), name: text(zone.name) };
        }
      }
      brand.general_settings = output;
    }
  }
  if ("hecs" in value) {
    if (!Array.isArray(value.hecs)) fail();
    brand.hecs = value.hecs.map((entry) => {
      const item = object(entry);
      return {
        id: integer(item.id),
        name: text(item.name),
        code: text(item.code),
      };
    });
  }
  // Return only validated display fields; never forward arbitrary upstream properties.
  return brand;
}
