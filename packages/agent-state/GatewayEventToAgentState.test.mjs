import {
  AgentStates,
} from './AgentStates.js'

import {
  gatewayEventToAgentState,
  connectionEventToAgentState,
} from './GatewayEventToAgentState.js'


const cases = [
  // agent / lifecycle
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'start' } }, AgentStates.THINKING],
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'model' } }, AgentStates.THINKING],
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'waiting-approval' } }, AgentStates.WAITING_APPROVAL],
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'approval-resolved' } }, AgentStates.WORKING],
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'end' } }, AgentStates.COMPLETED],
  [{ type: 'agent', stream: 'lifecycle', data: { phase: 'error' } }, AgentStates.FAILED],

  // agent / execution
  [{ type: 'agent', stream: 'execution', data: { state: 'running' } }, AgentStates.WORKING],
  [{ type: 'agent', stream: 'execution', data: { state: 'waiting', wait: { kind: 'approval' } } }, AgentStates.WAITING_APPROVAL],
  [{ type: 'agent', stream: 'execution', data: { state: 'waiting', wait: { kind: 'user_input' } } }, null],

  // agent / tool
  [{ type: 'agent', stream: 'tool', data: { phase: 'start' } }, AgentStates.WORKING],
  [{ type: 'agent', stream: 'tool', data: { phase: 'result', isError: false } }, AgentStates.WORKING],
  [{ type: 'agent', stream: 'tool', data: { phase: 'result', isError: true } }, AgentStates.FAILED],

  // agent / assistant
  [{ type: 'agent', stream: 'assistant', data: {} }, AgentStates.WORKING],

  // approval
  [{ type: 'exec.approval.requested' }, AgentStates.WAITING_APPROVAL],
  [{ type: 'exec.approval.resolved' }, AgentStates.WORKING],
  [{ type: 'session.approval', phase: 'pending' }, AgentStates.WAITING_APPROVAL],
  [{ type: 'session.approval', phase: 'terminal' }, AgentStates.WORKING],

  // no-op / unknown
  [{ type: 'agent', stream: 'usage', data: {} }, null],
  [{ type: 'session.message', data: {} }, null],
  [{ type: 'session.typing', typing: true }, null],
  [{ type: 'unknown.event' }, null],
  [null, null],
]


let failed = false


for (
  const [event, expectedState]
  of cases
) {

  const actual =
    gatewayEventToAgentState(
      event
    )

  if (
    actual !==
    expectedState
  ) {

    failed = true

    console.error(
      `FAIL: ${JSON.stringify(event)} -> ${actual}, expected ${expectedState}`
    )

  } else {

    console.log(
      `PASS: ${JSON.stringify(event)} -> ${actual}`
    )
  }
}


const connectionCases = [
  [{ type: 'hello-ok' }, AgentStates.IDLE],
  [{ type: 'connect' }, AgentStates.IDLE],
  [{ type: 'shutdown' }, AgentStates.OFFLINE],
  [{ type: 'close' }, AgentStates.OFFLINE],
  [{ type: 'disconnect' }, AgentStates.OFFLINE],
  [{ type: 'tick' }, null],
]


for (
  const [event, expectedState]
  of connectionCases
) {

  const actual =
    connectionEventToAgentState(
      event
    )

  if (
    actual !==
    expectedState
  ) {

    failed = true

    console.error(
      `FAIL(connection): ${JSON.stringify(event)} -> ${actual}, expected ${expectedState}`
    )

  } else {

    console.log(
      `PASS(connection): ${JSON.stringify(event)} -> ${actual}`
    )
  }
}


if (failed) {
  process.exit(1)
}

console.log(
  'GatewayEventToAgentState mapping tests passed.'
)
