# STATE（动态，状态变化时更新）

STATE_ID: 20261122-1830
HEAD_AT_SYNC: 83d0b1b
UPDATED: 2026-11-22T18:30+08:00
TASK: 桌宠阶段已落地（Blog 实现移植 + 18 动作 + 角色卡/情绪/关系记忆/气泡 + 映射 v2）；等 GUI 终验与下一步（动作包扩充/主动互动）

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

ROUND_PET-2（2026-11-22 傍晚）:
- 动作包 18 → **34 个**（73 文件 / 33.7MB）：补 angry/surprised/shy/sleepy 等情绪动作与更多待机动作。
- 角色卡 v3：10 情绪（neutral/happy/joy/excited/proud/shy/surprised/angry/sad/wronged），
  每种含 daily/work 两套台词；新增 10 个**事件专属台词池**（click/rapidClick/doubleClick/dragStart/dragEnd/chatStart/chatEnd/approval/reunion/idleChat）。
- 情绪引擎：台词优先级「事件台词 > 情绪台词」，强度≥2 时偏向更重的台词；气泡时长按字数 3.5–9s 自适应。
- `[[mood:xxx]]` 解析：`ChatController` 检测/剥离标记（含半截标记），`onMood` 回调驱动情绪；人格侧已写入
  `~/.openclaw/workspace/SOUL.md`（备份 `SOUL.md.bak-20261122-1840`），标记规范：最后一行、10 选 1、可带 `:0..2` 强度。
- 交互修复：Blog 版在 `pointerdown` 立刻进入 DRAGGING（点击也会闪悬空）；改为 **长按 260ms 或移动超 6px** 才进入，
  纯点击走 INTERACT，长按松手回 IDLE。
- 单测（本地脚本）：标记剥离/去重/半截标记均通过；`tsc` 0、`build` PASS。

ROUND_PET-3（2026-11-22 晚）:
- 桌宠关系记忆**落盘**：新增 Rust 命令 `pet_memory_load/save/clear`（`src-tauri/src/pet_memory.rs`），
  文件位于 `%APPDATA%\com.fjk.agent\pet-memory.json`；写入用「临时文件 + rename」防半写损坏。
- `PetMemoryStore` 增 `backend` + `async hydrate()`：启动时文件优先恢复（回退 localStorage），
  每次 `save()` 同时写 localStorage 与 AppData 文件；`clear()` 双清。
- 新增 `TauriPetMemoryBackend.js`（官方 `@tauri-apps/api/core` 的 `invoke`）。
- 验证：`tsc` 0、`vite build` PASS、`cargo check` 通过；用户已自行 `npm run tauri build` 运行无异常（口头确认）。

NEXT:
1. 桌宠 GUI 终验：IDLE 轮播 / thinking-work / 审批挥手+气泡 / 完成庆祝 / 拖拽 / 断线。
2. 动作包扩充（**已预留**：Blog `dsh` 有 101 动作、95.8MB；当前只入库 18 个 / 18.5MB），
   补素材时按 `character.json` 的 tags 映射挑选，并裁剪 `actions.json`/`manifest.json`。
3. 情绪联动进阶：`[[mood:xxx]]` 标记解析（需 agent 侧提示词）、工具失败/审批事件映射。
4. 主动互动：久坐提醒、深夜提醒、整点问候（可开关）。
5. Phase 6 产品化（MSI/签名/自动更新）。

ROUND_PET（2026-11-22 下午，阶段成果）:
- 代码来源：`D:\Personal Blog`（同源 Deepseek-pet），原样搬入 `PetStates/PetStateMachine/PetAnimator/PetRenderer/PetHitTest/PetInteractionController/PetActionCatalog/PetActionSelector` 共 8 个文件；
  适配点：`PetInteractionController.destroy()` → `unmount()`。
- 素材：从 Blog `dsh` 复制 18 个动作（webp + sidecar json），并裁剪 `actions.json`(18 条)/`manifest.json`(3 条)；
  旧 5 个动作移到 `.tmp/pets-old-backup/`（未提交）。
