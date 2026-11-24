# FJK Agent 权限与审批系统｜本阶段开发计划

> 文档 ID：FJK-PLAN-PERMISSION-PHASE1
> 版本：v0.2（2026-11-24 按实际代码刷新进度）
> 日期：2026-11-24
> 来源：`FJK_Agent_\PERMISSION_READING_GUIDE.md`、`PERMISSION_DESIGN_OVERVIEW.md`、
> **完整草案**（`这次直接在聊天里把整份草案重新整理，不生成文件。.docx`，932 段 / 约 1.28 万字）
> 依据：仓库现状核查（代码 / 文档 / OpenClaw 2026.11.6 实测）
> 状态：**P0 + P1 已完成并实测；P2 部分完成；P3 暂缓**（用户 2026-11-23 决定暂停继续开发）

---

## 0. 阅读与核查声明

- 已按指南完成 Planning 模式所需动作：读设计资料 → 查仓库代码 → 实测 OpenClaw 接口 → 输出差距 → 制定计划。
- 完整设计草案已补齐并全文阅读（2026-11-23）。
- 本文不把 `PROPOSED`（L0–L4、四层 Scope、四种模式、模块划分）当作已定案；它们按阶段逐步落地。
- 本文不修改 OpenClaw；底层执行与安全仍由 OpenClaw 承担（MUST）。
- **v0.2 说明**：第 1、2 节已按当前代码重写；第 3 节任务表新增「状态」列；第 6 节为本轮实际交付记录。

---

## 1. 现状盘点（2026-11-24 按代码核对）

| 能力 | 当前实现 | 位置 | 判定 |
|---|---|---|---|
| 审批事件接收 | `session.approval`（pending / terminal，含 `presentation.commandText`） | `runtime/usePetRuntime.ts` | **EXISTS**（实测抓包） |
| 审批决策提交 | `exec.approval.resolve {id, decision}` | `resolveApproval` | **EXISTS**（实测）；**拒绝时不带原因** |
| 命令级风险分级 | allow / deny / ask + 受保护路径 + 项目范围 + grant + 严格模式 | `policy/CommandPolicy.ts` | **EXISTS** |
| 风险等级 L0–L4 | `describeCommand` 推导 operation / resource / risk（含 L4：format、diskpart、force push、rm -rf 等） | `system/auditLog.ts` | **EXISTS**（8 例单测通过） |
| 只读自动放行 | 命中 allow 且无管道/重定向 → 自动 allow-once | `CommandPolicy.classify` | **EXISTS** |
| 危险命令拒绝 | 14 条 deny 规则（rm -rf、del /f、format、shutdown、force push…） | 同上 | **EXISTS** |
| 受保护路径 | `.git/ .ai-context/ .openclaw/ node_modules/ target/ Windows/ Program Files` | 同上 | **EXISTS** |
| 项目范围（Project Scope） | `projectRoots`：跨项目只读→ask，跨项目写删→deny | `CommandPolicy.checkProjectScope` | **EXISTS**（实测 `roots=1`） |
| 授权（Grant） | FJK 自建 `grants[]`（30 分钟、到期失效、不覆盖 deny）+ 审批卡「允许并记住 30 分钟」 | `policy/CommandPolicy.ts` + `system/appPolicy.ts` | **EXISTS**（原生 grant 只能读/撤销） |
| 全局策略文件 | `%APPDATA%\com.fjk.agent\policy.json`（allow/deny/protected/projectRoots/grants）+ 模板/重载/打开 | `system/appPolicy.ts` + `src-tauri/src/policy_file.rs` | **EXISTS** |
| 严格 / 分级模式 | 严格=全部人工；分级=只读自动、危险拒绝、其余人工 | 同上 + 设置行 | **EXISTS** |
| 限时自动批准 | 本地 30 分钟计时，危险命令仍拒 | 同上 | **PARTIAL**（非 OpenClaw grant） |
| 审计持久化 | `approvals.jsonl`（requested/decided/settled/grant，脱敏 + 5MB 轮转） | `system/auditLog.ts` + `src-tauri/src/audit_log.rs` | **EXISTS**（实测多轮，0 非法 JSON） |
| 审批 UI（终端） | 卡片显示命令 / operation·risk / 目标路径 / 过期时间 / 允许 / 允许并记住 30 分钟 / 拒绝 | `DesktopTerminal.tsx` | **EXISTS** |
| 审批 UI（桌宠） | 紧凑卡（风险 + 命令摘要 + 允许/拒绝），与终端共享 approvalId | `PetView.tsx` + `App.css` | **EXISTS** |
| 审批强提示 | 窗口注意 + 聚焦 | `notifyApproval` | **EXISTS** |
| 卡死兜底 | 首字 90s 看门狗，**等审批时暂停**（由 `session.approval` 驱动） | `ChatController` + runtime | **EXISTS**（实测等 385 秒未误杀） |
| 停止语义 | 本地 abort + `chat.abort {sessionKey, runId}` 中止远端 run | `GatewayChatAdapter` | **EXISTS**（日志 `chat.abort requested`） |
| 重连恢复审批 | 启动 / 重连 / 切会话时查 `exec.approval.list` 补拉 pending | `syncPendingApproval` | **EXISTS**（实测关应用重开卡片自动出现） |
| 会话级强停 | `sessions.abort {key, clearQueued}` | `abortSession` | **EXISTS** |
| Kill Switch（组合） | 需要「一键中止 + 拒绝所有 pending + 阻止后续发送」 | — | **PARTIAL**（缺组合按钮） |
| PermissionRequest 统一模型 | tool/operation/resource/scope/risk/mode 单一入口 | — | **MISSING** |
| 安全中心 | 审计查询 / 按风险筛选 / 导出 + 原生 grants 只读 | — | **MISSING** |
| 拒绝原因回传 | deny 只回 `operator declined` | — | **MISSING** |
| Git / Blog 操作细分 | — | — | **MISSING**（P3 暂缓） |
| 审计留存策略 | 固定 5MB 轮转，保留天数/脱敏规则不可配 | — | **MISSING**（P3） |

