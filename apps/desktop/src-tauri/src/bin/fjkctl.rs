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

fn screenshot(out: Option<String>, max_width: Option<u32>) -> Result<(), String> {
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
            biHeight: -height, // top-down
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

        let path = out.unwrap_or_else(|| {
            let dir = std::env::temp_dir().join("fjk-desktop");
            let _ = std::fs::create_dir_all(&dir);
            dir.join(format!("shot-{}.png", now_stamp()))
                .to_string_lossy()
                .to_string()
        });

        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let (out_w, out_h) = write_png(&path, width as u32, height as u32, &buffer, max_width)?;

        out_json(&format!(
            "{{\"ok\":true,\"action\":\"screenshot\",\"path\":\"{}\",\"width\":{},\"height\":{},\"sourceWidth\":{},\"sourceHeight\":{}}}",
            path.replace('\\', "\\\\"),
            out_w,
            out_h,
            width,
            height
        ));

        Ok(())
    }
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

fn click(x: i32, y: i32, button: &str, double: bool) -> Result<(), String> {
    let (abs_x, abs_y) = absolute(x, y);

    mouse_send(
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
        abs_x,
        abs_y,
        0,
    );

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

    out_json(&format!(
        "{{\"ok\":true,\"action\":\"click\",\"x\":{x},\"y\":{y},\"button\":\"{button}\",\"double\":{double}}}"
    ));

    Ok(())
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
        "screenshot" => screenshot(arg_value(&args, "--out"), arg_value(&args, "--max-width").and_then(|value| value.parse::<u32>().ok())),
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