- 角色卡 `public/pets/dsh1/character.json` v2：persona.daily/work 双模式、5 条行为清单、4 条限流、
  7 种情绪（tags/decayMs/daily·work 台词）、互动→情绪映射、memory 配置。
- `PetMemoryStore`（localStorage `fjk-pet-memory-v1`）：亲密度/互动计数/最近 50 条事件/久别判定；
  **写入为主，读取**：`isReunion()` 已接（>24h 重逢→happy）。
- `PetEmotionEngine`：事件→情绪→tags，强度+衰减、连点检测（1.6s×3→angry）、双模式台词。
- 接线 `usePetRuntime`：selector 注入状态机；root 监听 click/dblclick/pointer 拖拽；`sending` 变化→chatStart/chatEnd；
  `agentState` 变化→daily/work 模式；审批出现→气泡「有事要你确认！」+ surprised。
- 映射 v2（`packages/agent-state/AgentToPetState.js`）：返回 `{state,tags}`；WORKING→THINKING+work、WAITING_APPROVAL→INTERACT+greeting、
  COMPLETED→INTERACT+celebrate；保留 `mapAgentStateToPetState()`；单测同步通过。
- 仲裁：情绪只在桌宠 `IDLE/ERROR` 时接管动画，Agent 状态优先，避免抢动画。
- 气泡：气泡挂在桌宠容器内（跟随拖拽）、二次元萌系样式、情绪配色、打字机、上下浮动、尾巴居中。
- Settings 新增只读：桌宠亲密度 / 认识天数 / 互动次数；Log Viewer 新增 `pet` 来源事件。
- 体积：`public/pets/dsh1` = 40+ 文件 ≈ 18.5MB；build bundle 220.81 kB。

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

ROUND_P1-018（Settings 更多项 · 只读）:
- `SettingsOverview` 增 3 字段：`toolProfile: string | null`、`toolsEnabled: boolean | null`、`executionMode: string | null`；
  `readSettingsOverview` 从行/`metadata` 读取，缺失即 `null`。
- UI 新增 3 行：`工具 Profile`、`工具开关`（仅按布尔值显示 启用/禁用，**不**用 toolCount 推断）、`执行模式`；
  `null` 统一显示「未提供」；原「工具数量」行保留。
- 插曲：补丁首次只改了接口/读取/UI，漏了 `useState<SettingsOverview>` 初始值 → `TS2345`；本地补 3 个 `null` 后 `tsc` 0、`build` PASS。
- 实测（用户，Settings 面板）：`deepseek-flash`；工具数量/工具 Profile/工具开关/执行模式 均为「未提供」；当前 Session `agent:main:main`。

STEP0_BASELINE_20261122:
- `HEAD = origin/main = ad6ea1d`，工作区 clean。
- `tsc --noEmit -p apps/desktop` = 0 错误；`node packages/agent-state/AgentStateReducer.test.mjs` 通过（exit 0）。
- 网关 `127.0.0.1:18789` 处于 LISTENING，且已有 1 条 ESTABLISHED 连接；Vite `5173` 在 LISTENING。
- 系统代理 `127.0.0.1:7897` 处于开启（推 GitHub 可用；实测对话前需关）。

ROUND_P1-019（已完成并实测）:
- 目标：消息区向上滚动加载更早历史（原 `chat.history` 固定 `limit: 100`、无 cursor）。
- `ChatController.prependMessages(messages)`：空数组直接 return；否则 `[...新, ...旧]` → `emitMessages()`（不调 `stop()`）。
- `usePetRuntime`：4 个 ref（`historySessionKeyRef` / `historyOlderCursorRef` / `historyHasMoreRef` / `historyLoadingOlderRef`）；
  `loadOlderHistory()` 用 cursor 原样透传调 `chat.history {sessionKey, cursor, limit: 50}`，
  返回前校验 `activeSessionKeyRef`（切走不污染）、防重入、`hasMore !== true` 时 cursor 置 null；`return` 已暴露。
