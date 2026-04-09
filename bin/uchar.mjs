#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "unsigned char";
const APP_BUNDLE_NAME = `${APP_NAME}.app`;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = readVersion();
const COMMANDS = new Set(["open", "desktop"]);
const APP_PATHS = [
  join("/Applications", APP_BUNDLE_NAME),
  process.env.HOME ? join(process.env.HOME, "Applications", APP_BUNDLE_NAME) : "",
  join(REPO_ROOT, "src-tauri", "target", "release", "bundle", "macos", APP_BUNDLE_NAME),
  join(REPO_ROOT, "src-tauri", "target", "debug", "bundle", "macos", APP_BUNDLE_NAME),
].filter(Boolean);

const HELP = `uchar ${VERSION}

Open unsigned char on macOS.

Usage:
  uchar
  uchar open
  uchar desktop
  uchar --help
  uchar --version
`;

main(process.argv.slice(2));

function main(args) {
  if (args.length === 0) {
    openDesktopApp();
    return;
  }

  const [command] = args;

  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (!COMMANDS.has(command)) {
    fail(`unknown command "${command}"\n\n${HELP}`);
  }

  openDesktopApp();
}

function openDesktopApp() {
  if (process.platform !== "darwin") {
    fail("unsigned char currently supports only macOS.");
  }

  if (open(["-a", APP_NAME])) {
    return;
  }

  for (const appPath of APP_PATHS) {
    if (existsSync(appPath) && open([appPath])) {
      return;
    }
  }

  fail(
    [
      `could not find ${APP_BUNDLE_NAME}.`,
      "Install the desktop app in /Applications or ~/Applications,",
      "or open a local build from this repo with `npm run tauri:debug-app`.",
    ].join("\n"),
  );
}

function open(args) {
  const result = spawnSync("open", args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function readVersion() {
  const packageJsonPath = join(REPO_ROOT, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}

function fail(message) {
  process.stderr.write(`uchar: ${message}\n`);
  process.exit(1);
}
