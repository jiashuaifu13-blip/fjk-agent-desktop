use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

const GATEWAY_ADDR: &str = "127.0.0.1:18789";
const CONNECT_TIMEOUT: Duration = Duration::from_millis(250);
/// 一次启动后，多短时间内的重复 ensure 视为“正在启动中”，避免拉起第二个实例。
const START_DEDUPE_WINDOW_MS: u128 = 120_000;

/// 由 FJK 启动并托管的 Gateway 启动信息。
/// 只用于“知道自己发起过启动”，绝不据此终止任何进程。
#[allow(dead_code)]
struct ManagedGateway {
    pid: u32,
    started_at_ms: u128,
}

#[derive(Default)]
pub struct GatewayLaunchState {
    /// 单飞锁：同一时刻只允许一个 ensure 在跑。
    ensure: tokio::sync::Mutex<()>,
    managed: Mutex<Option<ManagedGateway>>,
}

#[derive(Serialize)]
pub struct EnsureResult {
    pub ok: bool,
    /// reused（已在监听）| started（已发起启动，等待端口就绪）| failed
    pub phase: String,
    pub pid: Option<u32>,
    pub error_kind: Option<String>,
    pub detail: Option<String>,
}

#[derive(Serialize)]
pub struct ProbeResult {
    pub port_open: bool,
    pub pid: Option<u32>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn port_open() -> bool {
    let Ok(addr) = GATEWAY_ADDR.parse::<SocketAddr>() else {
        return false;
    };

    TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).is_ok()
}

/// 反查真正监听 Gateway 端口的进程 PID。
///
/// `openclaw gateway start` 在 Windows 上是「启动登录项/服务」，
/// 它自己会很快退出，因此不能把 CLI 进程的 PID 当成 Gateway 的 PID。
fn listening_pid() -> Option<u32> {
    let output = Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);

    for line in text.lines() {
        if !line.contains(GATEWAY_ADDR) || !line.contains("LISTENING") {
            continue;
        }

        if let Some(pid) = line.split_whitespace().last() {
            if let Ok(pid) = pid.parse::<u32>() {
                return Some(pid);
            }
        }
    }

    None
}

fn pid_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("gateway.pid"))
}

fn write_pid_file(app: &AppHandle, phase: &str, pid: Option<u32>, started_at_ms: u128) {
    let Some(path) = pid_path(app) else {
        return;
    };

    /*
     * 只记录定位所需的最小信息；不含 token、环境变量或命令行。
     * phase 明确区分“已发起启动”与“已在监听”，避免把启动器 PID 当成网关 PID。
     */
    let pid_value = pid
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());

    let payload = format!(
        "{{\"phase\":\"{phase}\",\"pid\":{pid_value},\"startedAtMs\":{started_at_ms},\"source\":\"fjk-desktop\",\"port\":18789}}"
    );

    let _ = fs::write(path, payload);
}

/// OpenClaw 在 Windows 上生成的启动脚本；直接运行它可省掉 `openclaw` CLI 的启动链路。
fn gateway_cmd_path() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;

    let path = PathBuf::from(home).join(".openclaw").join("gateway.cmd");

    path.exists().then_some(path)
}

fn failed(kind: &str, detail: impl Into<String>) -> EnsureResult {
    EnsureResult {
        ok: false,
        phase: "failed".to_string(),
        pid: None,
        error_kind: Some(kind.to_string()),
        detail: Some(detail.into()),
    }
}

/// 探测 Gateway 端口是否已就绪（供前端轮询，不做任何副作用）。
#[tauri::command]
pub fn gateway_probe() -> ProbeResult {
    let open = port_open();

    ProbeResult {
        port_open: open,
        pid: if open { listening_pid() } else { None },
    }
}