- 基线：**首屏 boot** 与 **切换会话** 都拉一次 `chat.history` 并写入 cursor/hasMore（limit 均 50，原 100）。
- `DesktopTerminal`：消息区 `scrollTop <= 40` 触发加载，`olderScrollRef` 保持加载后可视位置不跳。
- 实测（用户）：重启 → 滚到顶部加载更早约 18 条 → 位置不跳 → 再滚到顶不再加载，无异常。
- 补丁插曲：P1-019.4 被重复执行导致 `OLD_NOT_FOUND`（幂等，无重复插入）；loadOlderHistory 首稿缺
  `const gateway = gatewayClientRef.current`，首屏块首稿引用了不在作用域的 `sessionKey`，均已本地修正。
- 提交：见下一行（feat(chat): load older history on scroll）。

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

ROUND_ONBOARD（2026-11-22 晚）:
- P-A1 检测：Rust `openclaw_status`（安装/版本/网关端口/config 是否存在），设置面板 3 行只读。
- P-A2 引导：重新检测按钮 + 未安装/未配置/网关未运行三种提示 + 版本提示语。
- P-A3 密钥：优先 Gateway RPC `models.authSetApiKey`（不停网关），失败退回 CLI `models auth paste-api-key`；
  校验走 `provider_list_models`（系统 curl，key 经 stdin，不进命令行）。
- 多 provider：端点表覆盖 deepseek/openai/anthropic/xai/groq/openrouter/google/moonshot/zhipu/alibaba/mistral/together/deepinfra/cerebras/cohere；
  未知 provider 返回 supported=false（界面提示手动验证）；provider id 改为格式校验，兼容任意已注册 provider。
- 凭据冲突：`models.authSetApiKey` 不接收 profileId，会解析 `<provider>:manual`；若该档案是别的登录方式会报
  “belongs to another sign-in”。已实现：捕获后调 `models.authLogout {provider, profileIds:[<provider>:manual]}` 再重试，
  界面提示「已移除旧的 X 凭据」。
- 排查副作用：探测 RPC 时误建 `zzz-not-real:manual`，已用 authLogout 清理。

ROUND_ONBOARD-2（2026-11-22 晚，自定义 provider）:
- 新增 Rust `custom_provider.rs`：
  - `custom_list_models(baseUrl, key)`：请求 `<base>/v1/models`（自动补 `/v1` 或 `/models`），Bearer 鉴权，25s 超时；
  - `openclaw_configure_custom_provider(id, baseUrl, modelIds)`：`openclaw config set models.providers.<id> '{baseUrl, apiKey:"<id>:manual", models:[...]}' --strict-json --merge`。
- 顺序：先 `models.authSetApiKey` 建 `<id>:manual` 凭据（key 不进命令行），再写 provider 配置引用该凭据。
- UI：设置 → 模型与密钥 增加「自定义 OpenAI 兼容」一行（provider id / Base URL / 模型 id / 保存自定义）。
- 用途：支持 New API / one-api 等中转（如 `https://qwarweww-newspace.hf.space`），官方 provider 的 `/models` 校验不适用时走这条。
- 备注：新 API 的默认模型需另行设置（`agents.defaults.model = "<id>/<model>"`），后续补按钮。

ROUND_CHAT-LATENCY-1（2026-11-22 深夜，对话延迟批次 1）:
- 流式批处理：`ChatController` 新增 `scheduleEmit()`（40ms 合并）+ `cancelScheduledEmit()`，token 不再逐条触发 React 渲染。
- 对象稳定：`emitMessages()` 用 displayCache 复用未变化的消息对象，配合 `React.memo` 的 `MessageRow`，历史消息不再重渲染。
- 等待可感知：发送后若还没有 assistant 内容，显示「等待模型响应… Ns」并计时；首 token 到达后切回流式光标。
- 埋点：`ChatController.onTiming({ttftMs,totalMs})` → runtime 写 Log Viewer「Chat latency ttft=…ms; total=…ms」。
- tsc 0、build PASS。批次 2 待做：reasoning 单独展示、打字机平滑、长对话虚拟化。

