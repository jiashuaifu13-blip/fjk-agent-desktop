use std::io::Write;
use std::process::Command;

use windows::core::{BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
    GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HGDIOBJ, SRCCOPY,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS,
    VIRTUAL_KEY,
};
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetSystemMetrics, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible, SetForegroundWindow, ShowWindow, SM_CXSCREEN, SM_CYSCREEN, SW_SHOWNORMAL,
};

const EXIT_DENIED: i32 = 3;

fn now_stamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    now.to_string()
}

fn out_json(value: &str) {
    println!("{value}");
}

// ---------- PNG (store-only，无外部依赖) ----------

fn crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut index = 0usize;

    while index < 256 {
        let mut crc = index as u32;

        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                0xEDB8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }

        table[index] = crc;
        index += 1;
    }

    table
}

fn crc32(data: &[u8]) -> u32 {
    let table = crc32_table();
    let mut crc = 0xFFFF_FFFFu32;

    for byte in data {
        crc = table[((crc ^ *byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }

    crc ^ 0xFFFF_FFFF
}

fn adler32(data: &[u8]) -> u32 {
    let mut a = 1u32;
    let mut b = 0u32;

    for byte in data {
        a = (a + *byte as u32) % 65521;
        b = (b + a) % 65521;
    }

    (b << 16) | a
}

fn chunk(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 12);
    out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(payload);

    let mut crc_input = Vec::with_capacity(payload.len() + 4);
    crc_input.extend_from_slice(kind);
    crc_input.extend_from_slice(payload);
    out.extend_from_slice(&crc32(&crc_input).to_be_bytes());

    out
}

/// 把 BGRA 像素写成 PNG。使用「stored」deflate 块（不压缩），避免引入压缩库。
fn write_png(path: &str, width: u32, height: u32, bgra: &[u8], max_width: Option<u32>) -> Result<(u32, u32), String> {
    let mut w = width;
    let mut h = height;
    let mut data = bgra.to_vec();

    // 可选降采样：按整数步长抽样，控制文件体积。
    if let Some(limit) = max_width {
        if limit > 0 && width > limit {
            let step = (width as f32 / limit as f32).ceil() as u32;
            let step = step.max(1);

            w = width / step;
            h = height / step;

            let mut scaled = Vec::with_capacity((w * h * 4) as usize);

            for y in 0..h {
                for x in 0..w {
                    let sx = x * step;
                    let sy = y * step;
                    let index = ((sy * width + sx) * 4) as usize;
                    scaled.extend_from_slice(&data[index..index + 4]);
                }
            }

            data = scaled;
        }
    }

    // 每行前加 filter byte 0
    let stride = (w * 4) as usize;
    let mut raw = Vec::with_capacity((h as usize) * (stride + 1));

    for y in 0..h as usize {
        raw.push(0u8);
        let start = y * stride;
        raw.extend_from_slice(&data[start..start + stride]);
    }

    // zlib：2 字节头 + stored 块（每块最多 65535）+ adler32
    let mut zlib = Vec::with_capacity(raw.len() + raw.len() / 65535 * 5 + 16);
    zlib.extend_from_slice(&[0x78, 0x01]);

    let mut offset = 0usize;

    while offset < raw.len() {
        let len = (raw.len() - offset).min(65535);
        zlib.push(if len == raw.len() - offset { 1 } else { 0 });
        zlib.extend_from_slice(&(len as u16).to_le_bytes());
        zlib.extend_from_slice(&(!(len as u16)).to_le_bytes());
        zlib.extend_from_slice(&raw[offset..offset + len]);
        offset += len;
    }

    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut png = Vec::new();
    png.extend_from_slice(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);

    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&w.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // 8bit RGBA
    png.extend_from_slice(&chunk(b"IHDR", &ihdr));
    png.extend_from_slice(&chunk(b"IDAT", &zlib));
    png.extend_from_slice(&chunk(b"IEND", &[]));

    let mut file = std::fs::File::create(path).map_err(|error| format!("create png: {error}"))?;
    file.write_all(&png).map_err(|error| format!("write png: {error}"))?;

    Ok((w, h))
}

// ---------- 截图 ----------

struct ShotOptions {
    out: Option<String>,
    max_width: Option<u32>,
    region: Option<(i32, i32, i32, i32)>,
    scale: u32,
    grid: Option<u32>,
}

/// 抓取整个主屏到 BGRA 缓冲区。
fn capture_screen() -> Result<(i32, i32, Vec<u8>), String> {
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        if width <= 0 || height <= 0 {
            return Err("无法读取屏幕尺寸".to_string());
        }

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("GetDC 失败".to_string());
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let previous = SelectObject(mem_dc, HGDIOBJ(bitmap.0));

        let copied = BitBlt(mem_dc, 0, 0, width, height, Some(screen_dc), 0, 0, SRCCOPY);

        let mut buffer = vec![0u8; (width * height * 4) as usize];

        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };

        let lines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut info,
            DIB_RGB_COLORS,
        );

        SelectObject(mem_dc, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);

        if copied.is_err() || lines == 0 {
            return Err("截图失败（BitBlt/GetDIBits）".to_string());
        }

        Ok((width, height, buffer))
    }
}

