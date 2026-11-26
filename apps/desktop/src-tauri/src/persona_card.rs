use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

const BEGIN_MARKER: &str = "<!-- FJK:PERSONA:BEGIN";
const END_MARKER: &str = "<!-- FJK:PERSONA:END";

const MAX_FILE_BYTES: usize = 8 * 1024 * 1024;
const MAX_FIELD_CHARS: usize = 20_000;
const MAX_TOTAL_CHARS: usize = 60_000;

#[derive(Serialize)]
pub struct CardPreview {
    pub ok: bool,
    pub format: String,
    pub name: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub first_mes: String,
    pub fields: Vec<String>,
    pub warnings: Vec<String>,
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn value(byte: u8) -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer: u32 = 0;
    let mut bits = 0;

    for byte in input.bytes() {
        if byte == b'=' || byte.is_ascii_whitespace() {
            continue;
        }

        let Some(v) = value(byte) else {
            return Err("Base64 内容非法".to_string());
        };

        buffer = (buffer << 6) | v as u32;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            out.push(((buffer >> bits) & 0xFF) as u8);
        }
    }

    Ok(out)
}

fn sanitize(text: &str) -> String {
    let mut value = text.to_string();

    for bad in ["<script", "</script", "<iframe", "javascript:"] {
        value = value.replace(bad, "");
    }

    value.trim().to_string()
}

fn clamp(text: &str) -> String {
    let cleaned = sanitize(text);
    let count = cleaned.chars().count();

    if count <= MAX_FIELD_CHARS {
        cleaned
    } else {
        cleaned.chars().take(MAX_FIELD_CHARS).collect::<String>() + "…"
    }
}

fn value_to_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => clamp(text),
        Some(Value::Array(items)) => {
            let joined = items
                .iter()
                .filter_map(|item| item.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            clamp(&joined)
        }
        _ => String::new(),
    }
}

/// 从 PNG 的 tEXt/iTXt 块里取出 chara 数据（base64 JSON）。
fn extract_card_from_png(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("不是有效的 PNG 文件".to_string());
    }

    let mut offset = 8usize;

    while offset + 8 <= bytes.len() {
        let length = u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]) as usize;

        let kind = &bytes[offset + 4..offset + 8];
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(length);

        if data_end > bytes.len() {
            break;
        }

        let data = &bytes[data_start..data_end];

        if kind == b"tEXt" || kind == b"iTXt" {
            if let Some(split) = data.iter().position(|byte| *byte == 0) {
                let keyword = String::from_utf8_lossy(&data[..split]).to_string();
                let mut rest = &data[split + 1..];

                if kind == b"iTXt" {
                    // iTXt: compressionFlag(1) compressionMethod(1) languageTag\0 translated\0 text
                    if rest.len() > 2 {
                        let compressed = rest[0] == 1;
                        rest = &rest[2..];

                        if let Some(zero) = rest.iter().position(|byte| *byte == 0) {
                            rest = &rest[zero + 1..];
                        }
                        if let Some(zero) = rest.iter().position(|byte| *byte == 0) {
                            rest = &rest[zero + 1..];
                        }

                        if compressed {
                            continue;
                        }
                    }
                }

                if keyword == "chara" || keyword == "ccv3" {
                    let encoded = String::from_utf8_lossy(rest).to_string();
                    let decoded = base64_decode(encoded.trim())?;

                    return String::from_utf8(decoded).map_err(|error| format!("卡片编码异常：{error}"));
                }
            }
        }

        offset = data_end + 4; // 跳过 CRC
    }

    Err("这张 PNG 里没有内嵌人格数据（不是 Character Card）".to_string())
}

