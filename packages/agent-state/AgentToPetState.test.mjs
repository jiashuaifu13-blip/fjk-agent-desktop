import {
  AgentStates,
} from './AgentStates.js'

import {
  mapAgentStateToPetAction,
  mapAgentStateToPetState,
} from './AgentToPetState.js'


const expected = new Map([
  [AgentStates.OFFLINE, 'ERROR'],
  [AgentStates.IDLE, 'IDLE'],
  [AgentStates.THINKING, 'THINKING'],
  [AgentStates.WORKING, 'THINKING'],
  [AgentStates.WAITING_APPROVAL, 'INTERACT'],
  [AgentStates.COMPLETED, 'INTERACT'],
  [AgentStates.FAILED, 'ERROR'],
])


const expectedTags = new Map([
  [AgentStates.WORKING, ['work', 'busy']],
  [AgentStates.WAITING_APPROVAL, ['greeting']],
  [AgentStates.COMPLETED, ['celebrate']],
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
      `mapAgentStateToPetState(${agentState}) = ${actual}, expected ${expectedPetState}`
    )
  }


  const action =
    mapAgentStateToPetAction(
      agentState
    )

  if (
    !action ||
    action.state !== expectedPetState
  ) {

    failed = true

    console.error(
      `mapAgentStateToPetAction(${agentState}) state mismatch`
    )
  }


  const tags =
    expectedTags.get(agentState)

  if (tags) {

    const actualTags =
      action.tags ?? []

    if (
      actualTags.join(',') !==
      tags.join(',')
    ) {

      failed = true

      console.error(
        `mapAgentStateToPetAction(${agentState}) tags = ${actualTags.join(',')}, expected ${tags.join(',')}`
      )
    }
  }
}


if (failed) {

  console.error('AgentToPetState tests FAILED')
  process.exit(1)
}

console.log('AgentToPetState tests passed')
