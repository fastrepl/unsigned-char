![unsigned {char}](.github/assets/uchar.jpg)

# unsigned {char}

If you want the real thing, use [Char](https://github.com/fastrepl/char).

Apple Silicon local meeting transcription desktop app for macOS, with a bundled CLI.

- records from your machine
- transcribes locally with speech-swift
- supports local speaker diarization with `pyannote.audio`

## Run

```bash
bun install
bun desktop
```

## CLI

Bundled app builds include `uchar` inside the app bundle:

```bash
/Applications/unsigned\ char.app/Contents/MacOS/uchar
```

If you want `uchar` on your `PATH`:

```bash
ln -sf "/Applications/unsigned {char}.app/Contents/MacOS/uchar" /opt/homebrew/bin/uchar
```

## Release

OTA updates are served from GitHub Releases via `latest.json`.

First-time setup:

```bash
bunx tauri signer generate -w ~/.tauri/unsigned-char.key
```

Add the same private key to GitHub as `TAURI_SIGNING_PRIVATE_KEY` and, if you used one, its password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

To ship a version:

```bash
git tag vX.Y.Z
git push origin main --follow-tags
```

The release workflow builds the macOS ARM bundle, uploads the signed updater artifacts, and publishes `latest.json` for future OTA checks.
