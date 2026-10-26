import { randomUUID } from "node:crypto";
import { request } from "playwright";
import { buildObservedPayload } from "../shared/group.ts";
import { validateBrandId } from "./brand.ts";
import { ApiError } from "./errors.ts";
import type { Config } from "./config.ts";

type HttpResponse = {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
};
type WriteContext = {
  post(
    url: string,
    options: { data: unknown; maxRedirects: number },
  ): Promise<HttpResponse>;
  dispose(): Promise<void>;
};
export type GroupContextFactory = (options: {
  extraHTTPHeaders: Record<string, string>;
  timeout: number;
  ignoreHTTPSErrors: boolean;
}) => Promise<WriteContext>;
type GroupReport = {
  brandId: string;
  name: string;
  mode: "mock" | "live";
  status: "mock_success" | "acknowledged" | "rejected" | "uncertain";
  message: string;
  verification: "mock_only" | "not_supported";
};
type Plan = {
  id: string;
  brandId: string;
  payload: ReturnType<typeof buildObservedPayload>;
  expiresAt: number;
  state: "pending" | "running" | "done";
  report?: GroupReport;
};
type Payload = ReturnType<typeof buildObservedPayload>;

/** Check the provided fields against the observed request shape; this is not a Harri business schema. */
function validateEditedPayload(value: unknown): Payload {
  const template = buildObservedPayload({
    name: "Example",
    countryCode: "US",
    timeZoneName: "Asia/Dubai",
    startDayOfWeek: "SAT",
    openTime: 28800,
    closeTime: 72000,
    closeTimeExtension: 3600,
  });
  function invalid(path: string): never {
    throw new ApiError(
      400,
      "INVALID_GROUP_DATA",
      `Invalid Group data at ${path}.`,
    );
  }
  function validate(
    actual: unknown,
    expected: unknown,
    path: string,
    depth: number,
  ): void {
    if (depth > 10) invalid(path);
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length > 50) invalid(path);
      if (path === "brands") {
        if (actual.length)
          throw new ApiError(
            400,
            "LOCATIONS_UNAVAILABLE",
            "The creation format for selected locations is not confirmed yet.",
          );
        return;
      }
      if (!expected.length) {
        if (actual.length) invalid(path);
        return;
      }
      actual.forEach((item, index) =>
        validate(item, expected[0], `${path}[${index}]`, depth + 1),
      );
      return;
    }
    if (expected && typeof expected === "object") {
      if (!actual || typeof actual !== "object" || Array.isArray(actual))
        invalid(path);
      const e = expected as Record<string, unknown>,
        a = actual as Record<string, unknown>;
      if (
        Object.keys(a).length !== Object.keys(e).length ||
        Object.keys(e).some((key) => !Object.hasOwn(a, key))
      )
        invalid(path);
      for (const key of Object.keys(e))
        validate(a[key], e[key], path ? `${path}.${key}` : key, depth + 1);
      return;
    }
    if (path.endsWith(".value") || expected === null) {
      if (
        actual !== null &&
        typeof actual !== "string" &&
        typeof actual !== "number" &&
        typeof actual !== "boolean"
      )
        invalid(path);
    } else if (typeof actual !== typeof expected) invalid(path);
    if (typeof actual === "string" && actual.length > 256) invalid(path);
    if (
      typeof actual === "number" &&
      (!Number.isFinite(actual) || Math.abs(actual) > 10000000)
    )
      invalid(path);
  }
  validate(value, template, "", 0);
  const payload = value as Payload;
  if (!payload.name.trim() || payload.name.trim().length > 120) invalid("name");
  const settings = payload.settings;
  if (!/^[A-Z]{2}$/.test(settings.country_code))
    invalid("settings.country_code");
  if (!settings.time_zone_name.trim()) invalid("settings.time_zone_name");
  if (
    !["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].includes(
      settings.start_day_of_week,
    )
  )
    invalid("settings.start_day_of_week");
  for (const [key, seconds] of Object.entries(settings.business_day)) {
    if (
      !Number.isSafeInteger(seconds) ||
      seconds < 0 ||
      seconds > (key === "close_time_extension" ? 86400 : 86399)
    )
      invalid(`settings.business_day.${key}`);
  }
  // Detach the plan from the caller; later edits cannot change an approved preview.
  return structuredClone({ ...payload, name: payload.name.trim() });
}
export class GroupManager {
  private plans = new Map<string, Plan>();
  private attemptedNames = new Map<string, "running" | "settled">();
  constructor(
    private config: Config,
    private factory: GroupContextFactory = (opts) => request.newContext(opts),
    private now = Date.now,
  ) {}
  get mode() {
    return this.config.mode;
  }
  get available() {
    return (
      this.mode === "mock" ||
      (this.config.approved &&
        this.config.groupWritesEnabled &&
        !!this.config.groupAllowedBrandId)
    );
  }
  preview(brand: unknown, edited?: unknown) {
    const brandId = validateBrandId(brand);
    if (
      this.mode === "live" &&
      this.config.groupAllowedBrandId &&
      brandId !== this.config.groupAllowedBrandId
    )
      throw new ApiError(
        403,
        "BRAND_NOT_ALLOWED",
        "This Brand is not the configured approved test Brand.",
      );
    const input = {
      name: `Auto Group ${randomUUID().slice(0, 12)}`,
      countryCode: "US",
      timeZoneName: "Asia/Dubai",
      startDayOfWeek: "SAT",
      openTime: 28800,
      closeTime: 72000,
      closeTimeExtension: 3600,
    };
    for (const [id, plan] of this.plans)
      if (plan.expiresAt < this.now() && plan.state !== "running")
        this.plans.delete(id);
    if (this.plans.size >= 500)
      throw new ApiError(
        429,
        "TOO_MANY_PREVIEWS",
        "Too many previews; try again later.",
      );
    const plan: Plan = {
      id: randomUUID(),
      brandId,
      payload:
        edited === undefined
          ? buildObservedPayload(input)
          : validateEditedPayload(edited),
      expiresAt: this.now() + 5 * 60 * 1000,
      state: "pending",
    };
    this.plans.set(plan.id, plan);
    return {
      id: plan.id,
      brandId,
      mode: this.mode,
      payload: plan.payload,
      expiresAt: plan.expiresAt,
      locations: "none",
      verification: "not_supported",
    };
  }
  async execute(
    id: unknown,
    brandConfirm: unknown,
    ackEmpty: unknown,
  ): Promise<GroupReport> {
    const plan = typeof id === "string" ? this.plans.get(id) : undefined;
    if (!plan)
      throw new ApiError(
        410,
        "PREVIEW_MISSING",
        "Preview unavailable. Create a new preview.",
      );
    if (brandConfirm !== plan.brandId || ackEmpty !== true)
      throw new ApiError(
        400,
        "CONFIRMATION_REQUIRED",
        "Confirm the Brand ID and that no locations are selected.",
      );
    if (plan.state === "done") return plan.report!;
    if (plan.state === "running")
      throw new ApiError(
        409,
        "ALREADY_RUNNING",
        "This preview is already being executed.",
      );
    if (plan.expiresAt < this.now())
      throw new ApiError(
        410,
        "PREVIEW_EXPIRED",
        "Preview expired. Create a new preview.",
      );
    if (
      this.mode === "live" &&
      (!this.available || plan.brandId !== this.config.groupAllowedBrandId)
    )
      throw new ApiError(
        403,
        "GROUP_WRITE_DISABLED",
        "Live Group creation is disabled or this Brand is not approved.",
      );
    const attemptKey = `${plan.brandId}\0${plan.payload.name.toLocaleLowerCase()}`;
    if (this.mode === "live" && this.attemptedNames.has(attemptKey))
      throw new ApiError(
        409,
        "CHECK_PREVIOUS_ATTEMPT",
        "This Brand and Group name were already attempted. Check Group Management before proceeding.",
      );
    if (this.mode === "live") this.attemptedNames.set(attemptKey, "running");
    plan.state = "running";
    const base = {
      brandId: plan.brandId,
      name: plan.payload.name,
      mode: this.mode,
    };
    let report: GroupReport;
    if (this.mode === "mock")
      report = {
        ...base,
        status: "mock_success",
        message: "Simulated only. No Group was created in Harri.",
        verification: "mock_only",
      };
    else {
      let ctx: WriteContext | undefined;
      try {
        ctx = await this.factory({
          extraHTTPHeaders: this.config.headers,
          timeout: 15000,
          ignoreHTTPSErrors: false,
        });
        const response = await ctx.post(
          `https://gateway.harriprep.com/scheduling/api/v1/admin/brands/${plan.brandId}/settings/groups`,
          { data: plan.payload, maxRedirects: 0 },
        );
        const status = response.status();
        if (!response.ok()) {
          const definitive =
            status >= 400 && status < 500 && status !== 408 && status !== 429;
          report = {
            ...base,
            status: definitive ? "rejected" : "uncertain",
            message: definitive
              ? `Harri rejected the request (HTTP ${status}).`
              : `Unexpected HTTP ${status}. Check Harri before retrying; the outcome may be unknown.`,
            verification: "not_supported",
          };
        } else {
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            body = null;
          }
          const valid =
            !!body &&
            typeof body === "object" &&
            "data" in body &&
            body.data === "Success" &&
            "status" in body &&
            body.status === "SUCCESS" &&
            "status_code" in body &&
            body.status_code === 200;
          report = {
            ...base,
            status: valid ? "acknowledged" : "uncertain",
            message: valid
              ? "Harri acknowledged the request. Group creation has not been independently verified."
              : "Unexpected response. Check Harri before retrying; the outcome may be unknown.",
            verification: "not_supported",
          };
        }
      } catch {
        report = {
          ...base,
          status: "uncertain",
          message:
            "The request outcome is unknown. Check Group Management before retrying.",
          verification: "not_supported",
        };
      } finally {
        await ctx?.dispose().catch(() => {});
      }
    }
    if (this.mode === "live") {
      if (report.status === "rejected") this.attemptedNames.delete(attemptKey);
      else this.attemptedNames.set(attemptKey, "settled");
    }
    plan.report = report;
    plan.state = "done";
    return report;
  }
}
