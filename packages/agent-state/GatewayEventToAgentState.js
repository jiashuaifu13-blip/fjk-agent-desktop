import {
  AgentStates,
} from './AgentStates.js'


/**
 * P0-021 reference mapping.
 *
 * Maps a single normalized OpenClaw Gateway event to the FJK
 * AgentState it represents.
 *
 * Returns null when the event does not change the agent state.
 *
 * Event shapes follow the Gateway protocol v4 contract captured in
 * .ai-context/OPENCLAW_GATEWAY_EVENT_SEMANTICS.md and
 * OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md.
 */
export function gatewayEventToAgentState(
  event
) {

  switch (
    event?.type
  ) {

    case 'agent':
      return mapAgentEvent(
        event
      )


    /*
     * Gateway-level approval lifecycle.
     */

    case 'exec.approval.requested':
      return AgentStates.WAITING_APPROVAL

    case 'exec.approval.resolved':
      return AgentStates.WORKING


    /*
     * Session-level approval projection.
     */

    case 'session.approval':
      return (
        event.phase === 'pending'
          ? AgentStates.WAITING_APPROVAL
          : AgentStates.WORKING
      )


    default:
      return null
  }
}


/**
 * Maps connection-level events (transport handshake / teardown).
 *
 * The Gateway Client owns the connection state separately; this
 * function only normalizes the transport events into an AgentState.
 */
export function connectionEventToAgentState(
  event
) {

  switch (
    event?.type
  ) {

    case 'hello-ok':
    case 'connect':
      return AgentStates.IDLE

    case 'shutdown':
    case 'close':
    case 'disconnect':
      return AgentStates.OFFLINE

    default:
      return null
  }
}


function mapAgentEvent(
  event
) {

  switch (
    event.stream
  ) {

    /*
     * runId lifecycle is the authoritative turn phase source.
     */

    case 'lifecycle':
      return mapLifecyclePhase(
        event.data?.phase
      )


    /*
     * Execution activity states.
     */

    case 'execution':

      if (
        event.data?.state ===
        'running'
      ) {

        return AgentStates.WORKING
      }

      if (
        event.data?.state ===
          'waiting' &&
        event.data?.wait?.kind ===
          'approval'
      ) {

        return AgentStates.WAITING_APPROVAL
      }

      return null


    /*
     * Tool calls.
     */

    case 'tool':
      return mapToolPhase(
        event.data?.phase,
        event.data?.isError
      )


    /*
     * Streaming assistant text is active output.
     */

    case 'assistant':
      return AgentStates.WORKING


    default:
      return null
  }
}


function mapLifecyclePhase(
  phase
) {

  switch (phase) {

    case 'start':
    case 'model':
      return AgentStates.THINKING

    case 'waiting-approval':
      return AgentStates.WAITING_APPROVAL

    case 'approval-resolved':
      return AgentStates.WORKING

    case 'end':
      return AgentStates.COMPLETED

    case 'error':
      return AgentStates.FAILED

    default:
      return null
  }
}


function mapToolPhase(
  phase,
  isError
) {

  switch (phase) {

    case 'start':
      return AgentStates.WORKING

    case 'result':
    case 'end':
      return (
        isError === true
          ? AgentStates.FAILED
          : AgentStates.WORKING
      )

    default:
      return null
  }
}
