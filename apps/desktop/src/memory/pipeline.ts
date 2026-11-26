/**
 * 长期记忆流水线的本地队列（占位实现）。
 *
 * 目标：会话被「归档」后，原文仍保留在 OpenClaw 存储中，后台提炼任务据此
 * 抽取长期事实写入 MEMORY.md / Basic Memory。
 *
 * 现在只做三件事：
 *  1. 记录哪些会话「已归档、待提炼」
 *  2. 提供读取/标记完成的接口
 *  3. 不改动任何对话原文
 *
 * 后续接入提炼任务时，只需调用 takePendingDistill() 取出待处理项，
 * 处理完成后 markDistilled()。
 */

const STORAGE_KEY = 'fjk-memory-pending-distill-v1'

export interface PendingDistill {
  sessionKey: string
  archivedAt: number
  reason: 'clear' | 'manual'
}

function readQueue(): PendingDistill[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as PendingDistill[]

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue: PendingDistill[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // 忽略
  }
}

/** 会话归档后登记一条待提炼记录（同一会话只保留一条）。 */
export function recordPendingDistill(
  sessionKey: string,
  reason: PendingDistill['reason'] = 'clear',
): void {
  const key = sessionKey.trim()

  if (!key) return

  const queue = readQueue().filter((item) => item.sessionKey !== key)
  queue.push({ sessionKey: key, archivedAt: Date.now(), reason })

  // 只保留最近 50 条，避免无限增长
  writeQueue(queue.slice(-50))
}

/** 取出全部待提炼记录（不删除）。 */
export function listPendingDistill(): PendingDistill[] {
  return readQueue()
}

/** 标记某个会话已提炼完成。 */
export function markDistilled(sessionKey: string): void {
  const key = sessionKey.trim()

  if (!key) return

  writeQueue(readQueue().filter((item) => item.sessionKey !== key))
}

/** 清空队列（调试用）。 */
export function clearPendingDistill(): void {
  writeQueue([])
}
