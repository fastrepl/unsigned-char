use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
    thread,
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, SampleFormat, Stream, StreamConfig,
};
use qwen_asr::{
    audio,
    context::QwenCtx,
    transcribe::{self, StreamState},
};
use serde::Serialize;
use tracing::{error, info};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const PUSH_INTERVAL_SAMPLES: usize = TARGET_SAMPLE_RATE as usize / 2;
const SESSION_POLL_INTERVAL: Duration = Duration::from_millis(200);

type SharedText = Arc<Mutex<String>>;
type SharedError = Arc<Mutex<Option<String>>>;
type SharedPreload = Arc<(Mutex<Option<Result<QwenCtx, String>>>, Condvar)>;

#[derive(Default)]
pub struct TranscriptionManager {
    active: Option<SessionHandle>,
    preloaded: Option<PreloadedModel>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscriptionState {
    pub running: bool,
    pub text: String,
    pub error: Option<String>,
}

enum AudioMessage {
    Chunk(Vec<f32>),
    Stop,
}

enum SessionCommand {
    Stop,
}

struct SessionHandle {
    model_path: PathBuf,
    transcript: SharedText,
    error: SharedError,
    running: Arc<AtomicBool>,
    command_tx: mpsc::Sender<SessionCommand>,
    join: Option<thread::JoinHandle<()>>,
}

struct PreloadedModel {
    model_path: PathBuf,
    shared: SharedPreload,
}

impl TranscriptionManager {
    pub fn start(&mut self, model_path: &Path) -> Result<LiveTranscriptionState, String> {
        let _ = self.stop();
        info!(model_path = %model_path.display(), "Starting transcription manager session");
        let preloaded_ctx = self.take_preloaded(model_path).transpose()?;
        let session = SessionHandle::start(model_path, preloaded_ctx)?;
        let snapshot = session.snapshot();
        self.active = Some(session);
        Ok(snapshot)
    }

    pub fn preload(&mut self, model_path: &Path) {
        if self
            .active
            .as_ref()
            .is_some_and(|session| session.model_path == model_path)
        {
            return;
        }

        if let Some(preloaded) = self.preloaded.as_ref() {
            if preloaded.model_path == model_path {
                if let Ok(result) = preloaded.shared.0.lock() {
                    if result.as_ref().is_none_or(|state| state.as_ref().is_ok()) {
                        return;
                    }
                }
            }
        }

        let model_path = model_path.to_path_buf();
        let shared = Arc::new((Mutex::new(None), Condvar::new()));
        let background_shared = shared.clone();
        let background_model_path = model_path.clone();

        info!(
            model_path = %background_model_path.display(),
            "Preloading transcription model context",
        );

        thread::spawn(move || {
            let result = load_model_context(&background_model_path);
            let (state, wake) = &*background_shared;
            if let Ok(mut slot) = state.lock() {
                *slot = Some(result);
                wake.notify_all();
            }
        });

        self.preloaded = Some(PreloadedModel { model_path, shared });
    }

    pub fn clear_preload(&mut self) {
        self.preloaded = None;
    }

    pub fn request_stop(&mut self) -> Result<LiveTranscriptionState, String> {
        let Some(session) = self.active.as_ref() else {
            return Ok(LiveTranscriptionState::default());
        };

        info!("Requesting transcription session shutdown");
        session.request_stop()?;
        Ok(session.snapshot())
    }

    pub fn state(&mut self) -> Result<LiveTranscriptionState, String> {
        let Some(session) = self.active.as_ref() else {
            return Ok(LiveTranscriptionState::default());
        };

        if session.running.load(Ordering::SeqCst) {
            return Ok(session.snapshot());
        }

        let session = self
            .active
            .take()
            .ok_or_else(|| "Failed to access transcription state.".to_string())?;

        info!("Finalizing completed transcription session");
        session.finish()
    }

