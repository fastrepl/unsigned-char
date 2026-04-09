mod asr;
mod permissions;

use std::{
    env,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
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
const DEFAULT_MODEL_NAME: &str = "Qwen3-ASR 0.6B";
const DEFAULT_HUGGING_FACE_MODEL_REPO: &str = "Qwen/Qwen3-ASR-0.6B";
const DEFAULT_HUGGING_FACE_MODEL_REVISION: &str = "main";
const MANAGED_MODEL_RELATIVE_PATH: &str = "models/qwen3-asr-0.6b";
const MANAGED_MODEL_FILES: &[&str] = &[
    "config.json",
    "generation_config.json",
    "merges.txt",
    "model.safetensors",
    "preprocessor_config.json",
    "tokenizer_config.json",
    "vocab.json",
];
const PYANNOTE_RUNNER_RELATIVE_PATH: &str = "scripts/pyannote_diarize.py";
const GENERAL_SETTINGS_FILE: &str = "general-settings.json";
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
    transcript: String,
    #[serde(default)]
    speaker_turns: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunLocalDiarizationInput {
    audio_path: String,
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum ModelSource {
    #[default]
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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveGeneralSettingsInput {
    main_language: String,
    spoken_languages: Vec<String>,
    timezone: String,
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

#[derive(Deserialize)]
struct HuggingFaceModelMetadata {
    #[serde(default)]
    siblings: Vec<HuggingFaceModelSibling>,
}

#[derive(Deserialize)]
struct HuggingFaceModelSibling {
    rfilename: String,
    size: Option<u64>,
}

struct ManagedModelFileDescriptor {
    name: &'static str,
    size: Option<u64>,
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
            source: Some(input.source),
            hugging_face_repo: normalize_hugging_face_repo(&input.hugging_face_repo)?,
            hugging_face_revision: input.hugging_face_revision.trim().to_string(),
            hugging_face_local_path: input.hugging_face_local_path.trim().to_string(),
        })
    }

    fn source(&self) -> ModelSource {
        self.source.unwrap_or(ModelSource::HuggingFace)
    }

    fn has_custom_hugging_face_selection(&self) -> bool {
        !self.hugging_face_repo.trim().is_empty() || !self.hugging_face_local_path.trim().is_empty()
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
            ModelSource::HuggingFace => DEFAULT_MODEL_NAME.to_string(),
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
    let target_dir = managed_model_path(&app)?;
    let shared = state.inner().managed_model_download.clone();

    if model_path_is_ready(&target_dir) {
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

    {
        let mut download_state = shared
            .lock()
            .map_err(|_| "Failed to access model download state.".to_string())?;
        if matches!(
            download_state.status,
            ManagedModelDownloadStatus::Downloading
        ) {
            return Ok(download_state.clone());
        }

        *download_state = ManagedModelDownloadState {
            status: ManagedModelDownloadStatus::Downloading,
            local_path: target_dir.display().to_string(),
            current_file: None,
            bytes_downloaded: 0,
            total_bytes: None,
            error: None,
        };
    }

    std::thread::spawn({
        let shared = shared.clone();
        move || {
            if let Err(error) = download_managed_model_snapshot(&target_dir, &shared) {
                if let Ok(mut download_state) = shared.lock() {
                    *download_state = ManagedModelDownloadState {
                        status: ManagedModelDownloadStatus::Error,
                        local_path: target_dir.display().to_string(),
                        current_file: None,
                        bytes_downloaded: 0,
                        total_bytes: None,
                        error: Some(error),
                    };
                }
            }
        }
    });

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
fn save_general_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveGeneralSettingsInput,
) -> Result<GeneralSettingsState, String> {
    let settings = StoredGeneralSettings::from_input(settings);
    persist_general_settings(&app, &settings)?;
    build_general_settings_state(&settings)
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
    let mut command = std::process::Command::new(python);
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
fn sync_meeting_markdown<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    export: MarkdownExport,
) -> Result<String, String> {
    let target_dir = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("unsigned char");

    std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;

    let file_path = export
        .path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let file_name = format!("meeting-{}.md", sanitize_path_component(&export.id));
            target_dir.join(file_name)
        });

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

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

    let builder = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Settings")
    .inner_size(560.0, 540.0)
    .min_inner_size(460.0, 420.0)
    .visible(false)
    .transparent(false)
    .always_on_top(true)
    .resizable(true);
    builder.build()?;

    Ok(())
}

fn default_managed_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredModelSettings, String> {
    Ok(StoredModelSettings {
        source: Some(ModelSource::HuggingFace),
        hugging_face_repo: DEFAULT_HUGGING_FACE_MODEL_REPO.to_string(),
        hugging_face_revision: String::new(),
        hugging_face_local_path: managed_model_path(app)?.display().to_string(),
    })
}

fn effective_model_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<StoredModelSettings, String> {
    let bundled_path = resolve_bundled_model_path(app);
    if matches!(settings.source(), ModelSource::Bundled) && model_path_is_ready(&bundled_path) {
        return Ok(settings.clone());
    }

    if settings.has_custom_hugging_face_selection() {
        let mut custom = settings.clone();
        custom.source = Some(ModelSource::HuggingFace);
        if resolve_custom_model_path(&custom.hugging_face_local_path)
            .as_ref()
            .map(|path| model_path_is_ready(path))
            .unwrap_or(false)
        {
            return Ok(custom);
        }
    }

    default_managed_model_settings(app)
}

fn build_model_settings_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredModelSettings,
) -> Result<ModelSettingsState, String> {
    let settings = effective_model_settings(app, settings)?;
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
    let hugging_face_ready = hugging_face_resolved_path
        .as_ref()
        .map(|path| model_path_is_ready(path))
        .unwrap_or(false);
    let managed_model_path = managed_model_path(app)?;
    let uses_managed_model = hugging_face_local_path == managed_model_path.display().to_string();
    let hugging_face_status = build_hugging_face_status(
        &hugging_face_repo,
        &hugging_face_revision,
        &hugging_face_local_path,
        hugging_face_resolved_path.as_deref(),
        hugging_face_ready,
        uses_managed_model,
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

fn load_general_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<StoredGeneralSettings, String> {
    let path = general_settings_path(app)?;
    if !path.exists() {
        return Ok(StoredGeneralSettings::default());
    }

    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&contents).map_err(|error| format!("Invalid general settings: {error}"))
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

fn persist_general_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &StoredGeneralSettings,
) -> Result<(), String> {
    let path = general_settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to encode general settings: {error}"))?;
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

fn general_settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(GENERAL_SETTINGS_FILE))
        .map_err(|error| error.to_string())
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

fn managed_model_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(MANAGED_MODEL_RELATIVE_PATH))
        .map_err(|error| error.to_string())
}