/// 截图 / 裁剪 / 放大 / 叠网格。
///
/// 放大与裁剪服务于“视觉兜底”：模型看不清细节时，把局部放大后再交给它判断坐标。
fn screenshot(options: ShotOptions) -> Result<(), String> {
    let (screen_w, screen_h, full) = capture_screen()?;

    let (mut width, mut height, mut data) = match options.region {
        Some((x, y, w, h)) => {
            let x0 = x.max(0).min(screen_w.saturating_sub(1));
            let y0 = y.max(0).min(screen_h.saturating_sub(1));
            let rw = w.max(1).min(screen_w.saturating_sub(x0));
            let rh = h.max(1).min(screen_h.saturating_sub(y0));

            let mut cropped = Vec::with_capacity((rw * rh * 4) as usize);

            for row in 0..rh {
                let start = (((y0 + row) * screen_w + x0) * 4) as usize;
                cropped.extend_from_slice(&full[start..start + (rw * 4) as usize]);
            }

            (rw, rh, cropped)
        }
        None => (screen_w, screen_h, full),
    };

    // 叠网格：帮助模型在放大图上估坐标（BGRA 顺序）
    if let Some(step) = options.grid {
        let step = step.max(8) as i32;
        let color = [0u8, 200u8, 255u8, 255u8];

        let mut gx = step;
        while gx < width {
            for yy in 0..height {
                let index = (((yy * width) + gx) * 4) as usize;
                data[index..index + 4].copy_from_slice(&color);
            }
            gx += step;
        }

        let mut gy = step;
        while gy < height {
            for xx in 0..width {
                let index = (((gy * width) + xx) * 4) as usize;
                data[index..index + 4].copy_from_slice(&color);
            }
            gy += step;
        }
    }

    // 最近邻放大：保留像素边界，适合读小字/小控件
    if options.scale > 1 {
        let scale = options.scale as i32;
        let scaled_w = width * scale;
        let scaled_h = height * scale;
        let mut scaled = Vec::with_capacity((scaled_w * scaled_h * 4) as usize);

        for yy in 0..scaled_h {
            let source_y = yy / scale;

            for xx in 0..scaled_w {
                let source_x = xx / scale;
                let index = (((source_y * width) + source_x) * 4) as usize;
                scaled.extend_from_slice(&data[index..index + 4]);
            }
        }

        width = scaled_w;
        height = scaled_h;
        data = scaled;
    }

    let out_path = options.out.unwrap_or_else(|| {
        let dir = std::env::temp_dir().join("fjk-desktop");
        let _ = std::fs::create_dir_all(&dir);
        dir.join(format!("shot-{}.png", now_stamp()))
            .to_string_lossy()
            .to_string()
    });

    if let Some(parent) = std::path::Path::new(&out_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let (out_w, out_h) = write_png(
        &out_path,
        width as u32,
        height as u32,
        &data,
        options.max_width,
    )?;

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"screenshot\",\"path\":\"{}\",\"width\":{},\"height\":{},\"sourceWidth\":{},\"sourceHeight\":{},\"scale\":{}}}",
        out_path.replace('\\', "\\\\"),
        out_w,
        out_h,
        screen_w,
        screen_h,
        options.scale
    ));

    Ok(())
}