    pub fn stop(&mut self) -> Result<LiveTranscriptionState, String> {
        let Some(session) = self.active.take() else {
            return Ok(LiveTranscriptionState::default());
        };

        session.stop()
    }

    fn take_preloaded(&mut self, model_path: &Path) -> Option<Result<QwenCtx, String>> {
        let preloaded = self.preloaded.take()?;
        if preloaded.model_path != model_path {
            self.preloaded = Some(preloaded);
            return None;
        }

        let (state, wake) = &*preloaded.shared;
        let mut slot = state.lock().ok()?;
        while slot.is_none() {
            slot = wake.wait(slot).ok()?;
        }

        slot.take()
    }
}

impl SessionHandle {
    fn start(model_path: &Path, preloaded_ctx: Option<QwenCtx>) -> Result<Self, String> {
        let transcript = Arc::new(Mutex::new(String::new()));
        let error = Arc::new(Mutex::new(None));
        let running = Arc::new(AtomicBool::new(false));
        let (command_tx, command_rx) = mpsc::channel();
        let (startup_tx, startup_rx) = mpsc::channel();
        let session_model_path = model_path.to_path_buf();

        let join = thread::spawn({
            let transcript = transcript.clone();
            let error = error.clone();
            let running = running.clone();
            let model_path = session_model_path.clone();

            move || {
                run_session(
                    model_path,
                    preloaded_ctx,
                    command_rx,
                    startup_tx,
                    transcript,
                    error,
                    running,
                )
            }
        });

        match startup_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                model_path: session_model_path,
                transcript,
                error,
                running,
                command_tx,
                join: Some(join),
            }),
            Ok(Err(message)) => {
                let _ = join.join();
                Err(message)
            }
            Err(_) => {
                let _ = join.join();
                Err("Failed to start local transcription.".to_string())
            }
        }
    }

    fn request_stop(&self) -> Result<(), String> {
        if self.command_tx.send(SessionCommand::Stop).is_err()
            && self.running.load(Ordering::SeqCst)
        {
            return Err("Failed to stop local transcription.".to_string());
        }

        Ok(())
    }

    fn finish(mut self) -> Result<LiveTranscriptionState, String> {
        if let Some(join) = self.join.take() {
            join.join()
                .map_err(|_| "The transcription session crashed.".to_string())?;
        }

        Ok(self.snapshot())
    }

    fn stop(self) -> Result<LiveTranscriptionState, String> {
        self.request_stop()?;
        self.finish()
    }

    fn snapshot(&self) -> LiveTranscriptionState {
        LiveTranscriptionState {
            running: self.running.load(Ordering::SeqCst),
            text: self
                .transcript
                .lock()
                .map(|value| value.clone())
                .unwrap_or_default(),
            error: self.error.lock().ok().and_then(|value| value.clone()),
        }
    }
}

