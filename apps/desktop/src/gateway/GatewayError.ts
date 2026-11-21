/**
 * Maps OpenClaw gateway errors to a small, user-facing vocabulary.
 *
 * The gateway answers with `{ code, message, details }`; the interesting cases
 * for the desktop client are:
 *
 * - `MISSING_SCOPE`  — connected, but the connection carries no operator scope.
 * - `NOT_PAIRED`     — the gateway requires a paired device identity.
 * - `UNAVAILABLE`    — gateway not running / restarting.
 * - `UNAUTHORIZED`   — token mismatch.
 */

export type GatewayErrorKind =
  | 'unauthorized'
  | 'not_paired'
  | 'origin_rejected'
  | 'offline'
  | 'timeout'
  | 'config'
  | 'protocol'
  | 'unknown'

export interface GatewayErrorPayload {
  code?: string
  message?: string
  details?: {
    code?: string
    missingScope?: string
    requiredScopes?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GatewayIssue {
  kind: GatewayErrorKind
  title: string
  detail: string
  hint?: string
  missingScope?: string
  requiredScopes: string[]
  /** Raw payload, kept for the console and for the expandable details block. */
  raw: string
}

function tryParseJson(text: string): GatewayErrorPayload | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? (parsed as GatewayErrorPayload) : null
  } catch {
    return null
  }
}

function extractPayload(error: unknown): GatewayErrorPayload | null {
  if (error instanceof GatewayError) return error.payload

  if (typeof error === 'string') return tryParseJson(error)

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    // invoke() rejects with the command's Err payload, not an Error instance.
    if (record.payload && typeof record.payload === 'object') {
      return record.payload as GatewayErrorPayload
    }
    if (typeof record.message === 'string') {
      return record as GatewayErrorPayload
    }
    return record as GatewayErrorPayload
  }

  return null
}

function describeRaw(payload: GatewayErrorPayload | null, error: unknown): string {
  if (payload) {
    try {
      return JSON.stringify(payload)
    } catch {
      return String(payload)
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Classifies a gateway failure into a UI-ready issue. */
export function toGatewayIssue(error: unknown): GatewayIssue {
  const payload = extractPayload(error)
  const code = String(payload?.code ?? '')
  const detailsCode = String(payload?.details?.code ?? '')
  const message = String(payload?.message ?? (error instanceof Error ? error.message : '') ?? '')
  const missingScope = payload?.details?.missingScope
  const requiredScopes = Array.isArray(payload?.details?.requiredScopes)
    ? payload.details.requiredScopes
    : []

  const base = {
    missingScope,
    requiredScopes,
    raw: describeRaw(payload, error),
  }

  if (detailsCode === 'MISSING_SCOPE' || /^missing scope:/i.test(message)) {
    return {
      kind: 'unauthorized',
      title: '未授权：网关没有授予操作权限',
      detail: `网关拒绝了本次请求（缺少权限 ${missingScope ?? (requiredScopes.join(', ') || 'unknown')}）。`,
      hint: '桌面端现在是经后端通道连接的；若仍缺少权限，请检查 gateway.auth.token 是否有效，或该网关是否要求设备配对（openclaw devices list / openclaw devices approve）。',
      ...base,
    }
  }

  if (
    detailsCode === 'NOT_PAIRED' ||
    detailsCode === 'DEVICE_IDENTITY_REQUIRED' ||
    /device identity required|not paired/i.test(message)
  ) {
    return {
      kind: 'not_paired',
      title: '未配对：网关要求设备身份',
      detail: '当前连接没有已批准的设备身份，网关因此只授予了空权限。',
      hint: '在网关侧为该设备完成配对后重试（openclaw devices list 查看待批准设备）。',
      ...base,
    }
  }

  if (detailsCode === 'CONTROL_UI_ORIGIN_NOT_ALLOWED' || /origin not allowed/i.test(message)) {
    return {
      kind: 'origin_rejected',
      title: '来源被拒绝：网关不允许该 Origin',
      detail: '连接来源不在 gateway.controlUi.allowedOrigins 中。',
      hint: '把桌面端来源加入 gateway.controlUi.allowedOrigins，或继续使用后端通道连接。',
      ...base,
    }
  }

  if (
    code === 'UNAUTHORIZED' ||
    /^unauthorized/i.test(message) ||
    /token mismatch|token missing/i.test(message)
  ) {
    return {
      kind: 'unauthorized',
      title: '认证失败：网关拒绝了 token',
      detail: message || 'gateway.auth.token 与网关进程不匹配。',
      hint: '检查 ~/.openclaw/openclaw.json 的 gateway.auth.token，并确认网关已用同一份配置启动。',
      ...base,
    }
  }

  if (code === 'GATEWAY_OFFLINE' || /gateway not connected|connection (closed|dropped)/i.test(message)) {
    return {
      kind: 'offline',
      title: '网关未连接',
      detail: message || 'WebSocket 连接不可用。',
      hint: '确认 OpenClaw Gateway 正在运行（默认端口 18789）。',
      ...base,
    }
  }

  if (code === 'GATEWAY_TIMEOUT' || /timed out|超时/i.test(message)) {
    return {
      kind: 'timeout',
      title: '网关响应超时',
      detail: message || '请求在限定时间内没有返回。',
      hint: '网关可能忙或已退出，稍后重试。',
      ...base,
    }
  }

  if (code === 'GATEWAY_CONFIG') {
    return {
      kind: 'config',
      title: '网关配置不可用',
      detail: message,
      hint: '确认已运行 openclaw configure，且 ~/.openclaw/openclaw.json 存在。',
      ...base,
    }
  }

  if (detailsCode === 'PROTOCOL_MISMATCH' || /protocol mismatch/i.test(message)) {
    return {
      kind: 'protocol',
      title: '协议版本不匹配',
      detail: message,
      hint: '桌面端使用 Gateway 协议 v4，请确认 OpenClaw 版本。',
      ...base,
    }
  }

  return {
    kind: 'unknown',
    title: '网关请求失败',
    detail: message || '未知网关错误。',
    hint: '详情见控制台日志。',
    ...base,
  }
}

export class GatewayError extends Error {
  readonly payload: GatewayErrorPayload | null
  readonly issue: GatewayIssue

  constructor(error: unknown) {
    const issue = toGatewayIssue(error)
    super(`${issue.title}：${issue.detail}`)
    this.name = 'GatewayError'
    this.payload = extractPayload(error)
    this.issue = issue
  }

  /** Short text suitable for a chat bubble or a status badge. */
  get displayMessage(): string {
    return this.issue.title
  }

  static from(error: unknown): GatewayError {
    return error instanceof GatewayError ? error : new GatewayError(error)
  }
}
