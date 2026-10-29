// This server deliberately ignores the user's .env and cannot call Harri.
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { createApp } from "../server/app.ts";
import { BrandClient } from "../server/brand-client.ts";
import { SsoManager } from "../server/sso.ts";
import { GroupManager } from "../server/groups.ts";
import { readConfig } from "../server/config.ts";
const config = readConfig({ HARRI_MODE: "mock" });
const backend = createApp(
  new BrandClient(config),
  new GroupManager(config),
  new SsoManager(config),
).listen(3001, "127.0.0.1");
await new Promise<void>((resolve) => backend.once("listening", resolve));
const vite = await createServer({
  configFile: false,
  plugins: [tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
await vite.listen();
console.log("Mock-only UI test server ready");
