import { invoke } from '@tauri-apps/api/core'

/*
 * 审批审计（P1-020）
 *
 * 只做记录：不改变任何审批行为，不参与决策。
 * 输出：%APPDATA%\com.fjk.agent\approvals.jsonl（5MB 轮转，由 Rust 侧处理）
 */

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, '***'],
  [/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***'],
  [/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._-]{8,}/gi, '$1***'],
]

export function sanitizeAuditText(value: unknown): string {
  let text = typeof value === 'string' ? value : String(value ?? '')

  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement)
  }

  return text.replace(/\s+/g, ' ').trim()
}

export interface CommandDescriptor {
  operation: 'read' | 'write' | 'delete' | 'other'
  resource: string
  risk: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
}

const DELETE_HINTS = /\b(del|erase|rmdir|rd|rm|remove-item|unlink)\b/i
const WRITE_HINTS =
  /\b(mkdir|md|copy|move|ren|rename|set-content|out-file|new-item)\b/i
const REDIRECT_HINTS = /(^|\s)>{1,2}\s*/i
// L4：破坏性/不可逆操作（与 CommandPolicy 的 deny 规则保持语义一致）
const CRITICAL_HINTS =
  /\b(format\s+[a-z]:|diskpart|mkfs|shutdown|restart-computer|git\s+push\s+--force|git\s+reset\s+--hard|rm\s+-[a-z]*r[a-z]*f)/i

// L3：写系统目录、删除、强制覆盖
const HIGH_HINTS =
  /(?:[A-Za-z]:\\Windows|[A-Za-z]:\\Program Files|\bRemove-Item\b.*-Force)/i

const READ_HINTS =
  /\b(dir|ls|type|cat|get-content|get-childitem|test-path|git\s+(status|diff|log|show))\b/i

export function describeCommand(commandText: string): CommandDescriptor {
  const text = sanitizeAuditText(commandText)

  const pathMatch = text.match(/[A-Za-z]:\\[^\s"']+|(?:\/[\w.-]+){2,}/)
  const resource = pathMatch ? pathMatch[0].slice(0, 240) : 'unknown'

  let operation: CommandDescriptor['operation'] = 'other'

  if (DELETE_HINTS.test(text)) {
    operation = 'delete'
  } else if (REDIRECT_HINTS.test(text) || WRITE_HINTS.test(text)) {
    operation = 'write'
  } else if (READ_HINTS.test(text)) {
    operation = 'read'
  }

  const risk: CommandDescriptor['risk'] =
    CRITICAL_HINTS.test(text)
      ? 'L4'
      : HIGH_HINTS.test(text)
        ? 'L3'
        : operation === 'read'
          ? 'L0'
          : operation === 'delete'
            ? 'L3'
            : operation === 'write'
              ? 'L2'
              : 'L1'

  return { operation, resource, risk }
}

export interface AuditRecord {
  phase: 'requested' | 'decided' | 'settled' | 'exec'
  approvalId?: string | null
  sessionKey?: string | null
  runId?: string | null
  tool?: string
  operation?: string
  resource?: string
  risk?: string
  decision?: string | null
  result?: string | null
  reason?: string | null
  command?: string
  expiresAtMs?: number | null
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function appendAudit(record: AuditRecord): Promise<void> {
  if (!hasTauri()) {
    return
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...record,
    command: record.command ? sanitizeAuditText(record.command).slice(0, 500) : undefined,
    reason: record.reason ? sanitizeAuditText(record.reason).slice(0, 300) : undefined,
    result: record.result ? sanitizeAuditText(record.result).slice(0, 300) : undefined,
  })

  try {
    await invoke('audit_append', { line })
  } catch (error) {
    console.warn('[audit] append failed', error)
  }
}

export async function readAuditInfo(): Promise<string | null> {
  if (!hasTauri()) {
    return null
  }

  try {
    return (await invoke('audit_info')) as string
  } catch {
    return null
  }
}
