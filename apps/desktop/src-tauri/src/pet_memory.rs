use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn memory_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir: {error}"))?;

    fs::create_dir_all(&dir).map_err(|error| format!("create_dir_all: {error}"))?;

    Ok(dir.join("pet-memory.json"))
}

#[tauri::command]
pub fn pet_memory_load(app: AppHandle) -> Result<Option<String>, String> {
    let path = memory_path(&app)?;

    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("read pet memory: {error}"))
}

#[tauri::command]
pub fn pet_memory_save(app: AppHandle, data: String) -> Result<(), String> {
    let path = memory_path(&app)?;
    let tmp = path.with_extension("json.tmp");

    fs::write(&tmp, data).map_err(|error| format!("write temp: {error}"))?;
    fs::rename(&tmp, &path).map_err(|error| format!("rename: {error}"))?;

    Ok(())
}

#[tauri::command]
pub fn pet_memory_clear(app: AppHandle) -> Result<(), String> {
    let path = memory_path(&app)?;

    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("remove: {error}"))?;
    }

    Ok(())
}
