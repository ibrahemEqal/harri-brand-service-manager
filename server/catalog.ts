import { readFile } from "node:fs/promises";
import { request } from "playwright";
import {
  CatalogValidationError,
  parseCatalog,
  type CatalogResponse,
} from "../shared/catalog.ts";
import {
  BrandValidationError,
  parseBrand,
  type BrandResponse,
} from "../shared/brand.ts";
import type { Config } from "./config.ts";
export const CATALOG_URL =
  "https://gateway.harriprep.com/account-management/api/v1/admin/service";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public upstreamStatus?: number,
  ) {
    super(message);
  }
}
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
export class CatalogClient {
  constructor(
    private config: Config,
    private factory: ContextFactory = (options) => request.newContext(options),
  ) {}
  get mode() {
    return this.config.mode;
  }
  private async readLive(
    url: string,
    kind: "Brand" | "Catalog",
  ): Promise<unknown> {
    if (!this.config.approved)
      throw new ApiError(
        403,
        "LIVE_DISABLED",
        "Live requests have not been authorized.",
      );
    if (!Object.keys(this.config.headers).length)
      throw new ApiError(
        503,
        "AUTH_CONFIGURATION",
        "Configure authentication on the local backend.",
      );
    let context: ReadContext | undefined;
    try {
      context = await this.factory({
        extraHTTPHeaders: this.config.headers,
        timeout: 15000,
        ignoreHTTPSErrors: false,
      });
      const response = await context.get(url, { maxRedirects: 0 });
      const status = response.status();
      if (status >= 300 && status < 400)
        throw new ApiError(
          502,
          "UPSTREAM_REDIRECT",
          `HTTP ${status}: Harri returned a redirect. It was not followed. Compare the working BAM request's authentication and required header names; no redirect URL or credentials are exposed.`,
        );
      if (status === 401)
        throw new ApiError(
          401,
          "AUTHENTICATION_ERROR",
          "HTTP 401: Harri rejected the backend credentials. Check that the approved session is current and that the backend sends the same required authentication headers as the working BAM request.",
        );
      if (status === 403)
        throw new ApiError(
          403,
          "ACCESS_DENIED",
          "HTTP 403: Harri denied access. Your session may lack permission or may need renewal.",
        );
      if (kind === "Brand" && status === 404)
        throw new ApiError(
          404,
          "BRAND_NOT_FOUND",
          "Harri did not return this Brand. The ID may not exist or may not be visible to your session.",
        );
      if (!response.ok())
        throw new ApiError(
          502,
          "UPSTREAM_ERROR",
          `Harri ${kind.toLowerCase()} request failed (HTTP ${status}). Try again later.`,
          status,
        );
      try {
        return await response.json();
      } catch {
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "Harri returned a non-JSON response. Check your server-side session configuration.",
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        502,
        "REQUEST_FAILED",
        "Could not reach Harri within the request timeout. Check connectivity and try again.",
      );
    } finally {
      await context?.dispose().catch(() => {});
    }
  }
  async load(): Promise<CatalogResponse> {
    try {
      const body =
        this.mode === "mock"
          ? JSON.parse(
              await readFile(
                new URL("../fixtures/services.json", import.meta.url),
                "utf8",
              ),
            )
          : await this.readLive(CATALOG_URL, "Catalog");
      return {
        mode: this.mode,
        scope: "global",
        source: this.mode === "mock" ? "attached-fixture" : "harri-prep",
        fetchedAt: new Date().toISOString(),
        services: parseCatalog(body),
      };
    } catch (error) {
      if (
        this.mode === "live" &&
        error instanceof ApiError &&
        error.upstreamStatus === 404
      ) {
        const fixture = JSON.parse(
          await readFile(
            new URL("../fixtures/services.json", import.meta.url),
            "utf8",
          ),
        );
        return {
          mode: "live",
          scope: "global",
          source: "attached-fixture-fallback",
          fetchedAt: new Date().toISOString(),
          services: parseCatalog(fixture),
          warning:
            "Harri catalog returned HTTP 404. Showing the complete provided catalog snapshot; service availability is not verified live.",
        };
      }
      if (error instanceof ApiError) throw error;
      if (error instanceof CatalogValidationError)
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "The catalog response does not match the documented service structure. No partial catalog was returned.",
        );
      throw new ApiError(
        502,
        "REQUEST_FAILED",
        "The local catalog fixture could not be loaded.",
      );
    }
  }
  async loadBrand(brandId: string): Promise<BrandResponse> {
    // Revalidate inside the transport boundary as well as at the local route.
    if (
      !/^[1-9]\d{0,15}$/.test(brandId) ||
      !Number.isSafeInteger(Number(brandId))
    )
      throw new ApiError(400, "INVALID_BRAND_ID", "Invalid Brand ID.");
    try {
      let body: unknown;
      if (this.mode === "mock") {
        if (brandId !== "18619889")
          throw new ApiError(
            404,
            "MOCK_BRAND_NOT_FOUND",
            "The mock snapshot contains only Brand 18619889. Other IDs require authorized Live Mode.",
          );
        body = JSON.parse(
          await readFile(
            new URL("../fixtures/brand.json", import.meta.url),
            "utf8",
          ),
        );
      } else {
        body = await this.readLive(
          `https://gateway.harriprep.com/account-management/api/v1/admin/brands/${brandId}`,
          "Brand",
        );
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
        "The local Brand fixture could not be loaded.",
      );
    }
  }
}
