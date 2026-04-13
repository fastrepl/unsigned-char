mod asr;
mod audio_capture;
mod logging;
mod permissions;
mod speech_models;

use std::{
    env,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use asr::{
    managed_model_download_state as speech_model_download_state,
    managed_model_path as speech_model_path, reset_managed_model as reset_speech_model,
    start_managed_model_download as start_speech_model_download, LiveTranscriptionState,
    SpeechModelDownloadState, TranscriptionManager,
};
use permissions::{PermissionKind, PermissionSnapshot};
use serde::{Deserialize, Serialize};
use speech_models::{
    detect_device_profile, meeting_audio_file_name, model_path_is_ready, normalize_batch_model,
    recommend_model, selected_model, speech_model_spec, DeviceProfileState, SpeechModelId,
    TranscriptionMode,
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
};
use tracing::{error, info, warn};

const APP_NAME: &str = "unsigned char";
const APP_DISPLAY_NAME: &str = "unsigned {char}";
const PYANNOTE_RUNNER_RELATIVE_PATH: &str = "scripts/pyannote_diarize.py";
const SETTINGS_CONFIG_FILE: &str = "settings.json";
const LEGACY_GENERAL_SETTINGS_FILE: &str = "general-settings.json";
const LEGACY_MODEL_SETTINGS_FILE: &str = "model-settings.json";
const LEGACY_DIARIZATION_SETTINGS_FILE: &str = "diarization-settings.json";
const OPEN_SETTINGS_MENU_ID: &str = "open-settings";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const PYANNOTE_PROVIDER_LABEL: &str = "pyannote.audio";
const PYANNOTE_PIPELINE_REPO: &str = "pyannote/speaker-diarization-community-1";
const HUGGING_FACE_TOKEN_ENV: &str = "HF_TOKEN";
const HUGGING_FACE_ALT_TOKEN_ENV: &str = "HUGGINGFACE_TOKEN";

#[derive(Default)]
struct AppState {
    transcription: Arc<Mutex<TranscriptionManager>>,
    managed_model_download: Arc<Mutex<ManagedModelDownloadState>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingState {
    product_name: &'static str,
    engine: String,
    reference: String,
    permissions: PermissionSnapshot,
    ready: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownExport {
    id: String,
    title: String,
    created_at: String,
    updated_at: String,
    status: String,
    #[serde(default)]
    audio_path: String,
    #[serde(default)]
    diarization_speaker_count: usize,
    #[serde(default)]
    diarization_pipeline_source: Option<String>,
    #[serde(default)]
    diarization_ran_at: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    summary_provider_label: String,
    #[serde(default)]
    summary_model: String,
    #[serde(default)]
    summary_updated_at: Option<String>,
    transcript: String,
    #[serde(default)]
    speaker_turns: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunLocalDiarizationInput {
    audio_path: String,
    #[serde(default)]
    speaker_count: Option<usize>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveModelSettingsInput {
    processing_mode: TranscriptionMode,
    batch_model_id: SpeechModelId,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDiarizationSettingsInput {
    enabled: bool,
    local_path: String,
    hugging_face_token: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveGeneralSettingsInput {
    main_language: String,
    spoken_languages: Vec<String>,
    timezone: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSummarySettingsInput {
    provider: String,
    model: String,
    base_url: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    update_api_key: bool,
    #[serde(default)]
    clear_api_key: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTranscriptSummaryInput {
    title: String,
    transcript: String,
    language: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredModelSettings {
    #[serde(default)]
    processing_mode: Option<TranscriptionMode>,
    #[serde(default)]
    batch_model_id: Option<SpeechModelId>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredDiarizationSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    local_path: String,
    #[serde(default)]
    hugging_face_token: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredGeneralSettings {
    #[serde(default)]
    main_language: String,
    #[serde(default)]
    spoken_languages: Vec<String>,
    #[serde(default)]
    timezone: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredSummarySettings {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    base_url_provider: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    api_key_provider: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppSettings {
    #[serde(default)]
    general: StoredGeneralSettings,
    #[serde(default)]
    model: StoredModelSettings,
    #[serde(default)]
    diarization: StoredDiarizationSettings,
    #[serde(default)]
    summary: StoredSummarySettings,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelSettingsState {
    processing_mode: TranscriptionMode,
    batch_model_id: SpeechModelId,
    selected_model_id: SpeechModelId,
    selected_model_label: &'static str,
    selected_model_repo: &'static str,
    selected_model_detail: &'static str,
    selected_model_size_label: &'static str,
    selected_model_languages_label: &'static str,
    selected_model_local_path: String,
    selected_model_status: String,
    available_models: Vec<SpeechModelOptionState>,
    recommended_model_id: SpeechModelId,
    recommendation_reason: String,
    device_profile: DeviceProfileState,
    selected_ready: bool,
    selected_reference: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeechModelOptionState {
    id: SpeechModelId,
    label: &'static str,
    detail: &'static str,
    processing_mode: TranscriptionMode,
    repo: &'static str,
    local_path: String,
    ready: bool,
    languages_label: &'static str,
    size_label: &'static str,
    recommended: bool,
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
enum ManagedModelDownloadStatus {
    #[default]
    Idle,
    Downloading,
    Ready,
    Error,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedModelDownloadState {
    status: ManagedModelDownloadStatus,
    local_path: String,
    current_file: Option<String>,
    bytes_downloaded: u64,
    total_bytes: Option<u64>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiarizationSettingsState {
    enabled: bool,
    provider_label: &'static str,
    pipeline_repo: &'static str,
    local_path: String,
    resolved_local_path: Option<String>,
    local_ready: bool,
    hugging_face_token_present: bool,
    hugging_face_token_source_label: Option<&'static str>,
    ready: bool,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneralSettingsState {
    main_language: String,
    spoken_languages: Vec<String>,
    timezone: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SummarySettingsState {
    provider: String,
    provider_label: String,
    model: String,
    base_url: String,
    resolved_base_url: String,
    api_key_present: bool,
    ready: bool,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptSummaryResult {
    summary: String,
    provider_label: String,
    model: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiarizationSegment {
    speaker: String,
    start_seconds: f64,
    end_seconds: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalDiarizationScriptOutput {
    segments: Vec<DiarizationSegment>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDiarizationResult {
    audio_path: String,
    pipeline_source: String,
    speaker_count: usize,
    segments: Vec<DiarizationSegment>,
}

impl StoredModelSettings {
    fn from_input(input: SaveModelSettingsInput) -> Result<Self, String> {
        Ok(Self {
            processing_mode: Some(input.processing_mode),
            batch_model_id: Some(normalize_batch_model(input.batch_model_id)),
        })
    }

    fn processing_mode(&self) -> TranscriptionMode {
        self.processing_mode.unwrap_or_default()
    }

    fn batch_model_id(&self) -> SpeechModelId {
        normalize_batch_model(self.batch_model_id.unwrap_or_default())
    }

    fn selected_model_id(&self) -> SpeechModelId {
        selected_model(self.processing_mode(), self.batch_model_id())
    }
}

impl StoredGeneralSettings {
    fn from_input(input: SaveGeneralSettingsInput) -> Self {
        let main_language = input.main_language.trim().to_string();
        let mut spoken_languages = Vec::new();
        let mut seen = std::collections::BTreeSet::new();

        for language in input.spoken_languages {
            let language = language.trim().to_string();
            if language.is_empty() || language == main_language {
                continue;
            }

            if seen.insert(language.clone()) {
                spoken_languages.push(language);
            }
        }

        Self {
            main_language,
            spoken_languages,
            timezone: input.timezone.trim().to_string(),
        }
    }
}

impl StoredSummarySettings {
    fn apply_input(&mut self, input: SaveSummarySettingsInput) -> Result<(), String> {
        let provider = normalize_summary_provider(&input.provider)?;
        self.provider = provider.clone();
        self.model = input.model.trim().to_string();

        let base_url = input.base_url.trim();
        if provider.is_empty() || base_url.is_empty() {
            self.base_url.clear();
            self.base_url_provider.clear();
        } else {
            self.base_url = normalize_summary_base_url(base_url)?;
            self.base_url_provider = provider.clone();
        }

        if input.clear_api_key {
            self.api_key.clear();
            self.api_key_provider.clear();
        } else if input.update_api_key {
            let api_key = input.api_key.trim();
            if !api_key.is_empty() {
                self.api_key = api_key.to_string();
                self.api_key_provider = provider;
            }
        }

        Ok(())
    }

    fn current_base_url(&self) -> String {
        if self.provider.is_empty() || self.base_url_provider != self.provider {
            return String::new();
        }

        self.base_url.trim().to_string()
    }

    fn current_api_key(&self) -> String {
        if self.provider.is_empty() || self.api_key_provider != self.provider {
            return String::new();
        }

        self.api_key.trim().to_string()
    }
}

#[tauri::command]
fn onboarding_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnboardingState, String> {
    let permissions = permissions::snapshot()?;
    let model_settings = build_model_settings_state(&app, &load_model_settings(&app)?)?;

    Ok(OnboardingState {
        product_name: "unsigned char",
        engine: model_settings.selected_model_label.to_string(),
        reference: model_settings
            .selected_reference
            .clone()
            .unwrap_or_else(|| model_settings.selected_model_local_path.clone()),
        ready: permissions.ready() && model_settings.selected_ready,
        permissions,
    })
}

#[tauri::command]
fn request_permission(permission: PermissionKind) -> Result<permissions::PermissionStatus, String> {
    let result = permissions::request(permission);

    match &result {
        Ok(status) => info!(?permission, ?status, "Updated permission status"),
        Err(message) => error!(?permission, %message, "Failed to update permission status"),
    }

    result
}

#[tauri::command]
fn open_permission_settings(permission: PermissionKind) -> Result<(), String> {
    let result = permissions::open_settings(permission);

    match &result {
        Ok(()) => info!(?permission, "Opened macOS permission settings"),
        Err(message) => error!(?permission, %message, "Failed to open macOS permission settings"),
    }

    result
}

#[tauri::command]
fn open_settings_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    section: Option<String>,
) -> Result<(), String> {
    show_settings_window(&app, section.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn model_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ModelSettingsState, String> {
    build_model_settings_state(&app, &load_model_settings(&app)?)
}

#[tauri::command]
fn managed_model_download_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<ManagedModelDownloadState, String> {
    snapshot_managed_model_download_state(&app, &state.inner().managed_model_download)
}

#[tauri::command]
fn download_managed_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<ManagedModelDownloadState, String> {
    let model_settings = effective_model_settings(&load_model_settings(&app)?);
    let selected_model_id = model_settings.selected_model_id();
    let selected_spec = speech_model_spec(selected_model_id);
    let target_dir = managed_model_path_for(&app, selected_model_id)?;
    let shared = state.inner().managed_model_download.clone();

    if model_path_is_ready(selected_model_id, &target_dir) {
        info!(
            model_id = selected_model_id.as_str(),
            target_dir = %target_dir.display(),
            "Managed transcription model already available",
        );
        let mut download_state = shared
            .lock()
            .map_err(|_| "Failed to access model download state.".to_string())?;
        *download_state = ManagedModelDownloadState {
            status: ManagedModelDownloadStatus::Ready,
            local_path: target_dir.display().to_string(),
            current_file: None,
            bytes_downloaded: 0,
            total_bytes: None,
            error: None,
        };
        return Ok(download_state.clone());
    }

    info!(
        model_id = selected_model_id.as_str(),
        target_dir = %target_dir.display(),
        "Starting speech-swift transcription model download",
    );

    start_speech_model_download(selected_model_id.as_str())?;
    let pending_state = ManagedModelDownloadState {
        status: ManagedModelDownloadStatus::Downloading,
        local_path: target_dir.display().to_string(),
        current_file: Some(format!("Preparing {}...", selected_spec.label)),
        bytes_downloaded: 0,
        total_bytes: None,
        error: None,
    };

    {
        let mut download_state = shared
            .lock()
            .map_err(|_| "Failed to access model download state.".to_string())?;
        *download_state = pending_state.clone();
    }

    let snapshot = snapshot_managed_model_download_state(&app, &shared)?;
    if matches!(snapshot.status, ManagedModelDownloadStatus::Idle) {
        return Ok(pending_state);
    }

    Ok(snapshot)
}

#[tauri::command]
fn reveal_managed_model_in_finder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let model_settings = effective_model_settings(&load_model_settings(&app)?);
    let selected_model_id = model_settings.selected_model_id();
    let target_dir = managed_model_path_for(&app, selected_model_id)?;
    if !target_dir.exists() {
        return Err("The transcription model has not been downloaded yet.".to_string());
    }

    info!(
        model_id = selected_model_id.as_str(),
        target_dir = %target_dir.display(),
        "Revealing managed transcription model in Finder",
    );
    reveal_path_in_file_manager(&target_dir)
}

#[tauri::command]
fn delete_managed_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<ManagedModelDownloadState, String> {
    let model_settings = effective_model_settings(&load_model_settings(&app)?);
    let selected_model_id = model_settings.selected_model_id();
    let target_dir = managed_model_path_for(&app, selected_model_id)?;
    let shared = state.inner().managed_model_download.clone();
    let snapshot = snapshot_managed_model_download_state(&app, &shared)?;

    if matches!(snapshot.status, ManagedModelDownloadStatus::Downloading) {
        return Err("The transcription model is still downloading.".to_string());
    }

    reset_speech_model(selected_model_id.as_str())?;

    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir).map_err(|error| {
            format!(
                "Failed to remove the transcription model at {}: {error}",
                target_dir.display()
            )
        })?;
    }

    info!(
        model_id = selected_model_id.as_str(),
        target_dir = %target_dir.display(),
        "Deleted managed transcription model",
    );

    {
        let mut download_state = shared
            .lock()
            .map_err(|_| "Failed to access model download state.".to_string())?;
        *download_state = ManagedModelDownloadState {
            status: ManagedModelDownloadStatus::Idle,
            local_path: target_dir.display().to_string(),
            current_file: None,
            bytes_downloaded: 0,
            total_bytes: None,
            error: None,
        };
    }

    refresh_selected_model_preload(&app, &state.inner().transcription);
    snapshot_managed_model_download_state(&app, &shared)
}

#[tauri::command]
fn diarization_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<DiarizationSettingsState, String> {
    build_diarization_settings_state(&load_diarization_settings(&app)?)
}

#[tauri::command]
fn general_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<GeneralSettingsState, String> {
    build_general_settings_state(&load_general_settings(&app)?)
}

#[tauri::command]
fn summary_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<SummarySettingsState, String> {
    build_summary_settings_state(&load_summary_settings(&app)?)
}

#[tauri::command]
fn save_model_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveModelSettingsInput,
) -> Result<ModelSettingsState, String> {
    let settings = StoredModelSettings::from_input(settings)?;
    persist_model_settings(&app, &settings)?;
    refresh_selected_model_preload(&app, &app.state::<AppState>().transcription);
    info!(
        processing_mode = settings.processing_mode().as_str(),
        batch_model_id = settings.batch_model_id().as_str(),
        "Saved transcription model settings",
    );
    build_model_settings_state(&app, &settings)
}

#[tauri::command]
fn save_diarization_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveDiarizationSettingsInput,
) -> Result<DiarizationSettingsState, String> {
    let mut stored = load_diarization_settings(&app)?;
    stored.enabled = settings.enabled;
    stored.local_path = settings.local_path.trim().to_string();

    let token = settings.hugging_face_token.trim();
    if !token.is_empty() {
        stored.hugging_face_token = normalize_hugging_face_token(token)?;
    }

    persist_diarization_settings(&app, &stored)?;
    info!(
        enabled = stored.enabled,
        custom_path = !stored.local_path.trim().is_empty(),
        has_token = !stored.hugging_face_token.trim().is_empty(),
        "Saved diarization settings",
    );
    build_diarization_settings_state(&stored)
}

#[tauri::command]
fn save_general_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveGeneralSettingsInput,
) -> Result<GeneralSettingsState, String> {
    let settings = StoredGeneralSettings::from_input(settings);
    persist_general_settings(&app, &settings)?;
    info!(
        main_language = %settings.main_language,
        spoken_languages = settings.spoken_languages.len(),
        timezone = %settings.timezone,
        "Saved general settings",
    );
    build_general_settings_state(&settings)
}

#[tauri::command]
fn save_summary_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveSummarySettingsInput,
) -> Result<SummarySettingsState, String> {
    let mut stored = load_summary_settings(&app)?;
    stored.apply_input(settings)?;
    persist_summary_settings(&app, &stored)?;
    info!(
        provider = %stored.provider,
        model = %stored.model,
        base_url = %stored.current_base_url(),
        api_key_present = !stored.current_api_key().is_empty(),
        "Saved summary settings",
    );
    build_summary_settings_state(&stored)
}

#[tauri::command]
async fn generate_transcript_summary<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    input: GenerateTranscriptSummaryInput,
) -> Result<TranscriptSummaryResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_transcript_summary_blocking(&app, input))
        .await
        .map_err(|error| format!("Failed to join summary task: {error}"))?
}

#[tauri::command]
fn run_local_diarization<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    input: RunLocalDiarizationInput,
) -> Result<LocalDiarizationResult, String> {
    info!(
        audio_path = %input.audio_path,
        speaker_count = ?input.speaker_count,
        "Starting local diarization run",
    );

    let settings = load_diarization_settings(&app)?;
    if !settings.enabled {
        return Err("Enable speaker diarization in Settings first.".to_string());
    }

    let resolved_audio_path = resolve_audio_file_path(&input.audio_path)?;
    let runner_path = resolve_pyannote_runner_path(&app);
    if !runner_path.exists() {
        return Err(format!(
            "pyannote runner script not found at {}.",
            runner_path.display()
        ));
    }

    let (pipeline_source, hugging_face_token) = resolve_pyannote_pipeline_source(&settings)?;
    let python = resolve_python_command()?;
    let mut command = std::process::Command::new(python);
    command
        .arg(&runner_path)
        .arg("--audio-path")
        .arg(&resolved_audio_path)
        .arg("--pipeline")
        .arg(&pipeline_source);

    if let Some(speaker_count) = input.speaker_count {
        if speaker_count == 0 {
            return Err("Speaker count must be at least 1.".to_string());
        }

        command
            .arg("--speaker-count")
            .arg(speaker_count.to_string());
    }

    if let Some(token) = hugging_face_token {
        command.env(HUGGING_FACE_TOKEN_ENV, token);
    }

    let output = command.output().map_err(|error| {
        format!(
            "Failed to launch {} for pyannote.audio diarization: {error}",
            python
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Unknown diarization runner failure.".to_string()
        };
        return Err(detail);
    }

    let script_output: LocalDiarizationScriptOutput = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Invalid diarization output: {error}"))?;
    let speaker_count = distinct_speaker_count(&script_output.segments);

    info!(
        audio_path = %resolved_audio_path.display(),
        speaker_count,
        segments = script_output.segments.len(),
        pipeline_source = %pipeline_source,
        "Finished local diarization run",
    );

    Ok(LocalDiarizationResult {
        audio_path: resolved_audio_path.display().to_string(),
        pipeline_source,
        speaker_count,
        segments: script_output.segments,
    })
}

#[tauri::command]
fn sync_meeting_markdown<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    export: MarkdownExport,
) -> Result<String, String> {
    let target_dir = meeting_exports_dir(&app)?;

    std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;

    let file_path = export
        .path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(|path| resolve_meeting_export_path(&app, path))
        .transpose()?
        .unwrap_or_else(|| {
            let file_name = format!("meeting-{}.md", sanitize_path_component(&export.id));
            target_dir.join(file_name)
        });

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    std::fs::write(&file_path, build_markdown(&export)).map_err(|error| error.to_string())?;

    info!(
        meeting_id = %export.id,
        target = %file_path.display(),
        "Synced meeting markdown export",
    );

    Ok(file_path.display().to_string())
}

#[tauri::command]
fn reveal_meeting_export_in_finder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let target = resolve_meeting_export_path(&app, &path)?;
    if !target.exists() {
        return Err(format!(
            "The meeting export does not exist: {}",
            target.display()
        ));
    }

    info!(target = %target.display(), "Revealing meeting export in Finder");
    reveal_path_in_file_manager(&target)
}

#[tauri::command]
fn meeting_export_exists<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<bool, String> {
    let target = resolve_meeting_export_path(&app, &path)?;
    Ok(target.is_file())
}

#[tauri::command]
fn delete_meeting_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let target = resolve_meeting_export_path(&app, &path)?;
    if target.is_dir() {
        return Err(format!(
            "Meeting export path points to a directory: {}",
            target.display()
        ));
    }

    match std::fs::remove_file(&target) {
        Ok(()) => {
            info!(target = %target.display(), "Deleted meeting export");
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            warn!(target = %target.display(), "Meeting export delete requested for missing file");
            Ok(())
        }
        Err(error) => Err(format!(
            "Failed to delete the meeting export at {}: {error}",
            target.display()
        )),
    }
}

#[tauri::command]
fn delete_meeting_audio<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let target = resolve_meeting_audio_path(&app, &path)?;
    if target.is_dir() {
        return Err(format!(
            "Meeting audio path points to a directory: {}",
            target.display()
        ));
    }

    match std::fs::remove_file(&target) {
        Ok(()) => {
            info!(target = %target.display(), "Deleted meeting audio");
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            warn!(target = %target.display(), "Meeting audio delete requested for missing file");
            Ok(())
        }
        Err(error) => Err(format!(
            "Failed to delete the meeting audio at {}: {error}",
            target.display()
        )),
    }
}

#[tauri::command]
async fn start_live_transcription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    meeting_id: String,
) -> Result<LiveTranscriptionState, String> {
    let transcription = state.inner().transcription.clone();
    info!(meeting_id = %meeting_id, "Starting live transcription session");
    tauri::async_runtime::spawn_blocking(move || {
        let model_settings = effective_model_settings(&load_model_settings(&app)?);
        let general_settings = load_general_settings(&app)?;
        let selected_model_id = model_settings.selected_model_id();
        let model_path = resolve_selected_model_path(&app, &model_settings)?;
        let recording_path = meeting_audio_path(&app, &meeting_id)?;
        info!(
            model_id = selected_model_id.as_str(),
            processing_mode = model_settings.processing_mode().as_str(),
            model_path = %model_path.display(),
            recording_path = %recording_path.display(),
            "Resolved transcription session inputs",
        );
        transcription
            .lock()
            .map_err(|_| "Failed to access transcription state.".to_string())?
            .start(
                model_settings.processing_mode().as_str(),
                selected_model_id.as_str(),
                &recording_path,
                general_settings.main_language.trim(),
            )
    })
    .await
    .map_err(|error| format!("Failed to join transcription startup task: {error}"))?
}

#[tauri::command]
fn live_transcription_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<LiveTranscriptionState, String> {
    let transcription = state.inner().transcription.clone();
    let snapshot = transcription
        .lock()
        .map_err(|_| "Failed to access transcription state.".to_string())?
        .state()?;

    if !snapshot.running {
        refresh_selected_model_preload(&app, &transcription);
    }

    Ok(snapshot)
}

#[tauri::command]
fn request_stop_live_transcription(
    state: State<'_, AppState>,
) -> Result<LiveTranscriptionState, String> {
    info!("Requesting live transcription shutdown");
    state
        .inner()
        .transcription
        .lock()
        .map_err(|_| "Failed to access transcription state.".to_string())?
        .request_stop()
}

fn refresh_selected_model_preload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    transcription: &Arc<Mutex<TranscriptionManager>>,
) {
    let selected_model_id = load_model_settings(app)
        .map(|settings| effective_model_settings(&settings).selected_model_id());

    if let Ok(mut manager) = transcription.lock() {
        match selected_model_id {
            Ok(model_id) => manager.preload(model_id.as_str()),
            Err(_) => manager.clear_preload(),
        }
    }
}

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about_metadata = AboutMetadata {
        name: Some(APP_DISPLAY_NAME.to_string()),
        version: Some(app.package_info().version.to_string()),
        copyright: app.config().bundle.copyright.clone(),
        authors: app
            .config()
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };
    let about_label = format!("About {APP_DISPLAY_NAME}");

    let settings_item = MenuItem::with_id(
        app,
        OPEN_SETTINGS_MENU_ID,
        "Settings...",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::about(app, Some(&about_label), Some(about_metadata.clone()))?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        app,
        APP_NAME,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&about_label), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &app_menu,
            #[cfg(not(target_os = "macos"))]
            &file_menu,
            &edit_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

fn settings_window_route(section: Option<&str>) -> String {
    match section.filter(|value| !value.trim().is_empty()) {
        Some(section) => format!(
            "/settings?section={section}&nonce={}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or(0)
        ),
        None => "/settings".to_string(),
    }
}

fn show_settings_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    section: Option<&str>,
) -> tauri::Result<()> {
    let route = settings_window_route(section);

    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.eval(&format!("window.location.hash = '#{route}'"))?;
        let _ = window.unminimize();
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App(format!("index.html#{route}").into()),
    )
    .title("Settings")
    .inner_size(560.0, 540.0)
    .min_inner_size(460.0, 420.0)
    .visible(false)
    .transparent(false)
    .resizable(true);
    let window = builder.build()?;
    window.show()?;
    window.set_focus()?;

    Ok(())
}

fn effective_model_settings(settings: &StoredModelSettings) -> StoredModelSettings {
    StoredModelSettings {
        processing_mode: Some(settings.processing_mode()),
        batch_model_id: Some(settings.batch_model_id()),
    }
}

fn build_model_settings_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<ModelSettingsState, String> {
    let settings = effective_model_settings(settings);
    let general_settings = load_general_settings(app)?;
    let device_profile = detect_device_profile();
    let recommendation = recommend_model(
        &device_profile,
        &selected_model_languages(&general_settings),
        settings.processing_mode(),
    );
    let selected_model_id = settings.selected_model_id();
    let selected_spec = speech_model_spec(selected_model_id);
    let selected_model_path = managed_model_path_for(app, selected_model_id)?;
    let selected_ready = model_path_is_ready(selected_model_id, &selected_model_path);
    let selected_model_status = build_selected_model_status(
        selected_spec.label,
        settings.processing_mode(),
        &selected_model_path,
        selected_ready,
    );

    let mut available_models = Vec::with_capacity(SpeechModelId::ALL.len());
    for model_id in SpeechModelId::ALL {
        let spec = speech_model_spec(model_id);
        let local_path = managed_model_path_for(app, model_id)?;
        available_models.push(SpeechModelOptionState {
            id: spec.id,
            label: spec.label,
            detail: spec.detail,
            processing_mode: spec.processing_mode,
            repo: spec.repo,
            local_path: local_path.display().to_string(),
            ready: model_path_is_ready(model_id, &local_path),
            languages_label: spec.languages_label,
            size_label: spec.size_label,
            recommended: model_id == recommendation.model_id,
        });
    }

    Ok(ModelSettingsState {
        processing_mode: settings.processing_mode(),
        batch_model_id: settings.batch_model_id(),
        selected_model_id,
        selected_model_label: selected_spec.label,
        selected_model_repo: selected_spec.repo,
        selected_model_detail: selected_spec.detail,
        selected_model_size_label: selected_spec.size_label,
        selected_model_languages_label: selected_spec.languages_label,
        selected_model_local_path: selected_model_path.display().to_string(),
        selected_model_status,
        available_models,
        recommended_model_id: recommendation.model_id,
        recommendation_reason: recommendation.reason,
        device_profile,
        selected_ready,
        selected_reference: Some(format!(
            "{} ({})",
            selected_spec.label,
            selected_model_path.display()
        )),
    })
}

fn build_diarization_settings_state(
    settings: &StoredDiarizationSettings,
) -> Result<DiarizationSettingsState, String> {
    let enabled = settings.enabled;
    let local_path = settings.local_path.trim().to_string();
    let configured_local_path = resolve_custom_model_path(&local_path);
    let resolved_local_path = configured_local_path
        .as_deref()
        .and_then(resolve_pyannote_pipeline_path);
    let local_ready = resolved_local_path.is_some();
    let display_local_path = resolved_local_path
        .as_ref()
        .cloned()
        .or(configured_local_path.clone());
    let (hugging_face_token, hugging_face_token_source_label) =
        resolve_hugging_face_token(settings)?;
    let hugging_face_token_present = !hugging_face_token.is_empty();
    let ready = !enabled || local_ready || hugging_face_token_present;
    let status = build_pyannote_status(
        enabled,
        &local_path,
        display_local_path.as_deref(),
        local_ready,
        hugging_face_token_present,
        hugging_face_token_source_label,
    );

    Ok(DiarizationSettingsState {
        enabled,
        provider_label: PYANNOTE_PROVIDER_LABEL,
        pipeline_repo: PYANNOTE_PIPELINE_REPO,
        local_path,
        resolved_local_path: display_local_path
            .as_ref()
            .map(|path| path.display().to_string()),
        local_ready,
        hugging_face_token_present,
        hugging_face_token_source_label,
        ready,
        status,
    })
}

fn build_general_settings_state(
    settings: &StoredGeneralSettings,
) -> Result<GeneralSettingsState, String> {
    Ok(GeneralSettingsState {
        main_language: settings.main_language.trim().to_string(),
        spoken_languages: settings
            .spoken_languages
            .iter()
            .map(|language| language.trim())
            .filter(|language| !language.is_empty())
            .map(str::to_string)
            .collect(),
        timezone: settings.timezone.trim().to_string(),
    })
}

fn build_summary_settings_state(
    settings: &StoredSummarySettings,
) -> Result<SummarySettingsState, String> {
    let provider = settings.provider.trim().to_string();
    let provider_label = summary_provider_label(&provider).to_string();
    let model = settings.model.trim().to_string();
    let base_url = settings.current_base_url();
    let resolved_base_url = summary_provider_resolved_base_url(&provider, &base_url).to_string();
    let api_key_present = !settings.current_api_key().is_empty();

    let status = if provider.is_empty() {
        "Choose a provider and model to enable transcript summaries.".to_string()
    } else if model.is_empty() {
        format!("Add a model for {provider_label} to enable summaries.")
    } else if summary_provider_requires_base_url(&provider) && resolved_base_url.is_empty() {
        format!("Add a base URL for {provider_label}.")
    } else if summary_provider_requires_api_key(&provider) && !api_key_present {
        format!("Add an API key for {provider_label}.")
    } else {
        format!("Ready to summarize transcripts with {provider_label}.")
    };

    let ready = !provider.is_empty()
        && !model.is_empty()
        && (!summary_provider_requires_base_url(&provider) || !resolved_base_url.is_empty())
        && (!summary_provider_requires_api_key(&provider) || api_key_present);

    Ok(SummarySettingsState {
        provider,
        provider_label,
        model,
        base_url,
        resolved_base_url,
        api_key_present,
        ready,
        status,
    })
}

fn load_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredModelSettings, String> {
    Ok(load_app_settings(app)?.model)
}

fn load_diarization_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredDiarizationSettings, String> {
    Ok(load_app_settings(app)?.diarization)
}

fn load_general_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredGeneralSettings, String> {
    Ok(load_app_settings(app)?.general)
}

fn load_summary_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredSummarySettings, String> {
    Ok(load_app_settings(app)?.summary)
}

fn persist_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<(), String> {
    let mut app_settings = load_app_settings(app)?;
    app_settings.model = settings.clone();
    persist_app_settings(app, &app_settings)
}

fn persist_diarization_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredDiarizationSettings,
) -> Result<(), String> {
    let mut app_settings = load_app_settings(app)?;
    app_settings.diarization = settings.clone();
    persist_app_settings(app, &app_settings)
}

fn persist_general_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredGeneralSettings,
) -> Result<(), String> {
    let mut app_settings = load_app_settings(app)?;
    app_settings.general = settings.clone();
    persist_app_settings(app, &app_settings)
}

fn persist_summary_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredSummarySettings,
) -> Result<(), String> {
    let mut app_settings = load_app_settings(app)?;
    app_settings.summary = settings.clone();
    persist_app_settings(app, &app_settings)
}

fn load_app_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredAppSettings, String> {
    let path = settings_config_path(app)?;
    if path.exists() {
        let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
        return serde_json::from_slice(&contents)
            .map_err(|error| format!("Invalid settings config: {error}"));
    }

    Ok(StoredAppSettings {
        general: load_legacy_general_settings(app)?,
        model: load_legacy_model_settings(app)?,
        diarization: load_legacy_diarization_settings(app)?,
        summary: StoredSummarySettings::default(),
    })
}

fn persist_app_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredAppSettings,
) -> Result<(), String> {
    let path = settings_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to encode settings config: {error}"))?;
    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    cleanup_legacy_settings_files(app);
    Ok(())
}

fn settings_config_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(SETTINGS_CONFIG_FILE))
        .map_err(|error| error.to_string())
}

fn general_settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(LEGACY_GENERAL_SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

fn model_settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(LEGACY_MODEL_SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

fn diarization_settings_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(LEGACY_DIARIZATION_SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

fn load_legacy_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredModelSettings, String> {
    let path = model_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredModelSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents)
        .map_err(|error| format!("Invalid legacy model settings: {error}"))
}

fn load_legacy_diarization_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredDiarizationSettings, String> {
    let path = diarization_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredDiarizationSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents)
        .map_err(|error| format!("Invalid legacy diarization settings: {error}"))
}

fn load_legacy_general_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredGeneralSettings, String> {
    let path = general_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredGeneralSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents)
        .map_err(|error| format!("Invalid legacy general settings: {error}"))
}

fn cleanup_legacy_settings_files<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let paths = [
        general_settings_path(app),
        model_settings_path(app),
        diarization_settings_path(app),
    ];

    for path in paths.into_iter().flatten() {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn managed_model_path_for<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model_id: SpeechModelId,
) -> Result<PathBuf, String> {
    let _ = app;
    speech_model_path(model_id.as_str())
}

fn meeting_exports_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .document_dir()
        .map(|path| path.join(APP_NAME))
        .map_err(|error| error.to_string())
}