fn parse_card(text: &str) -> Result<(Value, String, Vec<String>), String> {
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    let root: Value = serde_json::from_str(trimmed).map_err(|error| format!("JSON 解析失败：{error}"))?;

    let spec = root
        .get("spec")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    let data = root.get("data").cloned().unwrap_or_else(|| root.clone());

    let format = if spec.contains("v3") {
        "Character Card V3".to_string()
    } else if spec.contains("v2") {
        "Character Card V2".to_string()
    } else if data.get("name").is_some() {
        "TavernAI / 通用 JSON".to_string()
    } else {
        return Err("缺少 name 字段，不像是人格卡".to_string());
    };

    let mut warnings = Vec::new();

    if data.get("name").and_then(|value| value.as_str()).unwrap_or("").is_empty() {
        warnings.push("缺少角色名".to_string());
    }

    Ok((data, format, warnings))
}

fn card_fields(data: &Value) -> Vec<(String, String)> {
    let mut fields = Vec::new();

    let simple = [
        ("name", "名字"),
        ("description", "背景"),
        ("personality", "性格"),
        ("scenario", "场景"),
        ("first_mes", "开场白"),
        ("mes_example", "对话示例"),
        ("system_prompt", "系统指令"),
        ("post_history_instructions", "每轮约束"),
        ("creator_notes", "作者备注"),
    ];

    for (key, label) in simple {
        let text = value_to_string(data.get(key));

        if !text.is_empty() {
            fields.push((label.to_string(), text));
        }
    }

    let greetings = data.get("alternate_greetings").and_then(|value| value.as_array());

    if let Some(list) = greetings {
        let joined = list
            .iter()
            .filter_map(|item| item.as_str())
            .map(clamp)
            .collect::<Vec<_>>()
            .join("\n\n");

        if !joined.trim().is_empty() {
            fields.push(("备选开场".to_string(), joined));
        }
    }

    fields
}

/// 仅测试用：从 PNG 字节解出卡片 JSON。
#[cfg(test)]
pub(crate) fn extract_card_for_test(bytes: &[u8]) -> Result<String, String> {
    extract_card_from_png(bytes)
}

fn build_soul_block(fields: &[(String, String)], name: &str) -> String {
    let mut body = String::new();

    body.push_str("<!-- FJK:PERSONA:BEGIN imported -->\n");
    body.push_str(&format!("# 人格：{}\n\n", name));

    for (label, text) in fields {
        if label == "名字" {
            continue;
        }

        body.push_str(&format!("## {}\n\n{}\n\n", label, text));
    }

    // 保留情绪标记协议，桌宠表情依赖它
    body.push_str(
        "## 情绪标记（桌面端渲染用）\n\n\
每次回复的最后一行，单独输出一个情绪标记，取值：\n\n\
`neutral` `happy` `joy` `excited` `proud` `shy` `surprised` `angry` `sad` `wronged`\n\n\
可选强度后缀 `:0` / `:1` / `:2`，例如 `[[mood:happy:2]]`。\n\n\
规则：只输出一个且必须是最后一行；代码块、命令、文件内容里不出现；可省略；不在正文解释。\n",
    );
    body.push_str("<!-- FJK:PERSONA:END imported -->\n");

    body
}

fn workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "无法获取用户目录".to_string())?;
    Ok(PathBuf::from(home).join(".openclaw").join("workspace"))
}

fn merge_soul(existing: &str, block: &str) -> String {
    let begin = existing.find(BEGIN_MARKER);

    if let Some(begin_index) = begin {
        if let Some(end_rel) = existing[begin_index..].find(END_MARKER) {
            let end_index = begin_index + end_rel;
            let after = &existing[end_index..];
            let tail = match after.find('\n') {
                Some(offset) => &after[offset + 1..],
                None => "",
            };

            return format!("{}{}\n{}", &existing[..begin_index], block.trim_end(), tail);
        }
    }

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

/// 解析后的输入来源。
enum CardSource {
    /// JSON 文本（V2/V3/TavernAI）
    Json(String),
    /// 纯文本提示词（.txt / .md，中文社区主流格式）
    PlainText(String),
}

fn decode_card_bytes(data_base64: &str, file_name: &str) -> Result<CardSource, String> {
    let bytes = base64_decode(data_base64).map_err(|error| format!("Base64 解码失败：{error}"))?;

    if bytes.len() > MAX_FILE_BYTES {
        return Err("文件过大（上限 8MB）".to_string());
    }

    let lower = file_name.to_lowercase();

    if lower.ends_with(".png") || bytes.starts_with(b"\x89PNG") {
        return extract_card_from_png(&bytes).map(CardSource::Json);
    }

    let text = String::from_utf8(bytes).map_err(|error| format!("文件编码异常：{error}"))?;
    let trimmed = text.trim_start_matches('\u{feff}').trim();

    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Ok(CardSource::Json(text));
    }

    Ok(CardSource::PlainText(text))
}

