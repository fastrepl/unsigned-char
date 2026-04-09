mod permissions;

use std::{
    env,
    path::{Path, PathBuf},
};

use permissions::{PermissionKind, PermissionSnapshot};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

const APP_NAME: &str = "unsigned char";
const BUNDLED_MODEL_NAME: &str = "Bundled Qwen ASR";
const BUNDLED_MODEL_RELATIVE_PATH: &str = "models/qwen-asr";
const MODEL_SETTINGS_FILE: &str = "model-settings.json";
const OPEN_SETTINGS_MENU_ID: &str = "open-settings";
const SETTINGS_WINDOW_LABEL: &str = "settings";

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
fn save_model_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings: SaveModelSettingsInput,
) -> Result<ModelSettingsState, String> {
    let settings = StoredModelSettings::from_input(settings)?;
    persist_model_settings(&app, &settings)?;
    build_model_settings_state(&app, &settings)
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
            "Bundled model not found. Put the Qwen ASR files under {}. That directory is bundled into packaged apps automatically.",
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

fn model_settings_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(MODEL_SETTINGS_FILE))
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

fn model_path_is_ready(path: &Path) -> bool {
    if path.is_file() {
        return looks_like_model_artifact(path);
    }

    if !path.is_dir() {
        return false;
    }

    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
                continue;
            }

            if looks_like_model_artifact(&path) {
                return true;
            }
        }
    }

    false
}

fn looks_like_model_artifact(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let file_name = file_name.to_ascii_lowercase();

    if file_name.ends_with(".safetensors.index.json") {
        return true;
    }

    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("gguf" | "onnx" | "bin" | "pt" | "pth" | "safetensors" | "tflite")
    )
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
            "Enter a Hugging Face repo like Qwen/Qwen2-Audio-7B-Instruct or paste a repo URL."
                .to_string(),
        );
    }

    Ok(repo_segments.join("/"))
}

fn validate_hugging_face_repo(repo: &str) -> Result<(), String> {
    if repo.chars().any(char::is_whitespace) {
        return Err("Hugging Face repo IDs cannot contain spaces.".to_string());
    }

    if repo.split('/').any(|segment| segment.is_empty()) {
        return Err("Enter a Hugging Face repo like Qwen/Qwen2-Audio-7B-Instruct.".to_string());
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
            "Found {} for {reference}, but no model weights were detected there.",
            path.display()
        ),
        None => format!("Local model path not found: {local_path}"),
    }
}

fn build_markdown(export: &MarkdownExport) -> String {
    format!(
        "# {title}\n\n- Created: {created_at}\n- Updated: {updated_at}\n- Status: {status}\n\n## Transcript\n\n{transcript}\n",
        title = export.title.trim(),
        created_at = export.created_at.trim(),
        updated_at = export.updated_at.trim(),
        status = export.status.trim(),
        transcript = if export.transcript.trim().is_empty() {
            "_No transcript yet._".to_string()
        } else {
            export.transcript.trim().to_string()
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
            save_model_settings,
            save_meeting_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
