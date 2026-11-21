# STATE（动态，状态变化时更新）

STATE_ID: 20261121-1935
HEAD_AT_SYNC: ef76ecc
UPDATED: 2026-11-21T19:35+08:00
TASK: Approval deny 回归 / Settings·Log Viewer（二选一，尚未开始）

DONE:
- P1-001 Gateway 通道（Rust）
- P1-002 错误映射 + 离线 UI
- P1-003 事件驱动 AgentState（单测 10/10，T1–T4）
- P1-004 release 回归
- P1-005 NSIS 安装包回归
- P1-006 Approval 卡片 + resolve（**allow only**）

UNVERIFIED:
- deny 路径（拒绝后命令不得执行、run 应结束）

NEXT:
1. deny 回归
2. Settings / Connection State / Log Viewer
3. 修复 GatewayChatAdapter 快速失败竞态
4. 改动后重新回归构建与安装包

FACTS:
- caps 必须在 connect 顶层，放 client 会 invalid-handshake
- 订阅：sessions.messages.subscribe { key, includeApprovals: true }；退订 unsubscribe { key }
- resolve：exec.approval.resolve { id, decision }
- 审批约 38 秒内必须处理，否则 run 中止、审批清理（APPROVAL_NOT_FOUND）