/// 把纯文本提示词包装成 V2 结构：name 取文件名，正文进 system_prompt。
/// 如果正文里有 Markdown 标题，按标题关键字拆分到对应字段，保留原有结构。
/// 清理社区导出文本里的包装噪音（"===== FILE: ..." / 尾部 persona.json 元数据）。
fn clean_plain_text(text: &str) -> String {
    let mut out: Vec<&str> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("===== FILE:") || trimmed.starts_with("----- FILE:") {
            continue;
        }

        if trimmed.starts_with("=====") && trimmed.ends_with("=====") {
            continue;
        }

        // 尾部形如 {"id":"persona-...","title":...} 的元数据块，遇到就停止
        if trimmed.starts_with('{') && trimmed.contains("\"id\"") && trimmed.contains("persona") {
            break;
        }

        out.push(line);
    }

    out.join("\n")
}

/// 从正文里推断角色名：优先 "角色卡：X" / "角色名：X" / "你叫 X"。
fn guess_name_from_text(text: &str, fallback: &str) -> String {
    for line in text.lines().take(40) {
        let trimmed = line.trim().trim_start_matches('#').trim();
        let lower = trimmed.to_lowercase();

        for key in ["角色卡：", "角色卡:", "角色名：", "角色名:", "名称：", "名称:"] {
            if let Some(rest) = trimmed.strip_prefix(key) {
                let name = rest
                    .split(['（', '(', '—', '-', '【', '｜', '|'])
                    .next()
                    .unwrap_or("")
                    .trim();

                if !name.is_empty() && name.chars().count() <= 24 {
                    return name.to_string();
                }
            }
        }

        if lower.starts_with("name:") {
            let name = trimmed[5..].trim();

            if !name.is_empty() && name.chars().count() <= 24 {
                return name.to_string();
            }
        }
    }

    // 文件名兜底：去掉 gj-persona-xxx / persona-xxx / 长数字后缀
    let stem = fallback
        .rsplit('/')
        .next()
        .unwrap_or(fallback)
        .rsplit_once('.')
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| fallback.to_string());

    let mut cleaned = stem;

    for prefix in ["gj-persona-", "persona-", "card-", "角色卡-"] {
        if let Some(rest) = cleaned.strip_prefix(prefix) {
            cleaned = rest.to_string();
        }
    }

    cleaned = cleaned
        .trim_matches(|c: char| c == '-' || c == '_' || c.is_ascii_digit() || c.is_whitespace())
        .to_string();

    if cleaned.trim().is_empty() {
        "导入的角色".to_string()
    } else {
        cleaned
    }
}

/// 判断一行是否是分段标题（Markdown #、中文序号、方括号标题都算）。
fn heading_title(line: &str) -> Option<String> {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with('#') {
        let title = trimmed.trim_start_matches('#').trim();
        return (!title.is_empty()).then(|| title.to_string());
    }

    // 一、二、三、……
    let chinese_numbers = [
        "一、", "二、", "三、", "四、", "五、", "六、", "七、", "八、", "九、", "十、", "十一、", "十二、",
        "十三、", "十四、", "十五、", "十六、", "十七、", "十八、", "十九、", "二十、",
    ];

    for prefix in chinese_numbers {
        if trimmed.starts_with(prefix) {
            return Some(trimmed[prefix.len()..].trim().to_string());
        }
    }

    // 【身份】 这种
    if trimmed.starts_with('【') {
        if let Some(end) = trimmed.find('】') {
            let title = trimmed[1..end].trim();
            return (!title.is_empty()).then(|| title.to_string());
        }
    }

    None
}

