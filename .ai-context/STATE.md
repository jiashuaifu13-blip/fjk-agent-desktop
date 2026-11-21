# STATE（动态，状态变化时更新）

STATE_ID: 20261121-2310
HEAD_AT_SYNC: a78fe8a
UPDATED: 2026-11-21T23:10+08:00
TASK: 自动重连收尾（**有已知缺陷，未完成**）：网关刚启动时 sessions.list 可能为空，
      当前代码直接 throw，浪费最后一次尝试；需加 5×1s 重试后再判定失败。

DONE:
- P1-001 Gateway 通道（Rust）
- P1-002 错误映射 + 离线 UI
- P1-003 事件驱动 AgentState（单测 10/10，T1–T4）
- P1-004 release 回归
- P1-005 NSIS 安装包回归
- P1-006 Approval 卡片 + resolve（**allow 与 deny 均已验证**）
- Connection State 面板（构建通过、界面实测：字段/错误占位/重连说明）
- Log Viewer（构建通过、界面实测：7 条启动事件、清空/关闭按钮、订阅 approvals=true）
- Settings 只读概览（用户确认截图无问题：模型/工具数量/当前 Session/总数，未提供时降级）
- GatewayChatAdapter 订阅先于发送 + 早到事件缓冲（普通对话正常）
- release 构建 + NSIS 安装/运行/卸载复验（安装 0、卸载 0、目录/快捷方式/进程均清理）
- 文档收尾：TASKS / PROJECT_STATUS / AI_HANDOFF 已同步（提交 869e7a7）
- Settings 模型修改 + 单次回滚（RPC 与 UI 均实测通过：deepseek-flash→deepseek-chat→回滚）
- Session 只读列表（界面实测：5 条、MAIN/SESSION、当前使用、时间；提交 1fc704b）
- UI 布局修复：聊天区内部滚动、输入框固定；四面板互斥并悬浮（用户确认；提交 d495f24）
- Session 切换（用户确认；订阅迁移 + adapter setSessionKey；提交 1c5ad26）
- 自动重连（**WIP**，提交 a78fe8a）：1/2/4/8/15s 退避、5 次、成功后恢复 Session/订阅/adapter；
  Rust 侧加 session epoch，避免旧 reader 的 offline 事件污染新连接。


VERIFIED_DETAIL:
- allow：whoami 执行，exit 0，482ms，审批移除
- deny：`exec.approval.resolved {decision:"deny", resolvedBy:"FJK Desktop"}`，命令未执行
  （"Exec denied ... user-denied"，transcript 无执行输出）

UNVERIFIED:
- 快速失败行为未实测（开代理场景表现为挂起，非秒失败）
- 自动重连成功路径未验证（当前环境网关无法常驻；且存在 sessions.list 空列表缺陷）
- 重连后 header 与 Connection State 一致性（epoch 修复待实测）

NEXT:
1. 修自动重连的 sessions.list 空列表重试（5×1s），再测"杀网关→3s 后拉起→自动恢复"。
2. 确认 epoch 修复后 header 不再显示离线（面板与 header 一致）。
3. （可选）快速失败的确定性复现；新建/删除会话。

FACTS:
- caps 必须在 connect 顶层，放 client 会 invalid-handshake
- 订阅：sessions.messages.subscribe { key, includeApprovals: true }；退订 unsubscribe { key }
- resolve：exec.approval.resolve { id, decision }
- 审批约 38 秒内必须处理，否则 run 中止、审批清理（APPROVAL_NOT_FOUND）
