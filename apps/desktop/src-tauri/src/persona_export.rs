use std::fs;
use std::path::PathBuf;

use serde_json::Value;

const MAX_CARD_BYTES: usize = 512 * 1024;

fn workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "无法获取用户目录".to_string())?;
    Ok(PathBuf::from(home).join(".openclaw").join("workspace"))
}

fn target_dir(target: &str) -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "无法获取用户目录".to_string())?;
    let base = PathBuf::from(home);

    let dir = match target {
        "downloads" => base.join("Downloads"),
        "documents" => base.join("Documents"),
        _ => base.join("Desktop"),
    };

    if dir.is_dir() {
        Ok(dir)
    } else {
        let fallback = base.join("Desktop");

        if fallback.is_dir() {
            Ok(fallback)
        } else {
            Ok(base)
        }
    }
}

fn read_sidecar() -> Result<(String, Value), String> {
    let workspace = workspace_dir()?;
    let path = workspace.join("persona.v2.json");

    if !path.exists() {
        return Err("当前还没有可导出的人格卡（先导入一个人格）".to_string());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("读取人格卡失败：{error}"))?;

    if raw.len() > MAX_CARD_BYTES {
        return Err("人格卡过大，无法导出".to_string());
    }

    let value: Value = serde_json::from_str(&raw).map_err(|error| format!("人格卡格式损坏：{error}"))?;

    Ok((raw, value))
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    let trimmed = cleaned.trim().trim_matches('.').to_string();

    if trimmed.is_empty() {
        "persona".to_string()
    } else {
        trimmed.chars().take(60).collect()
    }
}

fn card_name(value: &Value) -> String {
    let data = value.get("data").unwrap_or(value);
    let name = data.get("name").and_then(|item| item.as_str()).unwrap_or("persona");

    sanitize_filename(name)
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);

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
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;

    for byte in bytes {
        crc ^= *byte as u32;

        for _ in 0..8 {
            crc = if crc & 1 == 1 { 0xEDB8_8320 ^ (crc >> 1) } else { crc >> 1 };
        }
    }

    crc ^ 0xFFFF_FFFF
}

fn adler32(bytes: &[u8]) -> u32 {
    let mut a: u32 = 1;
    let mut b: u32 = 0;

    for byte in bytes {
        a = (a + *byte as u32) % 65521;
        b = (b + a) % 65521;
    }

    (b << 16) | a
}

fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() + 12);
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);

    let mut crc_input = Vec::with_capacity(4 + data.len());
    crc_input.extend_from_slice(kind);
    crc_input.extend_from_slice(data);
    out.extend_from_slice(&crc32(&crc_input).to_be_bytes());

    out
}

/// 用 zlib stored block（不压缩）构造合法 IDAT，避免引入额外依赖。
fn zlib_stored(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(0x78); // CMF
    out.push(0x01); // FLG

    let mut offset = 0;

    while offset < raw.len() {
        let take = std::cmp::min(65535, raw.len() - offset);
        let last = offset + take >= raw.len();

        out.push(if last { 0x01 } else { 0x00 });
        out.extend_from_slice(&(take as u16).to_le_bytes());
        out.extend_from_slice(&(!(take as u16)).to_le_bytes());
        out.extend_from_slice(&raw[offset..offset + take]);

        offset += take;
    }

    out.extend_from_slice(&adler32(raw).to_be_bytes());
    out
}

fn build_png(card_json: &str) -> Vec<u8> {
    let mut png: Vec<u8> = Vec::new();
    png.extend_from_slice(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR: 1x1, 8bit, RGB
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    png.extend_from_slice(&chunk(b"IHDR", &ihdr));

    // tEXt: keyword "chara" + base64(card json)
    let encoded = base64_encode(card_json.as_bytes());
    let mut text = Vec::new();
    text.extend_from_slice(b"chara\0");
    text.extend_from_slice(encoded.as_bytes());
    png.extend_from_slice(&chunk(b"tEXt", &text));

    // IDAT: filter 0 + RGB 像素
    let raw_pixels = [0u8, 0x66, 0xCC, 0xFF];
    png.extend_from_slice(&chunk(b"IDAT", &zlib_stored(&raw_pixels)));

    png.extend_from_slice(&chunk(b"IEND", &[]));

    png
}

#[tauri::command]
pub fn persona_export_json() -> Result<String, String> {
    let (raw, _value) = read_sidecar()?;
    Ok(raw)
}

#[tauri::command]
pub fn persona_export_file(target: String, kind: String) -> Result<String, String> {
    let (raw, value) = read_sidecar()?;
    let dir = target_dir(&target)?;
    let name = card_name(&value);

    if kind == "png" {
        let path = dir.join(format!("{name}.card.png"));
        fs::write(&path, build_png(&raw)).map_err(|error| format!("写入 PNG 失败：{error}"))?;
        return Ok(path.display().to_string());
    }

    let path = dir.join(format!("{name}.card.json"));
    fs::write(&path, raw).map_err(|error| format!("写入 JSON 失败：{error}"))?;

    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_roundtrip_contains_card() {
        let json = r#"{"spec":"chara_card_v2","data":{"name":"测试角色"}}"#;
        let png = build_png(json);

        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");

        // 交给解析器还原
        let extracted = crate::persona_card::extract_card_for_test(&png).expect("png should contain card");
        assert!(extracted.contains("测试角色"));
    }

    #[test]
    fn sanitizes_filename() {
        assert_eq!(sanitize_filename("a/b:c*?"), "a_b_c__");
        assert_eq!(sanitize_filename("   "), "persona");
    }
}
