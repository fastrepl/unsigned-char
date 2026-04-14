![unsigned Char](.github/assets/uchar.jpg)

# unsigned Char

`unsigned Char` is a local-first Tauri desktop app for Apple Silicon Macs. It records meetings, transcribes them locally, saves transcript exports as Markdown, and can generate summaries with the provider you already use.

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

`bun desktop` builds the debug app bundle, re-signs it with `com.char.unsigned.app`, and opens it so macOS can register microphone and system-audio permissions against the app bundle. If you want the faster hot-reload loop, use `bun desktop:dev`, but macOS may attach privacy prompts to Warp, Ghostty, or Terminal instead of unsigned Char.

## CLI

Bundled app builds include `uchar` inside the app bundle:

```bash
/Applications/unsigned\ Char.app/Contents/MacOS/uchar
```

If you want `uchar` on your `PATH`:

```bash
ln -sf "/Applications/unsigned Char.app/Contents/MacOS/uchar" /opt/homebrew/bin/uchar
```
