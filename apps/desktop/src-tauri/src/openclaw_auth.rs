use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;

fn valid_provider(provider: &str) -> bool {
    !provider.is_empty()
        && provider.len() <= 64
        && provider.chars().all(|c| {
            c.is_ascii_lowercase()
                || c.is_ascii_digit()
                || c == '-'
                || c == '_'
                || c == '.'
        })
}

#[derive(Serialize)]
pub struct AuthSaveResult {
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

fn tail(text: &str, max: usize) -> String {
    let trimmed = text.trim();

    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }

    let mut chars: Vec<char> = trimmed.chars().collect();
    let start = chars.len().saturating_sub(max);
    let tail: String = chars.drain(start..).collect();

    format!("…{tail}")
}

#[tauri::command]
pub fn openclaw_auth_list() -> Result<String, String> {
    if find_cli().is_none() {
        return Err("OpenClaw CLI not found".to_string());
    }

    let output = crate::openclaw_cli::run(&["models", "auth", "list", "--json"])
        .map_err(|error| format!("spawn failed: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "exit {:?}: {}",
            output.status.code(),
            tail(&String::from_utf8_lossy(&output.stderr), 400)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn openclaw_save_api_key(provider: String, key: String) -> AuthSaveResult {
    let provider = provider.trim().to_lowercase();

    if !valid_provider(&provider) {
        return AuthSaveResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("unsupported provider: {provider}"),
        };
    }

    if key.trim().is_empty() {
        return AuthSaveResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: "empty api key".to_string(),
        };
    }

    let cli = match find_cli() {
        Some(path) => path,
        None => {
            return AuthSaveResult {
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: "OpenClaw CLI not found".to_string(),
            }
        }
    };

    let mut child = match Command::new("cmd")
        .args(["/C"])
        .arg(&cli)
        .args(["models", "auth", "paste-api-key", "--provider", &provider])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return AuthSaveResult {
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: format!("spawn failed: {error}"),
            }
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(key.trim().as_bytes());
        let _ = stdin.write_all(b"\r\n");
    }

    match child.wait_with_output() {
        Ok(output) => AuthSaveResult {
            ok: output.status.success(),
            exit_code: output.status.code(),
            stdout: tail(&String::from_utf8_lossy(&output.stdout), 600),
            stderr: tail(&String::from_utf8_lossy(&output.stderr), 600),
        },
        Err(error) => AuthSaveResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("wait failed: {error}"),
        },
    }
}