fn meeting_audio_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    meeting_exports_dir(app).map(|path| path.join("audio"))
}

fn meeting_audio_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    meeting_id: &str,
) -> Result<PathBuf, String> {
    Ok(meeting_audio_dir(app)?.join(meeting_audio_file_name(meeting_id)))
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized.pop();
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }

    normalized
}

fn resolve_meeting_export_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<PathBuf, String> {
    let normalized_path = path.trim();
    if normalized_path.is_empty() {
        return Err("Meeting export path is required.".to_string());
    }

    let exports_dir = normalize_path(&meeting_exports_dir(app)?);
    let candidate = PathBuf::from(normalized_path);
    let resolved = if candidate.is_absolute() {
        normalize_path(&candidate)
    } else {
        normalize_path(&exports_dir.join(candidate))
    };

    if !resolved.starts_with(&exports_dir) {
        return Err(
            "Meeting export path is outside the unsigned char document folder.".to_string(),
        );
    }

    if resolved.extension().and_then(|value| value.to_str()) != Some("md") {
        return Err("Meeting export path must point to a markdown file.".to_string());
    }

    Ok(resolved)
}

fn resolve_meeting_audio_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<PathBuf, String> {
    let normalized_path = path.trim();
    if normalized_path.is_empty() {
        return Err("Meeting audio path is required.".to_string());
    }

    let audio_dir = normalize_path(&meeting_audio_dir(app)?);
    let candidate = PathBuf::from(normalized_path);
    let resolved = if candidate.is_absolute() {
        normalize_path(&candidate)
    } else {
        normalize_path(&audio_dir.join(candidate))
    };

    if !resolved.starts_with(&audio_dir) {
        return Err("Meeting audio path is outside the unsigned char audio folder.".to_string());
    }

    if resolved.extension().and_then(|value| value.to_str()) != Some("wav") {
        return Err("Meeting audio path must point to a WAV file.".to_string());
    }

    Ok(resolved)
}

