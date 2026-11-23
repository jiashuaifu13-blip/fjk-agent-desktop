# FJK Agent 权限与审批系统｜本阶段开发计划

> 文档 ID：FJK-PLAN-PERMISSION-PHASE1
> 版本：v0.1（待确认）
> 日期：2026-11-23
> 来源：`FJK_Agent_\PERMISSION_READING_GUIDE.md`、`PERMISSION_DESIGN_OVERVIEW.md`、
> **完整草案**（`这次直接在聊天里把整份草案重新整理，不生成文件。.docx`，2026-11-23 校核，932 段/约 1.28 万字）
> 依据：仓库现状核查（代码 / 文档 / OpenClaw 2026.11.6 实测）
> 状态：**参考路线图**。当前排期只含第一阶段（P1-020 审批审计落盘）；P1/P2/P3 等第一阶段验收后再逐条确认。

---

## 0. 阅读与核查声明

- 已按指南完成 Planning 模式所需动作：读设计资料 → 查仓库代码 → 实测 OpenClaw 接口 → 输出差距 → 制定计划。
- 完整设计草案 `FJK_Agent_权限与审批系统设计草案.md` **未随资料提供**，本文所有带 `OPEN` 的条目需等草案补齐后复核。
- 本文不把 `PROPOSED`（L0–L4、四层 Scope、四种模式、模块划分）当作已定案；它们在本计划中作为**待验证的候选方案**逐步落地。
- 本文不修改 OpenClaw；所有底层执行与安全仍由 OpenClaw 承担（MUST）。

---

## 1. 现状盘点（EXISTS / PARTIAL / MISSING / VERIFY）

| 能力 | 当前实现 | 位置 | 判定 |
|---|---|---|---|
| 审批事件接收 | `session.approval`（phase=pending/terminal，含 `presentation.commandText`） | `runtime/usePetRuntime.ts` | **EXISTS**（实测抓包确认结构） |
| 审批决策提交 | `exec.approval.resolve {id, decision: allow-once/deny}` | `resolveApproval` | **EXISTS**（实测可解析；异常需回归） |
| 命令级风险分级 | `CommandPolicy`：allow / deny / ask + 受保护路径 + 严格模式 | `policy/CommandPolicy.ts` | **PARTIAL**：按**命令字符串**判定，无 Operation/Resource/Scope |
| 只读自动放行 | 命中 allow 规则且无管道/重定向 → 自动 allow-once | `CommandPolicy.classify` | **EXISTS** |
| 危险命令拒绝 | 12 条 deny 规则（rm -rf、del /f、format、shutdown、force push…） | 同上 | **EXISTS**（规则级，非风险等级） |
| 受保护路径 | `.git/ .ai-context/ .openclaw/ node_modules/ target/ Windows/ Program Files` | 同上 | **EXISTS**（仅拦非只读命令） |
| 严格模式 | 全部命令人工确认 | 同上 + 设置行 | **EXISTS** |
| 限时自动批准 | 本地 30 分钟计时（localStorage），危险命令仍拒 | 同上 | **PARTIAL**：非 OpenClaw grant，不可审计、不可撤销除计时外 |
| 审批 UI（终端） | 审批卡片、命令文本、允许/拒绝 | `DesktopTerminal.tsx` | **EXISTS** |
| 审批强提示 | 窗口注意请求 + 聚焦 | `notifyApproval` | **EXISTS** |
| 执行权限可视 | 模式 / security+ask / 白名单条数 / 告警 | 设置面板 + `exec_policy.rs` | **EXISTS** |
| 执行模式切换 | `openclaw config set tools.exec.mode`（ask/auto，auto 二次确认） | `exec_policy.rs` | **EXISTS** |
| Kill Switch | 仅 `sessions.abort {key, clearQueued}` | `abortSession` | **PARTIAL**：会话级，未覆盖“阻止新请求/关闭待审批”语义 |
| 审计 | 运行日志（内存 200 条，重启清空） | Log Viewer | **MISSING**（无持久化，无审批-执行关联） |
| 风险等级 L0–L4 | 无；只有 allow/deny/ask 三档 | — | **MISSING** |
| Operation / Resource 抽象 | 无；仅命令字符串 | — | **MISSING** |
| 四层 Scope（Global/Agent/Project/Task） | 无 | — | **MISSING** |
| Grant 生命周期 | 无（本地计时替代） | — | **MISSING** |
| 桌宠审批卡 | 无（桌宠只有情绪/气泡） | `PetView.tsx` | **MISSING** |
| Git / Blog 操作细分 | 无 | — | **MISSING**（后续阶段） |

### 1.1 OpenClaw 能力实测（2026.11.6，本机网关）

