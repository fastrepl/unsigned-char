#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAMES = ["unsigned Char", "unsigned char", "unsigned {char}"];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = readVersion();
const APP_PATHS = APP_NAMES.flatMap((appName) => [
  join("/Applications", `${appName}.app`),
  process.env.HOME ? join(process.env.HOME, "Applications", `${appName}.app`) : "",
  join(REPO_ROOT, "src-tauri", "target", "release", "bundle", "macos", `${appName}.app`),
  join(REPO_ROOT, "src-tauri", "target", "debug", "bundle", "macos", `${appName}.app`),
]).filter(Boolean);

const HELP = `uchar ${VERSION}

CLI for unsigned Char.

This wrapper forwards to the bundled app CLI when unsigned Char is installed.

Usage:
  uchar
  uchar desktop
  uchar transcribe ...
  uchar models ...
  uchar --help
  uchar --version
`;

main(process.argv.slice(2));

function main(args) {
  if (process.platform !== "darwin") {
    fail("unsigned Char currently supports only macOS.");
  }

  if (process.arch !== "arm64") {
    fail("unsigned Char currently supports only Apple Silicon Macs.");
  }

  const bundledCliPath = findBundledCliPath();
  if (bundledCliPath) {
    const result = spawnSync(bundledCliPath, args, { stdio: "inherit" });
    if (result.error) {
      fail(result.error.message);
    }

    process.exit(result.status ?? 0);
  }

  if (args.length === 0 || args[0] === "open" || args[0] === "desktop") {
    openDesktopApp();
    return;
  }

  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (args[0] === "--version" || args[0] === "-V" || args[0] === "-v" || args[0] === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  fail(
    [
      "could not find a bundled uchar CLI.",
      "Install unsigned Char in /Applications or ~/Applications,",
      "or build a local app bundle with `bun run tauri build --debug`.",
    ].join("\n"),
  );
}

function findBundledCliPath() {
  for (const appPath of APP_PATHS) {
    const cliPath = join(appPath, "Contents", "MacOS", "uchar");
    if (existsSync(cliPath)) {
      return cliPath;
    }
  }

  return null;
}

function openDesktopApp() {
  for (const appPath of APP_PATHS) {
    if (existsSync(appPath) && open(["-a", appPath])) {
      return;
    }
  }

  for (const appName of APP_NAMES) {
    if (open(["-a", appName])) {
      return;
    }
  }

  fail(
    [
      "could not find unsigned Char.app.",
      "Install the desktop app in /Applications or ~/Applications,",
      "or build a local app bundle with `bun run tauri build --debug`.",
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
