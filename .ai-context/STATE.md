# STATE（动态，状态变化时更新）

STATE_ID: 20261122-1607
HEAD_AT_SYNC: 9771dd2
UPDATED: 2026-11-22T16:07+08:00
TASK: 测试会话清理完成（5→1，仅 main）；代码与 Git 均 clean，等待下一项（Settings 更多项 / 历史分页）

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
1. 收尾：dashboard 测试会话已清空（现仅 1 条 `agent:main:main`），确认无需保留。
2. Settings 更多项（工具开关/执行模式展示）。
3. （可选）快速失败的确定性复现；内层等待的取消保护；`chat.history` 分页（当前 limit=100）与滚动加载。

ROUND_P1-014:
- STEP 0（基线）：HEAD=ad6ea1d clean；tsc 0；reducer 单测通过；网关 18789 有连接；代理 7897 开。
- STEP 1（数据/显示）：`GatewaySessionSummary.sessionId?` + `readSessionList` 映射 + 面板 `· sessionId: {…?? '未提供'}`；
  首轮因 `SessionListItem` 缺字段 TS2339 阻塞（`DesktopTerminal.tsx:607`）。
- STEP 1b（补类型）：两处重复声明各加 `sessionId: string | null`（L82/L89）；首条补丁 `hits=2` 非唯一被拒，
  改用 `-AllowMulti` 一次补两处；`tsc` 0、`npm run build` PASS（build 需完全权限，esbuild spawn EPERM）。
- 面板实测（用户截图）：5 条会话均显示真实 sessionId（main=`46aa601f-…`），当前使用标记正常。
- 遗留：代码改动（2 文件 / 10 行）**未提交**；「当前使用」标在 phase0-test 行（用户切过会话则正常）。
- 已落地流程：`.ai-context/.tmp/stepN.ps1|log` 留痕 + `WEB_AI_SESSION.md` 第九节命令索引规范。

ROUND_P1-014-STEP2:
- 新建会话：`createSession()` → `sessions.create {}`（不发首条消息、不自动切换）→ `sessions.list` 刷新 list 与 sessionCount → 运行时日志 `Session created`。
- GUI 实测：点击新建后会话 5→**14**（新增 9 条 `agent:main:dashboard:<uuid>`，均带真实 sessionId）；当前使用仍是 `agent:main:explicit:fjk-phase0-test`（未切换）。
- 回归：STEP 1 把 `· sessionId: …` 放进 `.connection-state-value`（`overflow:hidden + nowrap + ellipsis`）后，
  span 内的「切换」按钮被裁掉不可见。
- 修复：新增 CSS `.session-list-row`（flex）/`.session-list-value`（flex:1;min-width:0）/`.session-list-row > .connection-state-trigger`（flex:none）；
  JSX 把按钮移出 value span（`DesktopTerminal.tsx` L638 补 `</span>`），按钮成为 row 的 flex 兄弟节点。
- 补丁插曲：C2b.3/C2b.4 与 C2b.fix1 三次因锚点不唯一/不匹配失败（`PATCH_FAIL 2/3`），
  最终由本地助手用精确字节补丁 `C2b.fix2` 修正（`hits=1`，`PATCH_OK`）；`tsc` 0、`build` PASS。
- 用户实测：重建后非当前行「切换」按钮均可见，无异常（口头确认）。
- 遗留：代码改动（3 文件 / 107 插入）**未提交**。

ROUND_P1-014-STEP3:
- 删除链路：`deleteSession(key, expectedSessionId)` →
  校验（非 main / 非当前 / sessionId 与列表一致）→ `sessions.patch {archived:true, expectedSessionId}`
  → `sessions.delete {key, expectedSessionId}` → `sessions.list` 刷新 → 运行时日志 `Session deleted`。
- UI：仅当 `!isMain && key !== 当前 && session.sessionId` 时显示「删除」按钮；
  `window.confirm` 文案含真实 key 与 sessionId（先归档、再永久删除、不可撤销）。
- 插曲：C3.7 build 因 `TS2345`（onClick 回调内 sessionId 仍是 `string | null`）失败；
  本地修复为 `const sid = session.sessionId; if (!sid) return;` 后传 `sid`。
  期间一条本地补丁因 base64 错误写入 `0x1A` 控制字符、JSX 撕裂，已本地修复（tsc 0 / build PASS）。
- 实测（用户）：删除按预期工作；会话从 16 降到 **7**（main + 6 条 dashboard），
  cron 与 3 条 explicit 测试会话也被清掉；main 保留、当前会话未被删。
- 遗留：本轮删除改动（2 文件）未提交。

ROUND_P1-015:
- 切换会话时加载历史：`chat.history { sessionKey, limit: 100 }` → `readChatHistoryMessages()` →
  `chatController.replaceMessages()`（放在 `adapter.setSessionKey` 与设置切换之后）。
- 历史拉取失败：`replaceMessages([])` + 退订 target key + 抛错（不留旧会话内容）。
- 事件过滤：`GatewayChatAdapter` 在两处事件入口加 `sessionKey` 校验（不匹配直接丢弃），
  防止切换瞬间旧会话事件串进新会话；发送链路仍按 runId 过滤。
- 补丁插曲：C4.5 因锚点失配 `OLD_NOT_FOUND`，导致 `historyMessages` 声明未使用（TS6133）；
  本地补 `chatController?.replaceMessages(historyMessages)`（dry-run 先验 hits=1）后 `tsc` 0、`build` PASS。
- 实测（用户）：新建会话切换过去为空历史、切回原会话恢复原样，全部通过。
- 当前网关会话数 = **1**（仅 `agent:main:main`）：dashboard 测试会话已清空。
- 设计确认：「MAIN / 当前使用」不显示删除按钮属预期保护，不是 bug。

ROUND_P1-016（小 UX）:
- 面板关闭时自动清除会话操作错误：`useEffect(() => { if (!sessionPanelOpen) setSessionSwitchError(null) }, [sessionPanelOpen])`
  位于 `DesktopTerminal.tsx`；不触 runtime、不发 RPC。
- 实测（用户）：停网关 → 点「新建会话」出现「会话操作失败」→ 关闭再打开面板 → 错误消失；当前会话/历史/数量不变。
- 测后网关已恢复（`18789` LISTENING）；当前会话数 **5**（main + 4 条 dashboard，测试中新建产生）。

ROUND_P1-017（数据清理，无代码改动）:
- 用已验收的删除链路逐条清掉 4 条 `agent:main:dashboard:*`：5 → **1**（仅 `agent:main:main`）。
- 残留检查：`sessions.list { archived: "all" }` → `total=1`、`archived=0`，没有「已归档未删除」的残留。
- 源码 / Git / 产品配置零改动（`git status` clean，HEAD=9771dd2）。

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
