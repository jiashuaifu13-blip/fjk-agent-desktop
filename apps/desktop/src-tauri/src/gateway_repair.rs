use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
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

fn set_step(
    state: &RepairState,
    id: &str,
    status: &str,
    detail: Option<String>,
    elapsed: Option<Duration>,
) {
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

fn set_message(state: &RepairState, text: &str) {
    if let Ok(mut guard) = state.message.lock() {
        *guard = text.to_string();
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
        (
            "HKLM",
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
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

    if let Some(node) = node_exe() {
        if let Some(dir) = node.parent() {
            parts.push(dir.display().to_string());
        }
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

/// 找到 node.exe（多路径兜底，不依赖 PATH）。
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

/// OpenClaw 的 JS 入口（直接用 node 运行，绕开 cmd 与 PATH）。
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

fn port_ready() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:18789".parse().expect("addr"),
        Duration::from_millis(400),
    )
    .is_ok()
}

/// 用 node + index.js 执行 CLI 子命令（带超时控制由调用方负责）。
fn run_cli(args: &[&str]) -> Option<std::io::Result<Output>> {
    let node = node_exe()?;
    let entry = openclaw_entry()?;

    let mut command = Command::new(node);
    command
        .arg(entry)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    Some(command.output())
}

/// 最后兜底：直接以后台进程方式跑网关（不依赖 Windows 服务/登录项）。
fn spawn_gateway_detached() -> bool {
    let Some(node) = node_exe() else {
        return false;
    };
    let Some(entry) = openclaw_entry() else {
        return false;
    };

    let mut command = Command::new(node);
    command
        .arg(entry)
        .arg("gateway")
        .arg("--port")
        .arg("18789")
        .arg("--task-supervisor")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        command.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }

    command.spawn().is_ok()
}

fn tail(text: &str, lines: usize) -> String {
    let collected: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let start = collected.len().saturating_sub(lines);
    collected[start..].join(" | ")
}

#[tauri::command]
pub fn gateway_repair_status(state: tauri::State<'_, Arc<RepairState>>) -> RepairSnapshot {
    RepairSnapshot {
        running: state.running.load(Ordering::SeqCst),
        finished: state.finished.load(Ordering::SeqCst),
        ok: state.ok.load(Ordering::SeqCst),
        needs_install: state.needs_install.load(Ordering::SeqCst),
        steps: state
            .steps
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default(),
        message: state
            .message
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub async fn gateway_repair(state: tauri::State<'_, Arc<RepairState>>) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("修复已在进行中".to_string());
    }

    state.finished.store(false, Ordering::SeqCst);
    state.ok.store(false, Ordering::SeqCst);
    state.needs_install.store(false, Ordering::SeqCst);
    set_message(&state, "");
    if let Ok(mut guard) = state.steps.lock() {
        guard.clear();
        guard.push(step("cli", "找到 OpenClaw"));
        guard.push(step("env", "刷新系统环境变量"));
        guard.push(step("start", "安装并启动网关"));
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
                set_message(&shared, "这台电脑还没有安装 OpenClaw。点下面的按钮，我带你装。");
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

        // 3) 安装并启动网关：start → install → 直接后台运行
        let t2 = Instant::now();
        set_step(&shared, "start", "running", None, None);

        let mut notes: Vec<String> = Vec::new();

        // 3.1 start
        if let Some(Ok(output)) = run_cli(&["gateway", "start"]) {
            if output.status.success() && port_ready() {
                set_step(
                    &shared,
                    "start",
                    "done",
                    Some("已通过系统服务启动".to_string()),
                    Some(t2.elapsed()),
                );
            } else {
                let text = String::from_utf8_lossy(&output.stderr).to_string();
                notes.push(format!("start: {}", tail(&text, 1)));
            }
        }

        // 3.2 服务缺失时，install（安装并启动登录项）
        let started = shared
            .steps
            .lock()
            .map(|guard| guard.iter().any(|item| item.id == "start" && item.status == "done"))
            .unwrap_or(false);

        if !started {
            if let Some(Ok(output)) = run_cli(&["gateway", "install"]) {
                if output.status.success() {
                    // 安装会启动服务，等端口
                    let deadline = Instant::now() + Duration::from_secs(45);
                    while Instant::now() < deadline && !port_ready() {
                        std::thread::sleep(Duration::from_millis(900));
                    }

                    if port_ready() {
                        set_step(
                            &shared,
                            "start",
                            "done",
                            Some("已安装系统服务并启动".to_string()),
                            Some(t2.elapsed()),
                        );
                    } else {
                        let text = String::from_utf8_lossy(&output.stderr).to_string();
                        notes.push(format!("install: {}", tail(&text, 1)));
                    }
                } else {
                    let text = String::from_utf8_lossy(&output.stderr).to_string();
                    notes.push(format!("install: {}", tail(&text, 1)));
                }
            }
        }

        // 3.3 仍失败则直接后台拉进程（不依赖服务）
        let started = shared
            .steps
            .lock()
            .map(|guard| guard.iter().any(|item| item.id == "start" && item.status == "done"))
            .unwrap_or(false);

        if !started {
            let spawned = spawn_gateway_detached();

            if spawned {
                let deadline = Instant::now() + Duration::from_secs(40);
                while Instant::now() < deadline && !port_ready() {
                    std::thread::sleep(Duration::from_millis(700));
                }
            }

            if port_ready() {
                set_step(
                    &shared,
                    "start",
                    "done",
                    Some("已由应用直接启动（无需系统服务）".to_string()),
                    Some(t2.elapsed()),
                );
            } else {
                set_step(
                    &shared,
                    "start",
                    "failed",
                    Some(if notes.is_empty() {
                        "无法启动网关进程".to_string()
                    } else {
                        notes.join(" ; ")
                    }),
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
            set_message(&shared, "网关启动超时。可能是杀毒软件拦截，或端口被其它程序占用。");
            shared.running.store(false, Ordering::SeqCst);
            shared.finished.store(true, Ordering::SeqCst);
            return;
        }

        // 5) 握手由应用连接完成
        set_step(
            &shared,
            "auth",
            "running",
            Some("正在由应用建立连接…".to_string()),
            None,
        );
        set_message(&shared, "网关已启动，正在自动连接…");

        shared.ok.store(true, Ordering::SeqCst);
        shared.running.store(false, Ordering::SeqCst);
        shared.finished.store(true, Ordering::SeqCst);
    });

    Ok(())
}
