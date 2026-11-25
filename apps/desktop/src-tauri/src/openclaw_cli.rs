use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

/// 多路径查找 node.exe（不依赖 PATH，兼容自定义安装目录）。
pub fn node_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(output) = Command::new("where").arg("node").output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let line = line.trim();
                if !line.is_empty() {
                    candidates.push(PathBuf::from(line));
                }
            }
        }
    }

    for base in [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ] {
        candidates.push(PathBuf::from(base));
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local)
                .join("Programs")
                .join("nodejs")
                .join("node.exe"),
        );
    }

    candidates.into_iter().find(|path| path.exists())
}

/// OpenClaw 的 JS 入口（用 node 直接跑，绕开 .cmd 与 PATH）。
pub fn entry() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let entry = PathBuf::from(appdata)
        .join("npm")
        .join("node_modules")
        .join("openclaw")
        .join("dist")
        .join("index.js");

    entry.exists().then_some(entry)
}

fn cli_path() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let path = PathBuf::from(appdata).join("npm").join("openclaw.cmd");
        if path.exists() {
            return Some(path);
        }
    }

    None
}

#[cfg(windows)]
fn hide(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide(_command: &mut Command) {}

/// 统一执行 OpenClaw CLI：优先 node + dist/index.js，其次 cmd 调 .cmd。
pub fn run(args: &[&str]) -> std::io::Result<Output> {
    if let (Some(node), Some(entry)) = (node_exe(), entry()) {
        let mut command = Command::new(node);
        command
            .arg(entry)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide(&mut command);
        return command.output();
    }

    let Some(cli) = cli_path() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "未找到 OpenClaw（node 与 openclaw.cmd 都不存在）",
        ));
    };

    let mut command = Command::new("cmd");
    command
        .args([
            "/C",
            &format!("chcp 65001>nul & \"{}\" {}", cli.display(), args.join(" ")),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide(&mut command);
    command.output()
}
