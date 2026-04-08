mod permissions;

use serde::Serialize;
use permissions::{PermissionKind, PermissionSnapshot};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingState {
    product_name: &'static str,
    engine: &'static str,
    reference: &'static str,
    permissions: PermissionSnapshot,
    ready: bool,
}

#[tauri::command]
fn onboarding_state() -> Result<OnboardingState, String> {
    let permissions = permissions::snapshot()?;

    Ok(OnboardingState {
        product_name: "unsigned char",
        engine: "Qwen ASR",
        reference: "fastrepl/char",
        ready: permissions.ready(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            onboarding_state,
            request_permission,
            open_permission_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
