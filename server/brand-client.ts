import { readFile } from "node:fs/promises";
import { request } from "playwright";
import {
  BrandValidationError,
  parseBrand,
  type BrandResponse,
} from "../shared/brand.ts";
import { validateBrandId } from "./brand.ts";
import { ApiError } from "./errors.ts";
import type { Config } from "./config.ts";
export interface ReadContext {
  get(
    url: string,
    options: { maxRedirects: number },
  ): Promise<{ status(): number; ok(): boolean; json(): Promise<unknown> }>;
  dispose(): Promise<void>;
}
export type ContextFactory = (options: {
  extraHTTPHeaders: Record<string, string>;
  timeout: number;
  ignoreHTTPSErrors: boolean;
}) => Promise<ReadContext>;
export class BrandClient {
  constructor(
    private config: Config,
    private factory: ContextFactory = (options) => request.newContext(options),
  ) {}
  get mode() {
    return this.config.mode;
  }
  async loadBrand(raw: unknown): Promise<BrandResponse> {
    const brandId = validateBrandId(raw);
    try {
      let body: unknown;
      if (this.mode === "mock") {
        if (brandId !== "18619889")
          throw new ApiError(
            404,
            "MOCK_BRAND_NOT_FOUND",
            "The mock snapshot contains only Brand 18619889.",
          );
        body = JSON.parse(
          await readFile(
            new URL("../fixtures/brand.json", import.meta.url),
            "utf8",
          ),
        );
      } else {
        if (!this.config.approved)
          throw new ApiError(
            403,
            "LIVE_DISABLED",
            "Live requests have not been authorized.",
          );
        const context = await this.factory({
          extraHTTPHeaders: this.config.headers,
          timeout: 15000,
          ignoreHTTPSErrors: false,
        });
        try {
          const response = await context.get(
            `https://gateway.harriprep.com/account-management/api/v1/admin/brands/${brandId}`,
            { maxRedirects: 0 },
          );
          const status = response.status();
          if (status >= 300 && status < 400)
            throw new ApiError(
              502,
              "UPSTREAM_REDIRECT",
              `HTTP ${status}: Harri returned a redirect. It was not followed.`,
            );
          if (status === 401)
            throw new ApiError(
              401,
              "AUTHENTICATION_ERROR",
              "HTTP 401: Harri rejected the backend credentials.",
            );
          if (status === 403)
            throw new ApiError(
              403,
              "ACCESS_DENIED",
              "HTTP 403: Harri denied access to this Brand.",
            );
          if (status === 404)
            throw new ApiError(
              404,
              "BRAND_NOT_FOUND",
              "Harri did not return this Brand. The ID may not exist or may not be visible to your session.",
            );
          if (!response.ok())
            throw new ApiError(
              502,
              "UPSTREAM_ERROR",
              `Harri Brand request failed (HTTP ${status}).`,
            );
          try {
            body = await response.json();
          } catch {
            throw new ApiError(
              502,
              "INVALID_RESPONSE",
              "Harri returned a non-JSON response.",
            );
          }
        } finally {
          await context.dispose().catch(() => {});
        }
      }
      return {
        mode: this.mode,
        source: this.mode === "mock" ? "provided-fixture" : "harri-prep",
        fetchedAt: new Date().toISOString(),
        brand: parseBrand(body, brandId),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof BrandValidationError)
        throw new ApiError(
          502,
          "INVALID_BRAND_RESPONSE",
          "The Brand response is malformed or its ID does not match the requested Brand.",
        );
      throw new ApiError(
        502,
        "REQUEST_FAILED",
        this.mode === "mock"
          ? "The mock Brand fixture could not be loaded."
          : "Could not reach Harri. Check connectivity and try again.",
      );
    }
  }
}
