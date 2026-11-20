import {
  AgentStates,
} from './AgentStates.js'

import {
  mapAgentStateToPetState,
} from './AgentToPetState.js'


const expected = new Map([
  [AgentStates.OFFLINE, 'ERROR'],
  [AgentStates.IDLE, 'IDLE'],
  [AgentStates.THINKING, 'THINKING'],
  [AgentStates.WORKING, 'SPEAKING'],
  [AgentStates.WAITING_APPROVAL, 'IDLE'],
  [AgentStates.COMPLETED, 'INTERACT'],
  [AgentStates.FAILED, 'ERROR'],
])


let failed = false


for (
  const [agentState, expectedPetState]
  of expected
) {

  const actual =
    mapAgentStateToPetState(
      agentState
    )

  if (
    actual !==
    expectedPetState
  ) {

    failed = true

    console.error(
      `FAIL: ${agentState} -> ${actual}, expected ${expectedPetState}`
    )

  } else {

    console.log(
      `PASS: ${agentState} -> ${actual}`
    )
  }
}


try {

  mapAgentStateToPetState(
    'invalid-state'
  )

  failed = true

  console.error(
    'FAIL: invalid state should throw'
  )

} catch {

  console.log(
    'PASS: invalid state rejected'
  )
}


if (failed) {
  process.exit(1)
}

console.log(
  'AgentState adapter tests passed.'
)