ROUND_PROVIDER-LATENCY（2026-11-22 深夜，API 与对话体验）:
- 首启引导：Rust `openclaw_status`（安装/版本/网关/config）+ 设置面板「重新检测」+ 三种状态引导；写密钥优先走 Gateway RPC
  `models.authSetApiKey`（不停网关），冲突时 `models.authLogout` 清 `<provider>:manual` 后重试。
- 多 provider：内置 15 家 `/models` 校验端点；自定义 OpenAI 兼容 provider（New API / one-api）走
  `openclaw config set models.providers.<id> '{baseUrl, api:"openai-completions", apiKey:"<id>:manual", models:[…]}'`。
  关键坑：**自定义 provider 必须声明 `api: openai-completions`**，否则 models.json 加载失败、模型无法解析。
- 模型作用域：`sessions.patch` 只改**当前会话**；全局默认是 `agents.defaults.model.primary`。设置面板新增
  「设为全局默认」按钮（Rust `openclaw_set_default_model`）；模型行显示 provider。
- Agent 自检：`~/.openclaw/workspace/AGENTS.md` 增规则——问模型时读会话级 `model/modelProvider`，不要用默认值；
  注意**新会话才会重新加载**该文件（旧会话会继续答旧值）。
- 对话延迟：`ChatController` 40ms 合并流式渲染 + 稳定消息对象 + `MessageRow` memo；等待期显示阶段
  （已发送/模型处理中/生成中/等待你审批）；`Chat latency ttft/total` 埋点；首字 90s 未到自动 stop。
- 会话可观测：会话面板显示「· 运行中」+「强制停止」（`sessions.abort {key, clearQueued:true}`），面板打开时 8s 轮询；
  启动恢复上次会话（localStorage `fjk-last-session-v1`）。
- 实测数据：deepseek-flash ttft 0.9–10.8s；newapi/grok-4.7 ttft 3.4s（reasoning 模型）；HF Space 冷启动约 15s。
- 已知遗留：卡死多为 agent 工具调用（`tool_execution_wait`）；`newapi` 的 `models` 空数组靠上游默认接受；
  自动停止阈值 90s 是否偏长待评估。

NEXT（明天）:
1. 观察一晚上稳定性：卡死频率、自动停止误伤率、grok 中转限流情况。
2. 若频繁 `tool_execution_wait`：在 UI 显示 run 卡在哪个工具，并提供「停止该工具」。
3. 可选：模型快捷切换（快模型/深思考）、思考链展示、打字机平滑。
4. 收尾：把本轮 API/对话改动同步进 PROJECT_STATUS 与 WEB_AI_SESSION。

ROUND_EXEC-ROOTCAUSE（2026-11-23 午后，exec 被拒根因）:
- 现象：让 agent 执行 `dir D:\pet-desp` 被拒，回复 "SYSTEM_RUN_DENIED / Approved executables: none"。
- 真因（对话记录里 exec 的原始返回）：`Exec denied (SYSTEM_RUN_DENIED: approval requires a resolved executable): dir D:\pet-desp; Command did not run.`
  —— `dir` 是 cmd **内建命令**，审批层绑不到可执行文件，直接拒绝，**根本不弹审批卡**。
- 与卡巴斯基/防火墙无关：拒绝发生在创建进程之前；网络问题是另一类（`[model-fetch] code=runtime-unavailable`，免费中转 15s 无响应）。
- 修复：
  1. `~/.openclaw/workspace/AGENTS.md` 增「exec 命令规范」：禁止裸内建命令，必须 `cmd /c dir ...` / `powershell -Command Get-ChildItem ...` / 直接 `git.exe`；需要目录时显式传 `workdir`；被拒先改写再重试。备份 `AGENTS.md.bak-20261123-1320`。
  2. `CommandPolicy` 增规则：`cmd /c dir|type|where|findstr|echo`、`powershell -Command Get-ChildItem|Get-Content|Test-Path` 自动放行；`cmd /c del|rd|rmdir|format|diskpart|shutdown`、`powershell Remove-Item` 自动拒绝。
  3. `tools.exec.mode` 由 `ask` 改为 `auto`（配置备份 `openclaw.json.bak-20261123-1310`），模型侧不再看到 “Approved executables: none” 就自我劝退。
