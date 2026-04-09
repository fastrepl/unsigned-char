mod asr;
mod permissions;

use std::{
    env,
    path::{Path, PathBuf},
    sync::Mutex,
};

use asr::{LiveTranscriptionState, TranscriptionManager};
use permissions::{PermissionKind, PermissionSnapshot};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, State, WebviewUrl, WebviewWindowBuilder,
};

const APP_NAME: &str = "unsigned char";
const BUNDLED_MODEL_NAME: &str = "Bundled Qwen3-ASR";
const BUNDLED_MODEL_RELATIVE_PATH: &str = "models/qwen-asr";
const PYANNOTE_RUNNER_RELATIVE_PATH: &str = "scripts/pyannote_diarize.py";
const MODEL_SETTINGS_FILE: &str = "model-settings.json";
const DIARIZATION_SETTINGS_FILE: &str = "diarization-settings.json";
const OPEN_SETTINGS_MENU_ID: &str = "open-settings";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const PYANNOTE_PROVIDER_LABEL: &str = "pyannote.audio";
const PYANNOTE_PIPELINE_REPO: &str = "pyannote/speaker-diarization-community-1";
const HUGGING_FACE_TOKEN_ENV: &str = "HF_TOKEN";
const HUGGING_FACE_ALT_TOKEN_ENV: &str = "HUGGINGFACE_TOKEN";