fn build_text_card(text: &str, file_name: &str) -> Result<(Value, String, Vec<String>), String> {
    let cleaned = clamp(&clean_plain_text(text));

    if cleaned.trim().is_empty() {
        return Err("文件内容为空".to_string());
    }

    let name = guess_name_from_text(&cleaned, file_name);

    let mut description = String::new();
    let mut personality = String::new();
    let mut scenario = String::new();
    let mut mes_example = String::new();
    let mut instructions = String::new();
    let mut current = "description";

    let mut has_heading = false;

    for line in cleaned.lines() {
        if let Some(title) = heading_title(line) {
            has_heading = true;

            if title.contains("身份")
                || title.contains("角色")
                || title.contains("你是")
                || title.contains("设定")
            {
                current = "description";
            } else if title.contains("性格") || title.contains("人格") || title.contains("情绪") {
                current = "personality";
            } else if title.contains("场景") {
                current = "scenario";
            } else if title.contains("示例") || title.contains("对话") {
                current = "mes_example";
            } else {
                current = "instructions";
            }

            continue;
        }

        let target = match current {
            "description" => &mut description,
            "personality" => &mut personality,
            "scenario" => &mut scenario,
            "mes_example" => &mut mes_example,
            _ => &mut instructions,
        };

        target.push_str(line);
        target.push('\n');
    }

    // 没有标题时，整段文本按"系统指令"处理，避免被误当成背景描述
    if !has_heading {
        instructions = cleaned.clone();
        description.clear();
        personality.clear();
        scenario.clear();
        mes_example.clear();
    }

    let data = serde_json::json!({
        "name": name,
        "description": description.trim(),
        "personality": personality.trim(),
        "scenario": scenario.trim(),
        "mes_example": mes_example.trim(),
        "system_prompt": instructions.trim(),
        "tags": ["纯文本导入"],
        "creator_notes": "由纯文本提示词导入",
    });

    let mut warnings = Vec::new();

    if !has_heading {
        warnings.push("未检测到分段标题，整段文本将作为系统指令".to_string());
    }

    Ok((data, "纯文本提示词".to_string(), warnings))
}

fn parse_any(source: CardSource, file_name: &str) -> Result<(Value, String, Vec<String>), String> {
    match source {
        CardSource::Json(text) => parse_card(&text),
        CardSource::PlainText(text) => build_text_card(&text, file_name),
    }
}

#[tauri::command]
pub fn persona_preview_card(data_base64: String, file_name: String) -> Result<CardPreview, String> {
    let source = decode_card_bytes(&data_base64, &file_name)?;
    let (data, format, warnings) = parse_any(source, &file_name)?;
    let fields = card_fields(&data);

    let name = value_to_string(data.get("name"));
    let tags = data
        .get("tags")
        .and_then(|value| value.as_array())
        .map(|list| list.iter().filter_map(|item| item.as_str()).map(|item| item.to_string()).collect())
        .unwrap_or_default();

    let summary = fields
        .iter()
        .find(|(label, _)| label == "背景")
        .map(|(_, text)| text.chars().take(160).collect::<String>())
        .unwrap_or_default();

    Ok(CardPreview {
        ok: true,
        format,
        name: if name.is_empty() { "未命名角色".to_string() } else { name },
        summary,
        tags,
        first_mes: value_to_string(data.get("first_mes")).chars().take(120).collect(),
        fields: fields.iter().map(|(label, _)| label.clone()).collect(),
        warnings,
    })
}