- 验证：用户在聊天里发 `cmd /c dir D:\pet-desp`，成功返回目录列表（2026-11-23）。

ROUND_PERMISSION-PLAN（2026-11-23 傍晚，权限系统阶段计划）:
- 输入：`D:\桌面\桌宠文件备份\FJK_Agent_\PERMISSION_READING_GUIDE.md` + `PERMISSION_DESIGN_OVERVIEW.md` 全文已读；
  **完整草案 `FJK_Agent_权限与审批系统设计草案.md` 未随资料提供**（整个备份目录搜不到）→ 标 OPEN。
- 产出：`.ai-context/PERMISSION_SYSTEM_PLAN.md`（现状盘点 EXISTS/PARTIAL/MISSING/VERIFY + OpenClaw 接口实测
  + 差距取舍 + P0–P3 阶段任务 + 边界 MUST + OPEN 清单）。
- 现状要点：审批事件/resolve 可用；CommandPolicy 只是「命令字符串」级 allow/deny/ask；
  缺 Operation/Resource/Scope/Grant/审计/风险等级/桌宠审批卡；Kill Switch 仅 sessions.abort。
- 已写入：TASKS.md（DOING=P1-020 审计落盘 + P1-020..P1-030 任务表）、PROJECT_STATUS 下一步、WEB_AI_SESSION 当前任务。
- 第一批（P0）：审计落盘 → PermissionModel → 审批卡字段增强 → Kill Switch 组合。

ROUND_PERMISSION-SCOPE（2026-11-23 傍晚，收敛为第一阶段）:
- 用户决定：路线图（P0–P3）任务量过大，**当前只做第一阶段**，其余阶段暂不排期。
- TASKS.md：删除整张路线图表，DOING 仅保留 **P1-020 审批审计落盘**（JSONL + 脱敏 + 轮转，不改审批行为）。
- PERMISSION_SYSTEM_PLAN.md 顶部标注为「参考路线图」，P1/P2/P3 等验收后再逐条确认。
- PROJECT_STATUS / WEB_AI_SESSION 同步收窄；恢复卡 HEAD 更新为 2c4d7e8。

ROUND_PERMISSION-SYNC（2026-11-23 傍晚，补读完整草案并同步文档）:
- 完整草案已到位：`D:\桌面\桌宠文件备份\FJK_Agent_\这次直接在聊天里把整份草案重新整理，不生成文件。.docx`
  （932 段 / 约 1.28 万字，22 章：组合式模型、L0–L4 细则、四层 Scope 与交集原则、临时授权、四种审批模式、
  审批 11 字段与 7 状态、终端/桌宠联动、Git/Blog 风险表、Windows 命令多层控制、审计 15 字段与安全中心、
  Kill Switch 边界、Agent 状态机、OpenClaw 集成要求、§18 落地协议、§19 七个验收场景、§21 十四条铁律）。
- 已同步：
  - `PERMISSION_SYSTEM_PLAN.md` 来源补完整草案；OPEN #1 关闭（风险细则/Scope 交集/Grant/审批字段/KS 边界/验收场景均已具备）。
  - `DECISIONS.md` 新增 **ADR-007：权限系统分期**（当前只排期第一阶段 P1-020，其余暂缓；边界 MUST 记录）。
  - `MODULE_MAP.md` 新增 10 行：CommandPolicy（已有）、exec_policy.rs（已有）、审批链路（已有）、
    审计/Risk Engine/Scope Manager/Grant Manager/桌宠审批卡/安全中心（Planned 或 deferred）。
- 范围不变：当前仅 P1-020 审批审计落盘（只加记录，不改审批行为）。

