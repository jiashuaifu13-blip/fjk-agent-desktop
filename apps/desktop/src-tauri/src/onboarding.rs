use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::Command;

/// 子进程隐藏窗口，避免控制台闪烁。
fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}
use std::time::Duration;

use serde::Serialize;

#[derive(Serialize)]
pub struct OpenClawStatus {
    pub installed: bool,
    pub cli_path: Option<String>,
    pub version: Option<String>,
    pub gateway_running: bool,
    pub config_found: bool,
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(
            PathBuf::from(&appdata)
                .join("npm")
                .join("openclaw.cmd"),
        );
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

pub(crate) fn find_cli() -> Option<PathBuf> {
    for path in candidate_paths() {
        if path.exists() {
            return Some(path);
        }
    }

    let mut where_cmd = Command::new("where");
    where_cmd.arg("openclaw");
    hide_window(&mut where_cmd);

    let output = where_cmd.output().ok()?;

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

fn read_version(cli: &PathBuf) -> Option<String> {
    let mut version_cmd = Command::new("cmd");
    version_cmd.args(["/C"]).arg(cli).arg("--version");
    hide_window(&mut version_cmd);

    let output = version_cmd.output().ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn gateway_running() -> bool {
    let addr: SocketAddr = match "127.0.0.1:18789".parse() {
        Ok(value) => value,
        Err(_) => return false,
    };

    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn config_found() -> bool {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return PathBuf::from(profile)
            .join(".openclaw")
            .join("openclaw.json")
            .exists();
    }

    false
}

#[tauri::command]
pub async fn openclaw_status() -> OpenClawStatus {
    /*
     * 探测会拉起 `openclaw --version`（Node CLI 启动 0.5–2s）。
     * Tauri 的同步命令跑在主线程，会冻结界面，因此放进阻塞线程池。
     */
    tauri::async_runtime::spawn_blocking(collect_status)
        .await
        .unwrap_or_else(|_| OpenClawStatus {
            installed: false,
            cli_path: None,
            version: None,
            gateway_running: gateway_running(),
            config_found: config_found(),
        })
}

fn collect_status() -> OpenClawStatus {
    let cli = find_cli();
    let version = cli.as_ref().and_then(read_version);

    OpenClawStatus {
        installed: cli.is_some(),
        cli_path: cli.map(|path| path.to_string_lossy().to_string()),
        version,
        gateway_running: gateway_running(),
        config_found: config_found(),
    }
}