fn run_session(
    model_path: PathBuf,
    preloaded_ctx: Option<QwenCtx>,
    command_rx: mpsc::Receiver<SessionCommand>,
    startup_tx: mpsc::Sender<Result<(), String>>,
    transcript: SharedText,
    error: SharedError,
    running: Arc<AtomicBool>,
) {
    info!(model_path = %model_path.display(), "Launching transcription session thread");
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else {
        let _ = startup_tx.send(Err("No microphone input device is available.".to_string()));
        return;
    };

    let supported_config = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            let _ = startup_tx.send(Err(format!("Failed to read microphone config: {error}")));
            return;
        }
    };

    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels() as usize;
    let sample_format = supported_config.sample_format();
    let stream_config: StreamConfig = supported_config.into();

    let (audio_tx, audio_rx) = mpsc::channel();
    let (worker_ready_tx, worker_ready_rx) = mpsc::channel();
    let worker_join = spawn_worker(
        model_path,
        preloaded_ctx,
        sample_rate,
        audio_rx,
        transcript,
        error.clone(),
        running.clone(),
        worker_ready_tx,
    );

    match worker_ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(message)) => {
            let _ = startup_tx.send(Err(message));
            let _ = worker_join.join();
            return;
        }
        Err(_) => {
            let _ = startup_tx.send(Err("Failed to start the transcription worker.".to_string()));
            let _ = worker_join.join();
            return;
        }
    }

    let capture_stream = match build_capture_stream(
        device,
        &stream_config,
        sample_format,
        channels,
        audio_tx.clone(),
        error,
        running.clone(),
    ) {
        Ok(stream) => stream,
        Err(message) => {
            let _ = audio_tx.send(AudioMessage::Stop);
            let _ = startup_tx.send(Err(message));
            let _ = worker_join.join();
            return;
        }
    };

    if let Err(error) = capture_stream.play() {
        let _ = audio_tx.send(AudioMessage::Stop);
        let _ = startup_tx.send(Err(format!("Failed to start microphone capture: {error}")));
        let _ = worker_join.join();
        return;
    }

    running.store(true, Ordering::SeqCst);
    info!(
        sample_rate,
        channels, "Live microphone capture started for transcription session",
    );
    let _ = startup_tx.send(Ok(()));

    loop {
        if !running.load(Ordering::SeqCst) {
            break;
        }

        match command_rx.recv_timeout(SESSION_POLL_INTERVAL) {
            Ok(SessionCommand::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }

    drop(capture_stream);
    let _ = audio_tx.send(AudioMessage::Stop);
    let _ = worker_join.join();
    running.store(false, Ordering::SeqCst);
    info!("Live microphone capture stopped for transcription session");
}

fn build_capture_stream(
    device: Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    channels: usize,
    audio_tx: mpsc::Sender<AudioMessage>,
    error: SharedError,
    running: Arc<AtomicBool>,
) -> Result<Stream, String> {
    let err_audio_tx = audio_tx.clone();
    let err_running = running.clone();
    let err_error = error.clone();
    let err_fn = move |stream_error| {
        set_error(
            &err_error,
            format!("Microphone capture failed: {stream_error}"),
        );
        err_running.store(false, Ordering::SeqCst);
        let _ = err_audio_tx.send(AudioMessage::Stop);
    };

    match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _| {
                    send_audio_chunk(&audio_tx, downmix_f32(data, channels));
                },
                err_fn,
                None,
            )
            .map_err(|error| format!("Failed to build microphone stream: {error}")),
        SampleFormat::I16 => device
            .build_input_stream(
                config,
                move |data: &[i16], _| {
                    send_audio_chunk(&audio_tx, downmix_i16(data, channels));
                },
                err_fn,
                None,
            )
            .map_err(|error| format!("Failed to build microphone stream: {error}")),
        SampleFormat::U16 => device
            .build_input_stream(
                config,
                move |data: &[u16], _| {
                    send_audio_chunk(&audio_tx, downmix_u16(data, channels));
                },
                err_fn,
                None,
            )
            .map_err(|error| format!("Failed to build microphone stream: {error}")),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn spawn_worker(
    model_path: PathBuf,
    preloaded_ctx: Option<QwenCtx>,
    sample_rate: u32,
    audio_rx: mpsc::Receiver<AudioMessage>,
    transcript: SharedText,
    error: SharedError,
    running: Arc<AtomicBool>,
    startup_tx: mpsc::Sender<Result<(), String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut ctx = match preloaded_ctx {
            Some(ctx) => ctx,
            None => match load_model_context(&model_path) {
                Ok(ctx) => ctx,
                Err(message) => {
                    set_error(&error, &message);
                    let _ = startup_tx.send(Err(message));
                    return;
                }
            },
        };

        ctx.stream_chunk_sec = 2.0;
        ctx.stream_max_new_tokens = 64;
        ctx.past_text_conditioning = true;
        ctx.skip_silence = true;

        let _ = startup_tx.send(Ok(()));

        let mut stream_state = StreamState::new();
        let mut captured_samples = Vec::new();
        let mut pending_samples = 0usize;

        loop {
            match audio_rx.recv() {
                Ok(AudioMessage::Chunk(chunk)) => {
                    let chunk = if sample_rate == TARGET_SAMPLE_RATE {
                        chunk
                    } else {
                        audio::resample(&chunk, sample_rate as i32, TARGET_SAMPLE_RATE as i32)
                    };

                    pending_samples += chunk.len();
                    captured_samples.extend_from_slice(&chunk);

                    if pending_samples < PUSH_INTERVAL_SAMPLES {
                        continue;
                    }

                    pending_samples = 0;
                    if !push_audio_delta(
                        &mut ctx,
                        &captured_samples,
                        &mut stream_state,
                        false,
                        &transcript,
                        &error,
                    ) {
                        break;
                    }
                }
                Ok(AudioMessage::Stop) | Err(_) => {
                    let _ = push_audio_delta(
                        &mut ctx,
                        &captured_samples,
                        &mut stream_state,
                        true,
                        &transcript,
                        &error,
                    );
                    break;
                }
            }
        }

        running.store(false, Ordering::SeqCst);
    })
}

