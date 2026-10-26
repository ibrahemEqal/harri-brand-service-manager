import { randomUUID } from "node:crypto";
import { request } from "playwright";
import { buildObservedPayload, type GroupInput } from "../shared/group.ts";
import { validateBrandId } from "./brand.ts";
import { ApiError } from "./catalog.ts";
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
function validateInput(raw: unknown): GroupInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ApiError(400, "INVALID_INPUT", "Group data is required.");
  const value = raw as Record<string, unknown>;
  function text(key: string, max: number): string {
    const v = value[key];
    if (typeof v !== "string" || !v.trim() || v.trim().length > max)
      throw new ApiError(400, "INVALID_INPUT", `Invalid ${key}.`);
    return v.trim();
  }
  function number(key: string, max: number): number {
    const v = value[key];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
      throw new ApiError(400, "INVALID_INPUT", `Invalid ${key}.`);
    return v;
  }
  const startDayOfWeek = text("startDayOfWeek", 3);
  if (
    !["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].includes(startDayOfWeek)
  )
    throw new ApiError(400, "INVALID_INPUT", "Invalid weekday code.");
  const countryCode = text("countryCode", 2);
  if (!/^[A-Z]{2}$/.test(countryCode))
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Country code must be two uppercase letters.",
    );
  return {
    name: text("name", 120),
    countryCode,
    timeZoneName: text("timeZoneName", 100),
    startDayOfWeek,
    openTime: number("openTime", 86399),
    closeTime: number("closeTime", 86399),
    closeTimeExtension: number("closeTimeExtension", 86400),
  };
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
  preview(brand: unknown, raw: unknown) {
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
    const input = validateInput(raw);
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
      payload: buildObservedPayload(input),
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
