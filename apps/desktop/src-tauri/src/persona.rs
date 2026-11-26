use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const BEGIN_MARKER: &str = "<!-- FJK:PERSONA:BEGIN";
const END_MARKER: &str = "<!-- FJK:PERSONA:END";

#[derive(Serialize)]
pub struct PersonaStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub applied_at: Option<u64>,
    pub source: Option<String>,
    pub workspace: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct PersonaImportResult {
    pub ok: bool,
    pub version: String,
    pub applied: Vec<String>,
    pub backups: Vec<String>,
    pub message: String,
}

fn workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "无法获取用户目录".to_string())?;
    Ok(PathBuf::from(home).join(".openclaw").join("workspace"))
}

pub(crate) fn pack_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    // 打包后：resource_dir/persona-pack；开发时：cargo manifest/resources/persona-pack
    if let Ok(resource) = app.path().resource_dir() {
        let packaged = resource.join("persona-pack");

        if packaged.is_dir() {
            return Ok(packaged);
        }

        let nested = resource.join("resources").join("persona-pack");

        if nested.is_dir() {
            return Ok(nested);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("persona-pack");

    if dev.is_dir() {
        return Ok(dev);
    }

    Err("安装包缺少人格资源（persona-pack）".to_string())
}

fn read_pack_file(dir: &Path, name: &str) -> Result<String, String> {
    let path = dir.join(name);
    let meta = fs::metadata(&path).map_err(|_| format!("人格包缺少文件：{name}"))?;

    if meta.len() > 512 * 1024 {
        return Err(format!("人格包文件过大：{name}"));
    }

    fs::read_to_string(&path).map_err(|error| format!("读取 {name} 失败：{error}"))
}

fn stamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);

    format!("{now}")
}

fn backup(path: &Path, suffix: &str, backups: &mut Vec<String>) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }

    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    let backup_path = path.with_file_name(format!("{file_name}.bak-{suffix}"));

    fs::copy(path, &backup_path)?;
    backups.push(backup_path.display().to_string());

    Ok(())
}

/// 把人格块合并进 SOUL.md：已有标记块则替换，否则追加。
fn merge_soul(existing: &str, block: &str) -> String {
    let begin = existing.find(BEGIN_MARKER);

    if let Some(begin_index) = begin {
        if let Some(end_rel) = existing[begin_index..].find(END_MARKER) {
            let end_index = begin_index + end_rel;
            let after = &existing[end_index..];

            // 跳到 END 标记所在行末
            let tail = match after.find('\n') {
                Some(offset) => &after[offset + 1..],
                None => "",
            };

            return format!("{}{}\n{}", &existing[..begin_index], block.trim_end(), tail);
        }
    }

    // 兼容旧版：人格段是直接追加、没有标记块（我们自己的机器就是这样）。
    // 找到 "# 人格" 或 "## 情绪标记" 的起点，把该段视为旧人格整体替换，
    // 避免导入后出现两份人格。
    for marker in ["# 人格", "## 情绪标记"] {
        if let Some(index) = existing.find(marker) {
            let head = existing[..index].trim_end();

            if head.is_empty() {
                return format!("{}\n", block.trim_end());
            }

            return format!("{}\n\n{}\n", head, block.trim_end());
        }
    }

    if existing.trim().is_empty() {
        return format!("{}\n", block.trim_end());
    }

    format!("{}\n\n{}\n", existing.trim_end(), block.trim_end())
}

