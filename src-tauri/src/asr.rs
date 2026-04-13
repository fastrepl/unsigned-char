use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::info;

use crate::audio_capture::LiveCaptureSession;

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRData, SRString};

#[cfg(target_os = "macos")]
swift!(fn _speech_model_cache_dir(model_id: &SRString) -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_model_download_state(model_id: &SRString) -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_model_start_download(model_id: &SRString) -> Bool);
#[cfg(target_os = "macos")]
swift!(fn _speech_model_reset(model_id: &SRString) -> Bool);
#[cfg(target_os = "macos")]
swift!(fn _speech_live_transcription_start(
    mode: &SRString,
    model_id: &SRString,
    recording_path: &SRString,
    language: &SRString
) -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_live_transcription_append(
    mixed_samples: &SRData,
    microphone_samples: &SRData,
    system_samples: &SRData
) -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_live_transcription_state() -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_live_transcription_stop() -> SRString);

#[derive(Default)]
pub struct TranscriptionManager {
    active: Option<CaptureHandle>,
}

struct CaptureHandle {
    capture: LiveCaptureSession,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscriptEntry {
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscriptionState {
    pub running: bool,
    pub text: String,
    pub error: Option<String>,
    #[serde(default)]
    pub entries: Vec<LiveTranscriptEntry>,
    #[serde(default)]
    pub audio_path: String,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelDownloadState {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub current_file: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

impl TranscriptionManager {
    pub fn start(
        &mut self,
        mode: &str,
        model_id: &str,
        recording_path: &Path,
        language: &str,
    ) -> Result<LiveTranscriptionState, String> {
        let _ = self.stop();
        info!(
            mode,
            model_id,
            recording_path = %recording_path.display(),
            "Starting speech-swift transcription session"
        );

        let initial = ensure_started(speech_live_transcription_start(
            mode,
            model_id,
            recording_path,
            language,
        )?)?;

        match CaptureHandle::start() {
            Ok(handle) => {
                self.active = Some(handle);
                Ok(initial)
            }
            Err(message) => {
                let _ = speech_live_transcription_stop();
                Err(message)
            }
        }
    }

    pub fn preload(&mut self, _model_id: &str) {}

    pub fn clear_preload(&mut self) {}

    pub fn request_stop(&mut self) -> Result<LiveTranscriptionState, String> {
        info!("Requesting speech-swift transcription shutdown");
        if let Some(active) = self.active.as_ref() {
            active.capture.request_stop()?;
        }

        speech_live_transcription_state()
    }

    pub fn state(&mut self) -> Result<LiveTranscriptionState, String> {
        let Some(active) = self.active.as_ref() else {
            return speech_live_transcription_state();
        };

        if active.capture.is_running() {
            return speech_live_transcription_state();
        }

        let active = self
            .active
            .take()
            .ok_or_else(|| "Failed to access transcription state.".to_string())?;
        active.finish()
    }

    pub fn stop(&mut self) -> Result<LiveTranscriptionState, String> {
        let Some(active) = self.active.take() else {
            return speech_live_transcription_stop();
        };

        let _ = active.capture.request_stop();
        active.finish()
    }
}

impl CaptureHandle {
    fn start() -> Result<Self, String> {
        let capture = LiveCaptureSession::start(|mixed, microphone, system| {
            speech_live_transcription_append(&mixed, &microphone, &system)
        })?;
        Ok(Self { capture })
    }

    fn finish(self) -> Result<LiveTranscriptionState, String> {
        let capture_error = self.capture.take_error();
        self.capture.finish()?;

        let mut snapshot = speech_live_transcription_stop()?;
        if snapshot.error.is_none() {
            snapshot.error = capture_error;
        }

        Ok(snapshot)
    }
}

pub fn managed_model_path(model_id: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let model_id: SRString = model_id.into();
        let path = unsafe { _speech_model_cache_dir(&model_id) };
        Ok(PathBuf::from(path.as_str()))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

pub fn managed_model_download_state(model_id: &str) -> Result<SpeechModelDownloadState, String> {
    #[cfg(target_os = "macos")]
    {
        let model_id: SRString = model_id.into();
        decode_json(
            unsafe { _speech_model_download_state(&model_id) },
            "speech-swift model download state",
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

pub fn start_managed_model_download(model_id: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let model_id: SRString = model_id.into();
        if unsafe { _speech_model_start_download(&model_id) } {
            return Ok(());
        }

        Err("Failed to start the speech-swift model download.".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

pub fn reset_managed_model(model_id: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let model_id: SRString = model_id.into();
        if unsafe { _speech_model_reset(&model_id) } {
            return Ok(());
        }

        Err("Failed to reset the speech-swift model state.".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

fn ensure_started(snapshot: LiveTranscriptionState) -> Result<LiveTranscriptionState, String> {
    if snapshot.running {
        return Ok(snapshot);
    }

    Err(snapshot
        .error
        .unwrap_or_else(|| "Failed to start the speech-swift transcription session.".to_string()))
}

fn speech_live_transcription_start(
    mode: &str,
    model_id: &str,
    recording_path: &Path,
    language: &str,
) -> Result<LiveTranscriptionState, String> {
    #[cfg(target_os = "macos")]
    {
        let mode: SRString = mode.into();
        let model_id: SRString = model_id.into();
        let recording_path_string = recording_path.display().to_string();
        let recording_path: SRString = recording_path_string.as_str().into();
        let language: SRString = language.into();
        decode_json(
            unsafe {
                _speech_live_transcription_start(&mode, &model_id, &recording_path, &language)
            },
            "speech-swift transcription state",
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

fn speech_live_transcription_append(
    mixed_samples: &[f32],
    microphone_samples: &[f32],
    system_samples: &[f32],
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let encode = |samples: &[f32]| {
            let mut bytes = Vec::with_capacity(samples.len() * std::mem::size_of::<f32>());
            for sample in samples {
                bytes.extend_from_slice(&sample.to_le_bytes());
            }
            let data: SRData = bytes.as_slice().into();
            (bytes, data)
        };

        let (_mixed_bytes, mixed_data) = encode(mixed_samples);
        let (_microphone_bytes, microphone_data) = encode(microphone_samples);
        let (_system_bytes, system_data) = encode(system_samples);
        let message = unsafe {
            _speech_live_transcription_append(&mixed_data, &microphone_data, &system_data)
        };
        if message.as_str().is_empty() {
            return Ok(());
        }

        Err(message.as_str().to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = samples;
        Err("speech-swift is only available on macOS.".to_string())
    }
}

fn speech_live_transcription_state() -> Result<LiveTranscriptionState, String> {
    #[cfg(target_os = "macos")]
    {
        decode_json(
            unsafe { _speech_live_transcription_state() },
            "speech-swift transcription state",
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

fn speech_live_transcription_stop() -> Result<LiveTranscriptionState, String> {
    #[cfg(target_os = "macos")]
    {
        decode_json(
            unsafe { _speech_live_transcription_stop() },
            "speech-swift transcription state",
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("speech-swift is only available on macOS.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn decode_json<T>(value: SRString, label: &str) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_str(value.as_str())
        .map_err(|error| format!("Failed to decode {label}: {error}"))
}
