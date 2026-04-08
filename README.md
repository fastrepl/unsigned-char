# unsigned char

`unsigned char` is a simple desktop app for transcribing meetings on your own
machine.

It is meant to:

- listen to your microphone and system audio at the same time
- transcribe the conversation locally
- use Qwen ASR for speech recognition

## How it works

The intended flow is simple:

1. Open the app.
2. Grant microphone and system audio access.
3. Start a session.
4. Let it listen to your mic and system audio together.
5. Read the transcript as the meeting happens.

## Current status

This repo is still at the starting point. The app shell is in place, but the
actual audio capture and transcription flow are not wired yet.

## Run it

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the desktop app:

   ```bash
   npm run tauri dev
   ```

3. When the app opens, finish the permission onboarding before using the rest of
   the app.

## Note for development

Shout out to [fastrepl/char](https://github.com/fastrepl/char). It already
covers more of the meeting-transcription problem and is a good place to borrow
ideas from while building this out.