#[tauri::command]
pub fn persona_status() -> PersonaStatus {
    let workspace = workspace_dir().map(|dir| dir.display().to_string()).unwrap_or_default();

    let Ok(dir) = workspace_dir() else {
        return PersonaStatus {
            installed: false,
            version: None,
            applied_at: None,
            source: None,
            workspace,
            message: "无法定位工作区".to_string(),
        };
    };

    let marker = dir.join(".persona-version");

    let raw = fs::read_to_string(&marker).ok();
    let parsed: Option<serde_json::Value> = raw.and_then(|text| serde_json::from_str(&text).ok());

    let version = parsed
        .as_ref()
        .and_then(|value| value.get("version"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    let applied_at = parsed
        .as_ref()
        .and_then(|value| value.get("appliedAt"))
        .and_then(|value| value.as_u64());

    let source = parsed
        .as_ref()
        .and_then(|value| value.get("source"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    let soul_has_block = fs::read_to_string(dir.join("SOUL.md"))
        .map(|text| text.contains(BEGIN_MARKER))
        .unwrap_or(false);

    let installed = soul_has_block;

    PersonaStatus {
        installed,
        version,
        applied_at,
        source,
        workspace,
        message: if installed {
            "已导入人格".to_string()
        } else {
            "尚未导入人格".to_string()
        },
    }
}

#[tauri::command]
pub fn persona_import_default(app: tauri::AppHandle) -> Result<PersonaImportResult, String> {
    let pack = pack_dir(&app)?;
    let workspace = workspace_dir()?;

    fs::create_dir_all(&workspace).map_err(|error| format!("创建工作区失败：{error}"))?;

    let manifest_raw = read_pack_file(&pack, "manifest.json")?;
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_raw).map_err(|error| format!("manifest 解析失败：{error}"))?;

    let version = manifest
        .get("version")
        .and_then(|value| value.as_str())
        .unwrap_or("1")
        .to_string();

    let block = read_pack_file(&pack, "soul-persona-block.md")?;
    let identity = read_pack_file(&pack, "identity.md")?;
    let character = read_pack_file(&pack, "character.json")?;
    let v2 = read_pack_file(&pack, "persona.v2.json")?;

    // 校验 V2 JSON 合法性（不合法的包直接拒绝）
    serde_json::from_str::<serde_json::Value>(&v2)
        .map_err(|error| format!("persona.v2.json 非法：{error}"))?;
    serde_json::from_str::<serde_json::Value>(&character)
        .map_err(|error| format!("character.json 非法：{error}"))?;

    let suffix = stamp();
    let mut backups: Vec<String> = Vec::new();
    let mut applied: Vec<String> = Vec::new();

    // 1) SOUL.md 合并（保留用户块外内容）
    let soul_path = workspace.join("SOUL.md");
    let existing_soul = fs::read_to_string(&soul_path).unwrap_or_default();

    backup(&soul_path, &suffix, &mut backups).map_err(|error| format!("备份 SOUL.md 失败：{error}"))?;

    let merged = merge_soul(&existing_soul, &block);
    fs::write(&soul_path, merged).map_err(|error| format!("写入 SOUL.md 失败：{error}"))?;
    applied.push("SOUL.md".to_string());

    // 2) IDENTITY.md：不存在才写，存在则备份但保留用户版本
    let identity_path = workspace.join("IDENTITY.md");

    if !identity_path.exists() {
        backup(&identity_path, &suffix, &mut backups).ok();
        fs::write(&identity_path, &identity).map_err(|error| format!("写入 IDENTITY.md 失败：{error}"))?;
        applied.push("IDENTITY.md".to_string());
    } else {
        applied.push("IDENTITY.md（已存在，保留原文件）".to_string());
    }

    // 3) V2 sidecar（供导出/互通）
    let v2_path = workspace.join("persona.v2.json");
    backup(&v2_path, &suffix, &mut backups).ok();
    fs::write(&v2_path, &v2).map_err(|error| format!("写入 persona.v2.json 失败：{error}"))?;
    applied.push("persona.v2.json".to_string());

    // 4) 桌宠角色卡：放应用数据目录，供后续桌宠加载覆盖
    if let Ok(appdata) = std::env::var("APPDATA") {
        let persona_dir = PathBuf::from(appdata).join("com.fjk.agent").join("persona");
        fs::create_dir_all(&persona_dir).ok();

        let character_path = persona_dir.join("character.json");
        fs::write(&character_path, &character).ok();
        applied.push("character.json".to_string());
    }

    // 5) 版本记录
    let marker = serde_json::json!({
        "version": version,
        "appliedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis() as u64)
            .unwrap_or(0),
        "source": "factory",
    });

    fs::write(workspace.join(".persona-version"), marker.to_string())
        .map_err(|error| format!("写入版本记录失败：{error}"))?;

    Ok(PersonaImportResult {
        ok: true,
        version,
        applied,
        backups,
        message: "默认人格已导入，正在创建新会话以生效…".to_string(),
    })
}

/// 读取桌宠角色覆盖文件（外部人格卡导入后生成）。
#[tauri::command]
pub fn pet_character_override() -> Option<String> {
    let appdata = std::env::var("APPDATA").ok()?;
    let path = PathBuf::from(appdata)
        .join("com.fjk.agent")
        .join("persona")
        .join("character.json");

    if !path.exists() {
        return None;
    }

    let meta = fs::metadata(&path).ok()?;

    if meta.len() > 512 * 1024 {
        return None;
    }

    fs::read_to_string(&path).ok()
}

/// 根据外部人格卡生成桌宠角色卡：以内置默认卡为底，覆盖名字/日常人格，
/// 并按性格关键词微调情绪权重，让桌宠的表演跟着人格走。
pub(crate) fn write_pet_character(
    app: &tauri::AppHandle,
    name: &str,
    description: &str,
    personality: &str,
) -> Result<(), String> {
    let pack = pack_dir(app)?;
    let base_raw = fs::read_to_string(pack.join("character.json"))
        .map_err(|error| format!("读取内置桌宠卡失败：{error}"))?;
    let mut base: serde_json::Value =
        serde_json::from_str(&base_raw).map_err(|error| format!("内置桌宠卡损坏：{error}"))?;

    let daily_parts: Vec<String> = [description, personality]
        .iter()
        .filter(|text| !text.trim().is_empty())
        .map(|text| text.chars().take(160).collect::<String>())
        .collect();

    if !name.trim().is_empty() {
        base["name"] = serde_json::Value::String(name.trim().to_string());
    }

    if !daily_parts.is_empty() {
        base["persona"]["daily"] = serde_json::Value::String(daily_parts.join("。"));
    }

    let mut hook = |weight_key: &str, delta: f64| {
        if let Some(entry) = base["emotions"].get_mut(weight_key) {
            if let Some(weight) = entry["weight"].as_f64() {
                entry["weight"] = serde_json::json!((weight + delta).clamp(0.6, 2.0));
            }
        }
    };

    let text = format!("{description}{personality}");

    if text.contains("傲娇") || text.contains("嘴硬") {
        hook("angry", 0.2);
        hook("proud", 0.2);
    }

    if text.contains("温柔") || text.contains("软") || text.contains("乖巧") {
        hook("happy", 0.2);
        hook("shy", 0.2);
    }

    if text.contains("活泼") || text.contains("元气") || text.contains("开朗") {
        hook("excited", 0.2);
        hook("joy", 0.1);
    }

    if text.contains("冷静") || text.contains("理性") || text.contains("沉稳") {
        hook("neutral", 0.2);
    }

    let appdata = std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA".to_string())?;
    let dir = PathBuf::from(appdata).join("com.fjk.agent").join("persona");
    fs::create_dir_all(&dir).ok();

    fs::write(
        dir.join("character.json"),
        serde_json::to_string_pretty(&base).unwrap_or_else(|_| base.to_string()),
    )
    .map_err(|error| format!("写入桌宠角色卡失败：{error}"))?;

    Ok(())
}
