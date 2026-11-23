import { setDefaultModel } from './openclawStatus'

/*
 * 全局默认模型的后台同步（B1 + B2）
 *
 * - 不阻塞 UI：调用方 fire-and-forget
 * - debounce 3s：连续切换只写最后一次
 * - single-flight：写入进行中时，新的模型排队，完成后只写最新那次
 * - 只影响 agents.defaults.model.primary；会话模型仍由 sessions.patch 立即生效
 */

export interface DefaultModelSyncResult {
  model: string
  ok: boolean
  error: string | null
}

type Listener = (result: DefaultModelSyncResult) => void

let pendingModel: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let listeners: Listener[] = []
let lastResult: DefaultModelSyncResult | null = null

const DEBOUNCE_MS = 3000

export function getLastDefaultModelSync(): DefaultModelSyncResult | null {
  return lastResult
}

export function queueDefaultModelSync(
  model: string,
  onDone?: Listener,
): void {
  if (!model.trim()) {
    return
  }

  pendingModel = model.trim()

  if (onDone) {
    listeners.push(onDone)
  }

  if (timer !== null) {
    clearTimeout(timer)
  }

  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DEBOUNCE_MS)
}

async function flush(): Promise<void> {
  if (running) {
    return
  }

  const model = pendingModel

  if (!model) {
    return
  }

  pendingModel = null
  running = true

  try {
    const result = await setDefaultModel(model)

    lastResult = { model, ok: result.ok, error: result.error }

    const current = listeners
    listeners = []

    for (const listener of current) {
      try {
        listener(lastResult)
      } catch {
        // ignore listener failures
      }
    }
  } finally {
    running = false

    if (pendingModel) {
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, DEBOUNCE_MS)
    }
  }
}