fn load_model_context(model_path: &Path) -> Result<QwenCtx, String> {
    QwenCtx::load(model_path.to_string_lossy().as_ref()).ok_or_else(|| {
        format!(
            "Failed to load the local ASR model at {}. The directory must include vocab.json and model safetensors files.",
            model_path.display()
        )
    })
}

fn push_audio_delta(
    ctx: &mut QwenCtx,
    samples: &[f32],
    stream_state: &mut StreamState,
    finalize: bool,
    transcript: &SharedText,
    error: &SharedError,
) -> bool {
    match transcribe::stream_push_audio(ctx, samples, stream_state, finalize) {
        Some(delta) => {
            if !delta.is_empty() {
                append_text(transcript, &delta);
            }
            true
        }
        None => {
            set_error(
                error,
                "Local transcription failed while processing microphone audio.",
            );
            false
        }
    }
}

fn append_text(transcript: &SharedText, delta: &str) {
    if let Ok(mut value) = transcript.lock() {
        value.push_str(delta);
    }
}

fn set_error(error: &SharedError, message: impl Into<String>) {
    let message = message.into();
    error!(%message, "Transcription session error");
    if let Ok(mut value) = error.lock() {
        *value = Some(message);
    }
}

fn send_audio_chunk(audio_tx: &mpsc::Sender<AudioMessage>, chunk: Vec<f32>) {
    if chunk.is_empty() {
        return;
    }

    let _ = audio_tx.send(AudioMessage::Chunk(chunk));
}

fn downmix_f32(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }

    let mut mono = Vec::with_capacity(data.len() / channels.max(1));
    for frame in data.chunks(channels) {
        let sum: f32 = frame.iter().copied().sum();
        mono.push(sum / frame.len() as f32);
    }

    mono
}

fn downmix_i16(data: &[i16], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.iter().map(|sample| *sample as f32 / 32768.0).collect();
    }

    let mut mono = Vec::with_capacity(data.len() / channels.max(1));
    for frame in data.chunks(channels) {
        let sum: f32 = frame.iter().map(|sample| *sample as f32 / 32768.0).sum();
        mono.push(sum / frame.len() as f32);
    }

    mono
}

fn downmix_u16(data: &[u16], channels: usize) -> Vec<f32> {
    let convert = |sample: u16| (sample as f32 / u16::MAX as f32) * 2.0 - 1.0;

    if channels <= 1 {
        return data.iter().map(|sample| convert(*sample)).collect();
    }

    let mut mono = Vec::with_capacity(data.len() / channels.max(1));
    for frame in data.chunks(channels) {
        let sum: f32 = frame.iter().map(|sample| convert(*sample)).sum();
        mono.push(sum / frame.len() as f32);
    }

    mono
}
