//! FJK Desktop ↔ OpenClaw Gateway transport (protocol v4).
//!
//! The WebSocket lives in the Rust backend on purpose:
//!
//! OpenClaw 2026.11.x treats a WebSocket handshake that carries a browser
//! `Origin` header as a browser client and clears every unbound operator scope
//! for token-authenticated connections without a device identity. The result is
//! a successful `hello-ok` followed by `FORBIDDEN / MISSING_SCOPE` on the first
//! RPC. A native socket has no `Origin` header, so the gateway keeps the
//! connection on its local backend path and honours the requested scopes.
//!
//! Keeping the token here also means it never reaches the WebView.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_GATEWAY_URL: &str = "ws://127.0.0.1:18789";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Operator scopes requested during `connect`.
///
/// The gateway treats this list as a request and decides the granted set from
/// its own auth policy; requesting them is still required so the local backend
/// path can grant them.
const CONNECT_SCOPES: [&str; 6] = [
    "operator.admin",
    "operator.read",
    "operator.write",
    "operator.sessions.read",
    "operator.sessions.write",
    "operator.approvals",
];

fn error_payload(code: &str, message: impl Into<String>) -> Value {
    json!({
        "code": code,
        "message": message.into(),
        "details": { "code": code },
    })
}

fn offline_error(message: impl Into<String>) -> Value {
    error_payload("GATEWAY_OFFLINE", message)
}

fn config_error(message: impl Into<String>) -> Value {
    error_payload("GATEWAY_CONFIG", message)
}

fn config_path() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(PathBuf::from(home).join(".openclaw").join("openclaw.json"))
}

fn gateway_url() -> String {
    std::env::var("FJK_GATEWAY_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string())
}

fn read_token() -> Result<String, Value> {
    if let Ok(token) = std::env::var("FJK_GATEWAY_TOKEN") {
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }

    let path = config_path().ok_or_else(|| config_error("无法定位用户目录"))?;
    let text = std::fs::read_to_string(&path)
        .map_err(|err| config_error(format!("读取 {} 失败：{err}", path.display())))?;
    let json: Value = serde_json::from_str(&text)
        .map_err(|err| config_error(format!("解析 {} 失败：{err}", path.display())))?;

    let token = json
        .get("gateway")
        .and_then(|gateway| gateway.get("auth"))
        .and_then(|auth| auth.get("token"))
        .and_then(|token| token.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();

    if token.is_empty() {
        return Err(config_error("openclaw.json 未配置 gateway.auth.token"));
    }

    Ok(token)
}

struct Session {
    outbound: mpsc::UnboundedSender<Message>,
    pending: Mutex<HashMap<String, oneshot::Sender<Result<Value, Value>>>>,
    next_id: AtomicU64,
    connected: AtomicBool,
    #[allow(dead_code)]
    url: String,
}

impl Session {
    /// Sends one request frame and waits for its response.
    ///
    /// Gateway errors are returned verbatim so the frontend can classify them
    /// (`MISSING_SCOPE`, `NOT_PAIRED`, `UNAVAILABLE`, ...).
    async fn request(&self, method: &str, params: Value) -> Result<Value, Value> {
        if self.outbound.is_closed() {
            return Err(offline_error("gateway 连接已关闭"));
        }

        let id = self.next_id.fetch_add(1, Ordering::SeqCst).to_string();
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), sender);

        let frame = json!({
            "type": "req",
            "id": id,
            "method": method,
            "params": params,
        });

        if self
            .outbound
            .send(Message::Text(frame.to_string().into()))
            .is_err()
        {
            self.pending.lock().await.remove(&id);
            return Err(offline_error("gateway 连接已关闭"));
        }

        match tokio::time::timeout(REQUEST_TIMEOUT, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(offline_error("gateway 连接已断开")),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(error_payload(
                    "GATEWAY_TIMEOUT",
                    format!("gateway 请求超时：{method}"),
                ))
            }
        }
    }

    /// Marks the session closed and releases every waiting caller.
    async fn shutdown(self: &Arc<Self>) {
        self.connected.store(false, Ordering::SeqCst);
        let _ = self.outbound.send(Message::Close(None));

        let pending = {
            let mut guard = self.pending.lock().await;
            std::mem::take(&mut *guard)
        };
        for (_, sender) in pending {
            let _ = sender.send(Err(offline_error("gateway 连接已关闭")));
        }
    }
}

#[derive(Default)]
pub struct GatewayState {
    session: Mutex<Option<Arc<Session>>>,
}

/// Static information about the gateway connection (never the token itself).
#[tauri::command]
pub fn gateway_info() -> Value {
    json!({
        "url": gateway_url(),
        "hasToken": read_token().is_ok(),
        "configPath": config_path().map(|path| path.display().to_string()),
        "scopes": CONNECT_SCOPES,
    })
}