fn reveal_path_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|error| format!("Failed to open {} in Finder: {error}", path.display()))?;
        if status.success() {
            return Ok(());
        }

        return Err(format!("Failed to open {} in Finder.", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status()
            .map_err(|error| {
                format!(
                    "Failed to open {} in File Explorer: {error}",
                    path.display()
                )
            })?;
        if status.success() {
            return Ok(());
        }

        return Err(format!(
            "Failed to open {} in File Explorer.",
            path.display()
        ));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent()
                .ok_or_else(|| format!("Failed to determine the parent of {}.", path.display()))?
        };

        let status = std::process::Command::new("xdg-open")
            .arg(target)
            .status()
            .map_err(|error| {
                format!(
                    "Failed to open {} in the file manager: {error}",
                    target.display()
                )
            })?;
        if status.success() {
            return Ok(());
        }

        return Err(format!(
            "Failed to open {} in the file manager.",
            target.display()
        ));
    }

    #[allow(unreachable_code)]
    Err("Opening the model folder is not supported on this platform.".to_string())
}

fn snapshot_managed_model_download_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    shared: &Arc<Mutex<ManagedModelDownloadState>>,
) -> Result<ManagedModelDownloadState, String> {
    let model_settings = effective_model_settings(&load_model_settings(app)?);
    let selected_model_id = model_settings.selected_model_id();
    let local_path = managed_model_path_for(app, selected_model_id)?;
    let speech_state = speech_model_download_state(selected_model_id.as_str())?;
    let mut download_state = shared
        .lock()
        .map_err(|_| "Failed to access model download state.".to_string())?;

    download_state.local_path = local_path.display().to_string();

    apply_speech_model_download_state(
        &mut download_state,
        speech_state,
        model_path_is_ready(selected_model_id, &local_path),
    );

    Ok(download_state.clone())
}

