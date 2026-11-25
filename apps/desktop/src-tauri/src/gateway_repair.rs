use std::net::{TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct RepairStep {
    pub id: String,
    pub label: String,
    /// pending | running | done | failed
    pub status: String,
    pub detail: Option<String>,
    pub elapsed_ms: Option<u64>,
}

#[derive(Default)]
pub struct RepairState {
    running: AtomicBool,
    finished: AtomicBool,
    ok: AtomicBool,
    needs_install: AtomicBool,
    steps: Mutex<Vec<RepairStep>>,
    message: Mutex<String>,
}

#[derive(Serialize)]
pub struct RepairSnapshot {
    pub running: bool,
    pub finished: bool,
    pub ok: bool,
    pub needs_install: bool,
    pub steps: Vec<RepairStep>,
    pub message: String,
}

fn step(id: &str, label: &str) -> RepairStep {
    RepairStep {
        id: id.to_string(),
        label: label.to_string(),
        status: "pending".to_string(),
        detail: None,
        elapsed_ms: None,
    }
}

fn set_step(state: &RepairState, id: &str, status: &str, detail: Option<String>, elapsed: Option<Duration>) {
    let Ok(mut guard) = state.steps.lock() else {
        return;
    };

    for item in guard.iter_mut() {
        if item.id == id {
            item.status = status.to_string();
            item.detail = detail;
            item.elapsed_ms = elapsed.map(|value| value.as_millis() as u64);
            return;
        }
    }
}

fn cli_candidates() -> Vec<PathBuf> {
    let mut list: Vec<PathBuf> = Vec::new();

    if let Some(found) = crate::onboarding::find_cli() {
        list.push(found);
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        list.push(PathBuf::from(appdata).join("npm").join("openclaw.cmd"));
    }

    for base in [r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"] {
        list.push(PathBuf::from(base).join("openclaw.cmd"));
    }

    list
}

/// 从注册表重读 PATH，解决“刚装完 Node/OpenClaw，当前进程 PATH 还是旧的”。
fn refresh_path() -> String {
    let mut parts: Vec<String> = Vec::new();

    for (hive, key) in [
        ("HKCU", r"Environment"),
        ("HKLM", r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    ] {
        let output = Command::new("reg")
            .args(["query", &format!("{hive}\\{key}"), "/v", "Path"])
            .output();

        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout).to_string();

            for line in text.lines() {
                if line.contains("Path") && line.contains("REG_") {
                    if let Some(idx) = line.find("REG_") {
                        let rest = &line[idx..];
                        if let Some(space) = rest.find(char::is_whitespace) {
                            parts.push(rest[space..].trim().to_string());
                        }
                    }
                }
            }
        }
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        parts.push(PathBuf::from(appdata).join("npm").display().to_string());
    }

    parts.push(r"C:\Program Files\nodejs".to_string());

    let current = std::env::var("PATH").unwrap_or_default();
    parts.push(current);

    let merged = parts
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(";");

    std::env::set_var("PATH", &merged);
    merged
}

fn gateway_cmd_path() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE").ok()?;
    let path = PathBuf::from(home).join(".openclaw").join("gateway.cmd");
    path.exists().then_some(path)
}

fn port_ready() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:18789".parse().expect("addr"),
        Duration::from_millis(400),
    )
    .is_ok()
}

#[tauri::command]
pub fn gateway_repair_status(state: tauri::State<'_, Arc<RepairState>>) -> RepairSnapshot {
    RepairSnapshot {
        running: state.running.load(Ordering::SeqCst),
        finished: state.finished.load(Ordering::SeqCst),
        ok: state.ok.load(Ordering::SeqCst),
        needs_install: state.needs_install.load(Ordering::SeqCst),
        steps: state.steps.lock().map(|guard| guard.clone()).unwrap_or_default(),
        message: state.message.lock().map(|guard| guard.clone()).unwrap_or_default(),
    }
}

