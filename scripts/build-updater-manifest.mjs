import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const version = process.argv[2];
const repository = process.env.GITHUB_REPOSITORY ?? "fastrepl/unsigned-char";
const updaterAssetName = "unsigned-char-aarch64.app.tar.gz";

if (!version) {
  throw new Error("Expected a version argument, e.g. `node scripts/build-updater-manifest.mjs 0.0.1`.");
}

const releaseNotesPath = path.join(root, "release-notes.md");
const bundlePath = path.join(
  root,
  "src-tauri",
  "target",
  "aarch64-apple-darwin",
  "release",
  "bundle",
  "macos",
);
const bundleFiles = await readdir(bundlePath);
const archiveName = bundleFiles.find((file) => file.endsWith(".app.tar.gz"));

if (!archiveName) {
  throw new Error(`No macOS updater archive found in ${bundlePath}.`);
}

const signatureName = `${archiveName}.sig`;
const archiveUrl = `https://github.com/${repository}/releases/download/v${version}/${updaterAssetName}`;
const signaturePath = path.join(bundlePath, signatureName);
const notes = await readFile(releaseNotesPath, "utf8");
const signature = (await readFile(signaturePath, "utf8")).trim();

const manifest = {
  version,
  notes: notes.trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url: archiveUrl,
    },
  },
};

const outputPath = path.join(root, "latest.json");
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