fn snapshot_managed_model_download_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    shared: &Arc<Mutex<ManagedModelDownloadState>>,
) -> Result<ManagedModelDownloadState, String> {
    let local_path = managed_model_path(app)?;
    let ready = model_path_is_ready(&local_path);
    let mut download_state = shared
        .lock()
        .map_err(|_| "Failed to access model download state.".to_string())?;

    download_state.local_path = local_path.display().to_string();

    if ready
        && !matches!(
            download_state.status,
            ManagedModelDownloadStatus::Downloading
        )
    {
        download_state.status = ManagedModelDownloadStatus::Ready;
        download_state.current_file = None;
        download_state.bytes_downloaded = 0;
        download_state.total_bytes = None;
        download_state.error = None;
    } else if !ready && matches!(download_state.status, ManagedModelDownloadStatus::Ready) {
        download_state.status = ManagedModelDownloadStatus::Idle;
        download_state.current_file = None;
        download_state.bytes_downloaded = 0;
        download_state.total_bytes = None;
    }

    Ok(download_state.clone())
}

fn set_managed_model_download_progress(
    shared: &Arc<Mutex<ManagedModelDownloadState>>,
    local_path: &Path,
    current_file: Option<&str>,
    bytes_downloaded: u64,
    total_bytes: Option<u64>,
) -> Result<(), String> {
    let mut download_state = shared
        .lock()
        .map_err(|_| "Failed to access model download state.".to_string())?;
    download_state.status = ManagedModelDownloadStatus::Downloading;
    download_state.local_path = local_path.display().to_string();
    download_state.current_file = current_file.map(str::to_string);
    download_state.bytes_downloaded = bytes_downloaded;
    download_state.total_bytes = total_bytes;
    download_state.error = None;
    Ok(())
}