### 1.1 OpenClaw 能力实测（2026.11.6）

| 接口 | 结果 | 备注 |
|---|---|---|
| `session.approval` 事件 | ✅ 可用 | `presentation = {kind:'exec', commandText, host, allowedDecisions:['allow-once','deny']}` |
| `exec.approval.resolve` | ✅ 可用 | `{id, decision}`；**不支持附带原因** |
| `exec.approval.list` | ✅ 可用 | 用于重连补拉 pending（实测订阅不重放） |
| `exec.approvals.get` | ✅ 可用 | defaults(security/ask/askFallback) + agents{} + hash |
| `exec.approvals.set` | ⚠️ **VERIFY** | 需 `{file}`，写入 schema 与 hash 语义未实测 |
| `exec.approval.grants.list` | ✅ 可用 | 返回 `{grants: []}` |
| `exec.approval.grants.revoke` | ✅ 存在 | 参数 `{grantId}`，未实测撤销 |
| 原生 grant 创建 | ❌ 不可用（交互式） | 官方文档：仅「自动化任务 + Always allow」会铸造 grant |
| `chat.abort` | ✅ 可用 | `{sessionKey, runId}`，实测中止远端 run |
| `sessions.abort` | ✅ 可用 | `{key, clearQueued}` |
| `tools.effective` | ✅ 可用 | profile=full、64 工具、toolAccess（exec=available） |
| `tools.invoke` | ⚠️ **VERIFY** | exec 不可经此调用 |
| `config.schema` / `config.get` / `config.schema.lookup` | ✅ 可用 | `config.patch` 的 4.6–7.5s 是网关服务端耗时 |
| 非 exec 文件工具边界 | `agents.entries.main.cwd=D:\pet-desp` + `tools.fs.workspaceOnly=true` | `openclaw.json` | **EXISTS**（实测：项目内写入成功、跨项目写入被拒 `Path escapes sandbox root`） |
| 非 exec 工具的审批（write / apply_patch / browser / 插件） | 文件工具已由 OpenClaw 会话边界约束；**审批层仍不覆盖**（无卡片，靠边界拒绝） | — | **PARTIAL** |

---

## 2. 差距与取舍（更新）

| 草案目标 | 现状 | 差距 | 处理 |
|---|---|---|---|
| Tool/Operation/Resource 三元判断 | 由命令字符串推导 | 缺统一类型 | **P2-004 未做**（结构化能力的前置） |
| L0–L4 风险分级 | 已实现 | 与决策尚未融合（风险只展示/记录，不参与判定） | 可选增强 |
| Global/Agent/Project/Task Scope | Global（策略文件）+ Project（路径）已有 | Agent / Task 层缺失 | 后置 |
| Auto/AskOnce/AskEvery/Deny | Auto（分级）+ 限时 + 自建 Grant | AskOnce 语义已覆盖；AskEvery = 严格模式 | 基本满足 |
| 审批结果与执行结果分离 | 审计同记录 approvalId + result | 无“执行结果”独立字段（由 settled/工具结果间接体现） | 可选增强 |
| 终端与桌宠共享审批 | 已实现 | — | ✅ |
| 审计持久化 | 已实现 | 无查询界面 | **P2-010 未做** |
| Kill Switch | 有 abort + chat.abort | 缺组合急停 | **P2-003 部分** |
| Git/Blog 细分 | 无 | 全缺 | **P3 暂缓** |
| 非 exec 能力覆盖 | 文件工具已受会话边界约束（`cwd` + `fs.workspaceOnly`） | 仍无**审批卡**，边界外直接拒绝；browser/插件未验证 | **部分解决（2026-11-24）** |

---

## 3. 阶段计划与状态

> 状态标记：✅ 完成（已实测）/ ⚠️ 部分 / ❌ 未做 / ⏸ 暂缓

### P0 基础闭环

