use std::path::PathBuf;
use std::process::{Command, Output};

use serde::Serialize;

/// 所有探测子进程都必须隐藏窗口，否则向导轮询会不停闪控制台。
fn run_hidden(program: &str, args: &[&str]) -> Option<Output> {
    let mut command = Command::new(program);
    command.args(args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.output().ok()
}

#[derive(Serialize)]
pub struct Probe {
    pub ok: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub detail: Option<String>,
}

#[derive(Serialize)]
pub struct EnvCheck {
    pub webview2: Probe,
    pub node: Probe,
    pub openclaw: Probe,
}

fn read_version(program: &PathBuf) -> Option<String> {
    let output = run_hidden(&program.display().to_string(), &["--version"])?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if text.is_empty() {
        None
    } else {
        Some(text.lines().next().unwrap_or("").trim().to_string())
    }
}

fn probe_webview2() -> Probe {
    const GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    let keys = [
        format!(r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{GUID}"),
        format!(r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{GUID}"),
        format!(r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{GUID}"),
    ];

    for key in keys {
        let Some(output) = run_hidden("reg", &["query", &key, "/v", "pv"]) else {
            continue;
        };

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let version = text
                .split_whitespace()
                .last()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            return Probe {
                ok: true,
                version,
                path: None,
                detail: Some("已检测到 WebView2 Runtime".to_string()),
            };
        }
    }

    for base in [
        r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
        r"C:\Program Files\Microsoft\EdgeWebView\Application",
    ] {
        let path = PathBuf::from(base);

        if path.is_dir() {
            return Probe {
                ok: true,
                version: None,
                path: Some(path.display().to_string()),
                detail: Some("已检测到 WebView2 安装目录".to_string()),
            };
        }
    }

    Probe {
        ok: false,
        version: None,
        path: None,
        detail: Some("未检测到 WebView2 Runtime".to_string()),
    }
}

fn node_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(output) = run_hidden("where", &["node"]) {
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

    candidates
}

fn probe_node() -> Probe {
    for candidate in node_candidates() {
        if !candidate.exists() {
            continue;
        }

        let version = read_version(&candidate);

        let major = version
            .as_ref()
            .map(|text| text.trim_start_matches('v').to_string())
            .and_then(|text| text.split('.').next().map(|part| part.to_string()))
            .and_then(|part| part.parse::<u32>().ok());

        let ok = major.map(|value| value >= 18).unwrap_or(false);

        return Probe {
            ok,
            version,
            path: Some(candidate.display().to_string()),
            detail: Some(if ok {
                "Node.js 版本满足要求（≥18）".to_string()
            } else {
                "Node.js 版本过低，需要 18 或更高".to_string()
            }),
        };
    }

    Probe {
        ok: false,
        version: None,
        path: None,
        detail: Some("未检测到 Node.js（需要 18 或更高版本）".to_string()),
    }
}

fn probe_openclaw() -> Probe {
    let Some(cli) = crate::onboarding::find_cli() else {
        return Probe {
            ok: false,
            version: None,
            path: None,
            detail: Some("未检测到 OpenClaw CLI".to_string()),
        };
    };

    let version = read_version(&cli);

    Probe {
        ok: true,
        version,
        path: Some(cli.display().to_string()),
        detail: Some("已安装 OpenClaw CLI".to_string()),
    }
}

#[tauri::command]
pub async fn env_check() -> EnvCheck {
    tauri::async_runtime::spawn_blocking(|| EnvCheck {
        webview2: probe_webview2(),
        node: probe_node(),
        openclaw: probe_openclaw(),
    })
    .await
    .unwrap_or(EnvCheck {
        webview2: Probe {
            ok: false,
            version: None,
            path: None,
            detail: Some("检测失败".to_string()),
        },
        node: Probe {
            ok: false,
            version: None,
            path: None,
            detail: Some("检测失败".to_string()),
        },
        openclaw: Probe {
            ok: false,
            version: None,
            path: None,
            detail: Some("检测失败".to_string()),
        },
    })
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 http(s) 链接".to_string());
    }

    let mut command = Command::new("cmd");
    command.args(["/C", "start", "", &url]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
        .status()
        .map(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("系统未能打开链接".to_string())
            }
        })
        .map_err(|error| format!("打开链接失败：{error}"))?
}