// ---------- 窗口枚举 ----------

struct WindowRow {
    hwnd: isize,
    pid: u32,
    title: String,
}

fn list_windows() -> Result<(), String> {
    unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let rows = &mut *(lparam.0 as *mut Vec<WindowRow>);

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return BOOL(1);
        }

        let mut buffer = vec![0u16; (length + 1) as usize];
        let written = GetWindowTextW(hwnd, &mut buffer);

        if written <= 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&buffer[..written as usize]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        rows.push(WindowRow {
            hwnd: hwnd.0 as isize,
            pid,
            title,
        });

        BOOL(1)
    }

    unsafe {
        let mut rows: Vec<WindowRow> = Vec::new();
        let _ = EnumWindows(Some(callback), LPARAM(&mut rows as *mut _ as isize));

        let items: Vec<String> = rows
            .iter()
            .take(80)
            .map(|row| {
                format!(
                    "{{\"hwnd\":{},\"pid\":{},\"title\":\"{}\"}}",
                    row.hwnd,
                    row.pid,
                    row.title.replace('\\', "\\\\").replace('"', "\\\"")
                )
            })
            .collect();

        out_json(&format!(
            "{{\"ok\":true,\"action\":\"list-windows\",\"count\":{},\"windows\":[{}]}}",
            rows.len(),
            items.join(",")
        ));

        Ok(())
    }
}

// ---------- 输入 ----------

fn mouse_send(flags: MOUSE_EVENT_FLAGS, dx: i32, dy: i32, data: i32) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: data as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn absolute(x: i32, y: i32) -> (i32, i32) {
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN).max(1);
        let height = GetSystemMetrics(SM_CYSCREEN).max(1);

        (
            (x * 65535) / (width - 1).max(1),
            (y * 65535) / (height - 1).max(1),
        )
    }
}

/// 执行一次点击（不输出 JSON，供 click / click-verify 复用）。
fn perform_click(x: i32, y: i32, button: &str, double: bool) {
    let (abs_x, abs_y) = absolute(x, y);

    mouse_send(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, abs_x, abs_y, 0);

    let (down, up) = match button {
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    };

    let clicks = if double { 2 } else { 1 };

    for _ in 0..clicks {
        mouse_send(down, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(30));
        mouse_send(up, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
}

fn click(x: i32, y: i32, button: &str, double: bool) -> Result<(), String> {
    perform_click(x, y, button, double);

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"click\",\"x\":{x},\"y\":{y},\"button\":\"{button}\",\"double\":{double}}}"
    ));

    Ok(())
}

fn region_box(cx: i32, cy: i32, box_w: i32, box_h: i32, screen_w: i32, screen_h: i32) -> (i32, i32, i32, i32) {
    let x0 = (cx - box_w / 2).max(0).min(screen_w.saturating_sub(1));
    let y0 = (cy - box_h / 2).max(0).min(screen_h.saturating_sub(1));
    let w = box_w.min(screen_w - x0).max(1);
    let h = box_h.min(screen_h - y0).max(1);

    (x0, y0, w, h)
}

fn extract_region(full: &[u8], screen_w: i32, region: (i32, i32, i32, i32)) -> Vec<u8> {
    let (x0, y0, w, h) = region;
    let mut out = Vec::with_capacity((w * h * 4) as usize);

    for row in 0..h {
        let start = (((y0 + row) * screen_w + x0) * 4) as usize;
        out.extend_from_slice(&full[start..start + (w * 4) as usize]);
    }

    out
}

/// 像素差异比例（0.0–1.0）：任一通道差值超过 tol 即视为变化。
fn diff_ratio(before: &[u8], after: &[u8], tol: u8) -> f64 {
    let pixels = (before.len() / 4).max(1);
    let mut changed = 0usize;

    for index in (0..before.len().min(after.len())).step_by(4) {
        let delta_b = (before[index] as i32 - after[index] as i32).unsigned_abs() as u8;
        let delta_g = (before[index + 1] as i32 - after[index + 1] as i32).unsigned_abs() as u8;
        let delta_r = (before[index + 2] as i32 - after[index + 2] as i32).unsigned_abs() as u8;

        if delta_b > tol || delta_g > tol || delta_r > tol {
            changed += 1;
        }
    }

    changed as f64 / pixels as f64
}

