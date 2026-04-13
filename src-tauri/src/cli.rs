use std::{env, fs, path::PathBuf, process::Command, thread, time::Duration};

use serde::Serialize;

use crate::{
    asr::{
        managed_model_download_state, managed_model_path, reset_managed_model,
        start_managed_model_download, transcribe_audio_file,
    },
    speech_models::{
        detect_device_profile, model_path_is_ready, recommend_model, speech_model_spec,
        SpeechModelId, TranscriptionMode,
    },
};

const APP_DISPLAY_NAME: &str = "unsigned Char";
const APP_OPEN_NAMES: [&str; 3] = ["unsigned Char", "unsigned char", "unsigned {char}"];
const MODEL_DOWNLOAD_POLL_INTERVAL: Duration = Duration::from_millis(250);

pub fn try_run_from_env() -> Option<i32> {
    let args: Vec<String> = env::args().collect();
    if args.get(1).map(String::as_str) != Some("--uchar-cli") {
        return None;
    }

    let exit_code = match run(&args[2..]) {
        Ok(()) => 0,
        Err(message) => {
            eprintln!("uchar: {message}");
            1
        }
    };

    Some(exit_code)
}

fn run(args: &[String]) -> Result<(), String> {
    if args.is_empty() {
        return open_desktop_app();
    }

    match args[0].as_str() {
        "--help" | "-h" | "help" => {
            print_help();
            Ok(())
        }
        "--version" | "-V" | "-v" | "version" => {
            print_version();
            Ok(())
        }
        "open" | "desktop" => open_desktop_app(),
        "models" => run_models(&args[1..]),
        "transcribe" => run_transcribe(&args[1..]),
        command => Err(format!(
            "unknown command \"{command}\". Run `uchar --help` for usage."
        )),
    }
}

fn run_models(args: &[String]) -> Result<(), String> {
    if args.is_empty() {
        print_models_help();
        return Ok(());
    }

    match args[0].as_str() {
        "--help" | "-h" | "help" => {
            print_models_help();
            Ok(())
        }
        "list" => run_models_list(&args[1..]),
        "download" => run_models_download(&args[1..]),
        "delete" => run_models_delete(&args[1..]),
        command => Err(format!(
            "unknown `models` command \"{command}\". Run `uchar models --help`."
        )),
    }
}

fn run_models_list(args: &[String]) -> Result<(), String> {
    let mut format = CliFormat::Pretty;
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "-f" | "--format" => {
                format = CliFormat::parse(read_option_value(args, &mut index)?)?;
            }
            "--help" | "-h" | "help" => {
                print_models_list_help();
                return Ok(());
            }
            "--version" | "-V" | "version" => {
                print_version();
                return Ok(());
            }
            flag if flag.starts_with('-') => {
                return Err(format!("unsupported option for `models list`: {flag}"));
            }
            value => {
                return Err(format!("unexpected argument for `models list`: {value}"));
            }
        }

        index += 1;
    }

    let models = SpeechModelId::ALL
        .into_iter()
        .map(model_to_list_item)
        .collect::<Result<Vec<_>, _>>()?;

    match format {
        CliFormat::Pretty => {
            for model in &models {
                println!(
                    "{:<20} {:<12} {:<9} {}",
                    model.name, model.status, model.processing_mode, model.label
                );
                println!("  path: {}", model.path);
                println!("  size: {} | languages: {}", model.size, model.languages);
            }
        }
        CliFormat::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(&models)
                    .map_err(|error| format!("Failed to encode model list: {error}"))?
            );
        }
    }

    Ok(())
}

