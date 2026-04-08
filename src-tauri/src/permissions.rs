use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, Int};

#[cfg(target_os = "macos")]
swift!(fn _microphone_permission_status() -> Int);
#[cfg(target_os = "macos")]
swift!(fn _request_microphone_permission() -> Bool);
#[cfg(target_os = "macos")]
swift!(fn _audio_capture_permission_status() -> Int);
#[cfg(target_os = "macos")]
swift!(fn _request_audio_capture_permission() -> Bool);

const GRANTED: isize = 0;
const DENIED: isize = 1;
const NEVER_REQUESTED: isize = 2;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
    Microphone,
    SystemAudio,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PermissionStatus {
    NeverRequested,
    Authorized,
    Denied,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSnapshot {
    pub microphone: PermissionStatus,
    pub system_audio: PermissionStatus,
}

impl PermissionSnapshot {
    pub fn ready(self) -> bool {
        self.microphone == PermissionStatus::Authorized
            && self.system_audio == PermissionStatus::Authorized
    }
}

pub fn snapshot() -> Result<PermissionSnapshot, String> {
    Ok(PermissionSnapshot {
        microphone: check(PermissionKind::Microphone)?,
        system_audio: check(PermissionKind::SystemAudio)?,
    })
}

pub fn check(permission: PermissionKind) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let raw = match permission {
            PermissionKind::Microphone => unsafe { _microphone_permission_status() as isize },
            PermissionKind::SystemAudio => unsafe { _audio_capture_permission_status() as isize },
        };

        return Ok(match raw {
            GRANTED => PermissionStatus::Authorized,
            NEVER_REQUESTED => PermissionStatus::NeverRequested,
            DENIED => PermissionStatus::Denied,
            _ => PermissionStatus::Denied,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission;
        Ok(PermissionStatus::Denied)
    }
}

pub fn request(permission: PermissionKind) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let granted = match permission {
            PermissionKind::Microphone => unsafe { _request_microphone_permission() },
            PermissionKind::SystemAudio => unsafe { _request_audio_capture_permission() },
        };

        if granted {
            return Ok(PermissionStatus::Authorized);
        }
    }

    check(permission)
}

pub fn open_settings(permission: PermissionKind) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let target = match permission {
            PermissionKind::Microphone => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
            PermissionKind::SystemAudio => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
        };

        std::process::Command::new("open")
            .arg(target)
            .status()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission;
    }

    Ok(())
}
