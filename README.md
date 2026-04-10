![unsigned {char}](.github/assets/uchar.jpg)

# unsigned {char}

If you want the real thing, use [Char](https://github.com/fastrepl/char).

Apple Silicon local meeting transcription desktop app for macOS, with a bundled CLI.

- records from your machine
- transcribes locally with Qwen ASR
- supports local speaker diarization with `pyannote.audio`

## Run

```bash
npm install
npm run tauri dev
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
