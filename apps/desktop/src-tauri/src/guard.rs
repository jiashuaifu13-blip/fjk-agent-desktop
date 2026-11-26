use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
pub struct GuardResult {
    pub ok: bool,
    pub exec_mode: String,
    pub allow_count: usize,
    pub deny_count: usize,
    pub protected_count: usize,
    pub backups: Vec<String>,
    pub message: String,
}

fn app_data_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    Ok(PathBuf::from(appdata).join("com.fjk.agent"))
}

fn policy_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("policy.json"))
}

fn pack_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    if let Ok(resource) = app.path().resource_dir() {
        let packaged = resource.join("guard-pack");

        if packaged.is_dir() {
            return Ok(packaged);
        }

        let nested = resource.join("resources").join("guard-pack");

        if nested.is_dir() {
            return Ok(nested);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("guard-pack");

    if dev.is_dir() {
        return Ok(dev);
    }

    Err("安装包缺少审批基线（guard-pack）".to_string())
}

fn merge_unique(base: &mut Vec<String>, extra: &[String]) -> usize {
    let mut added = 0;

    for item in extra {
        if !base.iter().any(|existing| existing == item) {
            base.push(item.clone());
            added += 1;
        }
    }

    added
}

fn as_string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(|item| item.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|entry| entry.as_str())
                .map(|entry| entry.to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn guard_apply_default(app: tauri::AppHandle) -> Result<GuardResult, String> {
    let pack = pack_dir(&app)?;
    let baseline_raw = fs::read_to_string(pack.join("policy.baseline.json"))
        .map_err(|error| format!("读取审批基线失败：{error}"))?;
    let baseline: Value =
        serde_json::from_str(&baseline_raw).map_err(|error| format!("审批基线损坏：{error}"))?;

    let path = policy_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let mut backups = Vec::new();

    let existing_raw = fs::read_to_string(&path).ok();
    let policy: Value = existing_raw
        .as_ref()
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_else(|| json!({}));

    if existing_raw.is_some() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_secs())
            .unwrap_or(0);
        let backup = path.with_file_name(format!("policy.json.bak-{stamp}"));

        if fs::write(&backup, existing_raw.unwrap_or_default()).is_ok() {
            backups.push(backup.display().to_string());
        }
    }

    let mut allow = as_string_list(policy.get("allow"));
    let mut deny = as_string_list(policy.get("deny"));
    let mut protected = as_string_list(policy.get("protected"));

    let added_allow = merge_unique(&mut allow, &as_string_list(baseline.get("allow")));
    let added_deny = merge_unique(&mut deny, &as_string_list(baseline.get("deny")));
    let added_protected = merge_unique(&mut protected, &as_string_list(baseline.get("protected")));

    // 项目根目录不沿用我们的路径：保留用户已配置的，缺省为空（写操作全部走审批）
    let roots = policy
        .get("projectRoots")
        .cloned()
        .unwrap_or_else(|| json!([]));

    let updated = json!({
        "allow": allow,
        "deny": deny,
        "protected": protected,
        "projectRoots": roots,
        "grants": policy.get("grants").cloned().unwrap_or_else(|| json!([])),
    });

    fs::write(&path, serde_json::to_string_pretty(&updated).unwrap_or(updated.to_string()))
        .map_err(|error| format!("写入策略失败：{error}"))?;

    // 设置网关执行模式为 ask（审批卡才会出现）
    let mut mode_note = String::new();

    match crate::openclaw_cli::run(&[
        "config",
        "set",
        "tools.exec.mode",
        "\"ask\"",
        "--strict-json",
    ]) {
        Ok(output) if output.status.success() => mode_note.push_str("已设 tools.exec.mode=ask"),
        _ => mode_note.push_str("exec.mode 写入失败（网关未运行？稍后自动重试）"),
    }

    match crate::openclaw_cli::run(&[
        "config",
        "set",
        "tools.exec.host",
        "\"gateway\"",
        "--strict-json",
    ]) {
        Ok(output) if output.status.success() => mode_note.push_str("；host=gateway"),
        _ => {}
    }

    Ok(GuardResult {
        ok: true,
        exec_mode: "ask".to_string(),
        allow_count: allow.len(),
        deny_count: deny.len(),
        protected_count: protected.len(),
        backups,
        message: format!(
            "审批保护已启用（新增 allow {added_allow} / deny {added_deny} / protected {added_protected}）。{mode_note}"
        ),
    })
}

#[tauri::command]
pub fn guard_status() -> Result<Value, String> {
    let path = policy_path()?;
    let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let policy: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));

    Ok(json!({
        "exists": path.exists(),
        "path": path.display().to_string(),
        "allow": as_string_list(policy.get("allow")).len(),
        "deny": as_string_list(policy.get("deny")).len(),
        "protected": as_string_list(policy.get("protected")).len(),
        "projectRoots": as_string_list(policy.get("projectRoots")).len(),
    }))
}