| 接口 | 结果 | 备注 |
|---|---|---|
| `session.approval` 事件 | ✅ 可用 | `approval.presentation = {kind:'exec', commandText, host, allowedDecisions:['allow-once','deny']}` |
| `exec.approval.resolve` | ✅ 可用 | 参数 `{id, decision}` |
| `exec.approvals.get` | ✅ 可用 | 返回 defaults(security/ask/askFallback) + agents{} + socket + hash |
| `exec.approval.grants.list` | ✅ 可用 | 当前 `grants: []` |
| `exec.approval.grants.revoke` | ✅ 存在 | 未实测 |
| `exec.approvals.set` | ⚠ **VERIFY** | 方法存在，写入 schema 与 hash 对比语义未验证 |
| `sessions.abort` | ✅ 可用 | `{key, clearQueued}`，实测可解除卡死 |
| `tools.effective` | ✅ 可用 | 返回 `profile: full`、64 个工具、`toolAccess`（含 exec=available） |
| `tools.invoke` | ⚠ **VERIFY** | 存在，但直接调用 exec 返回 `Tool not available`（仅特定工具可调） |
| sandbox / 工作区隔离 | ⚠ **VERIFY** | 当前未配置 sandbox，`exec` cwd 默认 workspace |

> 关键结论：**审批链路（事件 → 决策）可用；风险分级与授权生命周期必须由 FJK 补齐；底层策略（allowlist、askFallback、auto review）由 OpenClaw 负责，FJK 只做前置判断与人机交互，不绕过。**

---

## 2. 差距分析与取舍（对照草案）

| 草案目标 | 现状 | 差距 | 本阶段取舍 |
|---|---|---|---|
| Tool/Operation/Resource 三元判断 | 仅命令字符串 | 缺 Operation/Resource 抽象 | **P0 建立最小模型**（先覆盖 exec/files/git） |
| L0–L4 风险分级 | 三档 allow/deny/ask | 缺等级与风险原因 | **P1 引入 L0–L4 映射**，先做 exec 与文件 |
| Global/Agent/Project/Task Scope | 无 | 全缺 | **P1 先做 Global + Project（路径）**；Agent/Task 后置 |
| Auto/AskOnce/AskEvery/Deny | allow/ask/deny + 限时自动 | 缺 AskOnce 的“范围+有效期”语义 | **P1 引入 Grant 雏形**（范围+过期+可撤销） |
| 审批结果与执行结果分离 | 审批状态与执行结果未关联 | 缺关联 ID | **P0 审计落盘时同时记录 approvalId + runId + result** |
| 终端与桌宠共享审批 | 仅终端 | 桌宠无审批卡 | **P2** |
| 审计持久化 | 内存日志 | 无 | **P0 JSONL 落盘（AppData）+ 脱敏** |
| Kill Switch | 会话 abort | 语义窄 | **P0 先做“停止运行 + 拒绝待审批”组合按钮** |
| Git/Blog 细分 | 无 | 全缺 | **P3** |

---

## 3. 阶段计划

> 依赖顺序：P0 → P1 → P2 → P3。每阶段结束需 `tsc` + `build` + 手工验收 + 提交推送。

### P0 基础闭环（低风险，先做）

| ID | 任务 | 涉及文件 | 验收标准 | 风险 |
|---|---|---|---|---|
| P2-001 | **审批审计落盘**：每次审批（请求/决策/结果）写 JSONL 到 `%APPDATA%\com.fjk.agent\approvals.jsonl`，字段：ts、approvalId、sessionKey、runId、tool、operation、resource、risk、decision、result、reason | `runtime/usePetRuntime.ts`、新增 `system/auditLog.ts` | 文件按天滚动；密钥/令牌被脱敏（正则 mask `sk-…`）；超过 5MB 轮转 | 低 |
| P2-002 | **审批卡信息增强**：卡片展示 Tool / Operation / Resource / 风险等级（先用规则推导，后续换风险引擎）/ 预计影响 | `DesktopTerminal.tsx`、`policy/CommandPolicy.ts` | 卡片能看到 5 个字段；命令过长折叠 | 低 |
| P2-003 | **Kill Switch（组合）**：一个按钮同时 `sessions.abort` + 拒绝所有 pending 审批 + 停止本会话后续发送 | 新增 `killSwitch()` | 点击后：会话 idle、pending 清空、日志记录触发原因 | 中（需避免误杀其他会话） |
| P2-004 | **审批信息与草案字段对齐**：引入 `PermissionRequest` 类型（tool/operation/resource/scope/risk/mode），先由 `CommandPolicy` 产出，作为后续扩展的单一入口 | `policy/PermissionModel.ts`（新） | 类型被卡片与审计复用；无行为变化 | 低 |

### P1 范围与授权（核心）