fn apply_speech_model_download_state(
    download_state: &mut ManagedModelDownloadState,
    speech_state: SpeechModelDownloadState,
    ready: bool,
) {
    download_state.status = match speech_state.status.as_str() {
        "downloading" => ManagedModelDownloadStatus::Downloading,
        "ready" if ready => ManagedModelDownloadStatus::Ready,
        "error" => ManagedModelDownloadStatus::Error,
        _ if ready => ManagedModelDownloadStatus::Ready,
        _ => ManagedModelDownloadStatus::Idle,
    };
    download_state.current_file = speech_state.current_file;
    download_state.bytes_downloaded = 0;
    download_state.total_bytes = None;
    download_state.error = speech_state.error;
}

fn resolve_pyannote_runner_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let packaged_candidate = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join(PYANNOTE_RUNNER_RELATIVE_PATH));
    let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(PYANNOTE_RUNNER_RELATIVE_PATH);

    match packaged_candidate {
        Some(path) if path.exists() => path,
        _ => dev_candidate,
    }
}

fn resolve_custom_model_path(raw_path: &str) -> Option<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let expanded = expand_home_path(trimmed);
    if !expanded.exists() {
        return None;
    }

    std::fs::canonicalize(&expanded).ok().or(Some(expanded))
}

fn resolve_audio_file_path(raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Add an audio file path before running diarization.".to_string());
    }

    let expanded = expand_home_path(trimmed);
    if !expanded.exists() {
        return Err(format!("Audio file not found: {trimmed}"));
    }

    if !expanded.is_file() {
        return Err(format!("Audio path must point to a file: {trimmed}"));
    }

    std::fs::canonicalize(&expanded).map_err(|error| {
        format!(
            "Failed to resolve audio path {}: {error}",
            expanded.display()
        )
    })
}

