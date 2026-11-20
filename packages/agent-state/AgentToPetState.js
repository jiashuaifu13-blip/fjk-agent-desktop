import {
  AgentStates,
} from './AgentStates.js'


/**
 * Maps normalized FJK Agent states into the existing
 * Deepseek-pet PetStateMachine states.
 *
 * Important:
 *
 * This adapter intentionally returns semantic pet-state names
 * instead of animation filenames.
 *
 * Agent state must never directly control spritesheet assets.
 */
export const AgentToPetState = Object.freeze({

  [AgentStates.OFFLINE]:
    'ERROR',

  [AgentStates.IDLE]:
    'IDLE',

  [AgentStates.THINKING]:
    'THINKING',

  /*
   * Deepseek-pet currently does not yet define a dedicated
   * WORKING state.
   *
   * SPEAKING is used only as a temporary semantic fallback.
   * A dedicated pet state may be added later when appropriate
   * animation resources exist.
   */
  [AgentStates.WORKING]:
    'SPEAKING',

  /*
   * No dedicated approval animation exists yet.
   * Keep the character visible and stable using IDLE.
   */
  [AgentStates.WAITING_APPROVAL]:
    'IDLE',

  /*
   * No dedicated completed/success state exists yet.
   * INTERACT is transient and automatically returns to IDLE,
   * so it is currently the closest suitable temporary mapping.
   */
  [AgentStates.COMPLETED]:
    'INTERACT',

  [AgentStates.FAILED]:
    'ERROR',
})


export function mapAgentStateToPetState(
  agentState
) {

  const petState =
    AgentToPetState[
      agentState
    ]

  if (!petState) {
    throw new Error(
      `Unknown FJK Agent state: ${agentState}`
    )
  }

  return petState
}
