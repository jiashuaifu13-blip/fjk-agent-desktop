# AI Handoff

## Current Stage

Phase 1（桌面框架）主体完成 / Phase 2 部分完成。

事件驱动 AgentState 已完成并经过真实桌面运行验证；Approval 链路 allow 与 deny 双路径均已真实验证。当前主数据流为：

`Gateway 事件 / 连接状态 + 本地请求意图 → AgentStateReducer → AgentState → AgentToPetState → PetStateMachine`

桌宠只消费 AgentState，不再由聊天控制器直接写入 Agent 生命周期状态。

## Last Changes (2026-11-20 / 11-21)

### Gateway-driven AgentState

1. **AgentStateReducer**
   - 新增 `packages/agent-state/AgentStateReducer.js`。
   - 统一消费：
     - `local/request-started`
     - `local/request-settled`
     - `gateway/event`
     - `connection/state`
   - 复用 `gatewayEventToAgentState` 做单事件语义映射。
   - 支持 runId 隔离、seq/ts 乱序保护、重复事件幂等。
   - `waiting_approval` 不会被普通 assistant/tool working 事件覆盖。
   - `completed` / `failed` 停留 1500ms 后回 `idle`。
   - 通过 epoch 防止旧 terminal timer 把新 run 打回 idle。
   - `now` / `setTimeout` / `clearTimeout` 可注入，便于纯函数级测试。

2. **ChatController**
   - `apps/desktop/src/chat/ChatController.js` 不再持有 `PetStateMachine`。
   - 删除原来的 THINKING / SPEAKING / ERROR / idle 直接桌宠写入。
   - 改为 dispatch 本地 Agent action。
   - 本地 action 是客户端意图，不伪装成 Gateway 事件。
   - 原有真实聊天和流式消息逻辑保留。

3. **Runtime**
   - `apps/desktop/src/runtime/usePetRuntime.ts` 创建并持有 AgentState store。
   - Gateway `gateway://event` 与 `gateway://state` 都进入 reducer。
   - Mock 模式使用同一个 store。
   - Agent 生命周期驱动桌宠的唯一路径为：
     `AgentState → AgentToPetState → PetStateMachine.setState`
   - runtime 中另保留一次应用 boot 初始化 `stateMachine.setState(IDLE)`。
   - 组件卸载时退订 Gateway listener / store listener，并 dispose reducer。

4. **Connection state**
   - `apps/desktop/src/gateway/TauriGatewayClient.ts` 独立提供：
     - `onEvent()`
     - `onConnectionState()`
   - `gateway://state { state: "offline" }` 已真实抓取验证。
   - 不修改 Rust Gateway transport 的现有载荷协议。

5. **Offline UI**
   - `apps/desktop/src/components/DesktopTerminal.tsx` 在运行中断线后：
     - 徽标显示 `Gateway · 离线`
     - 显示断线提示
     - 禁用输入
     - 提示用户重启桌面端
   - 自动重连不属于本任务范围。

### Related commits

- `6359dac` — AgentState → Pet 单向驱动相关代码
- `1dc315a` — Terminal 运行中断线 UI
- `094be78` — PROJECT_STATUS 更新
- `4aefa3d` — TASKS 更新
- `87cd24b` — CHANGELOG 更新

### Approval pipeline (2026-11-21)

1. **订阅**
   - `usePetRuntime` 在拿到 session key 后调用
     `sessions.messages.subscribe { key, includeApprovals: true }`；
   - 卸载时 `sessions.messages.unsubscribe { key }`；
   - 订阅失败只记录，不阻断聊天。

2. **caps 位置（重要）**
   - `caps: ["approvals","exec-approvals"]` 必须放在 `connect` 参数**顶层**；
   - 放进 `client` 会被网关拒绝：`invalid connect params: at /client: unexpected property 'caps'`。

3. **事件与解决**
   - 事件：`exec.approval.requested` / `session.approval`（pending → terminal）/ `exec.approval.resolved`；
   - 解决：`exec.approval.resolve { id, decision: "allow-once" | "deny" }`。

4. **UI**
   - `DesktopTerminal.tsx` 渲染审批卡片：标题、命令文本、过期时间、允许/拒绝；
   - 卡片由事件驱动：pending 显示、terminal 按 id 清除，不本地硬删。

### Related commits (approval)

- `55d5b08` — 订阅 + caps 顶层
- `0675933` — 审批卡片 UI
- `f87a3d0` / `db33f8a` / `78be4a4` — TASKS / CHANGELOG / PROJECT_STATUS 文档

## Verified

- `AgentStateReducer` 单元测试：**10/10 通过**。
- TypeScript 类型检查通过。
- T1：真实一问一答逐字流式正常；实测状态：
  `thinking → working → completed → idle`，桌宠同步表现。