fn download_managed_model_snapshot(
    target_dir: &Path,
    shared: &Arc<Mutex<ManagedModelDownloadState>>,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(format!("{APP_NAME}/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("Failed to prepare model download client: {error}"))?;
    let file_descriptors = fetch_managed_model_manifest(&client)?;
    let total_bytes = if file_descriptors.iter().all(|file| file.size.is_some()) {
        Some(file_descriptors.iter().filter_map(|file| file.size).sum())
    } else {
        None
    };

    if let Some(parent) = target_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to prepare the model directory at {}: {error}",
                parent.display()
            )
        })?;
    }
    std::fs::create_dir_all(target_dir).map_err(|error| {
        format!(
            "Failed to prepare the model directory at {}: {error}",
            target_dir.display()
        )
    })?;

    let mut bytes_downloaded = 0_u64;
    for file in &file_descriptors {
        let destination = target_dir.join(file.name);
        if destination.is_file() {
            if let Some(expected_size) = file.size {
                if destination
                    .metadata()
                    .map(|metadata| metadata.len() == expected_size)
                    .unwrap_or(false)
                {
                    bytes_downloaded += expected_size;
                    continue;
                }
            }
        }

        let temporary = target_dir.join(format!("{}.part", file.name));
        if !temporary.is_file() {
            continue;
        }

        let partial_size = temporary
            .metadata()
            .map(|metadata| metadata.len())
            .map_err(|error| {
                format!(
                    "Failed to inspect the partial download at {}: {error}",
                    temporary.display()
                )
            })?;

        if partial_size == 0 {
            let _ = std::fs::remove_file(&temporary);
            continue;
        }

        if let Some(expected_size) = file.size {
            if partial_size == expected_size {
                std::fs::rename(&temporary, &destination).map_err(|error| {
                    format!(
                        "Failed to restore {} from a previous partial download: {error}",
                        destination.display()
                    )
                })?;
                bytes_downloaded += expected_size;
                continue;
            }

            if partial_size > expected_size {
                let _ = std::fs::remove_file(&temporary);
                continue;
            }
        }

        bytes_downloaded += partial_size;
    }

    for file in &file_descriptors {
        set_managed_model_download_progress(
            shared,
            target_dir,
            Some(file.name),
            bytes_downloaded,
            total_bytes,
        )?;

        let destination = target_dir.join(file.name);
        if destination.is_file() {
            if let Some(expected_size) = file.size {
                if destination
                    .metadata()
                    .map(|metadata| metadata.len() == expected_size)
                    .unwrap_or(false)
                {
                    continue;
                }
            }
        }

        let temporary = target_dir.join(format!("{}.part", file.name));
        let mut resume_from = if temporary.is_file() {
            temporary
                .metadata()
                .map(|metadata| metadata.len())
                .map_err(|error| {
                    format!(
                        "Failed to inspect the partial download at {}: {error}",
                        temporary.display()
                    )
                })?
        } else {
            0
        };

        if let Some(expected_size) = file.size {
            if resume_from >= expected_size {
                if resume_from == expected_size {
                    std::fs::rename(&temporary, &destination).map_err(|error| {
                        format!(
                            "Failed to restore {} from a previous partial download: {error}",
                            destination.display()
                        )
                    })?;
                    continue;
                }

                let _ = std::fs::remove_file(&temporary);
                resume_from = 0;
            }
        }

        let url = managed_model_remote_url(file.name);
        let mut response = if resume_from > 0 {
            client
                .get(&url)
                .header("Range", format!("bytes={resume_from}-"))
                .send()
                .map_err(|error| format!("Failed to resume {}: {error}", file.name))?
        } else {
            client
                .get(&url)
                .send()
                .map_err(|error| format!("Failed to download {}: {error}", file.name))?
        };

        if resume_from > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            if !response.status().is_success() {
                return Err(format!(
                    "Failed to resume {}: received {}",
                    file.name,
                    response.status()
                ));
            }

            let _ = std::fs::remove_file(&temporary);
            bytes_downloaded = bytes_downloaded.saturating_sub(resume_from);
            resume_from = 0;
            set_managed_model_download_progress(
                shared,
                target_dir,
                Some(file.name),
                bytes_downloaded,
                total_bytes,
            )?;

            response = client
                .get(&url)
                .send()
                .map_err(|error| format!("Failed to download {}: {error}", file.name))?;
        }

        if !response.status().is_success() {
            return Err(format!(
                "Failed to download {}: received {}",
                file.name,
                response.status()
            ));
        }

        let mut output = if resume_from > 0 {
            std::fs::OpenOptions::new()
                .append(true)
                .open(&temporary)
                .map_err(|error| {
                    format!(
                        "Failed to reopen {} while resuming the model download: {error}",
                        temporary.display()
                    )
                })?
        } else {
            std::fs::File::create(&temporary).map_err(|error| {
                format!(
                    "Failed to create {} while downloading the model: {error}",
                    temporary.display()
                )
            })?
        };

        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|error| format!("Failed to read {}: {error}", file.name))?;
            if read == 0 {
                break;
            }

            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("Failed to write {}: {error}", destination.display()))?;
            bytes_downloaded += read as u64;
            set_managed_model_download_progress(
                shared,
                target_dir,
                Some(file.name),
                bytes_downloaded,
                total_bytes,
            )?;
        }

        output.flush().map_err(|error| {
            format!(
                "Failed to finish writing {}: {error}",
                destination.display()
            )
        })?;
        std::fs::rename(&temporary, &destination).map_err(|error| {
            format!(
                "Failed to move {} into place: {error}",
                destination.display()
            )
        })?;
    }

    if !model_path_is_ready(target_dir) {
        return Err(format!(
            "The model download finished, but {} is still missing required files.",
            target_dir.display()
        ));
    }

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

    Ok(())
}

