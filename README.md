![unsigned {char}](.github/assets/uchar.jpg)

# unsigned {char}

`unsigned {char}` is a local-first Tauri desktop app for Apple Silicon Macs. It records meetings, transcribes them locally, saves transcript exports as Markdown, and can generate summaries with the provider you already use.

If you want the upstream inspiration, use [Char](https://github.com/fastrepl/char).

## What it does

- records microphone and system audio
- transcribes locally with on-device speech models
- supports realtime and batch transcription modes
- saves each meeting as a local Markdown export
- generates summaries with OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, LM Studio, or another OpenAI-compatible endpoint
- ships with a bundled `uchar` launcher

## Requirements

- macOS 15 or newer
- Apple Silicon
- Bun 1.3.9
- Rust toolchain for local Tauri builds

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
ln -sf "/Applications/unsigned char.app/Contents/MacOS/uchar" /opt/homebrew/bin/uchar
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