ROUND_PROVIDER-CATALOG（2026-11-23 晚，API 切换漏洞修复）:
- 漏洞：内置 provider 保存密钥后 /models 成功但从不回写 models.providers.<id>.models[]，
  导致"密钥写成功但模型无法设默认/切换"（日志：no matching models.providers["deepseek"].models[] entry）。
- 修复 A（`e16d63d`）：新增 Rust `provider_catalog.rs` → `openclaw_merge_provider_models`，
  读-合并-写（保留人工条目，只追加缺失 id，上限 50，id 白名单）；保存密钥成功后自动登记，状态栏显示新增/保留数量。
- 修复 B（`19eded9`）：新增 `system/defaultModelSync.ts`（debounce 3s + single-flight），
  「保存模型」= 立即 sessions.patch（当前会话）+ 后台异步写 agents.defaults.model.primary；
  移除「设为全局默认」按钮。实测：点击后 1–2 秒返回，约 3 秒后全局默认更新。
- 探测结论：`config.schema` / `config.get` / `config.schema.lookup` 可用；但 config.patch 的 4.6–7.5s
  是网关服务端耗时（非 CLI 启动），因此没有迁 RPC，改用后台异步。
- 用户实测通过：连续两次保存不同模型，全局默认随之切换；deepseek models 三项目录条目保持合并未被覆盖
  （20:47 实测 default=deepseek/deepseek-v4-flash，models=deepseek-flash,deepseek-v4-pro,deepseek-v4-flash）。
- 下一步（未开始）：R1 审批卡恢复（P0）→ R2 watchdog 在 approval-wait 暂停 → R2 停止语义 → R3 已完成。

ROUND_APPROVAL-CHAIN（2026-11-23 晚，R1/R2 修复实测）:
- R1 审批卡：`cea1a7b` 回归删除的 consumer 已恢复（`9e08cbb`），展示命令/过期时间 + 允许一次/拒绝，busy 与错误提示。
- R2-A 看门狗：第一版用 `execution.wait.kind=approval` 实测无效（抓包证明网关不发 execution 事件），
  改为 `session.approval` pending/terminal 驱动 `pauseWatchdog/resumeWatchdog`（`01a61f9`）。
- 实测证据：requested 13:23:01.913 → decided 13:29:27.234（**385 秒**），result=allowed、decision=allow-once、reason=user，
  期间无 cancelled（修复前 86 秒即 cancelled）。
- R2-B 停止语义：adapter 在 abort 时发送 `chat.abort {sessionKey, runId}`（`6166ee6`）；
  网关日志出现 `chat.abort requested`，对应审批 `settled=cancelled`。
- 剩余：P1-034 重连/启动补拉 pending 审批（已实测订阅不重放，需主动查 `exec.approval.list`）。

ROUND_APPROVAL-P034（2026-11-23 晚，审批链路闭环）:
- 实现 `syncPendingApproval()`（`9394c95`）：主动查 `exec.approval.list`，恢复当前会话的 pending 审批；
  调用点：启动订阅成功 / 自动重连成功 / 切换会话成功。按 approvalId 去重，找不到则清理失效卡片。
- 实测：21:37:53 发起审批（fjk-reconnect-test，id=4d0fb42b）→ 关闭应用 → 重开 → 卡片自动出现，用户确认「有」。
- 至此 R1/R2 全链路闭环：审批卡（9e08cbb）、审批等待暂停看门狗（01a61f9，实测 385 秒）、
  停止即中止远端（6166ee6）、重连补拉（9394c95）。
- 遗留可选：清理调试期创建的 scratch 会话；下一阶段（风险引擎/Scope/Grant）按用户决定暂不排期。

