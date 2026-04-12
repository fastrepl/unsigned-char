use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::info;

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRString};

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
swift!(fn _speech_live_transcription_state() -> SRString);
#[cfg(target_os = "macos")]
swift!(fn _speech_live_transcription_stop() -> SRString);

#[derive(Default)]
pub struct TranscriptionManager;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscriptionState {
    pub running: bool,
    pub text: String,
    pub error: Option<String>,
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
        info!(mode, model_id, recording_path = %recording_path.display(), "Starting speech-swift transcription session");
        speech_live_transcription_start(mode, model_id, recording_path, language)
    }

    pub fn preload(&mut self, _model_id: &str) {}

    pub fn clear_preload(&mut self) {}

    pub fn request_stop(&mut self) -> Result<LiveTranscriptionState, String> {
        info!("Requesting speech-swift transcription shutdown");
        speech_live_transcription_stop()
    }

    pub fn state(&mut self) -> Result<LiveTranscriptionState, String> {
        speech_live_transcription_state()
    }

    pub fn stop(&mut self) -> Result<LiveTranscriptionState, String> {
        speech_live_transcription_stop()
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
