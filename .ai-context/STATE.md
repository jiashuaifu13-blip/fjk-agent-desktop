# STATE（动态，状态变化时更新）

STATE_ID: 20261122-1120
HEAD_AT_SYNC: d9a5143
UPDATED: 2026-11-22T11:20+08:00
TASK: P1-014 新建/删除会话 —— STEP 1b 已通过（用户截图确认 5 条会话均显示真实 sessionId）；代码改动未提交，等 STEP 2

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
- 自动重连（**已验证**，提交 a78fe8a + 7b201c9）：1/2/4/8/15s 退避 ×5；成功后恢复 Session/审批订阅/adapter key；
  Rust session epoch 防止旧连接 offline 污染；sessions.list 空时 5×1s 重试（网关启动预热）。
  实测：attempt=1..3 连接拒绝 → attempt=4 空列表 → attempt=5 恢复成功，session/approvals 均恢复。


VERIFIED_DETAIL:
- allow：whoami 执行，exit 0，482ms，审批移除
- deny：`exec.approval.resolved {decision:"deny", resolvedBy:"FJK Desktop"}`，命令未执行
  （"Exec denied ... user-denied"，transcript 无执行输出）

UNVERIFIED:
- 快速失败行为未实测（开代理场景表现为挂起，非秒失败）
- 网关刚启动时若此时发消息，会收到
  "Agent main has not completed startup inspection and preparation"（网关预热未完成，属预期）
- 内层 1s 重试等待未接 cancelled（组件卸载后最多多跑 4s，小隐患）

NEXT:
1. 提交 STEP 1 + 1b 的代码改动（`usePetRuntime.ts` 补 `sessionId`、`DesktopTerminal.tsx` 显示），等网页 AI 给提交口径。
2. 新建会话（`sessions.create`）最小可用：只创建 + 刷新列表，不自动发首条消息。
3. 删除会话（归档 `sessions.patch {archived, expectedSessionId}` → `sessions.delete`）：双确认，禁止删 main。
4. Settings 更多项（工具开关/执行模式展示）。
5. （可选）快速失败的确定性复现；内层等待的取消保护。

ROUND_P1-014:
- STEP 0（基线）：HEAD=ad6ea1d clean；tsc 0；reducer 单测通过；网关 18789 有连接；代理 7897 开。
- STEP 1（数据/显示）：`GatewaySessionSummary.sessionId?` + `readSessionList` 映射 + 面板 `· sessionId: {…?? '未提供'}`；
  首轮因 `SessionListItem` 缺字段 TS2339 阻塞（`DesktopTerminal.tsx:607`）。
- STEP 1b（补类型）：两处重复声明各加 `sessionId: string | null`（L82/L89）；首条补丁 `hits=2` 非唯一被拒，
  改用 `-AllowMulti` 一次补两处；`tsc` 0、`npm run build` PASS（build 需完全权限，esbuild spawn EPERM）。
- 面板实测（用户截图）：5 条会话均显示真实 sessionId（main=`46aa601f-…`），当前使用标记正常。
- 遗留：代码改动（2 文件 / 10 行）**未提交**；「当前使用」标在 phase0-test 行（用户切过会话则正常）。
- 已落地流程：`.ai-context/.tmp/stepN.ps1|log` 留痕 + `WEB_AI_SESSION.md` 第九节命令索引规范。

STEP0_BASELINE_20261122:
- `HEAD = origin/main = ad6ea1d`，工作区 clean。
- `tsc --noEmit -p apps/desktop` = 0 错误；`node packages/agent-state/AgentStateReducer.test.mjs` 通过（exit 0）。
- 网关 `127.0.0.1:18789` 处于 LISTENING，且已有 1 条 ESTABLISHED 连接；Vite `5173` 在 LISTENING。
- 系统代理 `127.0.0.1:7897` 处于开启（推 GitHub 可用；实测对话前需关）。

FACTS:
- caps 必须在 connect 顶层，放 client 会 invalid-handshake
- 订阅：sessions.messages.subscribe { key, includeApprovals: true }；退订 unsubscribe { key }
- resolve：exec.approval.resolve { id, decision }
- 审批约 38 秒内必须处理，否则 run 中止、审批清理（APPROVAL_NOT_FOUND）
- **DeepSeek API key 已于 2026-11-22 轮换**：旧 key 已撤销，新 key 只存在 OpenClaw 凭据存储；
  仓库/文档/本卡均不含密钥（已扫描 `sk-` 为 0 命中）。配置在 `~/.openclaw/openclaw.json` 与
  OpenClaw auth store（`deepseek:default` / `deepseek:manual`）。
- 网络注意：系统代理开 → OpenClaw SSRF 阻断；系统代理关 → 直连 api.deepseek.com 可能 ECONNRESET。
  可用 TUN 模式；不要为此改 OpenClaw 安全配置。
- HEAD_AT_SYNC 记录「同步时的 HEAD」；只改 `.ai-context` 的 docs 提交会让 HEAD 前进 1，
  属正常现象，不算漂移（除非有未提交代码）。
- OpenClaw 2026.11.6 会话写操作（依据本机 `openclaw/docs/gateway/protocol/rpc-session-control.md`）：
  - `sessions.create`：`{ key?, agentId?, message?, model?, label?, displayName?, titleSource?, fork?, cwd?, projectId? }`，
    返回 `{ key, entry, runStarted, runId?, runError? }`；不带 `message` 即只建会话、不发首条消息。
  - 归档/恢复走 `sessions.patch { archived: true|false, expectedSessionId }`，需列表里的 `sessionId`。
  - `sessions.delete`：docs 说明「先 archive 再 delete 同一代」；权限上**仅 archived-only 请求可 `operator.write`**，
    其余需 `operator.admin`（本地客户端 connect 顶层已申请 operator.admin）。
  - 受保护目标：agent main 会话（含 `global`）不能归档/删除，UI 需按 `isMain` 禁用按钮。
