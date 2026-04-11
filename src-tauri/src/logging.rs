use std::{
    backtrace::Backtrace,
    fs::{self, OpenOptions},
    panic,
    path::PathBuf,
};

use tauri::{AppHandle, Manager, Runtime};
use tracing_appender::non_blocking::WorkerGuard;
const LOG_FILE_NAME: &str = "unsigned-char.log";

pub fn init_logging<R: Runtime>(app: &AppHandle<R>) -> Result<(WorkerGuard, PathBuf), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|error| {
        format!(
            "Failed to create app log directory at {}: {error}",
            log_dir.display()
        )
    })?;

    let log_path = log_dir.join(LOG_FILE_NAME);
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| {
            format!(
                "Failed to open app log file at {}: {error}",
                log_path.display()
            )
        })?;

    let (writer, guard) = tracing_appender::non_blocking(file);
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_file(true)
        .with_line_number(true)
        .with_max_level(tracing::Level::INFO)
        .with_target(true)
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_writer(writer)
        .try_init()
        .map_err(|error| format!("Failed to initialize tracing subscriber: {error}"))?;

    install_panic_hook();

    Ok((guard, log_path))
}

fn install_panic_hook() {
    let previous = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        let payload = if let Some(value) = panic_info.payload().downcast_ref::<&str>() {
            *value
        } else if let Some(value) = panic_info.payload().downcast_ref::<String>() {
            value.as_str()
        } else {
            "panic payload unavailable"
        };

        let location = panic_info
            .location()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        tracing::error!(
            location = %location,
            payload = %payload,
            backtrace = %Backtrace::force_capture(),
            "Application panicked",
        );

        previous(panic_info);
    }));
}
