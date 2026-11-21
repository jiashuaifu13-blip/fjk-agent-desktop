import { AgentStates } from './AgentStates.js'
import { gatewayEventToAgentState } from './GatewayEventToAgentState.js'

export const TERMINAL_HOLD_MS = 1500
const TERMINAL = new Set([AgentStates.COMPLETED, AgentStates.FAILED])
const isRunStart = e => e?.type === 'agent' && e?.stream === 'lifecycle' && ['start', 'model'].includes(e?.data?.phase)

export function createAgentStateReducer(deps = {}) {
  const now = deps.now ?? Date.now
  const schedule = deps.setTimeout ?? globalThis.setTimeout
  const cancel = deps.clearTimeout ?? globalThis.clearTimeout
  const holdMs = deps.terminalHoldMs ?? TERMINAL_HOLD_MS
  const listeners = new Set()
  let snapshot = Object.freeze({ state: AgentStates.OFFLINE })
  let epoch = 0, activeRunId = null, lastSeq = null, lastTs = null, timer = null, dueAt = null

  const emitState = state => {
    if (snapshot.state === state) return snapshot
    snapshot = Object.freeze({ state })
    for (const listener of listeners) listener(snapshot)
    return snapshot
  }
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; dueAt = null }
  const resetOrder = () => { activeRunId = null; lastSeq = null; lastTs = null }
  const armIdle = () => {
    clearTimer()
    const token = epoch
    dueAt = now() + holdMs
    const fire = () => {
      if (token !== epoch || !TERMINAL.has(snapshot.state)) return
      const remaining = dueAt - now()
      if (remaining > 0) { timer = schedule(fire, remaining); return }
      timer = null; dueAt = null; emitState(AgentStates.IDLE)
    }
    timer = schedule(fire, holdMs)
  }

  const dispatch = action => {
    if (action?.type === 'local/request-started') {
      epoch += 1; clearTimer(); resetOrder(); return emitState(AgentStates.THINKING)
    }
    if (action?.type === 'connection/state') {
      if (action.state === 'offline') { epoch += 1; clearTimer(); resetOrder(); return emitState(AgentStates.OFFLINE) }
      if (action.state === 'connected' && snapshot.state === AgentStates.OFFLINE) return emitState(AgentStates.IDLE)
      return snapshot
    }
    if (action?.type !== 'gateway/event') return snapshot
    const event = action.event
    const mapped = gatewayEventToAgentState(event)
    if (mapped == null) return snapshot

    const runId = typeof event?.runId === 'string' ? event.runId : null
    if (runId && activeRunId && runId !== activeRunId) return snapshot
    if (runId && !activeRunId) { if (!isRunStart(event)) return snapshot; activeRunId = runId }
    if (Number.isFinite(event?.seq) && Number.isFinite(lastSeq) && event.seq <= lastSeq) return snapshot
    if (!Number.isFinite(event?.seq) && Number.isFinite(event?.ts) && Number.isFinite(lastTs) && event.ts <= lastTs) return snapshot
    if (Number.isFinite(event?.seq)) lastSeq = event.seq
    if (Number.isFinite(event?.ts)) lastTs = event.ts

    if (TERMINAL.has(snapshot.state)) return snapshot
    if (snapshot.state === AgentStates.WAITING_APPROVAL && mapped === AgentStates.WORKING) {
      const resolved = event?.data?.phase === 'approval-resolved' ||
        event?.type === 'exec.approval.resolved' ||
        (event?.type === 'session.approval' && event?.phase === 'terminal')
      if (!resolved) return snapshot
    }

    const result = emitState(mapped)
    if (TERMINAL.has(mapped)) armIdle()
    return result
  }

  return {
    dispatch,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() { epoch += 1; clearTimer(); resetOrder(); listeners.clear() },
  }
}