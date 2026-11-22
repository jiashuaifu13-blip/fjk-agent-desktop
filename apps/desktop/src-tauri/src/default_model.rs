use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
pub struct SetDefaultResult {
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(PathBuf::from(&appdata).join("npm").join("openclaw.cmd"));
    }

    if let Ok(profile) = std::env::var("USERPROFILE") {
        paths.push(
            PathBuf::from(&profile)
                .join("AppData")
                .join("Roaming")
                .join("npm")
                .join("openclaw.cmd"),
        );
    }

    paths
}

fn find_cli() -> Option<PathBuf> {
    for path in candidate_paths() {
        if path.exists() {
            return Some(path);
        }
    }

    let output = Command::new("where").arg("openclaw").output().ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().next()?.trim();

    if first.is_empty() {
        None
    } else {
        Some(PathBuf::from(first))
    }
}

fn valid_model(model: &str) -> bool {
    let Some((provider, rest)) = model.split_once('/') else {
        return false;
    };

    let provider_ok = !provider.is_empty()
        && provider.len() <= 64
        && provider
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.');

    let model_ok = !rest.is_empty()
        && rest.len() <= 200
        && rest.chars().all(|c| {
            c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ':' || c == '/'
        });

    provider_ok && model_ok
}

fn tail(text: &str, max: usize) -> String {
    let trimmed = text.trim();

    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }

    let chars: Vec<char> = trimmed.chars().collect();
    let start = chars.len().saturating_sub(max);
    chars[start..].iter().collect()
}

#[tauri::command]
pub fn openclaw_set_default_model(model: String) -> SetDefaultResult {
    let model = model.trim().to_string();

    if !valid_model(&model) {
        return SetDefaultResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("invalid model (expect provider/model): {model}"),
        };
    }

    let cli = match find_cli() {
        Some(path) => path,
        None => {
            return SetDefaultResult {
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: "OpenClaw CLI not found".to_string(),
            }
        }
    };

    let value = serde_json::Value::String(model).to_string();

    let output = Command::new("cmd")
        .args(["/C"])
        .arg(&cli)
        .args([
            "config",
            "set",
            "agents.defaults.model.primary",
            &value,
            "--strict-json",
        ])
        .output();

    match output {
        Ok(result) => SetDefaultResult {
            ok: result.status.success(),
            exit_code: result.status.code(),
            stdout: tail(&String::from_utf8_lossy(&result.stdout), 400),
            stderr: tail(&String::from_utf8_lossy(&result.stderr), 600),
        },
        Err(error) => SetDefaultResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("spawn failed: {error}"),
        },
    }
}
