import type { OperatingMode } from "../shared/catalog.ts";
export interface Config {
  mode: OperatingMode;
  approved: boolean;
  headers: Record<string, string>;
  port: number;
}
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const mode = env.HARRI_MODE ?? "mock";
  if (mode !== "mock" && mode !== "live")
    throw new Error("HARRI_MODE must be mock or live.");
  const approved = env.HARRI_ALLOW_REAL_REQUESTS === "true";
  if (mode === "live" && !approved)
    throw new Error(
      "Live mode requires prior explicit approval and HARRI_ALLOW_REAL_REQUESTS=true.",
    );
  const headers: Record<string, string> = {};
  const name = env.HARRI_AUTH_HEADER_NAME;
  const value = env.HARRI_AUTH_HEADER_VALUE;
  if (mode === "live") {
    if (!name || !value)
      throw new Error(
        "Live mode requires HARRI_AUTH_HEADER_NAME and HARRI_AUTH_HEADER_VALUE on the server.",
      );
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ||
      /^(host|connection|content-length|transfer-encoding|origin|referer|proxy-.*)$/i.test(
        name,
      )
    )
      throw new Error("Unsupported authentication header name.");
    if (
      /[\r\n]/.test(value) ||
      (env.HARRI_COOKIE && /[\r\n]/.test(env.HARRI_COOKIE))
    )
      throw new Error("Authentication headers must not contain line breaks.");
    headers[name] = value;
    if (env.HARRI_COOKIE) headers.Cookie = env.HARRI_COOKIE;
  }
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  return { mode, approved, headers, port };
}