fn run_models_download(args: &[String]) -> Result<(), String> {
    if matches!(
        args.first().map(String::as_str),
        Some("--help" | "-h" | "help")
    ) {
        print_models_download_help();
        return Ok(());
    }

    if args.is_empty() {
        return Err("`uchar models download` requires a model name.".to_string());
    }
    if args.len() > 1 {
        return Err("`uchar models download` accepts exactly one model name.".to_string());
    }

    let model_id = parse_model_name(&args[0])?;
    let spec = speech_model_spec(model_id);
    let target_dir = managed_model_path(model_id.as_str())?;

    if model_path_is_ready(model_id, &target_dir) {
        println!(
            "{} is already available at {}",
            spec.label,
            target_dir.display()
        );
        return Ok(());
    }

    start_managed_model_download(model_id.as_str())?;

    let mut last_status = String::new();
    let mut last_file = String::new();

    loop {
        let state = managed_model_download_state(model_id.as_str())?;
        let current_file = state.current_file.clone().unwrap_or_default();

        if state.status != last_status || current_file != last_file {
            if current_file.is_empty() {
                println!("{}: {}", spec.label, state.status);
            } else {
                println!("{current_file}");
            }
            last_status = state.status.clone();
            last_file = current_file;
        }

        match state.status.as_str() {
            "ready" => {
                println!("Downloaded {} to {}", spec.label, target_dir.display());
                return Ok(());
            }
            "error" => {
                return Err(state
                    .error
                    .unwrap_or_else(|| format!("Failed to download {}.", spec.label)));
            }
            _ => thread::sleep(MODEL_DOWNLOAD_POLL_INTERVAL),
        }
    }
}

fn run_models_delete(args: &[String]) -> Result<(), String> {
    if matches!(
        args.first().map(String::as_str),
        Some("--help" | "-h" | "help")
    ) {
        print_models_delete_help();
        return Ok(());
    }

    let mut force = false;
    let mut model_name: Option<&str> = None;

    for arg in args {
        match arg.as_str() {
            "--force" => force = true,
            value if value.starts_with('-') => {
                return Err(format!("unsupported option for `models delete`: {value}"));
            }
            value if model_name.is_none() => model_name = Some(value),
            value => {
                return Err(format!(
                    "`uchar models delete` accepts only one model name, got extra argument `{value}`."
                ));
            }
        }
    }

    let model_name =
        model_name.ok_or_else(|| "`uchar models delete` requires a model name.".to_string())?;
    let model_id = parse_model_name(model_name)?;
    let spec = speech_model_spec(model_id);
    let target_dir = managed_model_path(model_id.as_str())?;

    let _ = force;
    reset_managed_model(model_id.as_str())?;

    if target_dir.exists() {
        fs::remove_dir_all(&target_dir).map_err(|error| {
            format!(
                "Failed to remove {} from {}: {error}",
                spec.label,
                target_dir.display()
            )
        })?;
        println!("Deleted {} from {}", spec.label, target_dir.display());
        return Ok(());
    }

    println!("{} is not currently downloaded.", spec.label);
    Ok(())
}

