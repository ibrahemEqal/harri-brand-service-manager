import "dotenv/config";
import { createApp } from "./app.ts";
import { CatalogClient } from "./catalog.ts";
import { readConfig } from "./config.ts";
const config = readConfig(process.env);
createApp(new CatalogClient(config)).listen(config.port, "127.0.0.1", () => {
  console.log(
    `Harri Brand Service Manager: http://127.0.0.1:${config.port} (${config.mode}, read-only)`,
  );
});