fn expand_home_path(raw_path: &str) -> PathBuf {
    if raw_path == "~" {
        return env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(raw_path));
    }

    if let Some(rest) = raw_path.strip_prefix("~/") {
        if let Some(home) = env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }

    PathBuf::from(raw_path)
}

fn resolve_python_command() -> Result<&'static str, String> {
    for candidate in ["python3", "python"] {
        let status = std::process::Command::new(candidate)
            .arg("--version")
            .status();
        if matches!(status, Ok(status) if status.success()) {
            return Ok(candidate);
        }
    }

    Err(
        "Python 3 is required to run local diarization. Install python3 and pyannote.audio first."
            .to_string(),
    )
}

fn pyannote_path_is_ready(path: &Path) -> bool {
    path.is_dir() && path.join("config.yaml").is_file()
}

fn resolve_pyannote_pipeline_path(path: &Path) -> Option<PathBuf> {
    if pyannote_path_is_ready(path) {
        return Some(path.to_path_buf());
    }

    let snapshots_dir = path.join("snapshots");
    if !snapshots_dir.is_dir() {
        return None;
    }

    let main_ref_path = path.join("refs").join("main");
    if let Ok(reference) = std::fs::read_to_string(&main_ref_path) {
        let candidate = snapshots_dir.join(reference.trim());
        if pyannote_path_is_ready(&candidate) {
            return Some(candidate);
        }
    }

    let mut candidates = Vec::new();
    for entry in std::fs::read_dir(&snapshots_dir).ok()?.flatten() {
        let candidate = entry.path();
        if !pyannote_path_is_ready(&candidate) {
            continue;
        }

        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok();
        candidates.push((modified, candidate));
    }

    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    candidates
        .into_iter()
        .map(|(_, candidate)| candidate)
        .next()
}

