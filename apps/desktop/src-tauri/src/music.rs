use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct MusicTrack {
    /// 显示名（去掉扩展名的文件名）
    pub name: String,
    /// 绝对路径，前端用 asset 协议播放
    pub path: String,
    pub size: u64,
}

const AUDIO_EXTENSIONS: [&str; 5] = ["mp3", "wav", "flac", "m4a", "ogg"];

pub fn music_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata).join("com.fjk.agent").join("music"))
}

/// 启动时确保目录存在，用户才有地方丢文件。
pub fn ensure_dir() -> Option<PathBuf> {
    let dir = music_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

#[tauri::command]
pub fn music_list() -> Vec<MusicTrack> {
    let Ok(dir) = music_dir() else {
        return Vec::new();
    };

    let _ = fs::create_dir_all(&dir);

    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut tracks: Vec<MusicTrack> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let path = entry.path();
            let ext = path
                .extension()
                .map(|value| value.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                return None;
            }

            let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            let name = path
                .file_stem()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "未命名".to_string());

            Some(MusicTrack {
                name,
                path: path.display().to_string(),
                size,
            })
        })
        .collect();

    tracks.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    tracks
}

#[tauri::command]
pub fn music_open_dir() -> Result<String, String> {
    let dir = ensure_dir().ok_or_else(|| "无法创建音乐目录".to_string())?;

    std::process::Command::new("explorer")
        .arg(dir.display().to_string())
        .spawn()
        .map_err(|error| format!("打开目录失败：{error}"))?;

    Ok(dir.display().to_string())
}

const MAX_TRACK_BYTES: u64 = 32 * 1024 * 1024;

/// 读取一首歌的原始字节交给前端播放。
///
/// 不用 asset 协议（需要额外 crate，离线构建拿不到），而是直接走 IPC 二进制：
/// 前端拿到 ArrayBuffer 后建 Blob URL 播放。
/// 路径必须位于音乐目录内，防止任意文件读取。
#[tauri::command]
pub fn music_read(path: String) -> Result<tauri::ipc::Response, String> {
    let dir = music_dir()?;

    let requested = std::path::PathBuf::from(&path);
    let canonical_dir = dir.canonicalize().map_err(|error| format!("音乐目录不可用：{error}"))?;
    let canonical_file = requested
        .canonicalize()
        .map_err(|error| format!("文件不存在或不可读：{error}"))?;

    if !canonical_file.starts_with(&canonical_dir) {
        return Err("只允许读取音乐目录内的文件".to_string());
    }

    let meta = std::fs::metadata(&canonical_file).map_err(|error| format!("读取失败：{error}"))?;

    if meta.len() > MAX_TRACK_BYTES {
        return Err(format!(
            "文件过大（{} MB，上限 {} MB）",
            meta.len() / 1_048_576,
            MAX_TRACK_BYTES / 1_048_576
        ));
    }

    let bytes = std::fs::read(&canonical_file).map_err(|error| format!("读取失败：{error}"))?;

    Ok(tauri::ipc::Response::new(bytes))
}