| ID | 任务 | 状态 | 证据 |
|---|---|---|---|
| P2-001 | 审批审计落盘（JSONL + 脱敏 + 轮转） | ✅ | `f38e24a`、`b232629`；实测 16+ 行 0 非法 |
| P2-002 | 审批卡信息增强（tool/operation/resource/risk/impact） | ⚠️ | `0ecd99c`；**缺 impact** |
| P2-003 | Kill Switch 组合（abort + 拒 pending + 阻止发送） | ⚠️ | 有 abort/chat.abort；缺组合按钮 |
| P2-004 | PermissionRequest 统一模型 | ❌ | — |

### P1 范围与授权

| ID | 任务 | 状态 | 证据 |
|---|---|---|---|
| P2-005 | 风险引擎 v1（L0–L4） | ✅ | `0ecd99c`；8 例单测 ALL_PASS |
| P2-006 | Project Scope | ✅ | `3a64f27`；实测 `roots=1`，跨项目写删拒绝 |
| P2-007 | Grant 雏形 | ✅（受限） | `c119ad0`；原生创建不可用（改为自建 + 原生只读） |
| P2-008 | Global 策略文件 | ✅ | `515599d`、`353350c`；模板/重载/打开 |

### P2 体验与联动

| ID | 任务 | 状态 | 证据 |
|---|---|---|---|
| P2-009 | 桌宠审批卡 | ✅ | `2f7a530` |
| P2-010 | 安全中心（审计查询/筛选/导出 + 原生 grants 只读） | ❌ | — |
| P2-011 | 拒绝原因回传 agent | ❌ | 实测 resolve 仅 `{id, decision}` |

### P3 场景扩展（暂缓）

| ID | 任务 | 状态 |
|---|---|---|
| P2-012 | Git 操作细分 | ⏸ |
| P2-013 | Blog 操作拆分 | ⏸ |
| P2-014 | 审计留存策略 | ⏸ |

### 计划外但已完成的修复（同阶段）

| 项目 | 提交 | 证据 |
|---|---|---|
| 审批卡 consumer 回归修复 | `9e08cbb` | 点允许/拒绝产生 decided |
| 等审批暂停看门狗 | `01a61f9` | 385 秒未 cancelled |
| 停止即中止远端 run | `6166ee6` | `chat.abort requested` |
| 重连补拉 pending 审批 | `9394c95` | 关应用重开卡片自动恢复 |
| 自动判定不闪卡 | `440ee4c` | 仅人工审批时弹卡 |

---

## 4. 与 OpenClaw 的边界（MUST）

1. FJK 只做**前置判断 + 人机交互 + 审计**；放行与否最终仍受 OpenClaw（`tools.exec.mode`、allowlist、askFallback、auto review、sandbox）约束。
2. FJK 的 allow 不能覆盖 OpenClaw 的 deny；OpenClaw 拒绝时 FJK 不得重试绕过。
3. 不自行修改 OpenClaw 的安全默认值而不经用户确认；auto 模式必须二次确认并显示“不会弹卡”告警（已实现）。
4. `exec.approvals.set` / 原生 `grants` 的写入在 VERIFY 通过前不落地。
5. FJK 的审批层当前只覆盖 `exec`；其他工具（文件 / 浏览器 / 插件）必须在其各自接入前不宣称“已受权限系统保护”。

---

## 5. 待确认（OPEN）

1. ~~完整设计草案未提供~~ → ✅ 已补齐。
2. `exec.approvals.set` 的 schema 与 hash 语义（是否可安全写 allowlist）。—— **OPEN**
3. ~~原生 grants 与自建关系~~ → ✅ 定为 C 方案（自建为主 + 原生只读/撤销；原生不可创建）。
4. `tools.invoke` 的可用工具范围。—— **OPEN**
5. 沙箱（sandbox）是否启用及对 exec cwd 的影响。—— **OPEN**
6. ~~非 exec 工具是否受 OpenClaw 会话权限约束~~ → ✅ **已确认并修复（2026-11-24）**：
   启用 `agents.entries.main.cwd="D:\pet-desp"` + `tools.fs.workspaceOnly=true` 后，
   `write` 可在项目内写、跨项目被拒（`Path escapes sandbox root (D:\pet-desp)`）；
   人设/记忆文件仍留在原 workspace（`~/.openclaw/workspace`），无需迁移。备份：`openclaw.json.bak-20261124-cwdtest`。
7. 多实例同时运行时的审批归属（同一网关多个客户端订阅）—— **OPEN（已观察到双实例现象）**

---

## 6. 下一步建议（未排期）

按影响排序：

1. **P2-011 拒绝原因回传**：deny 时通过可用通道把原因带回 agent（评估 `exec.approval.resolve` 是否支持 reason，或改走 `plugin.approval` / 会话消息）。
2. **多实例锁**：应用层单实例守护，避免两个客户端抢审批。
3. **P2-003 Kill Switch 组合**：一个按钮完成 abort + 拒 pending + 阻止发送。
4. **P2-010 安全中心**：只读审计查询/筛选/导出 + 原生 grants 列表与撤销。
5. **P2-004 PermissionRequest**：为博客等结构化能力铺路，与非 exec 审批通道一起设计。
6. P2-012 / P2-013 / P2-014：依赖前面完成后再评估。

> 用户决定（2026-11-23）：验证到此暂停，P2/P3 待定。
