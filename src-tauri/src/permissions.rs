use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use cidre::{cf, core_audio as ca, ns, os};
#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, Int};

#[cfg(target_os = "macos")]
swift!(fn _microphone_permission_status() -> Int);
#[cfg(target_os = "macos")]
swift!(fn _request_microphone_permission() -> Bool);
#[cfg(target_os = "macos")]
swift!(fn _audio_capture_permission_status() -> Int);

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
            PermissionKind::SystemAudio => {
                request_system_audio_probe()?;
                true
            }
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
                "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture"
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

#[cfg(target_os = "macos")]
fn request_system_audio_probe() -> Result<(), String> {
    let stop_silence = play_silence();

    extern "C" fn tap_io_proc(
        _device: ca::Device,
        _now: &cidre::cat::AudioTimeStamp,
        _input_data: &cidre::cat::AudioBufList<1>,
        _input_time: &cidre::cat::AudioTimeStamp,
        _output_data: &mut cidre::cat::AudioBufList<1>,
        _output_time: &cidre::cat::AudioTimeStamp,
        _client_data: Option<&mut std::ffi::c_void>,
    ) -> os::Status {
        os::Status::NO_ERR
    }

    let tap_desc = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new());
    let tap = tap_desc
        .create_process_tap()
        .map_err(|error| format!("create_process_tap failed: {error}"))?;

    let tap_uid = tap
        .uid()
        .map_err(|error| format!("tap uid failed: {error}"))?;

    let sub_tap =
        cf::DictionaryOf::with_keys_values(&[ca::sub_device_keys::uid()], &[tap_uid.as_type_ref()]);

    let aggregate_desc = cf::DictionaryOf::with_keys_values(
        &[
            ca::aggregate_device_keys::is_private(),
            ca::aggregate_device_keys::tap_auto_start(),
            ca::aggregate_device_keys::name(),
            ca::aggregate_device_keys::uid(),
            ca::aggregate_device_keys::tap_list(),
        ],
        &[
            cf::Boolean::value_true().as_type_ref(),
            cf::Boolean::value_false(),
            cf::String::from_str("unsigned char permission probe").as_ref(),
            &cf::Uuid::new().to_cf_string(),
            &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
        ],
    );

    let device = ca::AggregateDevice::with_desc(&aggregate_desc)
        .map_err(|error| format!("create_aggregate_device failed: {error}"))?;
    let proc_id = device
        .create_io_proc_id(tap_io_proc, None)
        .map_err(|error| format!("create_io_proc_id failed: {error}"))?;
    let started = ca::device_start(device, Some(proc_id))
        .map_err(|error| format!("device_start failed: {error}"))?;

    std::thread::sleep(std::time::Duration::from_millis(500));
    let _ = stop_silence.send(());
    drop(started);

    Ok(())
}

#[cfg(target_os = "macos")]
fn play_silence() -> std::sync::mpsc::Sender<()> {
    use rodio::{
        nz,
        source::{Source, Zero},
        stream::DeviceSinkBuilder,
        Player,
    };

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        if let Ok(stream) = DeviceSinkBuilder::open_default_sink() {
            let silence = Zero::new(nz!(2u16), nz!(48_000u32))
                .take_duration(std::time::Duration::from_secs(1))
                .repeat_infinite();

            let player = Player::connect_new(stream.mixer());
            player.append(silence);

            let _ = rx.recv();
            player.stop();
        }
    });

    tx
}