/// 点击后自校验：点完截图对比，画面没变化就重试一次，仍无变化则报告失败。
fn click_verify(
    x: i32,
    y: i32,
    button: &str,
    double: bool,
    wait_ms: u64,
    threshold: f64,
    retries: u32,
    box_size: (i32, i32),
    save_dir: Option<String>,
) -> Result<(), String> {
    let (screen_w, screen_h, before_full) = capture_screen()?;
    let region = region_box(x, y, box_size.0, box_size.1, screen_w, screen_h);
    let before = extract_region(&before_full, screen_w, region);

    let mut attempts = 0u32;

    loop {
        attempts += 1;
        perform_click(x, y, button, double);
        std::thread::sleep(std::time::Duration::from_millis(wait_ms));

        let (_w, _h, after_full) = capture_screen()?;
        let after = extract_region(&after_full, screen_w, region);

        let ratio = diff_ratio(&before, &after, 12);

        if ratio >= threshold {
            let mut paths: Vec<String> = Vec::new();
            let mut save_error: Option<String> = None;

            if let Some(dir) = save_dir {
                if let Err(error) = std::fs::create_dir_all(&dir) {
                    save_error = Some(format!("create_dir_all: {error}"));
                }

                let stamp = now_stamp();
                let before_path = format!("{dir}\\click-before-{stamp}.png");
                let after_path = format!("{dir}\\click-after-{stamp}.png");
                let (_x0, _y0, w, h) = region;

                match write_png(&before_path, w as u32, h as u32, &before, None) {
                    Ok(_) => paths.push(before_path),
                    Err(error) => save_error = Some(format!("before: {error}")),
                }

                match write_png(&after_path, w as u32, h as u32, &after, None) {
                    Ok(_) => paths.push(after_path),
                    Err(error) => save_error = Some(format!("after: {error}")),
                }
            }

            out_json(&format!(
                "{{\"ok\":true,\"action\":\"click-verify\",\"changed\":true,\"ratio\":{ratio:.5},\"attempts\":{attempts},\"x\":{x},\"y\":{y},\"region\":{{\"x\":{},\"y\":{},\"width\":{},\"height\":{}}},\"files\":[{}],\"saveError\":{}}}",
                region.0,
                region.1,
                region.2,
                region.3,
                paths
                    .iter()
                    .map(|item| format!("\"{}\"", item.replace('\\', "\\\\")))
                    .collect::<Vec<_>>()
                    .join(","),
                save_error
                    .as_ref()
                    .map(|item| format!("\"{}\"", item.replace('\\', "\\\\").replace('"', "\\\"")))
                    .unwrap_or_else(|| "null".to_string())
            ));

            return Ok(());
        }

        if attempts > retries {
            out_json(&format!(
                "{{\"ok\":false,\"action\":\"click-verify\",\"changed\":false,\"ratio\":{ratio:.5},\"attempts\":{attempts},\"x\":{x},\"y\":{y},\"error\":\"no_visual_change\",\"hint\":\"点击后画面未变化：可能点偏、目标已打开、或该区域本就不变；请先用 crop 放大确认坐标\"}}"
            ));

            return Ok(());
        }
    }
}

fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    let (abs_x, abs_y) = absolute(x, y);
    mouse_send(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, abs_x, abs_y, 0);
    out_json(&format!("{{\"ok\":true,\"action\":\"move\",\"x\":{x},\"y\":{y}}}"));
    Ok(())
}

fn scroll(dy: i32) -> Result<(), String> {
    // 一个滚轮刻度 = 120
    mouse_send(MOUSEEVENTF_WHEEL, 0, 0, dy * 120);
    out_json(&format!("{{\"ok\":true,\"action\":\"scroll\",\"dy\":{dy}}}"));
    Ok(())
}