#[tauri::command]
pub fn persona_import_card(
    data_base64: String,
    file_name: String,
) -> Result<super::persona::PersonaImportResult, String> {
    let source = decode_card_bytes(&data_base64, &file_name)?;
    let (data, format, _) = parse_any(source, &file_name)?;
    let fields = card_fields(&data);

    let total: usize = fields.iter().map(|(_, text)| text.chars().count()).sum();

    if total > MAX_TOTAL_CHARS {
        return Err(format!("人格内容过长（{total} 字，上限 {MAX_TOTAL_CHARS}）"));
    }

    let name = {
        let value = value_to_string(data.get("name"));
        if value.is_empty() { "导入的角色".to_string() } else { value }
    };

    let block = build_soul_block(&fields, &name);

    let workspace = workspace_dir()?;
    fs::create_dir_all(&workspace).map_err(|error| format!("创建工作区失败：{error}"))?;

    let soul_path = workspace.join("SOUL.md");
    let existing = fs::read_to_string(&soul_path).unwrap_or_default();

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);

    let mut backups: Vec<String> = Vec::new();

    if soul_path.exists() {
        let backup_path = soul_path.with_file_name(format!("SOUL.md.bak-{stamp}"));
        fs::copy(&soul_path, &backup_path).ok();
        backups.push(backup_path.display().to_string());
    }

    fs::write(&soul_path, merge_soul(&existing, &block))
        .map_err(|error| format!("写入 SOUL.md 失败：{error}"))?;

    // 保存原始卡（导出与再编辑用）
    let sidecar = workspace.join("persona.v2.json");
    let sidecar_json = serde_json::json!({
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": data.clone(),
    });

    fs::write(
        &sidecar,
        serde_json::to_string_pretty(&sidecar_json).unwrap_or_else(|_| sidecar_json.to_string()),
    )
    .map_err(|error| format!("写入 persona.v2.json 失败：{error}"))?;

    let marker = serde_json::json!({
        "version": "imported",
        "appliedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis() as u64)
            .unwrap_or(0),
        "source": "card",
        "format": format,
        "name": name,
    });

    fs::write(workspace.join(".persona-version"), marker.to_string())
        .map_err(|error| format!("写入版本记录失败：{error}"))?;

    Ok(super::persona::PersonaImportResult {
        ok: true,
        version: "imported".to_string(),
        applied: vec!["SOUL.md".to_string(), "persona.v2.json".to_string()],
        backups,
        message: format!("已导入人格「{name}」（{format}），正在创建新会话以生效…"),
    })
}

#[tauri::command]
pub fn persona_read_sidecar() -> Result<String, String> {
    let workspace = workspace_dir()?;
    let path = workspace.join("persona.v2.json");

    if !path.exists() {
        return Err("当前还没有可导出的人格卡".to_string());
    }

    fs::read_to_string(&path).map_err(|error| format!("读取失败：{error}"))
}

#[allow(dead_code)]
fn _unused(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn card_json(name: &str) -> String {
        format!(
            r#"{{"spec":"chara_card_v2","spec_version":"2.0","data":{{"name":"{name}","description":"测试背景","personality":"温柔","first_mes":"你好呀","mes_example":"<START>\n{{user}}: hi\n{{char}}: 嗨"}}}}"#
        )
    }

    #[test]
    fn parses_v2_json() {
        let (data, format, _) = parse_card(&card_json("阿测")).expect("should parse");
        assert!(format.contains("V2"));
        assert_eq!(data.get("name").and_then(|v| v.as_str()), Some("阿测"));
    }

    #[test]
    fn builds_soul_block_with_mood_protocol() {
        let (data, _, _) = parse_card(&card_json("阿测")).unwrap();
        let fields = card_fields(&data);
        let block = build_soul_block(&fields, "阿测");
        assert!(block.contains("<!-- FJK:PERSONA:BEGIN imported -->"));
        assert!(block.contains("情绪标记"));
        assert!(block.contains("[[mood:happy:2]]"));
    }

    #[test]
    fn extracts_png_chara_chunk() {
        use std::io::Write;

        let json = card_json("PNG角色");
        let encoded = {
            const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let bytes = json.as_bytes();
            let mut out = String::new();

            for chunk in bytes.chunks(3) {
                let b0 = chunk[0] as u32;
                let b1 = *chunk.get(1).unwrap_or(&0) as u32;
                let b2 = *chunk.get(2).unwrap_or(&0) as u32;
                let triple = (b0 << 16) | (b1 << 8) | b2;

                out.push(TABLE[((triple >> 18) & 63) as usize] as char);
                out.push(TABLE[((triple >> 12) & 63) as usize] as char);
                out.push(if chunk.len() > 1 { TABLE[((triple >> 6) & 63) as usize] as char } else { '=' });
                out.push(if chunk.len() > 2 { TABLE[(triple & 63) as usize] as char } else { '=' });
            }

            out
        };

        let mut png: Vec<u8> = Vec::new();
        png.extend_from_slice(b"\x89PNG\r\n\x1a\n");

        // IHDR
        png.extend_from_slice(&13u32.to_be_bytes());
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&[0u8; 13]);
        png.extend_from_slice(&[0u8; 4]);

        // tEXt: "chara\0" + base64
        let mut text_data: Vec<u8> = Vec::new();
        text_data.extend_from_slice(b"chara\0");
        text_data.extend_from_slice(encoded.as_bytes());

        png.extend_from_slice(&(text_data.len() as u32).to_be_bytes());
        png.extend_from_slice(b"tEXt");
        png.extend_from_slice(&text_data);
        png.extend_from_slice(&[0u8; 4]);

        // IEND
        png.extend_from_slice(&0u32.to_be_bytes());
        png.extend_from_slice(b"IEND");
        png.extend_from_slice(&[0u8; 4]);

        let extracted = extract_card_from_png(&png).expect("png should yield card");
        assert!(extracted.contains("PNG角色"));

        let _ = std::io::stdout().flush();
    }
}