fn normalize_hugging_face_token(input: &str) -> Result<String, String> {
    let value = input.trim();
    if value.chars().any(char::is_whitespace) {
        return Err("Hugging Face access tokens cannot contain spaces.".to_string());
    }

    Ok(value.to_string())
}

fn resolve_hugging_face_token(
    settings: &StoredDiarizationSettings,
) -> Result<(String, Option<&'static str>), String> {
    let stored = settings.hugging_face_token.trim();
    if !stored.is_empty() {
        return Ok((
            normalize_hugging_face_token(stored)?,
            Some("Access token saved locally in app config."),
        ));
    }

    for (env_name, source_label) in [
        (
            HUGGING_FACE_TOKEN_ENV,
            "Using HF_TOKEN from the environment.",
        ),
        (
            HUGGING_FACE_ALT_TOKEN_ENV,
            "Using HUGGINGFACE_TOKEN from the environment.",
        ),
    ] {
        let env_value = env::var(env_name).unwrap_or_default();
        let env_value = env_value.trim();
        if env_value.is_empty() {
            continue;
        }

        return Ok((normalize_hugging_face_token(env_value)?, Some(source_label)));
    }

    Ok((String::new(), None))
}

fn resolve_pyannote_pipeline_source(
    settings: &StoredDiarizationSettings,
) -> Result<(String, Option<String>), String> {
    let local_path = settings.local_path.trim();
    if let Some(configured_path) = resolve_custom_model_path(local_path) {
        if let Some(path) = resolve_pyannote_pipeline_path(&configured_path) {
            return Ok((path.display().to_string(), None));
        }
    }

    let (token, _) = resolve_hugging_face_token(settings)?;
    if token.is_empty() {
        return Err("Add a local community-1 snapshot path or a Hugging Face token in Settings before running diarization.".to_string());
    }

    Ok((PYANNOTE_PIPELINE_REPO.to_string(), Some(token)))
}

fn build_pyannote_status(
    enabled: bool,
    local_path: &str,
    resolved_local_path: Option<&Path>,
    local_ready: bool,
    hugging_face_token_present: bool,
    hugging_face_token_source_label: Option<&'static str>,
) -> String {
    if !enabled {
        return "Speaker diarization is off.".to_string();
    }

    if let Some(path) = resolved_local_path {
        if local_ready {
            return format!(
                "Using local {} pipeline from {}.",
                PYANNOTE_PIPELINE_REPO,
                path.display()
            );
        }

        if hugging_face_token_present {
            return format!(
                "Found {} for {}, but no community-1 pipeline files were detected there. {} will fall back to downloading the pipeline with the configured Hugging Face token.",
                path.display(),
                PYANNOTE_PIPELINE_REPO,
                PYANNOTE_PROVIDER_LABEL
            );
        }

        return format!(
            "Found {} for {}, but no community-1 pipeline files were detected there.",
            path.display(),
            PYANNOTE_PIPELINE_REPO
        );
    }

    if !local_path.is_empty() {
        if hugging_face_token_present {
            return format!(
                "Local diarization path not found: {local_path}. {} will download {} locally when diarization runs.",
                PYANNOTE_PROVIDER_LABEL, PYANNOTE_PIPELINE_REPO
            );
        }

        return format!("Local diarization path not found: {local_path}");
    }

    if !hugging_face_token_present {
        return "Add a local community-1 snapshot path or a Hugging Face token so pyannote.audio can load the diarization pipeline locally.".to_string();
    }

    let mut status = format!(
        "{} will download {} locally when diarization runs.",
        PYANNOTE_PROVIDER_LABEL, PYANNOTE_PIPELINE_REPO
    );
    if let Some(source_label) = hugging_face_token_source_label {
        status.push(' ');
        status.push_str(source_label);
    }
    status.push_str(" Install ffmpeg and pyannote.audio before running local diarization.");
    status
}