fn char_to_vk(ch: char) -> Option<u8> {
    let upper = ch.to_ascii_uppercase();

    if upper.is_ascii_alphabetic() {
        return Some(upper as u8);
    }

    if upper.is_ascii_digit() {
        return Some(upper as u8);
    }

    Some(match ch {
        '\n' | '\r' => 0x0D,
        '\t' => 0x09,
        ' ' => 0x20,
        '-' => 0xBD,
        '=' => 0xBB,
        ',' => 0xBC,
        '.' => 0xBE,
        '/' => 0xBF,
        ';' => 0xBA,
        '\'' => 0xDE,
        '[' => 0xDB,
        ']' => 0xDD,
        '\\' => 0xDC,
        '`' => 0xC0,
        _ => return None,
    })
}

fn key_event(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) {
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

fn type_text(text: &str) -> Result<(), String> {
    for unit in text.encode_utf16() {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            SendInput(&[down, up], std::mem::size_of::<INPUT>() as i32);
        }

        std::thread::sleep(std::time::Duration::from_millis(8));
    }

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"type\",\"chars\":{}}}",
        text.chars().count()
    ));

    Ok(())
}

fn press_combo(combo: &str) -> Result<(), String> {
    const MOD_CTRL: u8 = 0x11;
    const MOD_SHIFT: u8 = 0x10;
    const MOD_ALT: u8 = 0x12;

    let mut modifiers: Vec<u8> = Vec::new();
    let mut key: Option<u8> = None;

    for part in combo.split('+') {
        match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers.push(MOD_CTRL),
            "shift" => modifiers.push(MOD_SHIFT),
            "alt" => modifiers.push(MOD_ALT),
            "" => {}
            other => {
                let lower = other;

                key = Some(match lower {
                    "enter" | "return" => 0x0D,
                    "tab" => 0x09,
                    "esc" | "escape" => 0x1B,
                    "space" => 0x20,
                    "backspace" => 0x08,
                    "delete" | "del" => 0x2E,
                    "up" => 0x26,
                    "down" => 0x28,
                    "left" => 0x25,
                    "right" => 0x27,
                    "home" => 0x24,
                    "end" => 0x23,
                    "pageup" => 0x21,
                    "pagedown" => 0x22,
                    "media-play" | "media-playpause" | "playpause" | "play" => 0xB3,
                    "media-next" | "next" => 0xB0,
                    "media-prev" | "prev" | "previous" => 0xB1,
                    "media-stop" => 0xB2,
                    "volume-up" => 0xAF,
                    "volume-down" => 0xAE,
                    "mute" => 0xAD,
                    f if f.starts_with('f') && f.len() <= 3 => {
                        let number: u8 = f[1..]
                            .parse()
                            .map_err(|_| format!("无法识别按键：{f}"))?;
                        if !(1..=12).contains(&number) {
                            return Err(format!("无法识别按键：{f}"));
                        }
                        0x70 + number - 1
                    }
                    single if single.chars().count() == 1 => char_to_vk(
                        single.chars().next().unwrap(),
                    )
                    .ok_or_else(|| format!("无法识别按键：{single}"))?,
                    _ => return Err(format!("无法识别按键：{lower}")),
                });
            }
        }
    }

    let key = key.ok_or_else(|| "组合键缺少主键".to_string())?;

    for modifier in &modifiers {
        key_event(VIRTUAL_KEY(*modifier as u16), KEYBD_EVENT_FLAGS(0));
    }

    key_event(VIRTUAL_KEY(key as u16), KEYBD_EVENT_FLAGS(0));
    key_event(VIRTUAL_KEY(key as u16), KEYEVENTF_KEYUP);

    for modifier in modifiers.iter().rev() {
        key_event(VIRTUAL_KEY(*modifier as u16), KEYEVENTF_KEYUP);
    }

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"key\",\"combo\":\"{combo}\"}}"
    ));

    Ok(())
}

fn launch(path: &str) -> Result<(), String> {
    let child = Command::new(path)
        .spawn()
        .map_err(|error| format!("启动失败：{error}"))?;

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"launch\",\"path\":\"{}\",\"pid\":{}}}",
        path.replace('\\', "\\\\"),
        child.id()
    ));

    Ok(())
}

