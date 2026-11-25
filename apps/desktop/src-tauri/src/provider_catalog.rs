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


fn node_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(output) = Command::new("where").arg("node").output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let line = line.trim();
                if !line.is_empty() {
                    candidates.push(PathBuf::from(line));
                }
            }
        }
    }

    for base in [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ] {
        candidates.push(PathBuf::from(base));
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local)
                .join("Programs")
                .join("nodejs")
                .join("node.exe"),
        );
    }

    candidates.into_iter().find(|path| path.exists())
}

fn openclaw_entry() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let entry = PathBuf::from(appdata)
        .join("npm")
        .join("node_modules")
        .join("openclaw")
        .join("dist")
        .join("index.js");

    entry.exists().then_some(entry)
}

/// 统一执行 OpenClaw CLI：优先 node + index.js，其次 cmd 调 .cmd。
fn run_openclaw(args: &[&str]) -> Option<std::io::Result<std::process::Output>> {
    if let (Some(node), Some(entry)) = (node_exe(), openclaw_entry()) {
        let mut command = Command::new(node);
        command.arg(entry).args(args);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        return Some(command.output());
    }

    let cli = cli_path()?;

    Some(
        Command::new("cmd")
            .args(["/C", &format!("chcp 65001>nul & \"{}\" {}", cli.display(), args.join(" "))])
            .output(),
    )
}

/// 已知 OpenAI 兼容 provider 的默认 baseUrl。
fn default_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com"),
        "openai" => Some("https://api.openai.com/v1"),
        "xai" => Some("https://api.x.ai/v1"),
        "moonshot" | "kimi" => Some("https://api.moonshot.cn/v1"),
        "dashscope" | "qwen" => Some("https://dashscope.aliyuncs.com/compatible-mode/v1"),
        "zhipu" | "glm" => Some("https://open.bigmodel.cn/api/paas/v4"),
        _ => None,
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
        // 新机器上没有该 provider：按 OpenAI 兼容模板创建一条，避免用户手动改配置
        let Some(base_url) = default_base_url(&provider) else {
            return MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: format!(
                    "provider `{provider}` 尚未在 OpenClaw 中配置，且不是内置支持的直连服务。请改用下方的「自定义 OpenAI 兼容服务」填写 Base URL。"
                ),
            };
        };

        let template = serde_json::json!({
            "baseUrl": base_url,
            "api": "openai-completions",
            "models": incoming
                .iter()
                .map(|id| serde_json::json!({ "id": id, "name": id }))
                .collect::<Vec<_>>(),
        });

        let set = run_openclaw(&[
            "config",
            "set",
            &format!("models.providers.{provider}"),
            &template.to_string(),
            "--strict-json",
        ]);

        return match set {
            Some(Ok(output)) if output.status.success() => MergeModelsResult {
                ok: true,
                added: incoming,
                kept: Vec::new(),
                error: String::new(),
            },
            Some(Ok(output)) => MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: format!(
                    "自动创建 provider 失败：{} {}",
                    tail(&String::from_utf8_lossy(&output.stdout), 160),
                    tail(&String::from_utf8_lossy(&output.stderr), 240)
                ),
            },
            Some(Err(error)) => MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: format!("自动创建 provider 失败：{error}"),
            },
            None => MergeModelsResult {
                ok: false,
                added: Vec::new(),
                kept: Vec::new(),
                error: "找不到 OpenClaw，请先在环境向导中完成安装".to_string(),
            },
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

    let value = Value::Array(merged).to_string();

    let output = run_openclaw(&[
        "config",
        "set",
        &format!("models.providers.{provider}.models"),
        &value,
        "--strict-json",
    ]);

    match output {
        None => MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: "找不到 OpenClaw，请先在环境向导中完成安装".to_string(),
        },
        Some(Err(error)) => MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: format!("spawn failed: {error}"),
        },
        Some(Ok(result)) if result.status.success() => MergeModelsResult {
            ok: true,
            added,
            kept,
            error: String::new(),
        },
        Some(Ok(result)) => MergeModelsResult {
            ok: false,
            added: Vec::new(),
            kept,
            error: format!(
                "config set failed: {} {}",
                tail(&String::from_utf8_lossy(&result.stdout), 200),
                tail(&String::from_utf8_lossy(&result.stderr), 300)
            ),
        },
    }
}