fn run_transcribe(args: &[String]) -> Result<(), String> {
    let mut input: Option<PathBuf> = None;
    let mut output: Option<PathBuf> = None;
    let mut format = CliFormat::Pretty;
    let mut model_id: Option<SpeechModelId> = None;
    let mut language = "en".to_string();
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "-i" | "--input" => {
                input = Some(PathBuf::from(read_option_value(args, &mut index)?));
            }
            "-o" | "--output" => {
                output = Some(PathBuf::from(read_option_value(args, &mut index)?));
            }
            "-m" | "--model" => {
                model_id = Some(parse_model_name(read_option_value(args, &mut index)?)?);
            }
            "-l" | "--language" => {
                language = read_option_value(args, &mut index)?.trim().to_string();
            }
            "-f" | "--format" => {
                format = CliFormat::parse(read_option_value(args, &mut index)?)?;
            }
            "--help" | "-h" | "help" => {
                print_transcribe_help();
                return Ok(());
            }
            "--version" | "-V" | "version" => {
                print_version();
                return Ok(());
            }
            flag if flag.starts_with('-') => {
                return Err(format!("unsupported option for `transcribe`: {flag}"));
            }
            value => {
                if input.is_some() {
                    return Err("`uchar transcribe` accepts only one input target.".to_string());
                }
                input = Some(PathBuf::from(value));
            }
        }

        index += 1;
    }

    let input = input.ok_or_else(|| {
        "Add an input audio file with `--input <FILE>` or pass the file path as the last argument."
            .to_string()
    })?;
    if !input.is_file() {
        return Err(format!("Input audio file not found: {}", input.display()));
    }

    let language = if language.trim().is_empty() {
        "en".to_string()
    } else {
        language
    };
    let model_id = model_id.unwrap_or_else(|| {
        recommend_model(
            &detect_device_profile(),
            &[language.clone()],
            TranscriptionMode::Batch,
        )
        .model_id
    });
    let model_path = managed_model_path(model_id.as_str())?;
    let spec = speech_model_spec(model_id);

    if !model_path_is_ready(model_id, &model_path) {
        return Err(format!(
            "{} is not downloaded yet. Run `uchar models download {}` first.",
            spec.label,
            model_id.cli_name()
        ));
    }

    let text = transcribe_audio_file(model_id.as_str(), &input, &language)?;
    let result = TranscriptionResult {
        input: input.display().to_string(),
        output_path: output.as_ref().map(|path| path.display().to_string()),
        model: model_id.cli_name().to_string(),
        label: spec.label.to_string(),
        language,
        text,
    };

    let rendered = match format {
        CliFormat::Pretty => {
            let transcript = result.text.trim_end_matches('\n');
            if transcript.is_empty() {
                String::new()
            } else {
                format!("{transcript}\n")
            }
        }
        CliFormat::Json => serde_json::to_string_pretty(&result)
            .map_err(|error| format!("Failed to encode transcription result: {error}"))?,
    };

    if let Some(output_path) = output {
        if let Some(parent) = output_path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create the output directory {}: {error}",
                    parent.display()
                )
            })?;
        }

        fs::write(&output_path, &rendered)
            .map_err(|error| format!("Failed to write {}: {error}", output_path.display()))?;

        match format {
            CliFormat::Pretty => println!("Wrote transcript to {}", output_path.display()),
            CliFormat::Json => println!(
                "{}",
                serde_json::to_string_pretty(&result)
                    .map_err(|error| format!("Failed to encode transcription result: {error}"))?
            ),
        }
        return Ok(());
    }

    print!("{rendered}");
    Ok(())
}

fn open_desktop_app() -> Result<(), String> {
    if let Some(bundle_path) = current_bundle_path() {
        let status = Command::new("open")
            .arg("-a")
            .arg(&bundle_path)
            .status()
            .map_err(|error| format!("Failed to open {}: {error}", bundle_path.display()))?;

        if status.success() {
            return Ok(());
        }
    }

    for app_name in APP_OPEN_NAMES {
        let status = Command::new("open")
            .args(["-a", app_name])
            .status()
            .map_err(|error| format!("Failed to open {app_name}: {error}"))?;

        if status.success() {
            return Ok(());
        }
    }

    Err(format!("Could not find {}.", APP_DISPLAY_NAME))
}

fn current_bundle_path() -> Option<PathBuf> {
    let executable = env::current_exe().ok()?;
    let macos_dir = executable.parent()?;
    if macos_dir.file_name()?.to_str()? != "MacOS" {
        return None;
    }

    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()?.to_str()? != "Contents" {
        return None;
    }

    let bundle_path = contents_dir.parent()?;
    let extension = bundle_path.extension()?.to_str()?;
    (extension == "app").then(|| bundle_path.to_path_buf())
}

fn read_option_value<'a>(args: &'a [String], index: &mut usize) -> Result<&'a str, String> {
    *index += 1;
    args.get(*index)
        .map(String::as_str)
        .ok_or_else(|| "Expected a value after the option.".to_string())
}

