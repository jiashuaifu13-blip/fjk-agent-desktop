use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// 备份清理：升级与日常使用会不断产生 .bak / sessions-* 备份。
/// 这里只保留最近的若干个，其余删除，避免磁盘与目录无限膨胀。
/// 全部操作都在启动时做一次，失败静默（不影响启动）。

const CONFIG_BACKUPS_TO_KEEP: usize = 3;
const SESSION_BACKUP_DIRS_TO_KEEP: usize = 1;
const WORKSPACE_BACKUPS_PER_FILE: usize = 3;

fn mtime(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn prune_files(dir: &Path, keep: usize, match_name: impl Fn(&str) -> bool) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };

    let mut files: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .map(|name| match_name(&name.to_string_lossy()))
                .unwrap_or(false)
        })
        .collect();

    if files.len() <= keep {
        return 0;
    }

    files.sort_by_key(|path| std::cmp::Reverse(mtime(path)));

    let mut removed = 0;

    for path in files.into_iter().skip(keep) {
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }

    removed
}

fn prune_dirs(dir: &Path, keep: usize, prefix: &str) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };

    let mut dirs: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().starts_with(prefix))
                .unwrap_or(false)
        })
        .collect();

    if dirs.len() <= keep {
        return 0;
    }

    dirs.sort_by_key(|path| std::cmp::Reverse(mtime(path)));

    let mut removed = 0;

    for path in dirs.into_iter().skip(keep) {
        if fs::remove_dir_all(&path).is_ok() {
            removed += 1;
        }
    }

    removed
}

/// 在应用启动时调用一次。返回 (清理文件数, 清理目录数)。
pub fn tidy() -> (usize, usize) {
    let mut files_removed = 0;
    let mut dirs_removed = 0;

    // 1) OpenClaw 配置备份：openclaw.json.bak*
    if let Ok(home) = std::env::var("USERPROFILE") {
        let openclaw = PathBuf::from(&home).join(".openclaw");
        files_removed += prune_files(&openclaw, CONFIG_BACKUPS_TO_KEEP, |name| {
            name.starts_with("openclaw.json.bak")
        });

        // 2) workspace 内的人格/规则/记忆备份：SOUL.md.bak-* 等，每个文件各留 3 个
        let workspace = openclaw.join("workspace");

        for base in ["SOUL.md", "AGENTS.md", "IDENTITY.md", "MEMORY.md", "USER.md"] {
            let prefix = format!("{base}.bak");
            files_removed += prune_files(&workspace, WORKSPACE_BACKUPS_PER_FILE, |name| {
                name.starts_with(&prefix)
            });
        }

        // 3) 人格卡 sidecar 备份
        files_removed += prune_files(&workspace, WORKSPACE_BACKUPS_PER_FILE, |name| {
            name.starts_with("persona.v2.json.bak")
        });
    }

    // 4) 应用侧会话备份目录：sessions-YYYYMMDD-HHMMSS，只留最近 1 个
    if let Ok(appdata) = std::env::var("APPDATA") {
        let backup = PathBuf::from(appdata)
            .join("com.fjk.agent")
            .join("backup");

        dirs_removed += prune_dirs(&backup, SESSION_BACKUP_DIRS_TO_KEEP, "sessions-");
    }

    (files_removed, dirs_removed)
}