// ---------- 入口 ----------


fn wait_ms(ms: u64) -> Result<(), String> {
    std::thread::sleep(std::time::Duration::from_millis(ms));
    out_json(&format!("{{\"ok\":true,\"action\":\"wait\",\"ms\":{ms}}}"));
    Ok(())
}

struct FocusTarget<'a> {
    needle: &'a str,
    found: Option<isize>,
}

unsafe extern "system" fn focus_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let target = &mut *(lparam.0 as *mut FocusTarget);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return BOOL(1);
    }

    let mut buffer = vec![0u16; (length + 1) as usize];
    let written = GetWindowTextW(hwnd, &mut buffer);

    if written <= 0 {
        return BOOL(1);
    }

    let title = String::from_utf16_lossy(&buffer[..written as usize]);

    if title.to_lowercase().contains(&target.needle.to_lowercase()) {
        target.found = Some(hwnd.0 as isize);
        return BOOL(0);
    }

    BOOL(1)
}

fn focus_window(needle: &str) -> Result<(), String> {
    unsafe {
        let mut target = FocusTarget {
            needle,
            found: None,
        };

        let _ = EnumWindows(Some(focus_callback), LPARAM(&mut target as *mut _ as isize));

        let Some(found) = target.found else {
            return Err(format!("未找到标题包含「{needle}」的窗口"));
        };

        let hwnd = HWND(found as *mut std::ffi::c_void);
        let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
        let _ = SetForegroundWindow(hwnd);

        out_json(&format!(
            "{{\"ok\":true,\"action\":\"focus\",\"title\":\"{}\"}}",
            needle.replace('\\', "\\\\").replace('"', "\\\"")
        ));

        Ok(())
    }
}

fn launch_uri(uri: &str) -> Result<(), String> {
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = uri.encode_utf16().chain(std::iter::once(0)).collect();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if result.0 as isize <= 32 {
        return Err(format!("打开 URI 失败（code {}）", result.0 as isize));
    }

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"launch-uri\",\"uri\":\"{}\"}}",
        uri.replace('\\', "\\\\").replace('"', "\\\"")
    ));

    Ok(())
}

fn usage() {
    eprintln!(
        "fjkctl — FJK 受控桌面操作\n\
         用法:\n\
           fjkctl screenshot [--out PATH] [--max-width N]\n\
           fjkctl list-windows\n\
           fjkctl move --x N --y N\n\
           fjkctl scroll --dy N\n\
           fjkctl click --x N --y N [--button left|right|middle] [--double]\n\
           fjkctl type --text \"...\"\n\
           fjkctl key --combo \"ctrl+s\"\n\
           fjkctl launch --path \"C:\\\\path\\\\app.exe\"\n\
         说明: kill 等破坏性动作被永久拒绝（exit code 3）。"
    );
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    let index = args.iter().position(|item| item == name)?;
    args.get(index + 1).cloned()
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|item| item == name)
}

fn number(args: &[String], name: &str) -> Result<i32, String> {
    arg_value(args, name)
        .ok_or_else(|| format!("缺少参数 {name}"))?
        .parse::<i32>()
        .map_err(|_| format!("参数 {name} 需要整数"))
}