/// 确保 Gateway 可用：已就绪则复用，未运行则发起启动并立即返回。
///
/// 真正的就绪等待由前端轮询 `gateway_probe` 完成——网关冷启动在本机实测约 12–32 秒，
/// 单次命令里长时间阻塞既体验差，也无法在失败后继续恢复。
#[tauri::command]
pub async fn gateway_ensure_running(
    app: AppHandle,
    state: State<'_, GatewayLaunchState>,
) -> Result<EnsureResult, String> {
    let _guard = state.ensure.lock().await;

    // 1) 已在监听：复用，绝不再启动第二个实例。
    if port_open() {
        let pid = listening_pid();

        return Ok(EnsureResult {
            ok: true,
            phase: "reused".to_string(),
            pid,
            error_kind: None,
            detail: Some("Gateway 已在运行，复用现有实例。".to_string()),
        });
    }

    // 2) 刚发起过启动且仍在窗口期内：不重复拉起。
    if let Ok(guard) = state.managed.lock() {
        if let Some(managed) = guard.as_ref() {
            let elapsed = now_ms().saturating_sub(managed.started_at_ms);

            if elapsed < START_DEDUPE_WINDOW_MS {
                return Ok(EnsureResult {
                    ok: true,
                    phase: "started".to_string(),
                    pid: Some(managed.pid),
                    error_kind: None,
                    detail: Some("Gateway 启动中，请继续等待端口就绪。".to_string()),
                });
            }
        }
    }

    // 2.5) 限制 Node 堆上限（默认 8032MB → 2048MB），防止长时间运行涨到 1.4GB
    let _ = tune_gateway_heap(1024);

    // 3) 选择启动方式：优先直接运行 gateway.cmd（快），否则回退 CLI。
    let (args, source) = match gateway_cmd_path() {
        Some(path) => (vec![path.to_string_lossy().to_string()], "gateway.cmd"),
        None => {
            let Some(cli) = crate::onboarding::find_cli() else {
                return Ok(failed(
                    "cli_missing",
                    "未找到 openclaw 命令与 gateway.cmd，请先安装 OpenClaw（npm i -g openclaw）。",
                ));
            };

            (
                vec![
                    cli.to_string_lossy().to_string(),
                    "gateway".to_string(),
                    "start".to_string(),
                ],
                "openclaw gateway start",
            )
        }
    };

    let mut command = Command::new("cmd");
    command
        .arg("/C")
        .args(&args)
        .stdin(Stdio::null());

    if let Some(path) = pid_path(&app) {
        let log = path.with_file_name("gateway-launch.log");

        if let Ok(file) = fs::File::create(&log) {
            if let Ok(clone) = file.try_clone() {
                command.stdout(Stdio::from(file));
                command.stderr(Stdio::from(clone));
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Ok(failed(
                "spawn_failed",
                format!("无法启动 Gateway（{source}）：{error}"),
            ));
        }
    };

    let pid = child.id();
    let started_at_ms = now_ms();

    write_pid_file(&app, "started", Some(pid), started_at_ms);

    if let Ok(mut guard) = state.managed.lock() {
        *guard = Some(ManagedGateway {
            pid,
            started_at_ms,
        });
    }

    Ok(EnsureResult {
        ok: true,
        phase: "started".to_string(),
        pid: Some(pid),
        error_kind: None,
        detail: Some(format!("已发起启动（{source}），等待端口就绪…")),
    })
}

/// 调整 gateway.cmd 里的 Node 堆上限（默认 2048MB）。
///
/// 为什么必须改文件：OpenClaw 生成的 gateway.cmd 会先 `set "NODE_OPTIONS="`，
/// 再用命令行 `--max-old-space-size=8032` 启动，环境变量覆盖不了它。
/// 该文件是 GBK 编码且含中文用户名，所以按字节定位 ASCII 片段替换，绝不整体重写。
pub fn tune_gateway_heap(target_mb: u32) -> Option<String> {
    let home = std::env::var("USERPROFILE").ok()?;
    let path = std::path::PathBuf::from(home).join(".openclaw").join("gateway.cmd");

    if !path.exists() {
        return None;
    }

    let bytes = std::fs::read(&path).ok()?;
    let needle = b"--max-old-space-size=";

    let start = bytes
        .windows(needle.len())
        .position(|window| window == needle)?;

    let number_start = start + needle.len();
    let mut number_end = number_start;

    while number_end < bytes.len()
        && bytes[number_end].is_ascii_digit()
        && number_end - number_start < 8
    {
        number_end += 1;
    }

    if number_end == number_start {
        return None;
    }

    let current = String::from_utf8_lossy(&bytes[number_start..number_end]).to_string();

    if current == target_mb.to_string() {
        return Some(format!("已是 {current}MB"));
    }

    let replacement = format!("{target_mb:04}").into_bytes();
    let mut next: Vec<u8> = Vec::with_capacity(bytes.len());
    next.extend_from_slice(&bytes[..number_start]);
    next.extend_from_slice(&replacement);
    next.extend_from_slice(&bytes[number_end..]);

    std::fs::write(&path, next).ok()?;

    Some(format!("{current}MB -> {target_mb}MB"))
}
