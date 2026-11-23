use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct MergeModelsResult {
    pub ok: bool,
    pub added: Vec<String>,
    pub kept: Vec<String>,
    pub error: String,
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

fn valid_provider(provider: &str) -> bool {
    !provider.is_empty()
        && provider.len() <= 64
        && provider
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.')
}

fn valid_model_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 120
        && id.chars().all(|c| {
            c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ':' || c == '/'
        })
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
pub fn openclaw_merge_provider_models(
    provider: String,
    ids: Vec<String>,
) -> MergeModelsResult {
    let provider = provider.trim().to_lowercase();

    if !valid_provider(&provider) {
        return MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept: Vec::new(),
            error: format!("invalid provider: {provider}"),
        };
    }

    let mut incoming: Vec<String> = Vec::new();

    for id in ids {
        let id = id.trim().to_string();

        if valid_model_id(&id) && !incoming.iter().any(|item| item == &id) {
            incoming.push(id);
        }

        if incoming.len() >= 50 {
            break;
        }
    }

    if incoming.is_empty() {
        return MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept: Vec::new(),
            error: "empty model list".to_string(),
        };
    }

    let Some(path) = config_path() else {
        return MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept: Vec::new(),
            error: "config path unavailable".to_string(),
        };
    };

    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) => {
            return MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: format!("read config: {error}"),
            }
        }
    };

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            return MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: format!("parse config: {error}"),
            }
        }
    };

    let provider_entry = parsed
        .get("models")
        .and_then(|models| models.get("providers"))
        .and_then(|providers| providers.get(&provider));

    if provider_entry.is_none() {
        return MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept: Vec::new(),
            error: format!("provider `{provider}` 不在配置中，请先保存密钥"),
        };
    }

    let mut merged: Vec<Value> = Vec::new();
    let mut kept: Vec<String> = Vec::new();

    if let Some(models) = provider_entry
        .and_then(|entry| entry.get("models"))
        .and_then(|models| models.as_array())
    {
        for model in models {
            let id = model
                .get("id")
                .and_then(|id| id.as_str())
                .unwrap_or_default()
                .to_string();

            if !id.is_empty() {
                kept.push(id);
            }

            merged.push(model.clone());
        }
    }

    let mut added: Vec<String> = Vec::new();

    for id in incoming {
        if kept.iter().any(|existing| existing == &id) {
            continue;
        }

        merged.push(serde_json::json!({ "id": id, "name": id }));
        kept.push(id.clone());
        added.push(id);
    }

    if added.is_empty() {
        return MergeModelsResult {
            ok: true,
            added,
            kept,
            error: String::new(),
        };
    }

    let Some(cli) = cli_path() else {
        return MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: "OpenClaw CLI not found".to_string(),
        };
    };

    let value = Value::Array(merged).to_string();

    let output = Command::new("cmd")
        .args(["/C"])
        .arg(&cli)
        .args([
            "config",
            "set",
            &format!("models.providers.{provider}.models"),
            &value,
            "--strict-json",
        ])
        .output();

    match output {
        Ok(result) if result.status.success() => MergeModelsResult {
            ok: true,
            added,
            kept,
            error: String::new(),
        },
        Ok(result) => MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: format!(
                "config set failed: {} {}",
                tail(&String::from_utf8_lossy(&result.stdout), 200),
                tail(&String::from_utf8_lossy(&result.stderr), 300)
            ),
        },
        Err(error) => MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: format!("spawn failed: {error}"),
        },
    }
}
