use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

const MAX_LOG_BYTES: usize = 64 * 1024;

#[derive(Default)]
pub struct InstallState {
    running: AtomicBool,
    exit_code: Mutex<Option<i32>>,
    log: Mutex<String>,
}

#[derive(Serialize)]
pub struct InstallStatus {
    pub running: bool,
    pub exit_code: Option<i32>,
    pub log: String,
}

fn node_exe() -> Option<PathBuf> {
    if let Ok(output) = Command::new("where").arg("node").output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);

            if let Some(line) = text.lines().next() {
                let path = PathBuf::from(line.trim());
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    for base in [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ] {
        let path = PathBuf::from(base);
        if path.exists() {
            return Some(path);
        }
    }

    std::env::var("LOCALAPPDATA")
        .ok()
        .map(|dir| PathBuf::from(dir).join("Programs").join("nodejs").join("node.exe"))
        .filter(|path| path.exists())
}

fn npm_cmd() -> Option<PathBuf> {
    // 优先找与 node.exe 同目录的 npm.cmd，避免 PATH 未刷新
    if let Some(node) = node_exe() {
        if let Some(dir) = node.parent() {
            let npm = dir.join("npm.cmd");
            if npm.exists() {
                return Some(npm);
            }
        }
    }

    for base in [
        r"C:\Program Files\nodejs\npm.cmd",
        r"C:\Program Files (x86)\nodejs\npm.cmd",
    ] {
        let path = PathBuf::from(base);
        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn append_log(state: &InstallState, chunk: &str) {
    let Ok(mut guard) = state.log.lock() else {
        return;
    };

    guard.push_str(chunk);

    if guard.len() > MAX_LOG_BYTES {
        let keep_from = guard.len() - MAX_LOG_BYTES;
        *guard = guard[keep_from..].to_string();
    }
}

#[tauri::command]
pub fn openclaw_install_status(state: tauri::State<'_, Arc<InstallState>>) -> InstallStatus {
    let exit_code = state.exit_code.lock().ok().and_then(|guard| *guard);
    let log = state.log.lock().map(|guard| guard.clone()).unwrap_or_default();

    InstallStatus {
        running: state.running.load(Ordering::SeqCst),
        exit_code,
        log,
    }
}

/// 后台执行 `npm i -g openclaw [--registry=...]`，输出写入内存日志供前端轮询。
#[tauri::command]
pub async fn openclaw_install(
    state: tauri::State<'_, Arc<InstallState>>,
    registry: Option<String>,
) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("安装已在进行中".to_string());
    }

    if let Ok(mut guard) = state.exit_code.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.log.lock() {
        guard.clear();
    }

    let Some(npm) = npm_cmd() else {
        state.running.store(false, Ordering::SeqCst);
        return Err("未找到 npm（请先安装 Node.js 18+，装好后点重新检测）".to_string());
    };

    let mut args: Vec<String> = vec![
        "install".to_string(),
        "-g".to_string(),
        "openclaw@latest".to_string(),
        "--no-fund".to_string(),
        "--no-audit".to_string(),
    ];

    if let Some(registry) = registry.filter(|value| !value.trim().is_empty()) {
        args.push(format!("--registry={registry}"));
    }

    let shared = Arc::clone(&state);

    std::thread::spawn(move || {
        let mut command = Command::new(&npm);
        command
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        match command.output() {
            Ok(output) => {
                append_log(
                    &shared,
                    &String::from_utf8_lossy(&output.stdout),
                );

                let stderr = String::from_utf8_lossy(&output.stderr);

                if !stderr.trim().is_empty() {
                    append_log(
                    &shared, &stderr);
                }

                let code = output.status.code().unwrap_or(-1);

                if let Ok(mut guard) = shared.exit_code.lock() {
                    *guard = Some(code);
                }
            }
            Err(error) => {
                append_log(
                    &shared, &format!("启动 npm 失败：{error}"));

                if let Ok(mut guard) = shared.exit_code.lock() {
                    *guard = Some(-1);
                }
            }
        }

        shared.running.store(false, Ordering::SeqCst);
    });

    Ok(())
}
