import { createApp } from "./app.ts";
import { GroupManager } from "./groups.ts";
import { CatalogClient } from "./catalog.ts";
import { loadRuntimeConfig, safeAuthSummary } from "./runtime-config.ts";
const { config, source } = loadRuntimeConfig();
const server = createApp(new CatalogClient(config), new GroupManager(config));
server
  .listen(config.port, "127.0.0.1", () => {
    console.log(
      `Harri Brand Service Manager: http://127.0.0.1:${config.port} (${config.mode}; group creation ${config.groupWritesEnabled ? "enabled for configured Brand" : "disabled"})`,
    );
    console.log(`Configuration source: ${source}`);
    if (config.mode === "live")
      console.log(
        "Authentication configuration (values hidden):",
        safeAuthSummary(config),
      );
  })
  .on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${config.port} is already in use. Stop the old backend before restarting.`
        : "The local server could not start.",
    );
    process.exitCode = 1;
  });
