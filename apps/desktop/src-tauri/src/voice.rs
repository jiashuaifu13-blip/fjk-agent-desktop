use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

const DEFAULT_VOICE: &str = "zh-CN-XiaoxiaoNeural";
const TTS_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_TEXT_CHARS: usize = 300;
const MAX_AUDIO_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Serialize)]
pub struct VoiceStatus {
    pub available: bool,
    pub voice: String,
    pub node: Option<String>,
    pub script: Option<String>,
    pub cache_dir: String,
    pub detail: String,
}

fn app_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata).join("com.fjk.agent"))
}

fn cache_dir() -> Result<PathBuf, String> {
    let dir = app_dir()?.join("voice").join("cache");
    fs::create_dir_all(&dir).ok();
    Ok(dir)
}

/// openclaw 自带的 node_modules（node-edge-tts 所在处）。
fn openclaw_node_modules() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(appdata)
        .join("npm")
        .join("node_modules")
        .join("openclaw")
        .join("node_modules");

    dir.is_dir().then_some(dir)
}

fn script_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;

    if let Ok(resource) = app
        .path()
        .resolve("resources/voice_tts.cjs", tauri::path::BaseDirectory::Resource)
    {
        if resource.exists() {
            return Some(resource);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("voice_tts.cjs");

    dev.exists().then_some(dev)
}

/// FNV-1a 64 位：用于缓存文件名，确定性且无额外依赖。
fn hash_text(text: &str, voice: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;

    for byte in text.as_bytes().iter().chain(voice.as_bytes()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }

    format!("{hash:016x}")
}

fn run_tts(
    node: &PathBuf,
    script: &PathBuf,
    node_path: &PathBuf,
    text: &str,
    out: &PathBuf,
    voice: &str,
) -> Result<(), String> {
    let mut command = Command::new(node);
    command
        .arg(script)
        .arg(out)
        .arg(voice)
        .env("NODE_PATH", node_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| format!("启动 node 失败：{error}"))?;

    // 必须 take() 后再写出：写完立刻 drop，关闭子进程 stdin。
    // 若只 as_mut() 借用，stdin 会一直保持打开，NODE 侧等不到 'end' 事件 → 30 秒超时。
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("写入文本失败：{error}"))?;
        stdin.flush().ok();
        // stdin 在此作用域结束时 drop → 发送 EOF
    }

    let deadline = Instant::now() + TTS_TIMEOUT;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }

                let stderr = child
                    .stderr
                    .take()
                    .and_then(|mut pipe| {
                        let mut buffer = String::new();
                        use std::io::Read;
                        pipe.read_to_string(&mut buffer).ok()?;
                        Some(buffer)
                    })
                    .unwrap_or_default();

                return Err(format!("语音合成失败：{}", stderr.trim().chars().take(200).collect::<String>()));
            }
            Ok(None) => {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    return Err("语音合成超时".to_string());
                }

                std::thread::sleep(Duration::from_millis(120));
            }
            Err(error) => return Err(format!("等待 node 失败：{error}")),
        }
    }
}

#[tauri::command]
pub fn voice_status(app: tauri::AppHandle) -> VoiceStatus {
    let node = crate::openclaw_cli::node_exe();
    let script = script_path(&app);
    let node_modules = openclaw_node_modules();

    let available = node.is_some() && script.is_some() && node_modules.is_some();

    let detail = match (&node, &script, &node_modules) {
        (None, _, _) => "未找到 node（需要先安装 OpenClaw）".to_string(),
        (_, None, _) => "安装包缺少 voice_tts.cjs".to_string(),
        (_, _, None) => "未找到 openclaw 的 node_modules（node-edge-tts）".to_string(),
        _ => "可用（Edge TTS，需要联网）".to_string(),
    };

    VoiceStatus {
        available,
        voice: DEFAULT_VOICE.to_string(),
        node: node.map(|path| path.display().to_string()),
        script: script.map(|path| path.display().to_string()),
        cache_dir: cache_dir().map(|dir| dir.display().to_string()).unwrap_or_default(),
        detail,
    }
}

/// 合成语音并返回 mp3 字节（走 IPC 二进制，前端建 Blob URL 播放）。
#[tauri::command]
pub fn voice_speak(app: tauri::AppHandle, text: String, voice: Option<String>) -> Result<tauri::ipc::Response, String> {
    let cleaned: String = text.trim().chars().take(MAX_TEXT_CHARS).collect();

    if cleaned.is_empty() {
        return Err("文本为空".to_string());
    }

    let voice = voice
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_VOICE.to_string());

    let dir = cache_dir()?;
    let key = hash_text(&cleaned, &voice);
    let cached = dir.join(format!("{key}.mp3"));

    if cached.exists() {
        if let Ok(meta) = fs::metadata(&cached) {
            if meta.len() > 0 && meta.len() <= MAX_AUDIO_BYTES {
                let bytes = fs::read(&cached).map_err(|error| format!("读取缓存失败：{error}"))?;
                return Ok(tauri::ipc::Response::new(bytes));
            }
        }
    }

    let node = crate::openclaw_cli::node_exe().ok_or_else(|| "未找到 node（需要先安装 OpenClaw）".to_string())?;
    let script = script_path(&app).ok_or_else(|| "安装包缺少 voice_tts.cjs".to_string())?;
    let node_modules = openclaw_node_modules()
        .ok_or_else(|| "未找到 openclaw 的 node_modules（node-edge-tts）".to_string())?;

    let temp = dir.join(format!("{key}.tmp.mp3"));

    run_tts(&node, &script, &node_modules, &cleaned, &temp, &voice)?;

    let bytes = fs::read(&temp).map_err(|error| format!("读取合成结果失败：{error}"))?;

    if bytes.is_empty() {
        let _ = fs::remove_file(&temp);
        return Err("语音合成结果为空".to_string());
    }

    let _ = fs::rename(&temp, &cached);

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn voice_open_cache() -> Result<String, String> {
    let dir = cache_dir()?;

    std::process::Command::new("explorer")
        .arg(dir.display().to_string())
        .spawn()
        .map_err(|error| format!("打开缓存目录失败：{error}"))?;

    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn voice_clear_cache() -> Result<usize, String> {
    let dir = cache_dir()?;
    let entries = fs::read_dir(&dir).map_err(|error| format!("读取缓存目录失败：{error}"))?;

    let mut removed = 0;

    for entry in entries.filter_map(|item| item.ok()) {
        let path = entry.path();

        if path.extension().map(|ext| ext.eq_ignore_ascii_case("mp3")) == Some(true)
            && fs::remove_file(&path).is_ok()
        {
            removed += 1;
        }
    }

    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_deterministic_and_voice_sensitive() {
        let a = hash_text("你好", "zh-CN-XiaoxiaoNeural");
        let b = hash_text("你好", "zh-CN-XiaoxiaoNeural");
        let c = hash_text("你好", "zh-CN-YunxiNeural");

        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 16);
    }
}
