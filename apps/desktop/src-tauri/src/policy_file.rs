use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct PolicyFile {
    pub path: String,
    pub exists: bool,
    pub content: Option<String>,
    pub error: String,
}

fn policy_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir: {error}"))?;

    fs::create_dir_all(&dir).map_err(|error| format!("create_dir_all: {error}"))?;

    Ok(dir.join("policy.json"))
}

fn validate(raw: &str) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(raw).map_err(|error| format!("invalid json: {error}"))?;

    let object = parsed
        .as_object()
        .ok_or_else(|| "policy must be a JSON object".to_string())?;

    for key in ["allow", "deny", "protected"] {
        if let Some(value) = object.get(key) {
            let array = value
                .as_array()
                .ok_or_else(|| format!("`{key}` must be an array of regex strings"))?;

            for item in array {
                let pattern = item
                    .as_str()
                    .ok_or_else(|| format!("`{key}` must contain only strings"))?;

                if pattern.len() > 400 {
                    return Err(format!("`{key}` pattern too long (max 400): {pattern}"));
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn policy_load(app: AppHandle) -> PolicyFile {
    let path = match policy_path(&app) {
        Ok(path) => path,
        Err(error) => {
            return PolicyFile {
                path: String::new(),
                exists: false,
                content: None,
                error,
            }
        }
    };

    let display = path.display().to_string();

    if !path.exists() {
        return PolicyFile {
            path: display,
            exists: false,
            content: None,
            error: String::new(),
        };
    }

    match fs::read_to_string(&path) {
        Ok(content) => {
            if let Err(error) = validate(&content) {
                return PolicyFile {
                    path: display,
                    exists: true,
                    content: None,
                    error,
                };
            }

            PolicyFile {
                path: display,
                exists: true,
                content: Some(content),
                error: String::new(),
            }
        }
        Err(error) => PolicyFile {
            path: display,
            exists: true,
            content: None,
            error: format!("read failed: {error}"),
        },
    }
}

#[tauri::command]
pub fn policy_save(app: AppHandle, content: String) -> String {
    if let Err(error) = validate(&content) {
        return format!("ERROR: {error}");
    }

    let path = match policy_path(&app) {
        Ok(path) => path,
        Err(error) => return format!("ERROR: {error}"),
    };

    match fs::write(&path, content) {
        Ok(_) => path.display().to_string(),
        Err(error) => format!("ERROR: write failed: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn accepts_object_with_string_arrays() {
        assert!(validate(r#"{"allow":["^dir"],"deny":[],"protected":["x"]}"#).is_ok());
    }

    #[test]
    fn rejects_non_array() {
        assert!(validate(r#"{"allow":"nope"}"#).is_err());
    }

    #[test]
    fn rejects_non_string_items() {
        assert!(validate(r#"{"deny":[1]}"#).is_err());
    }
}