ROUND_PERMISSION-P1（2026-11-23 深夜，权限系统 P1 阶段完成）:
- 本轮落地（全部已推送）:
  - `515599d` Global 策略文件 `%APPDATA%\com.fjk.agent\policy.json`（allow/deny/protected 可覆盖，无效回退默认）
  - `3a64f27` Project Scope（`projectRoots`）：跨项目只读→审批、跨项目写删→拒绝
  - `c119ad0` FJK 自建 Grant（`grants[]`，30 分钟有效期，不可覆盖 deny）+ 审批卡「允许并记住 30 分钟」
  - `2f7a530` 桌宠审批卡（与终端共享 approvalId）
  - `353350c` 设置里一键「打开文件 / 打开目录」+ 小白说明文案
  - `af09b0d` 重载日志增加 roots/grants 字段
  - `440ee4c` 自动放行/拒绝时不再闪现审批卡（只有真正需要人工时才弹）
- 实测证据：22:37:52 `Policy reloaded source=file; allow=17; deny=14; protected=7; roots=1; grants=0`
  → projectRoots 已生效（roots=1）。
- 原生 grants 只读契约已确认：`exec.approval.grants.list` / `revoke{grantId}` 可用；
  但 OpenClaw 只允许「自动化任务」创建 grant，交互式无法创建 → 采用 FJK 自建 + 原生只读（C 方案）。
- 用户决定：**验证到此暂停，暂不继续下一阶段**（P2 安全中心 / P3 Git·Blog 细分待定）。
- 遗留：`%TEMP%` 下测试目录 fjk-* 可手工清理；调试期创建的 scratch 会话可清理。

ROUND_NONEXEC-BOUNDARY（2026-11-24 早，文件工具越界漏洞修复）:
- 验证（只读探测）：`write` 工具原先可写 `D:\pet-desp\.tmp\write-probe.txt`，全程无审批 → 项目范围保护可被绕过。
- 受控实验（用户批准，配置已备份 `openclaw.json.bak-20261124-cwdtest`）：
  - 设 `agents.entries.main.cwd = "D:\\pet-desp"`（coding 工具工作目录）
  - 设 `tools.fs.workspaceOnly = true`（文件工具限制在 workspace 边界内）
- 实测结果：
  - 项目内写入 `D:\pet-desp\.tmp\c-test.txt` → ✅ 成功
  - 跨项目写入 `C:\Users\付家康\.dsh\c-test-outside.txt` → ❌ 被拒
    （错误原文：`Path escapes sandbox root (D:\pet-desp): ...`）
  - 人设/记忆文件仍在 `~/.openclaw/workspace`（SOUL.md / AGENTS.md / MEMORY.md 均存在，未迁移）
- 结论：漏洞已堵；文件工具受 OpenClaw 会话边界约束（无审批卡，越界直接拒绝）。
- 文档：`PERMISSION_SYSTEM_PLAN.md` OPEN #6 关闭、差距表更新；`TASKS.md` 新增 P1-059 DONE。
- 配置当前保持修复状态（未回滚）；如需回滚：恢复 `openclaw.json.bak-20261124-cwdtest`。


ROUND_UI-V02-AND-PANEL-LAG（2026-11-24 上午，UI v0.2 整合 + 卡顿修复）:
- 4666c1d feat(ui): 整合 Living Workspace v0.2（App / Sidebar / Welcome / LivingWorkspace.css；DesktopTerminal 三处桥接；桌宠位置一次性迁移）。
- 后续修复：
  - 桌宠「消失」根因＝pet-stage 坐标系被缩进侧栏（288px），而 PetInteractionController 按视口存取位置 → CSS 恢复 inset:0 + 一次性清旧坐标。
    证据：localStorage fjk-blog-pet-position-v1 = {xRatio:0.7298, yRatio:0.0948}。
  - 面板「点开再点不关闭」根因＝桥接 hook 用 setXxx(panel===...) 赋值而非 togglePanel → 改用 togglePanel，deps 改为 [togglePanel]。
  - 欢迎页横向滚动条根因＝.fjk-pet-scenery right:-5% → overflow-x: clip + terminal-messages overflow-x: hidden。