#[derive(Default)]
struct AppState {
    transcription: Mutex<TranscriptionManager>,
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
    title: String,
    created_at: String,
    updated_at: String,
    status: String,
    transcript: String,
    #[serde(default)]
    speaker_turns: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunLocalDiarizationInput {
    audio_path: String,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum ModelSource {
    Bundled,
    HuggingFace,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveModelSettingsInput {
    source: ModelSource,
    hugging_face_repo: String,
    hugging_face_revision: String,
    hugging_face_local_path: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDiarizationSettingsInput {
    enabled: bool,
    local_path: String,
    hugging_face_token: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredModelSettings {
    #[serde(default)]
    source: Option<ModelSource>,
    #[serde(default)]
    hugging_face_repo: String,
    #[serde(default)]
    hugging_face_revision: String,
    #[serde(default)]
    hugging_face_local_path: String,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelSettingsState {
    source: ModelSource,
    bundled_label: &'static str,
    bundled_relative_path: &'static str,
    bundled_resolved_path: String,
    bundled_ready: bool,
    bundled_status: String,
    hugging_face_repo: String,
    hugging_face_revision: String,
    hugging_face_local_path: String,
    hugging_face_resolved_path: Option<String>,
    hugging_face_ready: bool,
    hugging_face_status: String,
    selected_ready: bool,
    selected_reference: Option<String>,
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

impl Default for ModelSource {
    fn default() -> Self {
        Self::Bundled
    }
}

impl StoredModelSettings {
    fn from_input(input: SaveModelSettingsInput) -> Result<Self, String> {
        Ok(Self {
            source: Some(input.source),
            hugging_face_repo: normalize_hugging_face_repo(&input.hugging_face_repo)?,
            hugging_face_revision: input.hugging_face_revision.trim().to_string(),
            hugging_face_local_path: input.hugging_face_local_path.trim().to_string(),
        })
    }

    fn source(&self) -> ModelSource {
        self.source.unwrap_or_default()
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
        engine: match model_settings.source {
            ModelSource::Bundled => BUNDLED_MODEL_NAME.to_string(),
            ModelSource::HuggingFace => "Hugging Face".to_string(),
        },
        reference: model_settings
            .selected_reference
            .clone()
            .unwrap_or_else(|| model_settings.bundled_resolved_path.clone()),
        ready: permissions.ready() && model_settings.selected_ready,
        permissions,
    })
}

#[tauri::command]
fn request_permission(permission: PermissionKind) -> Result<permissions::PermissionStatus, String> {
    permissions::request(permission)
}

#[tauri::command]
fn open_permission_settings(permission: PermissionKind) -> Result<(), String> {
    permissions::open_settings(permission)
}

#[tauri::command]
fn open_settings_window<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    show_settings_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn model_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<ModelSettingsState, String> {
    build_model_settings_state(&app, &load_model_settings(&app)?)
}

#[tauri::command]
fn diarization_settings_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<DiarizationSettingsState, String> {
    build_diarization_settings_state(&load_diarization_settings(&app)?)
}

#[tauri::command]
fn save_model_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveModelSettingsInput,
) -> Result<ModelSettingsState, String> {
    let settings = StoredModelSettings::from_input(settings)?;
    persist_model_settings(&app, &settings)?;
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
    build_diarization_settings_state(&stored)
}

#[tauri::command]
fn run_local_diarization<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    input: RunLocalDiarizationInput,
) -> Result<LocalDiarizationResult, String> {
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
    let mut command = std::process::Command::new(&python);
    command
        .arg(&runner_path)
        .arg("--audio-path")
        .arg(&resolved_audio_path)
        .arg("--pipeline")
        .arg(&pipeline_source);

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

    Ok(LocalDiarizationResult {
        audio_path: resolved_audio_path.display().to_string(),
        pipeline_source,
        speaker_count,
        segments: script_output.segments,
    })
}

#[tauri::command]
fn save_meeting_markdown<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    export: MarkdownExport,
) -> Result<String, String> {
    let target_dir = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("unsigned char");

    std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;

    let file_name = format!(
        "{}-{}.md",
        sanitize_path_component(&export.title),
        sanitize_path_component(&export.created_at)
    );
    let file_path = unique_path(target_dir.join(file_name));

    std::fs::write(&file_path, build_markdown(&export)).map_err(|error| error.to_string())?;

    Ok(file_path.display().to_string())
}

#[tauri::command]
fn start_live_transcription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<LiveTranscriptionState, String> {
    let settings = load_model_settings(&app)?;
    let model_path = resolve_selected_model_path(&app, &settings)?;
    state
        .inner()
        .transcription
        .lock()
        .map_err(|_| "Failed to access transcription state.".to_string())?
        .start(&model_path)
}

#[tauri::command]
fn live_transcription_state(state: State<'_, AppState>) -> Result<LiveTranscriptionState, String> {
    Ok(state
        .inner()
        .transcription
        .lock()
        .map_err(|_| "Failed to access transcription state.".to_string())?
        .state())
}

#[tauri::command]
fn stop_live_transcription(state: State<'_, AppState>) -> Result<LiveTranscriptionState, String> {
    state
        .inner()
        .transcription
        .lock()
        .map_err(|_| "Failed to access transcription state.".to_string())?
        .stop()
}

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about_metadata = AboutMetadata {
        name: Some(APP_NAME.to_string()),
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
            &PredefinedMenuItem::about(app, None, Some(about_metadata.clone()))?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        app,
        APP_NAME,
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
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

fn show_settings_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.unminimize();
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Settings")
    .inner_size(560.0, 540.0)
    .min_inner_size(460.0, 420.0)
    .resizable(true)
    .build()?;

    Ok(())
}

fn build_model_settings_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<ModelSettingsState, String> {
    let bundled_path = resolve_bundled_model_path(app);
    let bundled_ready = model_path_is_ready(&bundled_path);
    let bundled_status = if bundled_ready {
        format!(
            "{BUNDLED_MODEL_NAME} is bundled and ready at {}.",
            bundled_path.display()
        )
    } else {
        format!(
            "Bundled model is incomplete. Put vocab.json and Qwen3-ASR safetensors files under {}.",
            bundled_path.display()
        )
    };

    let hugging_face_repo = settings.hugging_face_repo.trim().to_string();
    let hugging_face_revision = settings.hugging_face_revision.trim().to_string();
    let hugging_face_local_path = settings.hugging_face_local_path.trim().to_string();
    let hugging_face_resolved_path = resolve_custom_model_path(&hugging_face_local_path);
    let hugging_face_ready = !hugging_face_repo.is_empty()
        && hugging_face_resolved_path
            .as_ref()
            .map(|path| model_path_is_ready(path))
            .unwrap_or(false);
    let hugging_face_status = build_hugging_face_status(
        &hugging_face_repo,
        &hugging_face_revision,
        &hugging_face_local_path,
        hugging_face_resolved_path.as_deref(),
        hugging_face_ready,
    );

    let source = settings.source();
    let selected_ready = match source {
        ModelSource::Bundled => bundled_ready,
        ModelSource::HuggingFace => hugging_face_ready,
    };
    let selected_reference = match source {
        ModelSource::Bundled => Some(bundled_path.display().to_string()),
        ModelSource::HuggingFace => {
            if hugging_face_repo.is_empty() {
                hugging_face_resolved_path
                    .as_ref()
                    .map(|path| path.display().to_string())
            } else if let Some(path) = hugging_face_resolved_path.as_ref() {
                Some(format!(
                    "{} ({})",
                    format_hugging_face_reference(&hugging_face_repo, &hugging_face_revision),
                    path.display()
                ))
            } else {
                Some(format_hugging_face_reference(
                    &hugging_face_repo,
                    &hugging_face_revision,
                ))
            }
        }
    };

    Ok(ModelSettingsState {
        source,
        bundled_label: BUNDLED_MODEL_NAME,
        bundled_relative_path: BUNDLED_MODEL_RELATIVE_PATH,
        bundled_resolved_path: bundled_path.display().to_string(),
        bundled_ready,
        bundled_status,
        hugging_face_repo,
        hugging_face_revision,
        hugging_face_local_path,
        hugging_face_resolved_path: hugging_face_resolved_path
            .as_ref()
            .map(|path| path.display().to_string()),
        hugging_face_ready,
        hugging_face_status,
        selected_ready,
        selected_reference,
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

fn load_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredModelSettings, String> {
    let path = model_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredModelSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents).map_err(|error| format!("Invalid model settings: {error}"))
}

fn load_diarization_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredDiarizationSettings, String> {
    let path = diarization_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredDiarizationSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents)
        .map_err(|error| format!("Invalid diarization settings: {error}"))
}

fn persist_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<(), String> {
    let path = model_settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to encode settings: {error}"))?;
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

fn persist_diarization_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredDiarizationSettings,
) -> Result<(), String> {
    let path = diarization_settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to encode diarization settings: {error}"))?;
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

fn model_settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(MODEL_SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

fn diarization_settings_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(DIARIZATION_SETTINGS_FILE))
        .map_err(|error| error.to_string())
}

fn resolve_bundled_model_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let packaged_candidate = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join(BUNDLED_MODEL_RELATIVE_PATH));
    let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(BUNDLED_MODEL_RELATIVE_PATH);

    match packaged_candidate {
        Some(path) if path.exists() => path,
        _ => dev_candidate,
    }
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

fn model_path_is_ready(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return false,
    };

    let mut has_vocab = false;
    let mut has_model = false;

    for entry in entries.flatten() {
        let file_path = entry.path();
        if !file_path.is_file() {
            continue;
        }

        let Some(file_name) = file_path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let file_name = file_name.to_ascii_lowercase();

        if file_name == "vocab.json" {
            has_vocab = true;
            continue;
        }

        if file_name == "model.safetensors"
            || (file_name.starts_with("model-") && file_name.ends_with(".safetensors"))
        {
            has_model = true;
        }
    }

    has_vocab && has_model
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

fn normalize_hugging_face_repo(input: &str) -> Result<String, String> {
    let value = input.trim();
    if value.is_empty() {
        return Ok(String::new());
    }

    if let Some((_, rest)) = value.split_once("huggingface.co/") {
        let repo = extract_repo_from_hugging_face_url(rest)?;
        validate_hugging_face_repo(&repo)?;
        return Ok(repo);
    }

    validate_hugging_face_repo(value)?;
    Ok(value.to_string())
}

fn normalize_hugging_face_token(input: &str) -> Result<String, String> {
    let value = input.trim();
    if value.chars().any(char::is_whitespace) {
        return Err("Hugging Face access tokens cannot contain spaces.".to_string());
    }

    Ok(value.to_string())
}

fn extract_repo_from_hugging_face_url(path: &str) -> Result<String, String> {
    let segments = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty());
    let mut repo_segments = Vec::new();

    for segment in segments {
        if matches!(segment, "tree" | "resolve" | "blob" | "commit") {
            break;
        }
        repo_segments.push(segment);
    }

    if repo_segments.is_empty() {
        return Err(
            "Enter a Hugging Face repo like Qwen/Qwen3-ASR-0.6B or paste a repo URL.".to_string(),
        );
    }

    Ok(repo_segments.join("/"))
}

fn validate_hugging_face_repo(repo: &str) -> Result<(), String> {
    if repo.chars().any(char::is_whitespace) {
        return Err("Hugging Face repo IDs cannot contain spaces.".to_string());
    }

    if repo.split('/').any(|segment| segment.is_empty()) {
        return Err("Enter a Hugging Face repo like Qwen/Qwen3-ASR-0.6B.".to_string());
    }

    Ok(())
}

fn format_hugging_face_reference(repo: &str, revision: &str) -> String {
    if revision.trim().is_empty() {
        repo.to_string()
    } else {
        format!("{}@{}", repo, revision.trim())
    }
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

fn build_hugging_face_status(
    repo: &str,
    revision: &str,
    local_path: &str,
    resolved_path: Option<&Path>,
    ready: bool,
) -> String {
    if repo.is_empty() {
        return "Enter a Hugging Face repo or URL to use a custom model.".to_string();
    }

    if local_path.is_empty() {
        return "Add a local snapshot path for the Hugging Face model.".to_string();
    }

    let reference = format_hugging_face_reference(repo, revision);
    match resolved_path {
        Some(path) if ready => format!("Using {reference} from {}.", path.display()),
        Some(path) => format!(
            "Found {} for {reference}, but qwen-asr needs vocab.json and model safetensors files there.",
            path.display()
        ),
        None => format!("Local model path not found: {local_path}"),
    }
}

fn resolve_selected_model_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<PathBuf, String> {
    let source = settings.source();
    let selected_path = match source {
        ModelSource::Bundled => resolve_bundled_model_path(app),
        ModelSource::HuggingFace => resolve_custom_model_path(&settings.hugging_face_local_path)
            .ok_or_else(|| "The selected Hugging Face snapshot path was not found.".to_string())?,
    };

    if model_path_is_ready(&selected_path) {
        return Ok(selected_path);
    }

    Err(match source {
        ModelSource::Bundled => format!(
            "Bundled model is incomplete at {}. The directory must include vocab.json and model safetensors files.",
            selected_path.display()
        ),
        ModelSource::HuggingFace => format!(
            "Hugging Face model is incomplete at {}. The directory must include vocab.json and model safetensors files.",
            selected_path.display()
        ),
    })
}

fn build_markdown(export: &MarkdownExport) -> String {
    format!(
        "# {title}\n\n- Created: {created_at}\n- Updated: {updated_at}\n- Status: {status}\n\n## Transcript\n\n{transcript}\n\n## Speaker Turns\n\n{speaker_turns}\n",
        title = export.title.trim(),
        created_at = export.created_at.trim(),
        updated_at = export.updated_at.trim(),
        status = export.status.trim(),
        transcript = if export.transcript.trim().is_empty() {
            "_No transcript yet._".to_string()
        } else {
            export.transcript.trim().to_string()
        },
        speaker_turns = if export.speaker_turns.trim().is_empty() {
            "_No speaker turns yet._".to_string()
        } else {
            export.speaker_turns.trim().to_string()
        }
    )
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

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("meeting");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");
    let parent = path.parent().map(PathBuf::from).unwrap_or_default();

    for index in 2..1000 {
        let candidate = parent.join(format!("{stem}-{index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!("{stem}-copy.{extension}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            app.set_menu(build_app_menu(&app.handle())?)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == OPEN_SETTINGS_MENU_ID {
                let _ = show_settings_window(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            onboarding_state,
            request_permission,
            open_permission_settings,
            open_settings_window,
            model_settings_state,
            diarization_settings_state,
            save_model_settings,
            save_diarization_settings,
            run_local_diarization,
            save_meeting_markdown,
            start_live_transcription,
            live_transcription_state,
            stop_live_transcription
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
