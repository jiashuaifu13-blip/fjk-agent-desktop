use std::io::Write;
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct ProviderModelsResult {
    pub ok: bool,
    pub supported: bool,
    pub status: Option<u16>,
    pub models: Vec<String>,
    pub error: Option<String>,
}

enum AuthStyle {
    Bearer,
    Anthropic,
    Google,
}

fn endpoint(provider: &str) -> Option<(&'static str, AuthStyle)> {
    match provider {
        "deepseek" => Some(("https://api.deepseek.com/models", AuthStyle::Bearer)),
        "openai" => Some(("https://api.openai.com/v1/models", AuthStyle::Bearer)),
        "anthropic" => Some(("https://api.anthropic.com/v1/models", AuthStyle::Anthropic)),
        "xai" | "grok" => Some(("https://api.x.ai/v1/models", AuthStyle::Bearer)),
        "groq" => Some(("https://api.groq.com/openai/v1/models", AuthStyle::Bearer)),
        "openrouter" => Some(("https://openrouter.ai/api/v1/models", AuthStyle::Bearer)),
        "google" | "gemini" => Some((
            "https://generativelanguage.googleapis.com/v1beta/models",
            AuthStyle::Google,
        )),
        "moonshot" => Some(("https://api.moonshot.cn/v1/models", AuthStyle::Bearer)),
        "zhipu" | "bigmodel" => Some((
            "https://open.bigmodel.cn/api/paas/v4/models",
            AuthStyle::Bearer,
        )),
        "alibaba" | "qwen" | "dashscope" => Some((
            "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
            AuthStyle::Bearer,
        )),
        "mistral" => Some(("https://api.mistral.ai/v1/models", AuthStyle::Bearer)),
        "together" => Some(("https://api.together.xyz/v1/models", AuthStyle::Bearer)),
        "deepinfra" => Some((
            "https://api.deepinfra.com/v1/openai/models",
            AuthStyle::Bearer,
        )),
        "cohere" => Some(("https://api.cohere.com/v1/models", AuthStyle::Bearer)),
        "cerebras" => Some(("https://api.cerebras.ai/v1/models", AuthStyle::Bearer)),
        _ => None,
    }
}

fn parse_model_ids(payload: &Value) -> Vec<String> {
    let Some(items) = payload.get("data").and_then(|value| value.as_array()) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            item.get("id")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .collect()
}

/*
 * 用系统自带 curl.exe 发请求：
 * key 通过 stdin 的 curl 配置文件传入，不落在命令行参数里（避免进程列表泄露）。
 */
#[tauri::command]
pub fn provider_list_models(provider: String, key: String) -> ProviderModelsResult {
    let provider = provider.trim().to_lowercase();
    let key = key.trim().to_string();

    if key.is_empty() {
        return ProviderModelsResult {
            ok: false,
            supported: false,
            status: None,
            models: Vec::new(),
            error: Some("empty api key".to_string()),
        };
    }

    let Some((url, style)) = endpoint(&provider) else {
        return ProviderModelsResult {
            ok: true,
            supported: false,
            status: None,
            models: Vec::new(),
            error: None,
        };
    };

    let mut config = String::new();
    config.push_str(&format!("url = \"{url}\"\n"));
    config.push_str("silent\nshow-error\nmax-time = 15\n");

    match style {
        AuthStyle::Bearer => {
            config.push_str(&format!("header = \"Authorization: Bearer {key}\"\n"));
        }
        AuthStyle::Anthropic => {
            config.push_str(&format!("header = \"x-api-key: {key}\"\n"));
            config.push_str("header = \"anthropic-version: 2023-06-01\"\n");
        }
        AuthStyle::Google => {
            config.push_str(&format!("header = \"x-goog-api-key: {key}\"\n"));
        }
    }

    config.push_str("write-out = \"\\n%{http_code}\"\n");

    let mut child = match Command::new("curl.exe")
        .args(["-K", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return ProviderModelsResult {
                ok: false,
                supported: true,
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
            return ProviderModelsResult {
                ok: false,
                supported: true,
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
        return ProviderModelsResult {
            ok: false,
            supported: true,
            status,
            models: Vec::new(),
            error: Some(if stderr.trim().is_empty() {
                "empty response".to_string()
            } else {
                stderr.chars().take(200).collect()
            }),
        };
    }

    match serde_json::from_str::<Value>(&body) {
        Ok(payload) => ProviderModelsResult {
            ok,
            supported: true,
            status,
            models: parse_model_ids(&payload),
            error: if ok {
                None
            } else {
                Some(body.chars().take(200).collect())
            },
        },
        Err(_) => ProviderModelsResult {
            ok,
            supported: true,
            status,
            models: Vec::new(),
            error: Some(body.chars().take(200).collect()),
        },
    }
}