- T2：在 `completed` 后 1.5 秒内追发新请求，没有旧 timer 导致的 idle 抖动。
- T3：运行中关闭 Gateway：
  - AgentState 进入 `offline`
  - Terminal 显示 `Gateway · 离线`
  - 显示断线提示
  - 输入被禁用
- T4：重启 Gateway 后重新启动桌面端，恢复正常连接与运行路径。
- `waiting_approval` / Approval 路径：**allow 与 deny 均已验证**。
  - allow：点击「允许」后 `whoami` 真实执行，输出 `laptop-qqmq9j32\付家康`，`exitCode=0`，482ms；
  - deny：点击「拒绝」后 `exec.approval.resolved {decision:"deny", resolvedBy:"FJK Desktop"}`，命令未执行（user-denied）。
- Connection State：连接徽标、Gateway/模式/Agent/Terminal、连接说明、最近错误、重连说明（截图确认）。
- Log Viewer：最近 200 条运行事件，展开/关闭/清空；启动日志 7 条，含 subscription（approvals=true）（截图确认）。
- Settings 只读概览：模型 / 工具数量 / 当前 Session / Session 总数，缺失字段显示「未提供」（截图确认）。
- GatewayChatAdapter：`onEvent` 在 L138、`sendMessage` 在 L162，subscribe-before-send=True；普通对话正常。
- release + NSIS 复验：`tauri build` exit 0；静默安装 exit 0（目录 `D:\fjk-agent\FJK Agent`）、
  安装版窗口正常并连接 Gateway、静默卸载 exit 0，目录/快捷方式/进程/注册表均清理。

## Known Issues

### 1. GatewayChatAdapter 快速失败竞态 — 已修复，场景未实测

已改为「先注册 `onEvent`、再 `sendMessage`」，并缓冲 runId 未知前的早到事件（提交 `fb108f7`）。

- 普通对话正常（流式 → idle），`tsc`/build 通过；
- **"run 秒失败"场景未实测**：开系统代理表现为挂起（30s+），不是秒失败，构造不出稳定场景；
- 若要关闭此项：临时用 `sessions.patch` 把模型改成不存在的名字，发一条消息观察是否快速进 `failed`，再改回。

### 2. Approval deny 路径已验证（已关闭）

`waiting_approval` 映射、reducer 优先级、卡片展示、allow 与 deny 均已真实验证：
点击「拒绝」后 `exec.approval.resolved {decision:"deny", resolvedBy:"FJK Desktop"}`，命令未执行（user-denied）。

保留提示：审批请求约 **38 秒**内必须处理，超时后 run 中止、审批被清理（再查为 `APPROVAL_NOT_FOUND`），属预期行为。

### 3. 无自动重连

运行中断线可正确进入 `offline`，但桌面端当前没有自动 reconnect loop。

恢复 Gateway 后需要手动重新启动桌面端。

自动重连单独立项，不在当前 AgentState 任务范围内。

## Environment / Troubleshooting

Windows 系统代理若指向 `127.0.0.1:7897`，当前 OpenClaw 环境可能触发 SSRF 防护：

`SsrFBlockedError`

表现为模型请求快速失败。

排查此类问题时，先确认并关闭该系统代理，再判断是否为 FJK Desktop 代码问题。

不要为了绕过 SSRF 防护去修改 FJK Desktop 或 OpenClaw 安全逻辑。

## Next Task

1. 下一轮功能：Settings 写操作 / Session 管理 / 自动重连（尚未开始）。
2. （可选）快速失败场景的确定性复现（临时改错模型名），关闭最后一个未实测项。
3. 安装包后续形态：MSI、代码签名、自动更新（NSIS 已复验通过）。

## Constraints Reminder

- Gateway WebSocket **必须留在 Rust 后端**（`apps/desktop/src-tauri/src/gateway.rs`）。
- 不要把 Gateway WebSocket 移回 WebView；带 `Origin` 的浏览器握手会触发 OpenClaw 不同的权限处理路径。
- token 不得进入前端、日志、文档或 Git。
- 不修改 OpenClaw Core 来绕过权限或 SSRF 安全机制。
- AgentState 是 Agent 行为状态唯一权威；桌宠只做表现层。
- 不重新建立 PetState → AgentState 的反向状态源。
- 未经过真实测试的 Approval 行为不得标记完成；deny 未验证，文档只能写「allow 已验证、deny 未验证」。
- `caps` 必须位于 `connect` 参数顶层；放入 `client` 会被网关以 invalid-handshake 拒绝。
- 改中文文件只能用 .NET `WriteAllText` + `UTF8Encoding($false)`，写后自检 `NUL=0 / BOM=False / ???=0`。
- 文档只允许按锚点插入/删除指定行，禁止整文件重写；改文件禁止 `git apply`。
