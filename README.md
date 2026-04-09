![unsigned char](.github/assets/uchar.jpg)

# unsigned char

If you want the real thing, use [Char](https://github.com/fastrepl/char).

Local meeting transcription for your desktop.

- records from your machine
- transcribes locally with Qwen ASR
- supports local speaker diarization with `pyannote.audio`

## Run

```bash
npm install
npm run tauri dev
```

## Model

Put the bundled Qwen ASR files in:

```text
src-tauri/resources/models/qwen-asr/
```

Or pick a local Hugging Face snapshot in Settings.

## CLI

```bash
npx unsigned-char
```

Or:

```bash
uchar
```
