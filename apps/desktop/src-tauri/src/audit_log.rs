use std::fs::{self, OpenOptions};
use std::io::Write;

use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 5 * 1024 * 1024;

fn audit_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir: {error}"))?;

    fs::create_dir_all(&dir).map_err(|error| format!("create_dir_all: {error}"))?;

    Ok(dir)
}

fn rotate_if_needed(dir: &std::path::Path, path: &std::path::Path) -> Result<(), String> {
    let Ok(meta) = fs::metadata(path) else {
        return Ok(());
    };

    if meta.len() < MAX_BYTES {
        return Ok(());
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let rotated = dir.join(format!("approvals-{stamp}.jsonl"));

    fs::rename(path, &rotated).map_err(|error| format!("rotate: {error}"))?;

    Ok(())
}

#[tauri::command]
pub fn audit_append(app: AppHandle, line: String) -> Result<String, String> {
    let dir = audit_dir(&app)?;
    let path = dir.join("approvals.jsonl");

    rotate_if_needed(&dir, &path)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("open audit log: {error}"))?;

    file.write_all(line.trim_end().as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|error| format!("write audit log: {error}"))?;

    Ok(path.display().to_string())
}

#[tauri::command]
pub fn audit_info(app: AppHandle) -> Result<String, String> {
    let dir = audit_dir(&app)?;
    let path = dir.join("approvals.jsonl");

    let size = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);

    Ok(format!("{}|{}", path.display(), size))
}

#[cfg(test)]
mod tests {
    use super::MAX_BYTES;

    #[test]
    fn rotation_threshold_is_five_megabytes() {
        assert_eq!(MAX_BYTES, 5 * 1024 * 1024);
    }
}