/// Opens the WebSocket and completes the OpenClaw `connect` handshake.
#[tauri::command]
pub async fn gateway_connect(
    app: AppHandle,
    state: State<'_, GatewayState>,
) -> Result<Value, Value> {
    let token = read_token()?;
    let url = gateway_url();

    let previous = { state.session.lock().await.take() };
    if let Some(previous) = previous {
        previous.shutdown().await;
    }

    let (socket, _) = tokio::time::timeout(
        CONNECT_TIMEOUT,
        tokio_tungstenite::connect_async(url.as_str()),
    )
    .await
    .map_err(|_| offline_error(format!("连接 {url} 超时")))?
    .map_err(|err| offline_error(format!("连接 {url} 失败：{err}")))?;

    let (mut writer, mut reader) = socket.split();
    let (outbound, mut outbound_rx) = mpsc::unbounded_channel::<Message>();

    let session = Arc::new(Session {
        outbound: outbound.clone(),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        connected: AtomicBool::new(false),
        url: url.clone(),
    });

    // Writer task: drains outbound frames until a close frame or a write error.
    tauri::async_runtime::spawn(async move {
        while let Some(message) = outbound_rx.recv().await {
            let closing = matches!(message, Message::Close(_));
            if writer.send(message).await.is_err() {
                break;
            }
            if closing {
                let _ = writer.close().await;
                break;
            }
        }
    });

    let (challenge_sender, challenge_receiver) = oneshot::channel::<()>();
    let reader_session = Arc::clone(&session);
    let reader_app = app.clone();
    let pong_sender = outbound.clone();

    // Reader task: resolves pending requests and forwards gateway events.
    tauri::async_runtime::spawn(async move {
        let mut challenge_sender = Some(challenge_sender);

        loop {
            let message = match reader.next().await {
                Some(Ok(message)) => message,
                Some(Err(_)) | None => break,
            };

            match message {
                Message::Text(text) => {
                    let Ok(value) = serde_json::from_str::<Value>(text.as_str()) else {
                        continue;
                    };

                    match value.get("type").and_then(|kind| kind.as_str()) {
                        Some("event") => {
                            let name = value
                                .get("event")
                                .and_then(|event| event.as_str())
                                .unwrap_or_default()
                                .to_string();

                            if name == "connect.challenge" {
                                if let Some(sender) = challenge_sender.take() {
                                    let _ = sender.send(());
                                }
                                continue;
                            }

                            let mut payload = value
                                .get("payload")
                                .cloned()
                                .unwrap_or_else(|| json!({}));
                            if !payload.is_object() {
                                payload = json!({});
                            }
                            if let Some(object) = payload.as_object_mut() {
                                object.insert("type".to_string(), json!(name));
                            }

                            let _ = reader_app.emit("gateway://event", payload);
                        }
                        Some("res") | Some("response") => {
                            let id = value
                                .get("id")
                                .and_then(|id| id.as_str())
                                .unwrap_or_default()
                                .to_string();

                            let sender = reader_session.pending.lock().await.remove(&id);
                            let Some(sender) = sender else { continue };

                            let has_error = value
                                .get("error")
                                .map(|error| !error.is_null())
                                .unwrap_or(false);

                            let outcome = if has_error {
                                Err(value.get("error").cloned().unwrap_or_else(|| {
                                    error_payload("GATEWAY_REQUEST", "gateway 请求失败")
                                }))
                            } else if value.get("ok").and_then(|ok| ok.as_bool()) == Some(false) {
                                Err(error_payload(
                                    "GATEWAY_REQUEST",
                                    format!("gateway 请求失败：{id}"),
                                ))
                            } else {
                                Ok(value
                                    .get("result")
                                    .or_else(|| value.get("payload"))
                                    .cloned()
                                    .unwrap_or_else(|| value.clone()))
                            };

                            let _ = sender.send(outcome);
                        }
                        _ => {}
                    }
                }
                Message::Ping(payload) => {
                    let _ = pong_sender.send(Message::Pong(payload));
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        reader_session.connected.store(false, Ordering::SeqCst);

        let pending = {
            let mut guard = reader_session.pending.lock().await;
            std::mem::take(&mut *guard)
        };
        for (_, sender) in pending {
            let _ = sender.send(Err(offline_error("gateway 连接已断开")));
        }

        let _ = reader_app.emit("gateway://state", json!({ "state": "offline" }));
    });

    if tokio::time::timeout(CONNECT_TIMEOUT, challenge_receiver)
        .await
        .is_err()
    {
        session.shutdown().await;
        return Err(offline_error("未收到 gateway 握手挑战（connect.challenge）"));
    }

    let hello = session
        .request(
            "connect",
            json!({
                "minProtocol": 4,
                "maxProtocol": 4,
                "caps": ["approvals", "exec-approvals"],
                "client": {
                    "id": "gateway-client",
                    "displayName": "FJK Desktop",
                    "version": env!("CARGO_PKG_VERSION"),
                    "mode": "backend",
                    "platform": "win32",
                },
                "auth": { "token": token },
                "role": "operator",
                "scopes": CONNECT_SCOPES,
            }),
        )
        .await;

    let hello = match hello {
        Ok(hello) => hello,
        Err(error) => {
            session.shutdown().await;
            return Err(error);
        }
    };

    session.connected.store(true, Ordering::SeqCst);

    {
        let mut guard = state.session.lock().await;
        *guard = Some(Arc::clone(&session));
    }

    let _ = app.emit(
        "gateway://state",
        json!({ "state": "connected", "url": url }),
    );

    Ok(hello)
}

/// Forwards one RPC to the gateway. Errors are returned as the gateway's own
/// `{ code, message, details }` payload so the UI can map them.
#[tauri::command]
pub async fn gateway_request(
    state: State<'_, GatewayState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, Value> {
    let session = { state.session.lock().await.clone() }
        .ok_or_else(|| offline_error("gateway 尚未连接"))?;

    session
        .request(&method, params.unwrap_or_else(|| json!({})))
        .await
}

#[tauri::command]
pub async fn gateway_disconnect(state: State<'_, GatewayState>) -> Result<(), Value> {
    let session = { state.session.lock().await.take() };
    if let Some(session) = session {
        session.shutdown().await;
    }
    Ok(())
}