fn distinct_speaker_count(segments: &[DiarizationSegment]) -> usize {
    let mut speakers = std::collections::BTreeSet::new();
    for segment in segments {
        speakers.insert(segment.speaker.as_str());
    }
    speakers.len()
}

fn resolve_selected_model_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<PathBuf, String> {
    let selected_model_id = settings.selected_model_id();
    let selected_spec = speech_model_spec(selected_model_id);
    let selected_path = managed_model_path_for(app, selected_model_id)?;

    if model_path_is_ready(selected_model_id, &selected_path) {
        return Ok(selected_path);
    }

    Err(format!(
        "{} is not ready at {}. Download the selected model first.",
        selected_spec.label,
        selected_path.display(),
    ))
}

fn selected_model_languages(settings: &StoredGeneralSettings) -> Vec<String> {
    let mut languages = Vec::with_capacity(1 + settings.spoken_languages.len());
    languages.push(settings.main_language.trim().to_string());
    languages.extend(
        settings
            .spoken_languages
            .iter()
            .map(|language| language.trim().to_string()),
    );
    languages
}

fn build_selected_model_status(
    label: &str,
    processing_mode: TranscriptionMode,
    local_path: &Path,
    ready: bool,
) -> String {
    if ready {
        return format!("Using {label} from {}.", local_path.display());
    }

    match processing_mode {
        TranscriptionMode::Realtime => format!(
            "Download {label} before starting live transcription. The files stay cached at {}.",
            local_path.display()
        ),
        TranscriptionMode::Batch => format!(
            "Download {label} before post-meeting batch transcription can run. The files stay cached at {}.",
            local_path.display()
        ),
    }
}

#[derive(Deserialize)]
struct OpenAiCompatibleResponse {
    #[serde(default)]
    choices: Vec<OpenAiCompatibleChoice>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleChoice {
    message: OpenAiCompatibleMessage,
}

#[derive(Deserialize)]
struct OpenAiCompatibleMessage {
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicContentBlock>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Deserialize)]
struct GeminiContent {
    #[serde(default)]
    parts: Vec<GeminiPart>,
}

#[derive(Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

fn normalize_summary_provider(value: &str) -> Result<String, String> {
    let provider = value.trim().to_string();
    if provider.is_empty() {
        return Ok(String::new());
    }

    match provider.as_str() {
        "openai"
        | "anthropic"
        | "google_generative_ai"
        | "openrouter"
        | "ollama"
        | "lmstudio"
        | "custom" => Ok(provider),
        _ => Err(format!("Unsupported summary provider: {provider}")),
    }
}

fn normalize_summary_base_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let parsed =
        reqwest::Url::parse(trimmed).map_err(|error| format!("Invalid base URL: {error}"))?;
    Ok(parsed.to_string().trim_end_matches('/').to_string())
}

fn summary_provider_label(provider: &str) -> &'static str {
    match provider {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "google_generative_ai" => "Google Gemini",
        "openrouter" => "OpenRouter",
        "ollama" => "Ollama",
        "lmstudio" => "LM Studio",
        "custom" => "Custom",
        _ => "Not configured",
    }
}

fn summary_provider_default_base_url(provider: &str) -> &'static str {
    match provider {
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com/v1",
        "google_generative_ai" => "https://generativelanguage.googleapis.com/v1beta",
        "openrouter" => "https://openrouter.ai/api/v1",
        "ollama" => "http://127.0.0.1:11434/v1",
        "lmstudio" => "http://127.0.0.1:1234/v1",
        _ => "",
    }
}

fn summary_provider_requires_api_key(provider: &str) -> bool {
    matches!(
        provider,
        "openai" | "anthropic" | "google_generative_ai" | "openrouter"
    )
}

fn summary_provider_requires_base_url(provider: &str) -> bool {
    provider == "custom"
}

fn summary_provider_resolved_base_url<'a>(provider: &'a str, base_url: &'a str) -> &'a str {
    let trimmed = base_url.trim();
    if !trimmed.is_empty() {
        trimmed
    } else {
        summary_provider_default_base_url(provider)
    }
}

fn summary_http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Failed to initialize summary HTTP client: {error}"))
}

fn generate_transcript_summary_blocking<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    input: GenerateTranscriptSummaryInput,
) -> Result<TranscriptSummaryResult, String> {
    let transcript = input.transcript.trim();
    if transcript.is_empty() {
        return Err("A transcript is required before generating a summary.".to_string());
    }

    let settings = load_summary_settings(app)?;
    let state = build_summary_settings_state(&settings)?;
    if !state.ready {
        return Err(state.status);
    }

    let provider = state.provider.as_str();
    let provider_label = state.provider_label.clone();
    let model = state.model.trim().to_string();
    let base_url = state.resolved_base_url.trim().to_string();
    let api_key = settings.current_api_key();
    let system_prompt = summary_system_prompt(&input.language);
    let user_prompt = summary_user_prompt(&input.title, transcript);
    let client = summary_http_client()?;

    let summary = match provider {
        "anthropic" => call_anthropic_summary(
            &client,
            &base_url,
            &api_key,
            &model,
            &system_prompt,
            &user_prompt,
        )?,
        "google_generative_ai" => call_google_summary(
            &client,
            &base_url,
            &api_key,
            &model,
            &system_prompt,
            &user_prompt,
        )?,
        _ => call_openai_compatible_summary(
            &client,
            provider,
            &base_url,
            &api_key,
            &model,
            &system_prompt,
            &user_prompt,
        )?,
    };

    let summary = summary.trim().to_string();
    if summary.is_empty() {
        return Err(format!("{provider_label} returned an empty summary."));
    }

    Ok(TranscriptSummaryResult {
        summary,
        provider_label,
        model,
    })
}

fn summary_system_prompt(language: &str) -> String {
    let trimmed_language = language.trim();
    if trimmed_language.is_empty() {
        "You turn raw meeting transcripts into concise, actionable Markdown summaries. Use only information grounded in the transcript. If something is uncertain, say so plainly. Keep the output tight and useful.".to_string()
    } else {
        format!(
            "You turn raw meeting transcripts into concise, actionable Markdown summaries. Use only information grounded in the transcript. If something is uncertain, say so plainly. Respond in the language identified by this code when possible: {trimmed_language}. Keep the output tight and useful."
        )
    }
}

fn summary_user_prompt(title: &str, transcript: &str) -> String {
    format!(
        "Meeting title: {}\n\nFormat the response as Markdown with these sections:\n## Summary\n## Decisions\n## Action Items\n## Open Questions\n\nUse flat bullet lists where appropriate. If a section has no clear information, write `- None`.\n\nTranscript:\n{}",
        title.trim(),
        transcript.trim()
    )
}

