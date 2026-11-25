use std::path::PathBuf;

use serde::Serialize;

#[derive(Serialize)]
pub struct ExecPolicyStatus {
    pub ok: bool,
    pub mode: String,
    pub host: String,
    pub config_path: String,
    pub error: String,
}

#[derive(Serialize)]
pub struct ExecModeWriteResult {
    pub ok: bool,
    pub mode: String,
    pub stdout: String,
    pub stderr: String,
}

fn config_path() -> Option<PathBuf> {
    let profile = std::env::var("USERPROFILE").ok()?;
    Some(PathBuf::from(profile).join(".openclaw").join("openclaw.json"))
}

fn cli_path() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let path = PathBuf::from(appdata).join("npm").join("openclaw.cmd");

        if path.exists() {
            return Some(path);
        }
    }

    let profile = std::env::var("USERPROFILE").ok()?;
    let path = PathBuf::from(profile)
        .join("AppData")
        .join("Roaming")
        .join("npm")
        .join("openclaw.cmd");

    if path.exists() {
        Some(path)
    } else {
        None
    }
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
pub fn openclaw_exec_policy_status() -> ExecPolicyStatus {
    let path = match config_path() {
        Some(path) => path,
        None => {
            return ExecPolicyStatus {
                ok: false,
                mode: String::new(),
                host: String::new(),
                config_path: String::new(),
                error: "config path unavailable".to_string(),
            }
        }
    };

    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) => {
            return ExecPolicyStatus {
                ok: false,
                mode: String::new(),
                host: String::new(),
                config_path: path.display().to_string(),
                error: format!("read failed: {error}"),
            }
        }
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            return ExecPolicyStatus {
                ok: false,
                mode: String::new(),
                host: String::new(),
                config_path: path.display().to_string(),
                error: format!("parse failed: {error}"),
            }
        }
    };

    let exec = parsed
        .get("tools")
        .and_then(|tools| tools.get("exec"));

    let mode = exec
        .and_then(|exec| exec.get("mode"))
        .and_then(|mode| mode.as_str())
        .unwrap_or("")
        .to_string();

    let host = exec
        .and_then(|exec| exec.get("host"))
        .and_then(|host| host.as_str())
        .unwrap_or("")
        .to_string();

    ExecPolicyStatus {
        ok: true,
        mode,
        host,
        config_path: path.display().to_string(),
        error: String::new(),
    }
}

#[tauri::command]
pub fn openclaw_set_exec_mode(mode: String) -> ExecModeWriteResult {
    let mode = mode.trim().to_lowercase();

    let allowed = ["deny", "allowlist", "ask", "auto", "full"];

    if !allowed.contains(&mode.as_str()) {
        return ExecModeWriteResult {
            ok: false,
            mode,
            stdout: String::new(),
            stderr: "invalid mode (deny|allowlist|ask|auto|full)".to_string(),
        };
    }

    let _cli = match cli_path() {
        Some(path) => path,
        None => {
            return ExecModeWriteResult {
                ok: false,
                mode,
                stdout: String::new(),
                stderr: "OpenClaw CLI not found".to_string(),
            }
        }
    };

    let value = serde_json::Value::String(mode.clone()).to_string();

    let output = crate::openclaw_cli::run(&[
        "config",
        "set",
        "tools.exec.mode",
        &value,
        "--strict-json",
    ]);

    match output {
        Ok(result) => ExecModeWriteResult {
            ok: result.status.success(),
            mode,
            stdout: tail(&String::from_utf8_lossy(&result.stdout), 400),
            stderr: tail(&String::from_utf8_lossy(&result.stderr), 600),
        },
        Err(error) => ExecModeWriteResult {
            ok: false,
            mode,
            stdout: String::new(),
            stderr: format!("spawn failed: {error}"),
        },
    }
}