fn parse_model_name(value: &str) -> Result<SpeechModelId, String> {
    SpeechModelId::from_cli_name(value).ok_or_else(|| {
        let supported = SpeechModelId::ALL
            .into_iter()
            .map(SpeechModelId::cli_name)
            .collect::<Vec<_>>()
            .join(", ");

        format!("Unsupported model `{value}`. Supported models: {supported}.")
    })
}

fn model_to_list_item(model_id: SpeechModelId) -> Result<ModelListItem, String> {
    let spec = speech_model_spec(model_id);
    let path = managed_model_path(model_id.as_str())?;
    let state = managed_model_download_state(model_id.as_str())?;

    Ok(ModelListItem {
        name: model_id.cli_name().to_string(),
        id: model_id.as_str().to_string(),
        label: spec.label.to_string(),
        status: state.status,
        ready: model_path_is_ready(model_id, &path),
        path: path.display().to_string(),
        processing_mode: spec.processing_mode.as_str().to_string(),
        languages: spec.languages_label.to_string(),
        size: spec.size_label.to_string(),
        detail: spec.detail.to_string(),
    })
}

fn print_help() {
    println!(
        "uchar {}\n\nCLI for unsigned {{char}}.\n\nUsage:\n  uchar\n  uchar desktop\n  uchar transcribe [-i <FILE>] [-m <MODEL>] [-l <LANGUAGE>] [-o <FILE>] [-f <FORMAT>] [target]\n  uchar models <command>\n  uchar --help\n  uchar --version\n\nCommands:\n  desktop     Open unsigned {{char}}\n  transcribe  Transcribe an audio file with a local model\n  models      Manage local transcription models\n",
        env!("CARGO_PKG_VERSION")
    );
}

fn print_models_help() {
    println!(
        "uchar models\n\nUsage:\n  uchar models list [-f <FORMAT>]\n  uchar models download <name>\n  uchar models delete <name>\n\nCommands:\n  list      List local models and their status\n  download  Download a model by name\n  delete    Delete a downloaded model\n"
    );
}

fn print_models_list_help() {
    println!(
        "uchar models list\n\nUsage:\n  uchar models list [-f <FORMAT>]\n\nOptions:\n  -f, --format  <FORMAT>  pretty or json\n"
    );
}

fn print_models_download_help() {
    println!("uchar models download\n\nUsage:\n  uchar models download <name>\n");
}

fn print_models_delete_help() {
    println!("uchar models delete\n\nUsage:\n  uchar models delete [--force] <name>\n");
}

fn print_transcribe_help() {
    println!(
        "uchar transcribe\n\nUsage:\n  uchar transcribe [-i <FILE>] [-m <MODEL>] [-l <LANGUAGE>] [-o <FILE>] [-f <FORMAT>] [target]\n\nOptions:\n  -i, --input     <FILE>     Input audio file\n  -m, --model     <MODEL>    parakeet-streaming, parakeet-batch, omnilingual, qwen3-small, qwen3-large\n  -l, --language  <LANGUAGE> Language hint (default: en)\n  -o, --output    <FILE>     Write the result to a file\n  -f, --format    <FORMAT>   pretty or json\n"
    );
}

fn print_version() {
    println!("{}", env!("CARGO_PKG_VERSION"));
}

#[derive(Clone, Copy)]
enum CliFormat {
    Pretty,
    Json,
}

impl CliFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim() {
            "pretty" | "text" => Ok(Self::Pretty),
            "json" => Ok(Self::Json),
            other => Err(format!(
                "Unsupported format `{other}`. Use `pretty` or `json`."
            )),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelListItem {
    name: String,
    id: String,
    label: String,
    status: String,
    ready: bool,
    path: String,
    processing_mode: String,
    languages: String,
    size: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResult {
    input: String,
    output_path: Option<String>,
    model: String,
    label: String,
    language: String,
    text: String,
}