fn main() {
    /*
     * 设为 per-monitor DPI aware：否则 GetSystemMetrics/BitBlt 拿到的是缩放后的逻辑像素，
     * 截图与点击坐标会与真实屏幕不一致。
     */
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }

    let args: Vec<String> = std::env::args().skip(1).collect();

    let Some(command) = args.first().cloned() else {
        usage();
        std::process::exit(2);
    };

    let result = match command.as_str() {
        "screenshot" | "crop" => {
            let region = match (
                arg_value(&args, "--x"),
                arg_value(&args, "--y"),
                arg_value(&args, "--w"),
                arg_value(&args, "--h"),
            ) {
                (Some(x), Some(y), Some(w), Some(h)) => Some((
                    x.parse::<i32>().unwrap_or(0),
                    y.parse::<i32>().unwrap_or(0),
                    w.parse::<i32>().unwrap_or(240),
                    h.parse::<i32>().unwrap_or(180),
                )),
                _ => None,
            };

            if command == "crop" && region.is_none() {
                Err("crop 需要 --x --y --w --h".to_string())
            } else {
                screenshot(ShotOptions {
                    out: arg_value(&args, "--out"),
                    max_width: arg_value(&args, "--max-width")
                        .and_then(|value| value.parse::<u32>().ok()),
                    region,
                    scale: arg_value(&args, "--scale")
                        .and_then(|value| value.parse::<u32>().ok())
                        .unwrap_or(1),
                    grid: arg_value(&args, "--grid")
                        .and_then(|value| value.parse::<u32>().ok()),
                })
            }
        }
        "list-windows" => list_windows(),
        "move" => number(&args, "--x")
            .and_then(|x| number(&args, "--y").map(|y| (x, y)))
            .and_then(|(x, y)| move_mouse(x, y)),
        "scroll" => number(&args, "--dy").and_then(|dy| scroll(dy)),
        "click" => {
            let button = arg_value(&args, "--button").unwrap_or_else(|| "left".to_string());
            let double = has_flag(&args, "--double");

            number(&args, "--x")
                .and_then(|x| number(&args, "--y").map(|y| (x, y)))
                .and_then(|(x, y)| click(x, y, &button, double))
        }
        "click-verify" => {
            let button = arg_value(&args, "--button").unwrap_or_else(|| "left".to_string());
            let double = has_flag(&args, "--double");
            let wait_ms = arg_value(&args, "--wait")
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(450);
            let threshold = arg_value(&args, "--threshold")
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.002);
            let retries = arg_value(&args, "--retries")
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(1);
            let box_size = arg_value(&args, "--box")
                .and_then(|value| {
                    let parts: Vec<i32> = value
                        .split('x')
                        .filter_map(|part| part.parse::<i32>().ok())
                        .collect();
                    if parts.len() == 2 {
                        Some((parts[0], parts[1]))
                    } else {
                        None
                    }
                })
                .unwrap_or((260, 180));
            let save_dir = arg_value(&args, "--save-dir").or_else(|| {
                let dir = std::env::temp_dir().join("fjk-desktop");
                Some(dir.to_string_lossy().to_string())
            });

            number(&args, "--x")
                .and_then(|x| number(&args, "--y").map(|y| (x, y)))
                .and_then(|(x, y)| {
                    click_verify(x, y, &button, double, wait_ms, threshold, retries, box_size, save_dir)
                })
        }
        "type" => arg_value(&args, "--text")
            .ok_or_else(|| "缺少参数 --text".to_string())
            .and_then(|text| type_text(&text)),
        "key" => arg_value(&args, "--combo")
            .ok_or_else(|| "缺少参数 --combo".to_string())
            .and_then(|combo| press_combo(&combo)),
        "launch" => match (arg_value(&args, "--path"), arg_value(&args, "--uri")) {
            (Some(path), _) => launch(&path),
            (None, Some(uri)) => launch_uri(&uri),
            (None, None) => Err("缺少参数 --path 或 --uri".to_string()),
        },
        "wait" => arg_value(&args, "--ms")
            .ok_or_else(|| "缺少参数 --ms".to_string())
            .and_then(|value| value.parse::<u64>().map_err(|_| "参数 --ms 需要整数".to_string()))
            .and_then(wait_ms),
        "focus" => arg_value(&args, "--title")
            .ok_or_else(|| "缺少参数 --title".to_string())
            .and_then(|title| focus_window(&title)),
        "kill" => {
            out_json("{\"ok\":false,\"action\":\"kill\",\"error\":\"denied_by_fjkctl\"}");
            std::process::exit(EXIT_DENIED);
        }
        _ => {
            out_json(&format!(
                "{{\"ok\":false,\"error\":\"unknown_action\",\"action\":\"{}\"}}",
                command
            ));
            std::process::exit(EXIT_DENIED);
        }
    };

    if let Err(error) = result {
        out_json(&format!(
            "{{\"ok\":false,\"error\":\"{}\"}}",
            error.replace('\\', "\\\\").replace('"', "\\\"")
        ));
        std::process::exit(1);
    }
}
