import { invoke } from '@tauri-apps/api/core'

export interface EnsureGatewayResult {
  ok: boolean
  phase: 'reused' | 'started' | 'failed' | string
  pid: number | null
  errorKind: string | null
  detail: string | null
}

function hasTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

/**
 * 确保 OpenClaw Gateway 可用（幂等）。
 *
 * - 已在监听：Rust 直接复用，不会重复启动
 * - 未运行：由 Rust 拉起 `openclaw gateway start`（隐藏窗口），最多等 20s
 * - 失败分类：cli_missing / spawn_failed / start_timeout
 *
 * 注意：返回 ok 只代表端口已监听；真正的 READY 仍由 `gateway.connect()`
 * 的 WebSocket 握手决定。
 */
export interface ProbeGatewayResult {
  portOpen: boolean
  pid: number | null
}

/** 只读探测 Gateway 端口，供前端轮询等待就绪。 */
export async function probeGateway(): Promise<ProbeGatewayResult | null> {
  if (!hasTauri()) {
    return null
  }

  try {
    const raw = (await invoke('gateway_probe')) as {
      port_open?: boolean
      pid?: number | null
    }

    return {
      portOpen: raw.port_open === true,
      pid: typeof raw.pid === 'number' ? raw.pid : null,
    }
  } catch {
    return null
  }
}

export async function ensureGatewayRunning(): Promise<EnsureGatewayResult | null> {
  if (!hasTauri()) {
    return null
  }

  try {
    const raw = (await invoke('gateway_ensure_running')) as {
      ok?: boolean
      phase?: string
      pid?: number | null
      error_kind?: string | null
      detail?: string | null
    }

    return {
      ok: raw.ok === true,
      phase: raw.phase ?? 'failed',
      pid: typeof raw.pid === 'number' ? raw.pid : null,
      errorKind: raw.error_kind ?? null,
      detail: raw.detail ?? null,
    }
  } catch (error) {
    return {
      ok: false,
      phase: 'failed',
      pid: null,
      errorKind: 'invoke_failed',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}
