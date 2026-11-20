/**
 * FJK Agent unified states.
 *
 * This layer belongs to FJK Agent, not Deepseek-pet.
 *
 * OpenClaw events will eventually be normalized into these states.
 * Desktop Terminal and Pet must consume the same state source.
 */

export const AgentStates = Object.freeze({
  OFFLINE: 'offline',
  IDLE: 'idle',
  THINKING: 'thinking',
  WORKING: 'working',
  WAITING_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
})