fn call_openai_compatible_summary(
    client: &reqwest::blocking::Client,
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut request = client.post(url).json(&serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ]
    }));

    if !api_key.trim().is_empty() {
        request = request.bearer_auth(api_key.trim());
    }

    if provider == "openrouter" {
        request = request
            .header("HTTP-Referer", "https://unsigned.char")
            .header("X-Title", APP_DISPLAY_NAME);
    }

    let response = request.send().map_err(|error| {
        format!(
            "Failed to reach {}: {error}",
            summary_provider_label(provider)
        )
    })?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!(
            "{} summary request failed with {}{}",
            summary_provider_label(provider),
            status,
            summarize_error_body(&body)
        ));
    }

    let payload: OpenAiCompatibleResponse = response.json().map_err(|error| {
        format!(
            "Failed to decode {} response: {error}",
            summary_provider_label(provider)
        )
    })?;

    payload
        .choices
        .first()
        .and_then(|choice| extract_openai_message_text(&choice.message.content))
        .ok_or_else(|| {
            format!(
                "{} returned no summary text.",
                summary_provider_label(provider)
            )
        })
}

fn call_anthropic_summary(
    client: &reqwest::blocking::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/messages", base_url.trim_end_matches('/'));
    let response = client
        .post(url)
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": model,
            "max_tokens": 1200,
            "system": system_prompt,
            "messages": [{ "role": "user", "content": user_prompt }]
        }))
        .send()
        .map_err(|error| format!("Failed to reach Anthropic: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!(
            "Anthropic summary request failed with {}{}",
            status,
            summarize_error_body(&body)
        ));
    }

    let payload: AnthropicResponse = response
        .json()
        .map_err(|error| format!("Failed to decode Anthropic response: {error}"))?;

    let text = payload
        .content
        .iter()
        .filter(|block| block.kind == "text")
        .filter_map(|block| {
            let text = block.text.trim();
            (!text.is_empty()).then_some(text)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    if text.is_empty() {
        return Err("Anthropic returned no summary text.".to_string());
    }

    Ok(text)
}

fn call_google_summary(
    client: &reqwest::blocking::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let model = model.trim().trim_start_matches("models/");
    let mut url = reqwest::Url::parse(&format!(
        "{}/models/{}:generateContent",
        base_url.trim_end_matches('/'),
        model
    ))
    .map_err(|error| format!("Invalid Gemini URL: {error}"))?;
    url.query_pairs_mut().append_pair("key", api_key.trim());

    let response = client
        .post(url)
        .json(&serde_json::json!({
            "systemInstruction": {
                "parts": [{ "text": system_prompt }]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{ "text": user_prompt }]
                }
            ],
            "generationConfig": {
                "temperature": 0.2
            }
        }))
        .send()
        .map_err(|error| format!("Failed to reach Google Gemini: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!(
            "Google Gemini summary request failed with {}{}",
            status,
            summarize_error_body(&body)
        ));
    }

    let payload: GeminiResponse = response
        .json()
        .map_err(|error| format!("Failed to decode Google Gemini response: {error}"))?;

    let text = payload
        .candidates
        .first()
        .and_then(|candidate| candidate.content.as_ref())
        .map(|content| {
            content
                .parts
                .iter()
                .filter_map(|part| part.text.as_deref())
                .filter_map(|text| {
                    let text = text.trim();
                    (!text.is_empty()).then_some(text)
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default();

    if text.is_empty() {
        return Err("Google Gemini returned no summary text.".to_string());
    }

    Ok(text)
}

fn extract_openai_message_text(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        serde_json::Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn summarize_error_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let compact = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    let message = if compact.len() > 200 {
        format!(": {}", &compact[..200])
    } else {
        format!(": {compact}")
    };
    message
}

fn build_markdown(export: &MarkdownExport) -> String {
    let title = export.title.trim();
    let summary = if export.summary.trim().is_empty() {
        "_No summary yet._".to_string()
    } else {
        export.summary.trim().to_string()
    };
    let transcript = if export.transcript.trim().is_empty() {
        "_No transcript yet._".to_string()
    } else {
        export.transcript.trim().to_string()
    };
    let speaker_turns = if export.speaker_turns.trim().is_empty() {
        "_No speaker turns yet._".to_string()
    } else {
        export.speaker_turns.trim().to_string()
    };

    format!(
        "---\nid: {id}\ntitle: {frontmatter_title}\ncreated_at: {created_at}\nupdated_at: {updated_at}\nstatus: {status}\naudio_path: {audio_path}\nsummary_provider: {summary_provider}\nsummary_model: {summary_model}\nsummary_updated_at: {summary_updated_at}\ndiarization_speaker_count: {diarization_speaker_count}\ndiarization_pipeline_source: {diarization_pipeline_source}\ndiarization_ran_at: {diarization_ran_at}\n---\n\n# {title}\n\n## Summary\n\n{summary}\n\n## Transcript\n\n{transcript}\n\n## Speaker Turns\n\n{speaker_turns}\n",
        id = yaml_string(&export.id),
        frontmatter_title = yaml_string(title),
        created_at = yaml_string(export.created_at.trim()),
        updated_at = yaml_string(export.updated_at.trim()),
        status = yaml_string(export.status.trim()),
        audio_path = yaml_optional_string(Some(export.audio_path.trim())),
        summary_provider = yaml_optional_string(Some(export.summary_provider_label.trim())),
        summary_model = yaml_optional_string(Some(export.summary_model.trim())),
        summary_updated_at = yaml_optional_string(export.summary_updated_at.as_deref()),
        diarization_speaker_count = export.diarization_speaker_count,
        diarization_pipeline_source =
            yaml_optional_string(export.diarization_pipeline_source.as_deref()),
        diarization_ran_at = yaml_optional_string(export.diarization_ran_at.as_deref()),
        title = title,
        summary = summary,
        transcript = transcript,
        speaker_turns = speaker_turns
    )
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn yaml_optional_string(value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(yaml_string)
        .unwrap_or_else(|| "null".to_string())
}

fn sanitize_path_component(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut last_was_dash = false;

    for character in input.chars() {
        let normalized = if character.is_ascii_alphanumeric() {
            last_was_dash = false;
            character.to_ascii_lowercase()
        } else if !last_was_dash {
            last_was_dash = true;
            '-'
        } else {
            continue;
        };

        output.push(normalized);
    }

    let output = output.trim_matches('-');
    if output.is_empty() {
        "meeting".to_string()
    } else {
        output.to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            app.set_menu(build_app_menu(app.handle())?)?;
            refresh_selected_model_preload(app.handle(), &app.state::<AppState>().transcription);
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == OPEN_SETTINGS_MENU_ID {
                let _ = show_settings_window(app, None);
            }
        })
        .invoke_handler(tauri::generate_handler![
            onboarding_state,
            request_permission,
            open_permission_settings,
            open_settings_window,
            model_settings_state,
            managed_model_download_state,
            download_managed_model,
            reveal_managed_model_in_finder,
            delete_managed_model,
            diarization_settings_state,
            general_settings_state,
            summary_settings_state,
            save_model_settings,
            save_diarization_settings,
            save_general_settings,
            save_summary_settings,
            generate_transcript_summary,
            run_local_diarization,
            sync_meeting_markdown,
            reveal_meeting_export_in_finder,
            meeting_export_exists,
            delete_meeting_export,
            delete_meeting_audio,
            start_live_transcription,
            live_transcription_state,
            request_stop_live_transcription
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let _log_guard = match logging::init_logging(app.handle()) {
        Ok((guard, log_path)) => {
            info!(
                version = env!("CARGO_PKG_VERSION"),
                log_path = %log_path.display(),
                "Application logging initialized",
            );
            Some(guard)
        }
        Err(message) => {
            eprintln!("Failed to initialize application logging: {message}");
            None
        }
    };

    info!("Application ready");

    app.run(|_, event| {
        if let RunEvent::Exit = event {
            info!("Application exiting");
        }
    });
}
