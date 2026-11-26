use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const BEGIN: &str = "<!-- FJK:MEMORY:BEGIN";
const END: &str = "<!-- FJK:MEMORY:END";
const MEMORY_MD_WARN_BYTES: u64 = 200 * 1024;

#[derive(Serialize)]
pub struct MemoryStatus {
    pub script_path: String,
    pub script_ready: bool,
    pub agents_block: bool,
    pub memory_md_bytes: u64,
    pub memory_md_lines: usize,
    pub daily_files: usize,
    pub archived_files: usize,
    pub warn: Option<String>,
}

fn workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "无法获取用户目录".to_string())?;
    Ok(PathBuf::from(home).join(".openclaw").join("workspace"))
}

fn script_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("com.fjk.agent")
        .join("bin")
        .join("fjk-mem.ps1"))
}

fn read_text(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

fn count_md(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .map(|ext| ext.eq_ignore_ascii_case("md"))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn memory_status() -> Result<MemoryStatus, String> {
    let script = script_path()?;
    let workspace = workspace_dir()?;
    let agents = read_text(&workspace.join("AGENTS.md"));
    let memory_md = workspace.join("MEMORY.md");
    let meta = fs::metadata(&memory_md).ok();

    let bytes = meta.as_ref().map(|item| item.len()).unwrap_or(0);
    let lines = fs::read_to_string(&memory_md)
        .map(|text| text.lines().count())
        .unwrap_or(0);

    let daily_files = count_md(&workspace.join("memory"));
    let archived_files = count_md(&workspace.join("memory").join("archive"));

    let warn = if bytes > MEMORY_MD_WARN_BYTES {
        Some(format!(
            "MEMORY.md 已 {} KB，建议整理（把细节移到 memory/日期.md）",
            bytes / 1024
        ))
    } else {
        None
    };

    Ok(MemoryStatus {
        script_path: script.display().to_string(),
        script_ready: script.exists(),
        agents_block: agents.contains(BEGIN),
        memory_md_bytes: bytes,
        memory_md_lines: lines,
        daily_files,
        archived_files,
        warn,
    })
}

fn build_agents_block(script: &Path) -> String {
    let path = script.display().to_string();

    format!(
        "{BEGIN} v1 -->\n\
## 长期记忆写入（fjk-mem，唯一可写 workspace 的通道）\n\n\
脚本（绝对路径，直接调用即可）：\n\n\
```powershell\n\
powershell -NoProfile -ExecutionPolicy Bypass -File \"{path}\" user --text \"称呼用户为「你」\"\n\
powershell -NoProfile -ExecutionPolicy Bypass -File \"{path}\" memory --text \"结论：…\"\n\
powershell -NoProfile -ExecutionPolicy Bypass -File \"{path}\" daily --text \"今天的上下文\"\n\
powershell -NoProfile -ExecutionPolicy Bypass -File \"{path}\" show --file user\n\
```\n\n\
规则：\n\
- 用户说「记住…」「以后都这样」→ 用 user（写 USER.md，下次会话自动加载）\n\
- 形成稳定决定/根因结论 → 用 memory（写 MEMORY.md）\n\
- 一次性上下文 → 用 daily（写 memory/YYYY-MM-DD.md）\n\
- 同一条重复写会被去重；补充已有主题用 show 读回后改写，不要重复追加\n\
- 不写密钥/token、不写大段日志\n\
{END} v1 -->\n"
    )
}

fn merge_block(existing: &str, block: &str) -> String {
    if let Some(begin_index) = existing.find(BEGIN) {
        if let Some(end_rel) = existing[begin_index..].find(END) {
            let end_index = begin_index + end_rel;
            let after = &existing[end_index..];
            let tail = match after.find('\n') {
                Some(offset) => &after[offset + 1..],
                None => "",
            };

            return format!("{}{}\n{}", &existing[..begin_index], block.trim_end(), tail);
        }
    }

    if existing.trim().is_empty() {
        return block.to_string();
    }

    format!("{}\n\n{}\n", existing.trim_end(), block.trim_end())
}

#[tauri::command]
pub fn memory_setup(app: tauri::AppHandle) -> Result<MemoryStatus, String> {
    use tauri::Manager;

    // 1) 释放 fjk-mem.ps1（若安装包内有）
    let target = script_path()?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).ok();
    }

    if let Ok(resource) = app
        .path()
        .resolve("resources/fjk-mem.ps1", tauri::path::BaseDirectory::Resource)
    {
        if resource.exists() {
            let stale = match (fs::metadata(&target), fs::metadata(&resource)) {
                (Ok(existing), Ok(source)) => existing.len() != source.len(),
                _ => true,
            };

            if stale {
                fs::copy(&resource, &target).map_err(|error| format!("释放写入脚本失败：{error}"))?;
            }
        }
    }

    // 2) 注入 AGENTS.md 记忆规范
    let workspace = workspace_dir()?;
    fs::create_dir_all(&workspace).map_err(|error| format!("创建工作区失败：{error}"))?;
    fs::create_dir_all(workspace.join("memory")).ok();

    let agents_path = workspace.join("AGENTS.md");
    let existing = read_text(&agents_path);
    let block = build_agents_block(&target);

    let backup = if agents_path.exists() {
        let path = agents_path.with_file_name(format!("AGENTS.md.bak-{}", now_secs()));
        fs::copy(&agents_path, &path).ok();
        Some(path)
    } else {
        None
    };

    fs::write(&agents_path, merge_block(&existing, &block))
        .map_err(|error| format!("写入 AGENTS.md 失败：{error}"))?;

    let _ = backup;

    memory_status()
}

#[tauri::command]
pub fn memory_open_dir() -> Result<String, String> {
    let workspace = workspace_dir()?;

    std::process::Command::new("explorer")
        .arg(workspace.display().to_string())
        .spawn()
        .map_err(|error| format!("打开目录失败：{error}"))?;

    Ok(workspace.display().to_string())
}

/// 把 90 天以前的每日笔记移到 memory/archive（护栏：防止索引无限增长）。
#[tauri::command]
pub fn memory_archive_old(days: u32) -> Result<usize, String> {
    let workspace = workspace_dir()?;
    let memory_dir = workspace.join("memory");

    if !memory_dir.is_dir() {
        return Ok(0);
    }

    let archive = memory_dir.join("archive");
    fs::create_dir_all(&archive).ok();

    let cutoff = now_secs().saturating_sub(days as u64 * 24 * 3600);
    let mut moved = 0;

    if let Ok(entries) = fs::read_dir(&memory_dir) {
        for entry in entries.filter_map(|item| item.ok()) {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            if path.extension().map(|ext| ext.eq_ignore_ascii_case("md")) != Some(true) {
                continue;
            }

            let modified = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_secs())
                .unwrap_or(u64::MAX);

            if modified < cutoff {
                if let Some(name) = path.file_name() {
                    let dest = archive.join(name);

                    if fs::rename(&path, &dest).is_ok() {
                        moved += 1;
                    }
                }
            }
        }
    }

    Ok(moved)
}
