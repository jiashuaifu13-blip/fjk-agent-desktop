import {
  AgentStates,
} from './AgentStates.js'

/*
 * ============================================================
 * FJK AgentState → PetState 映射
 * ============================================================
 *
 * 每项返回 { state, tags }：
 * - state：桌宠状态机状态名（语义层，不绑定具体动画）
 * - tags ：交给 PetActionSelector 的动作标签，用于在同类动作里挑选
 *
 * 说明：
 * - WORKING 不再借用 SPEAKING，改为 THINKING + work 标签（敲键盘类动作）。
 * - WAITING_APPROVAL 用一次 INTERACT 挥手，让用户能注意到“有事要确认”。
 * - COMPLETED 用 INTERACT + celebrate 标签（瞬态，播完回 IDLE）。
 */

export const AgentToPetAction = Object.freeze({

  [AgentStates.OFFLINE]: {
    state: 'ERROR',
    tags: ['error'],
  },

  [AgentStates.IDLE]: {
    state: 'IDLE',
    tags: [],
  },

  [AgentStates.THINKING]: {
    state: 'THINKING',
    tags: ['thinking'],
  },

  [AgentStates.WORKING]: {
    state: 'THINKING',
    tags: ['work', 'busy'],
  },

  [AgentStates.WAITING_APPROVAL]: {
    state: 'INTERACT',
    tags: ['greeting'],
  },

  [AgentStates.COMPLETED]: {
    state: 'INTERACT',
    tags: ['celebrate'],
  },

  [AgentStates.FAILED]: {
    state: 'ERROR',
    tags: ['error'],
  },
})


export function mapAgentStateToPetAction(
  agentState
) {

  const action =
    AgentToPetAction[
      agentState
    ]

  if (!action) {
    throw new Error(
      `Unknown FJK Agent state: ${agentState}`
    )
  }

  return action
}


/*
 * 兼容旧调用：只取状态名。
 */
export function mapAgentStateToPetState(
  agentState
) {

  return mapAgentStateToPetAction(
    agentState
  ).state
}