fn fetch_managed_model_manifest(
    client: &reqwest::blocking::Client,
) -> Result<Vec<ManagedModelFileDescriptor>, String> {
    let metadata: HuggingFaceModelMetadata = client
        .get(format!(
            "https://huggingface.co/api/models/{DEFAULT_HUGGING_FACE_MODEL_REPO}"
        ))
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| format!("Failed to fetch model metadata: {error}"))?
        .json()
        .map_err(|error| format!("Failed to decode model metadata: {error}"))?;

    MANAGED_MODEL_FILES
        .iter()
        .map(|file_name| {
            let sibling = metadata
                .siblings
                .iter()
                .find(|sibling| sibling.rfilename == *file_name)
                .ok_or_else(|| format!("The upstream model is missing {}.", file_name))?;

            Ok(ManagedModelFileDescriptor {
                name: file_name,
                size: sibling.size,
            })
        })
        .collect()
}

fn managed_model_remote_url(file_name: &str) -> String {
    format!(
        "https://huggingface.co/{DEFAULT_HUGGING_FACE_MODEL_REPO}/resolve/{DEFAULT_HUGGING_FACE_MODEL_REVISION}/{file_name}"
    )
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
    uses_managed_model: bool,
) -> String {
    if local_path.is_empty() {
        return if uses_managed_model {
            format!(
                "Download {DEFAULT_MODEL_NAME} once to continue. The files stay on this device."
            )
        } else {
            "Add a local snapshot path for the transcription model.".to_string()
        };
    }

    if uses_managed_model && resolved_path.is_none() {
        return format!(
            "Download {DEFAULT_MODEL_NAME} once to continue. The files will be stored at {local_path}."
        );
    }

    let reference = if repo.is_empty() {
        DEFAULT_MODEL_NAME.to_string()
    } else {
        format_hugging_face_reference(repo, revision)
    };
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
    let settings = effective_model_settings(app, settings)?;
    let source = settings.source();
    let selected_path = match source {
        ModelSource::Bundled => resolve_bundled_model_path(app),
        ModelSource::HuggingFace => resolve_custom_model_path(&settings.hugging_face_local_path)
            .ok_or_else(|| {
                "The local transcription model has not been downloaded yet.".to_string()
            })?,
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
    let title = export.title.trim();
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
        "---\nid: {id}\ntitle: {frontmatter_title}\ncreated_at: {created_at}\nupdated_at: {updated_at}\nstatus: {status}\naudio_path: {audio_path}\ndiarization_speaker_count: {diarization_speaker_count}\ndiarization_pipeline_source: {diarization_pipeline_source}\ndiarization_ran_at: {diarization_ran_at}\n---\n\n# {title}\n\n## Transcript\n\n{transcript}\n\n## Speaker Turns\n\n{speaker_turns}\n",
        id = yaml_string(&export.id),
        frontmatter_title = yaml_string(title),
        created_at = yaml_string(export.created_at.trim()),
        updated_at = yaml_string(export.updated_at.trim()),
        status = yaml_string(export.status.trim()),
        audio_path = yaml_optional_string(Some(export.audio_path.trim())),
        diarization_speaker_count = export.diarization_speaker_count,
        diarization_pipeline_source =
            yaml_optional_string(export.diarization_pipeline_source.as_deref()),
        diarization_ran_at = yaml_optional_string(export.diarization_ran_at.as_deref()),
        title = title,
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
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            app.set_menu(build_app_menu(app.handle())?)?;
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
            managed_model_download_state,
            download_managed_model,
            diarization_settings_state,
            general_settings_state,
            save_model_settings,
            save_diarization_settings,
            save_general_settings,
            run_local_diarization,
            sync_meeting_markdown,
            start_live_transcription,
            live_transcription_state,
            stop_live_transcription
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