- 面板卡顿（本轮）：
  - 根因①：设置面板打开时，同步命令 openclaw_status 在主线程执行 cmd /C openclaw --version（0.5–2s 冻结）→ 改为 async + spawn_blocking。
  - 根因②：61KB 单组件整树重渲染 → 检测结果 60s 缓存 + 轮询 8s→30s + sessions.list 结果去重不 setState。
- 验证：tsc 0 / cargo check 0 / vite build PASS；实际体感待装包验证（VERIFY）。
- 新主线：Windows 首启安装向导（4 个 Phase，见 TASKS.md）；决策：Gateway 自动拉起、Node 缺失引导下载、面向普通用户。


ROUND_GATEWAY-AUTOSTART（2026-11-24 晚，Gateway 自动拉起 Phase A–C）:
- 现状核对（计划书 626 行 vs 代码）：仅「连上之后的断线重连」一致（退避 1/2/4/8/15s + epoch + 重连后恢复会话/订阅/审批）；
  计划核心「Gateway 未启动 → 自动拉起 → 就绪 → 连接」完全缺失；boot 连接失败直接进 Mock 且不重试；5 次重连失败即放弃并要求重启 App。
- 本轮实现：
  - 新增 `src-tauri/src/gateway_launch.rs`：`gateway_ensure_running` — 端口探测复用 / 未运行则 `cmd /C openclaw gateway start`（CREATE_NO_WINDOW，stdout/stderr 落 gateway-launch.log）/ 20s 轮询就绪；tokio 单飞锁；PID 文件含 pid+startedAtMs。
  - `onboarding::find_cli` 提升为 `pub(crate)` 复用；`lib.rs` 注册模块、状态与命令。
  - 前端 `system/gatewayLaunch.ts` 包装 invoke；`usePetRuntime` boot 路径改为 `connectWithAutoStart()`：首次握手失败 → 状态「正在启动 OpenClaw Gateway…」→ ensure → 再握手一次。
  - 连接面板新增「启动 / 重试 Gateway」按钮（复用 invoke，显示 reused/started/失败原因）。
- 验证：tsc 0 / vite build PASS / cargo check 0。运行时行为待实测（VERIFY）。
- 已知未做：重连路径未接 ensure；托管进程停止与清理未做；错误分类仅在日志/按钮提示；计划书 §14 17 项测试矩阵未跑。


ROUND_GATEWAY-AUTOSTART-V2（2026-11-24 晚，冷启动误判失败修复）:
- 现象：重启电脑后打开 FJK 报 `Gateway auto-start failed: start_timeout`（20s 未监听 18789）。
- 根因（三方日志对齐，~/.openclaw/tmp/openclaw/openclaw-2026-11-24.log）：
  - `openclaw gateway start` 在 Windows 上走 `cmd → 登录项/Startup VBS → gateway.cmd → node`，发起后约 20s node 才开始加载；
  - node 启动到 `http.bound` 实测 21.5s（process.bootstrap 一项 14s），冷启动总耗时约 32s，远超我们 20s 超时；
  - 超时后 boot 路径直接降级 Mock 且 `reconnectEnabledRef` 未启用 → 网关后来起来了应用也不会连，必须重启应用。
- 修复（1+2+3+4）：
  - Rust `gateway_ensure_running` 改为「发起启动后立即返回」，新增 `gateway_probe`（只读 TCP 探测）；
  - 优先直接运行 `%USERPROFILE%\.openclaw\gateway.cmd`（省掉 CLI 链路约 20s），不存在回退 `openclaw gateway start`；
  - 120s 内重复 ensure 视为「启动中」，避免拉起第二个实例；PID/file 记录 phase=started|reused，成功时用 netstat 反查真实 PID；
  - 前端 `connectWithAutoStart` 改为轮询：每 3s probe，最多 180s，成功即握手；UI 显示「正在启动 OpenClaw Gateway… 已等待 N 秒」。
- 验证：cargo check 0 / tsc 0 / vite build PASS / NSIS 重新打包成功（35.18 MiB）。
- 待实测：重启电脑后打开应用是否 12–25s 内自动连上（VERIFY）。
