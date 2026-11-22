use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct CliResult {
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize)]
pub struct CustomModelsResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub models: Vec<String>,
    pub error: Option<String>,
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

    let chars: Vec<char> = trimmed.chars().collect();
    let start = chars.len().saturating_sub(max);
    chars[start..].iter().collect()
}

fn normalise_models_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');

    if trimmed.ends_with("/models") {
        return trimmed.to_string();
    }

    if trimmed.ends_with("/v1") {
        return format!("{trimmed}/models");
    }

    format!("{trimmed}/v1/models")
}

fn normalise_base_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');

    if trimmed.ends_with("/v1") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/v1")
    }
}

#[tauri::command]
pub fn custom_list_models(base_url: String, key: String) -> CustomModelsResult {
    let key = key.trim().to_string();

    if key.is_empty() {
        return CustomModelsResult {
            ok: false,
            status: None,
            models: Vec::new(),
            error: Some("empty api key".to_string()),
        };
    }

    let url = normalise_models_url(&base_url);

    let config = format!(
        "url = \"{url}\"\nsilent\nshow-error\nmax-time = 25\nheader = \"Authorization: Bearer {key}\"\nwrite-out = \"\\n%{{http_code}}\"\n"
    );

    let mut child = match Command::new("curl.exe")
        .args(["-K", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return CustomModelsResult {
                ok: false,
                status: None,
                models: Vec::new(),
                error: Some(format!("curl unavailable: {error}")),
            }
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(config.as_bytes());
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            return CustomModelsResult {
                ok: false,
                status: None,
                models: Vec::new(),
                error: Some(format!("curl wait failed: {error}")),
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let mut lines: Vec<&str> = stdout.lines().collect();
    let status = lines
        .pop()
        .and_then(|last| last.trim().parse::<u16>().ok());
    let body = lines.join("\n");
    let ok = status.map(|code| (200..300).contains(&code)).unwrap_or(false);

    if body.trim().is_empty() {
        return CustomModelsResult {
            ok: false,
            status,
            models: Vec::new(),
            error: Some(if stderr.trim().is_empty() {
                "empty response".to_string()
            } else {
                tail(&stderr, 200)
            }),
        };
    }

    let models = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|payload| {
            payload
                .get("data")
                .and_then(|value| value.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            item.get("id")
                                .and_then(|value| value.as_str())
                                .map(|value| value.to_string())
                        })
                        .collect::<Vec<String>>()
                })
        })
        .unwrap_or_default();

    CustomModelsResult {
        ok,
        status,
        models,
        error: if ok {
            None
        } else {
            Some(tail(&body, 200))
        },
    }
}

/*
 * 把自定义 OpenAI 兼容 provider 写进 OpenClaw 配置。
 * key 不经过命令行：调用方先用 models.authSetApiKey 建立 <id>:manual 凭据，
 * 这里只写 baseUrl / 模型清单，并把 apiKey 指向该凭据。
 */
#[tauri::command]
pub fn openclaw_configure_custom_provider(
    id: String,
    base_url: String,
    model_ids: Vec<String>,
) -> CliResult {
    let id = id.trim().to_lowercase();
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.');

    if !valid {
        return CliResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("invalid provider id: {id}"),
        };
    }

    let base = normalise_base_url(&base_url);

    let models: Vec<Value> = model_ids
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(|item| serde_json::json!({ "id": item, "name": item }))
        .collect();

    let payload = serde_json::json!({
        "baseUrl": base,
        "apiKey": format!("{id}:manual"),
        "models": models,
    });

    let cli = match find_cli() {
        Some(path) => path,
        None => {
            return CliResult {
                ok: false,
                exit_code: None,
                stdout: String::new(),
                stderr: "OpenClaw CLI not found".to_string(),
            }
        }
    };

    let path = format!("models.providers.{id}");

    let output = Command::new("cmd")
        .args(["/C"])
        .arg(&cli)
        .args([
            "config",
            "set",
            &path,
            &payload.to_string(),
            "--strict-json",
            "--merge",
        ])
        .output();

    match output {
        Ok(result) => CliResult {
            ok: result.status.success(),
            exit_code: result.status.code(),
            stdout: tail(&String::from_utf8_lossy(&result.stdout), 400),
            stderr: tail(&String::from_utf8_lossy(&result.stderr), 600),
        },
        Err(error) => CliResult {
            ok: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("spawn failed: {error}"),
        },
    }
}
