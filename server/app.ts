import express from "express";
import { validateBrandId } from "./brand.ts";
import { ApiError, type CatalogClient } from "./catalog.ts";
export function createApp(
  client: Pick<CatalogClient, "mode" | "load" | "loadBrand">,
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
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return res
        .status(405)
        .json({
          code: "READ_ONLY",
          error: "This application only supports read-only requests.",
        });
    }
    next();
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      mode: client.mode,
      readOnly: true,
      scope: "global",
      capabilities: { brandLookup: true, assignedServices: false },
    }),
  );
  app.head("/api/brand", (_req, res) => res.status(200).end());
  app.get("/api/brand", async (req, res) =>
    res.json(await client.loadBrand(validateBrandId(req.query.brandId))),
  );
  // Metadata only: HEAD and unknown API routes must not trigger a live catalog request.
  app.head("/api/services", (_req, res) => res.status(200).end());
  app.get("/api/services", async (_req, res) => res.json(await client.load()));
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ code: "NOT_FOUND", error: "Unknown read-only endpoint." }),
  );
  app.use(express.static("dist"));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error instanceof ApiError ? error.status : 500)
        .json({
          code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
          error:
            error instanceof ApiError
              ? error.message
              : "The catalog request could not be processed.",
        });
    },
  );
  return app;
}