#[cfg(test)]
mod text_import_tests {
    use super::*;

    #[test]
    fn builds_card_from_plain_text() {
        let text = "# 身份\n我是大肥鱼，住在数据海洋。\n# 性格\n傲娇嘴硬心软。\n# 回复示例\n用户：你好\n大肥鱼：唔，你来啦。\n";
        let (data, format, _) = build_text_card(text, "大肥鱼.txt").expect("should build");
        assert_eq!(format, "纯文本提示词");
        assert_eq!(data["name"].as_str(), Some("大肥鱼"));
        assert!(data["description"].as_str().unwrap_or("").contains("数据海洋"));
        assert!(data["personality"].as_str().unwrap_or("").contains("傲娇"));
        assert!(data["mes_example"].as_str().unwrap_or("").contains("你来啦"));
    }

    #[test]
    fn plain_text_without_heading_falls_back_to_instructions() {
        let text = "你是一个温柔的角色，说话短。";
        let (data, _format, warnings) = build_text_card(text, "prompt.md").expect("should build");
        assert!(data["system_prompt"].as_str().unwrap_or("").contains("温柔"));
        assert!(!warnings.is_empty());
    }
}

#[cfg(test)]
mod community_text_tests {
    use super::*;

    #[test]
    fn parses_community_export_with_numbered_headings() {
        let text = "角色卡：DeepSeek 小鲸鱼 —— QQ 群友版（自动嘴臭版）\n\n一、你是谁\n你是 DeepSeek，一个以 AI 身份混在群里的群友。\n\n二、嘴臭模式\n被怼才开火。\n\n八、回复示例\n群友：蓝色大肥鱼！\n小鲸鱼：？ 你再说一遍试试\n";
        let (data, format, warnings) = build_text_card(text, "gj-persona-04-58893442.txt").expect("should build");
        assert_eq!(format, "纯文本提示词");
        let name = data["name"].as_str().unwrap_or("");
        assert!(name.contains("小鲸鱼"), "name = {name}");
        assert!(warnings.is_empty(), "warnings = {warnings:?}");
        assert!(data["description"].as_str().unwrap_or("").contains("混在群里"));
        assert!(data["mes_example"].as_str().unwrap_or("").contains("再说一遍"));
    }

    #[test]
    fn strips_wrapper_lines_and_metadata() {
        let text = "===== FILE: persona-1/prompt.txt =====\n# 身份\n我是测试角色\n{\"id\":\"persona-1\",\"title\":\"x\"}";
        let (data, _f, _w) = build_text_card(text, "persona-1.txt").expect("should build");
        let desc = data["description"].as_str().unwrap_or("");
        assert!(desc.contains("测试角色"));
        assert!(!desc.contains("===== FILE"));
        assert!(!desc.contains("persona-1"));
    }
}
