import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { readConfig, type Config } from "./config.ts";
export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFile: URL = new URL("../.env", import.meta.url),
): { config: Config; source: "project .env" | "process environment" } {
  let parsed: Record<string, string> = {};
  let source: "project .env" | "process environment" = "process environment";
  try {
    parsed = parse(readFileSync(envFile));
    source = "project .env";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Could not read the project's .env file.");
  }
  // Only this tool's settings can override inherited variables, never PATH/HOME/etc.
  const allowed = new Set([
    "HARRI_MODE",
    "HARRI_ALLOW_REAL_REQUESTS",
    "HARRI_AUTH_HEADER_NAME",
    "HARRI_AUTH_HEADER_VALUE",
    "HARRI_COOKIE",
    "PORT",
  ]);
  const settings = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => allowed.has(key)),
  );
  return { config: readConfig({ ...env, ...settings }), source };
}
export function safeAuthSummary(config: Config) {
  const entry = Object.entries(config.headers).find(
    ([key]) => key.toLowerCase() !== "cookie",
  );
  const auth = Object.entries(config.headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  )?.[1];
  return {
    headerName:
      entry?.[0] ?? (Object.keys(config.headers).length ? "Cookie" : "none"),
    cookieConfigured: Object.keys(config.headers).some(
      (key) => key.toLowerCase() === "cookie",
    ),
    // Only a boolean is emitted. No credentials, token fragments, hashes or lengths.
    ...(auth && /^Bearer\b/i.test(auth)
      ? { bearerFormatValid: /^Bearer [^\s:]+$/i.test(auth) }
      : {}),
  };
}