| ID | 任务 | 验收标准 | 风险 |
|---|---|---|---|
| P2-005 | **风险引擎 v1（L0–L4）**：把 allow/deny 规则改写为 `{risk, reason}`；exec 按 operation（读/写/删除/网络/系统）+ resource（路径类别）评分 | 现有 20 条规则全部映射到 L0–L4；`classify` 返回 risk+reason；卡片显示等级 | 中 |
| P2-006 | **Project Scope**：绑定项目根（`D:\pet-desp`），命令路径必须落在项目内（或显式允许） | 跨项目路径 → deny/ask；项目内只读 → allow；测试 5 例 | 中 |
| P2-007 | **Grant 雏形**：`Ask Once` 生成 `{scope, operation, resource, expiresAt}`，持久化到 `grants.json`，可撤销；与 OpenClaw `exec.approval.grants.*` 对齐（VERIFY 后决定是否双写） | 授权到期自动失效；撤销后立即 ask；审计记录 grantId | 中高（涉及 OpenClaw 语义，先 VERIFY） |
| P2-008 | **Global 策略文件**：`%APPDATA%\com.fjk.agent\policy.json` 覆盖默认规则（allow/deny/protected/risk 覆盖） | 修改后重启生效；非法 JSON 回退默认并提示 | 低 |

### P2 体验与联动

| ID | 任务 | 验收标准 |
|---|---|---|
| P2-009 | 桌宠审批卡（紧凑版：图标+命令摘要+允许/拒绝） | 与终端同一 approvalId，不重复审批；任一入口处理后另一入口同步消失 |
| P2-010 | 安全中心（只读）：最近 100 条审计、按风险/结果筛选、导出 | 数据来自 P2-001 文件；无明文密钥 |
| P2-011 | 拒绝原因回传 agent（便于它改写命令） | deny 时附带 reason，agent 能重试替代方案 |

### P3 场景扩展（暂缓，等前两阶段验收）

| ID | 任务 |
|---|---|
| P2-012 | Git 操作细分（status/diff=L0；add=L1；commit=L2；push=L3；force push/reset --hard=L4） |
| P2-013 | Blog 操作拆分（read/create_draft/publish/delete/config 分别授权） |
| P2-014 | 审计留存策略与合规（保留天数、大小上限、脱敏规则可配置） |

> 编号沿用现有 `P1-0xx` 体系冲突，本计划暂用 `P2-0xx` 前缀；**落库 `TASKS.md` 时统一改为项目现行编号（P1-020 起）**。

---

## 4. 与 OpenClaw 的边界（MUST）

1. FJK 只做**前置判断 + 人机交互 + 审计**；放行与否最终仍受 OpenClaw（`tools.exec.mode`、allowlist、askFallback、auto review、sandbox）约束。
2. FJK 的 allow 不能覆盖 OpenClaw 的 deny；OpenClaw 拒绝时 FJK 不得重试绕过。
3. 不自行修改 OpenClaw 的安全默认值（`tools.exec.mode` 等）而不经用户确认；auto 模式必须二次确认并显示“不会弹卡”告警（已实现）。
4. `exec.approvals.set` / `grants` 的写入在 VERIFY 通过前不落地，避免破坏 OpenClaw 审批状态。

---

## 5. 待确认（OPEN）

1. ~~完整设计草案未提供~~ → **已补齐（2026-11-23 docx 全文已读）**，风险分级细则（§四）、Scope 交集原则（§五）、
   临时授权机制（§六）、审批字段与状态（§八）、Kill Switch 边界（§十四）、第一阶段 7 个验收场景（§十九）均已具备。
2. `exec.approvals.set` 的 schema 与 hash 语义（是否可安全写 allowlist）。
3. `exec.approval.grants.*` 与 FJK 自建 Grant 的关系（双写 / 只读 / 替代）。
4. `tools.invoke` 的可用工具范围（能否做只读探测，避免消耗模型 token）。
5. 沙箱（sandbox）是否启用及对 exec cwd 的影响。
6. 桌宠审批卡的交互规范（草案只给了原则，没有形态）。

---

## 6. 立即可以开始的三件事（建议第一步）

1. **P2-001 审计落盘**：不改行为，只加记录，先把“审批-执行”关联数据留下
2. **P2-004 PermissionModel**：定义 `PermissionRequest`，让后续所有能力都走同一入口
3. **P2-002 卡片字段增强**：让用户第一次看到 Operation/Resource/Risk

---

## 7. 文档同步

- 本文件：设计资料 → 本阶段计划（唯一新增文档）
- `TASKS.md`：追加 P1-020 起的任务条目（下一步，待编号确认）
- `STATE.md`：记录本轮（PHASE1 计划制定）
- `PROJECT_STATUS.md`：更新「下一步」（权限系统 P0）
- `WEB_AI_SESSION.md`：当前任务改为权限系统 P0