#[tauri::command]
pub async fn gateway_repair(
    state: tauri::State<'_, Arc<RepairState>>,
) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("修复已在进行中".to_string());
    }

    state.finished.store(false, Ordering::SeqCst);
    state.ok.store(false, Ordering::SeqCst);
    state.needs_install.store(false, Ordering::SeqCst);
    if let Ok(mut guard) = state.message.lock() {
        guard.clear();
    }
    if let Ok(mut guard) = state.steps.lock() {
        guard.clear();
        guard.push(step("cli", "找到 OpenClaw"));
        guard.push(step("env", "刷新系统环境变量"));
        guard.push(step("start", "启动网关进程"));
        guard.push(step("port", "等待网关端口就绪"));
        guard.push(step("auth", "验证网关握手"));
    }

    let shared = Arc::clone(&state);

    std::thread::spawn(move || {
        // 1) 找 CLI
        let t0 = Instant::now();
        set_step(&shared, "cli", "running", None, None);

        let cli = cli_candidates().into_iter().find(|path| path.exists());

        match &cli {
            Some(path) => set_step(
                &shared,
                "cli",
                "done",
                Some(path.display().to_string()),
                Some(t0.elapsed()),
            ),
            None => {
                set_step(
                    &shared,
                    "cli",
                    "failed",
                    Some("没有找到 openclaw".to_string()),
                    Some(t0.elapsed()),
                );
                shared.needs_install.store(true, Ordering::SeqCst);
                if let Ok(mut guard) = shared.message.lock() {
                    *guard = "这台电脑还没有安装 OpenClaw。点下面的按钮，我带你装。".to_string();
                }
                shared.running.store(false, Ordering::SeqCst);
                shared.finished.store(true, Ordering::SeqCst);
                return;
            }
        }

        // 2) 刷新环境变量
        let t1 = Instant::now();
        set_step(&shared, "env", "running", None, None);
        let merged = refresh_path();
        set_step(
            &shared,
            "env",
            "done",
            Some(format!("PATH 已刷新（{} 项）", merged.split(';').count())),
            Some(t1.elapsed()),
        );

        // 3) 启动网关
        let t2 = Instant::now();
        set_step(&shared, "start", "running", None, None);

        let start_result = if let Some(cmd_path) = gateway_cmd_path() {
            Command::new("cmd")
                .args(["/C", &cmd_path.display().to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .output()
        } else {
            let cli_path = cli.as_ref().expect("cli").display().to_string();
            Command::new("cmd")
                .args(["/C", &format!("\"{cli_path}\" gateway start")])
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .output()
        };

        match start_result {
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                let tail: String = stderr
                    .lines()
                    .rev()
                    .take(3)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join(" ");

                set_step(
                    &shared,
                    "start",
                    if output.status.success() { "done" } else { "failed" },
                    if tail.is_empty() { None } else { Some(tail) },
                    Some(t2.elapsed()),
                );
            }
            Err(error) => {
                set_step(
                    &shared,
                    "start",
                    "failed",
                    Some(format!("无法启动：{error}")),
                    Some(t2.elapsed()),
                );
            }
        }

        // 4) 等端口
        let t3 = Instant::now();
        set_step(&shared, "port", "running", None, None);
        let deadline = Instant::now() + Duration::from_secs(120);
        let mut ready = port_ready();

        while !ready && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(900));
            ready = port_ready();
        }

        if ready {
            set_step(
                &shared,
                "port",
                "done",
                Some("127.0.0.1:18789 已就绪".to_string()),
                Some(t3.elapsed()),
            );
        } else {
            set_step(
                &shared,
                "port",
                "failed",
                Some("等待 120 秒仍无响应".to_string()),
                Some(t3.elapsed()),
            );
            if let Ok(mut guard) = shared.message.lock() {
                *guard = "网关启动超时。可能是杀毒软件拦截，或端口被其它程序占用。".to_string();
            }
            shared.running.store(false, Ordering::SeqCst);
            shared.finished.store(true, Ordering::SeqCst);
            return;
        }

        // 5) 握手交给前端连接（这里只标记待验证）
        set_step(&shared, "auth", "running", Some("正在由应用建立连接…".to_string()), None);

        if let Ok(mut guard) = shared.message.lock() {
            *guard = "网关已启动，正在自动连接…".to_string();
        }

        shared.ok.store(true, Ordering::SeqCst);
        shared.running.store(false, Ordering::SeqCst);
        shared.finished.store(true, Ordering::SeqCst);
    });

    Ok(())
}
