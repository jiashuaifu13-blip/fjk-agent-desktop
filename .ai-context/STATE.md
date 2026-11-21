# STATE（动态，状态变化时更新）

STATE_ID: 20261121-2015
HEAD_AT_SYNC: 32189e9
UPDATED: 2026-11-21T20:15+08:00
TASK: Settings 其余项（模型/工具/会话概览，尚未开始）

DONE:
- P1-001 Gateway 通道（Rust）
- P1-002 错误映射 + 离线 UI
- P1-003 事件驱动 AgentState（单测 10/10，T1–T4）
- P1-004 release 回归
- P1-005 NSIS 安装包回归
- P1-006 Approval 卡片 + resolve（**allow 与 deny 均已验证**）
- Connection State 面板（构建通过、界面实测：字段/错误占位/重连说明）
- Log Viewer（构建通过、界面实测：7 条启动事件、清空/关闭按钮、订阅 approvals=true）

VERIFIED_DETAIL:
- allow：whoami 执行，exit 0，482ms，审批移除
- deny：`exec.approval.resolved {decision:"deny", resolvedBy:"FJK Desktop"}`，命令未执行
  （"Exec denied ... user-denied"，transcript 无执行输出）

UNVERIFIED:
- Settings 其余项（模型/工具/会话等）
- GatewayChatAdapter 快速失败竞态（已知未修）

NEXT:
1. Settings 其余项
2. 修复 GatewayChatAdapter 快速失败竞态
3. 改动后重新回归构建与安装包

FACTS:
- caps 必须在 connect 顶层，放 client 会 invalid-handshake
- 订阅：sessions.messages.subscribe { key, includeApprovals: true }；退订 unsubscribe { key }
- resolve：exec.approval.resolve { id, decision }
- 审批约 38 秒内必须处理，否则 run 中止、审批清理（APPROVAL_NOT_FOUND）
