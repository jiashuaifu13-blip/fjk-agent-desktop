# Tasks

## DOING

- **P1-020 审批审计落盘**（权限系统 P0-①）：每次审批（请求/决策/结果）写 JSONL 到
  `%APPDATA%\com.fjk.agent\approvals.jsonl`；字段 ts / approvalId / sessionKey / runId / tool /
  operation / resource / risk / decision / result / reason；含 `sk-…` 脱敏与 5MB 轮转。
  计划见 `.ai-context/PERMISSION_SYSTEM_PLAN.md`。

## 权限系统（仅第一阶段在排期）

> 完整路线图（P0–P3）见 `.ai-context/PERMISSION_SYSTEM_PLAN.md`，**当前只执行第一阶段**，
> 其余阶段等第一阶段验收后再讨论排期，避免一次背上过大开发量。

**第一阶段（唯一进行中）：P1-020 审批审计落盘**
- 目标：每次审批写一行 JSONL（请求 / 决策 / 执行结果），为用户可见的审计打底。
- 文件：`%APPDATA%\com.fjk.agent\approvals.jsonl`（按天文件名，5MB 轮转）。
- 字段：`ts, approvalId, sessionKey, runId, tool, operation, resource, risk, decision, result, reason`。
- 脱敏：命中 `sk-[A-Za-z0-9]{10,}`、`Bearer\s+\S+` 一律替换为 `***`。
- 范围限制：**不改现有审批行为**，只加记录；不做风险引擎、不做 Scope、不做桌宠卡。
- 验收：跑 3 次审批（1 允许 / 1 拒绝 / 1 超时）→ 文件里 3 行、字段齐全、无明文密钥；`tsc` + `build` 通过。

**进度（2026-11-23 21:00 实机验证通过 → DONE）**：`approvals.jsonl` 共 16 行、0 行非法 JSON；实测两条完整链路（mkdir/write L2、dir/read L0），均含 requested → settled → decided，decision=allow-once、reason=user，resource/command 字段完整、无明文密钥。
- 新增 `src/system/auditLog.ts`（sanitize / describeCommand / appendAudit / readAuditInfo）
- 新增 Rust `src-tauri/src/audit_log.rs`（`audit_append` 追加 JSONL、5MB 轮转、`audit_info` 查路径与大小）
- 接线：审批 requested / decided（auto+timed+user）/ settled 三个阶段；不改任何审批行为

## 审批链路修复（2026-11-23 晚，已实测）

