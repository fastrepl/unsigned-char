import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const tauriConfigPath = resolve("src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const bundleIdentifier = tauriConfig.identifier;
const productName = tauriConfig.productName;
const appPath = resolve("src-tauri", "target", "debug", "bundle", "macos", `${productName}.app`);

if (process.platform !== "darwin") {
  console.error("debug-app.mjs only supports macOS.");
  process.exit(1);
}

if (!existsSync(appPath)) {
  console.error(`App bundle not found at ${appPath}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("codesign", ["--force", "--deep", "--sign", "-", "--identifier", bundleIdentifier, appPath]);

if (process.argv.includes("--open")) {
  run("open", [appPath]);
}
