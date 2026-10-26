import express from "express";
import { validateBrandId } from "./brand.ts";
import type { GroupManager } from "./groups.ts";
import { ApiError } from "./errors.ts";
import type { BrandClient } from "./brand-client.ts";
export function createApp(
  client: Pick<BrandClient, "mode" | "loadBrand">,
  groups?: GroupManager,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    );
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return res
        .status(403)
        .json({ code: "LOCAL_ONLY", error: "Local access only." });
    if (
      req.headers.origin &&
      ![
        `http://${host}`,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].includes(req.headers.origin)
    )
      return res
        .status(403)
        .json({ code: "ORIGIN_REJECTED", error: "Origin rejected." });
    const isGroupAction =
      req.method === "POST" &&
      groups &&
      ["/api/groups/preview", "/api/groups/execute"].includes(req.path);
    if (isGroupAction && !req.headers.origin)
      return res.status(403).json({
        code: "ORIGIN_REQUIRED",
        error: "An approved local Origin is required.",
      });
    if (!["GET", "HEAD"].includes(req.method) && !isGroupAction) {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({
        code: "READ_ONLY",
        error: "This request method is not supported for this endpoint.",
      });
    }
    next();
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      mode: client.mode,
      readOnly: !(groups && groups.mode === "live" && groups.available),
      capabilities: { brandLookup: true, groupCreation: !!groups?.available },
    }),
  );
  app.head("/api/brand", (_req, res) => res.status(200).end());
  app.get("/api/brand", async (req, res) =>
    res.json(await client.loadBrand(validateBrandId(req.query.brandId))),
  );
  if (groups) {
    app.post(
      "/api/groups/preview",
      express.json({ limit: "16kb", strict: true }),
      (req, res) =>
        res.json(groups.preview(req.body?.brandId, req.body?.payload)),
    );
    app.post(
      "/api/groups/execute",
      express.json({ limit: "16kb", strict: true }),
      async (req, res) =>
        res.json(
          await groups.execute(
            req.body?.previewId,
            req.body?.confirmation,
            req.body?.acknowledgeNoLocations,
          ),
        ),
    );
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ code: "NOT_FOUND", error: "Unknown endpoint." }),
  );
  app.use(express.static("dist"));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error instanceof ApiError ? error.status : 500).json({
        code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
        error:
          error instanceof ApiError
            ? error.message
            : "The request could not be processed.",
      });
    },
  );
  return app;
}