| 编号 | 任务 | 状态 | 证据 |
|---|---|---|---|
| P1-031 | 恢复审批卡（`cea1a7b` 回归删除的 consumer） | DONE `e16d63d`→`9e08cbb` | 两次点击产生 decided/allow-once，卡片可见 |
| P1-032 | 等待审批时暂停首字看门狗 | DONE `01a61f9` | 实测 requested→decided 间隔 **385 秒**（6m25s）未 cancelled |
| P1-033 | 停止时同时中止远端 run（`chat.abort`） | DONE a6166ee6` | 网关日志 `chat.abort requested` → `settled=cancelled` |
| P1-034 | 重连/启动补拉 pending 审批（`exec.approval.list`） | DONE `9394c95` | 实测：关闭应用时留 pending（4d0fb42b，21:37:53）→ 重开后卡片自动恢复 |

## 权限系统 P1（2026-11-23 完成，已实测）

| 编号 | 任务 | 状态 | 证据 |
|---|---|---|---|
| P1-040 | Global 策略文件 policy.json | DONE `515599d` | 生成模板/重新加载/无效回退 |
| P1-041 | Project Scope（projectRoots） | DONE `3a64f27` | roots=1 生效；跨项目写删拒绝 |
| P1-042 | FJK 自建 Grant（grants[] + 记住 30 分钟） | DONE `c119ad0` | 授权命中 allow；不可覆盖 deny |
| P1-043 | 桌宠审批卡 | DONE `2f7a530` | 与终端共享 approvalId |
| P1-044 | 一键打开策略文件 + 小白说明 | DONE `353350c` | 日志 Policy file opened |
| P1-045 | 重载日志补 roots/grants | DONE `af09b0d` | 22:37:52 roots=1 |
| P1-046 | 自动判定不闪卡 | DONE `440ee4c` | 仅人工审批时弹卡 |

> 用户决定：验证到此暂停，P2（安全中心）/ P3（Git·Blog 细分）暂不排期。

## 权限系统 P2（未排期，用户 2026-11-23 决定暂停）

| 编号 | 任务 | 计划项 | 备注 |
|---|---|---|---|
| P1-050 | 拒绝原因回传 agent | P2-011 | 现在只回 operator declined，agent 无法改写命令 |
| P1-051 | 多实例锁（单实例守护） | 计划外 | 已观察双实例抢审批现象 |
| P1-052 | Kill Switch 组合（abort + 拒 pending + 阻止发送） | P2-003 | 现有 abort/chat.abort 仅为部分 |
| P1-053 | 安全中心（审计查询/筛选/导出 + 原生 grants 只读） | P2-010 | 数据源 approvals.jsonl 已具备 |
| P1-054 | PermissionRequest 统一模型 | P2-004 | 博客等结构化能力的前置 |
| P1-055 | 审批卡 impact 字段 | P2-002 补全 | — |
| P1-056 | 审计留存策略（保留天数/大小/脱敏可配） | P2-014 | 暂缓 |
| P1-057 | Git / Blog 操作细分 | P2-012 / P2-013 | 依赖 P1-054 与非 exec 审批通道 |
| P1-058 | 非 exec 工具审批接入（write/browser/插件） | 计划外，安全影响大 | **文件工具已完成边界约束**（见下）；browser/插件仍待验证 |
| P1-059 | 文件工具边界修复（cwd + fs.workspaceOnly） | DONE 2026-11-24 | 实测：项目内 write 成功、跨项目被拒；人设文件未迁移 |

## TODO

- Settings 更多项（工具开关/执行模式展示）。
- **（可选）快速失败场景的确定性复现。**
  订阅先于发送的修复已落地、普通对话正常；但"run 秒失败"场景无法稳定构造
  （开系统代理表现为挂起而非秒失败），该路径仍标**未实测**。
- MSI 安装包（可选）。NSIS 已完成并验证；MSI、代码签名、自动更新未做。
- 设备配对（device identity）作为浏览器端接入的可选路径。

## BLOCKED

None.

## DONE

### P1-013
自动重连（已实测通过）。

- 退避 1/2/4/8/15s 共 5 次；同一时刻只有一个重连任务；
- 成功后恢复：优先用户当前 Session → 审批订阅（includeApprovals）→ adapter.setSessionKey，
  并清空 approval/error、刷新 settings/sessionList；
- Rust 侧 session epoch：旧 reader 的 `offline` 事件不再污染新连接（header 与面板一致）；
- 网关预热期 `sessions.list` 为空时，按 5×1s 重试再判定失败；
- 实测：attempt 1..3 连接拒绝 → attempt 4 空列表 → attempt 5 恢复成功（session/approvals 均恢复）；
- 提交 `a78fe8a`、`7b201c9`。

### P1-012
Session 切换（已实测）。

- 非当前会话显示「切换」按钮，运行中禁用；切换后「（当前使用）」立即移动；
- 顺序：先 sessions.messages.subscribe {key, includeApprovals:true} 新 key，再 unsubscribe 旧 key；
  旧 key 退订失败则撤销新订阅并保持原会话，不做半切换；
- Adapter 通过 setSessionKey 使用新 key 发送；审批状态清空；
- 用户确认测试通过；提交 1c5ad26。

### P1-011
UI 布局修复（聊天滚动 + 面板互斥/悬浮，已实测）。

- 消息区 min-height:0 + 容器 overflow:hidden，长对话只在消息区内部滚动，输入框固定底部；
- 四个面板互斥：同一时刻最多一个，点击另一个自动切换，再点同一按钮收起；
- 面板改为 absolute 悬浮层（top 56px，最大高度 calc(100%-150px)，内部可滚动），不再挤压聊天区；
- 用户确认测试无异常；提交 d495f24。

### P1-010
Session 管理 —— 只读会话列表（已实测）。

- 顶部「会话」面板展示 sessions.list 的 key、MAIN/SESSION、更新时间；
- 与 settingsOverview.sessionKey 相同的一条标「（当前使用）」；
- updatedAt 缺失显示「未提供」，不推算；
- 本步不新建/删除/切换会话；
- 提交 1fc704b。

### P1-009
Settings 模型修改 + 单次回滚（已实测）。

- 「设置」中可修改当前 Session 的 `model`，走 `sessions.patch { key, model }`，成功后 `sessions.list` 刷新；
- 修改前记录原值，可点「回滚模型」一次性恢复；当前模型为空时禁止写入；
- RPC 实测：`deepseek-flash` → `deepseek-chat` → 回滚 `deepseek-flash`；
- UI 实测：用户确认保存与回滚均正常；
- 提交 `fd3866a`。

### P1-008
GatewayChatAdapter 订阅顺序修复。

- `send()` 改为**先注册 `onEvent`、再 `sendMessage`**，并对 runId 未知前的早到事件做缓冲；
- 结果：`onEvent` 在 L138、`sendMessage` 在 L162（subscribe-before-send=True）；
- `tsc` 0 错误、`npm run build` PASS；普通对话正常（流式 + 回 idle）；
- 快速失败瞬时事件**未实测**（开系统代理表现为挂起，不是秒失败）；
- 提交 `fb108f7`。

### P1-007
Connection State / Log Viewer / Settings 只读概览（均界面实测）。

- Connection State：连接状态徽标、Gateway/模式/Agent/Terminal、连接说明、最近错误、重连说明。
- Log Viewer：最近 200 条运行事件，展开/关闭/清空；启动日志含 handshake、permission probe、
  subscription（approvals=true）、runtime ready。
- Settings：只读展示模型、工具数量、当前 Session、Session 总数；Gateway 未返回的字段统一显示「未提供」，不伪造。
- 提交：`cea1a7b`（Connection State）、`32189e9`（Log Viewer）、`345d9ce`（Settings）。

### P1-005
NSIS 安装包回归通过。

- 配置：`bundle.active = true`、`targets = ["nsis"]`、显式 5 个图标、`windows.nsis.installMode = "currentUser"`。
- 产物：`target/release/bundle/nsis/FJK Agent_0.1.0_x64-setup.exe`（13.22 MB）。
- 安装：`/S` 静默安装退出码 0；安装目录由卸载注册表解析（本机为 `D:\fjk-agent\FJK Agent`）；开始菜单快捷方式已创建。
- 运行：安装版启动正常、Gateway 连接成功、真实对话成功（runId `0c46a932`）。
- 卸载：`uninstall.exe /S` 退出码 0；目录与快捷方式清理，无进程残留。
- 边界：未签名；MSI、自动更新未做。

### P1-004
Release 构建与运行回归通过。

- 从 `D:\pet-desp\apps\desktop` 执行 `npm run tauri build`：成功，无 error。
- 前端 production 产物 `apps/desktop/dist/` 已生成：12 个文件，约 11.6 MB。
- release exe：
  `apps/desktop/src-tauri/target/release/fjk-desktop.exe`
- exe 大小：**20.24 MB**。
- 发布形态直接运行验证：
  1. 窗口正常打开，无白屏、无崩溃；
  2. 成功连接本地 Gateway，徽标为 `Gateway`，`agent: idle`；
  3. 真实流式对话成功，记录 runId `83a787ed`；
  4. 关闭窗口后 `fjk-desktop` 进程正常退出，无残留。
- 本轮仅验证 standalone release exe；`bundle.active = false`，未生成/验证 NSIS 或 MSI 安装包。

### P1-003
事件驱动 AgentState 已完成。

- 新增 `packages/agent-state/AgentStateReducer.js`：统一消费本地请求意图、Gateway 事件与连接状态；支持 runId 隔离、seq/ts 乱序保护、终态 1500ms 回落、epoch 防竞态，并通过注入 `now` / `setTimeout` / `clearTimeout` 保持可测试。
- `apps/desktop/src/chat/ChatController.js` 不再持有或直接写入 `PetStateMachine`；改为 dispatch `local/request-started` / `local/request-settled`。
- `apps/desktop/src/runtime/usePetRuntime.ts` 使用 AgentState 作为唯一 Agent 行为状态源，并建立唯一 Agent 驱动链：
  `AgentState → AgentToPetState → PetStateMachine.setState`。
- runtime 中 Agent 生命周期写入桌宠仅保留上述一处；另保留应用启动时的 boot 初始化 `stateMachine.setState(IDLE)`。
- `TauriGatewayClient` 独立提供 `onEvent()` 与 `onConnectionState()`，运行中断线可将 AgentState 切换到 `offline`。
- reducer 单元测试：**10/10 通过**。
- T1 实测：真实流式对话正常，`thinking → working → completed → idle`，桌宠同步。
- T2 实测：completed 后 1.5 秒内追发新消息，无旧 terminal timer 导致的 idle 抖动。
- T3 实测：运行中关闭 Gateway，AgentState 进入 `offline`，终端显示离线并禁用输入。
- T4 实测：重启 Gateway 后重新启动桌面端，可恢复正常连接与运行路径。
- Approval / `waiting_approval` 桌面真实路径：**未验证**。

### P1-006
Approval 卡片 + resolve 已完成，allow 路径已真实验证。

- 前端订阅与 caps 顶层提交：`55d5b08`。
- Approval 卡片 UI 提交：`0675933`。
- 已确认事件：
  - `exec.approval.requested`
  - `session.approval`（`pending` → `terminal`）
  - `exec.approval.resolved`
- resolve 方法：`exec.approval.resolve { id, decision }`。
- allow 路径实测通过：审批卡片出现后点击“允许”，`whoami` 真实执行并返回 `laptop-qqmq9j32\付家康`，`exitCode=0`，耗时 `482ms`，随后审批记录被移除。
- deny 路径实测通过：点击「拒绝」后 `exec.approval.resolved` 记录 `decision:"deny"`、`resolvedBy:"FJK Desktop"`，命令未执行（user-denied）。
### P1-001
Gateway transport moved to Rust (`src-tauri/src/gateway.rs`), removing the
WebView `Origin` header that made OpenClaw clear operator scopes. Tauri commands:
`gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`;
token stays in the backend. Verified with a real chat round-trip.

### P1-002
Gateway error mapping (`src/gateway/GatewayError.ts`) + UI: unauthorized /
not-paired / origin-rejected / offline / timeout / config states, banner, mode
badge and structured chat error block. Assertions pass.

### P0-001
Project guide established.

### P0-002
AI context system established.

### P0-003
Local Git baseline established.

### P0-004
Deepseek-pet imported.

### P0-005
Deepseek-pet architecture audited.

### P0-006
Pet runtime integration boundary identified.

### P0-007
FJK AgentState adapter created and tested.

### P0-008
OpenClaw installed.

### P0-009
Windows Gateway validated.

### P0-010
DeepSeek Provider configured.

### P0-011
Real model inference validated.

### P0-012
Gateway model transport validated.

### P0-013
Agent Runtime validated.

### P0-014
Session persistence validated.

### P0-015
Tool + interactive Approval complete chain validated.

### P0-016
Real Gateway event semantics inspected (OPENCLAW_GATEWAY_EVENT_SEMANTICS.md).

### P0-017
Gateway authentication and connection contract identified (OPENCLAW_GATEWAY_AUTH_CONTRACT.md).

### P0-018
Agent turn events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-019
Tool execution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-020
Approval request / resolution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-021
Gateway Event → FJK AgentState mapping defined (OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md + packages/agent-state/GatewayEventToAgentState.js).

### P0-022
FJK Gateway Client interface defined (OPENCLAW_GATEWAY_CLIENT_INTERFACE.md + packages/gateway-client).

### P0-023
Phase 0 technical selection report produced (OPENCLAW_TECH_SELECTION.md).
