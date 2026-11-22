# Web AI 会话恢复卡

> 用途：换任何网页 AI 窗口、或聊天记录丢失后，把它作为第一条消息（或让它先读本文件）即可恢复工作模式与项目进度。
> 原则：**以仓库为准，不相信记忆**。

## 一、给新窗口的第一条消息（复制即用）

```text
你是本项目的远程开发指挥。请先读：
https://raw.githubusercontent.com/jiashuaifu13-blip/fjk-agent-desktop/main/.ai-context/WEB_AI_SESSION.md

读完后用 5 行以内复述：当前 HEAD、已完成到哪个任务、当前任务、下一步第一步。
然后只给下一步 STEP 的一条命令，不要一次给多步。

工作方式：你给命令，我在 Windows PowerShell 5.1 执行；本地另有一位验证助手检查构建与文件，
我只会把【本地检查 · STEP N】摘要贴给你，不要要求完整终端输出。
```

## 二、项目事实

- 仓库：`https://github.com/jiashuaifu13-blip/fjk-agent-desktop`（public）
- 本地路径：`D:\pet-desp`
- 技术栈：Tauri 2 + React 18 + TypeScript + Rust；桌宠 runtime 来自 Deepseek-pet
- 分支：`main`
- 环境：Windows 11、Windows PowerShell 5.1、Node 18+、Rust stable、本地 OpenClaw Gateway（`ws://127.0.0.1:18789`）

## 三、当前状态（2026-11-21 22:40 更新）

- 实时状态以 `STATE.md` 为准（含 `STATE_ID` / `HEAD_AT_SYNC` / 任务 / 未验证项）；
- 未提交改动：无
- 当前任务：**P1-014 新建/删除会话**（STEP 1b 已通过本地验收，代码改动待提交；状态以 `STATE.md` 为准）

  已完成且实测：

  | 功能 | 状态 |
  |---|---|
  | Approval（allow/deny） | 已验证：allow 执行 whoami；deny user-denied、命令未执行 |
  | Connection State | 已验证：徽标/字段/最近错误/重连说明 |
  | Log Viewer | 已验证：最近 200 条、展开/关闭/清空、订阅 approvals=true |
  | Settings 只读概览 | 已验证：模型/工具数量/当前 Session/总数，缺失显示「未提供」 |
  | Settings 模型修改 + 单次回滚 | 已验证：`sessions.patch {key, model}`，deepseek-flash→deepseek-chat→回滚 |
  | Session 只读列表 | 已验证：MAIN/SESSION、key、时间、当前使用 |
  | Session 切换 | 已验证：先订阅新 key 再退订旧 key，adapter 换 key |
  | UI 布局 | 已验证：聊天区内部滚动、输入框固定、四面板互斥悬浮 |

  未验证：快速失败瞬时事件（开代理表现为挂起，非秒失败）。

- 下一步：从上面的候选里选一个，不要再重复验证已完成项。

## 四、已完成（P1-001 ~ P1-005）

| 编号 | 内容 | 证据 |
|---|---|---|
| P1-001 | Rust 侧 Gateway 通道（`src-tauri/src/gateway.rs`，4 个命令，token 不下发前端） | 真实对话 |
| P1-002 | Gateway 错误映射 + 未授权/离线 UI | 断言通过 |
| P1-003 | 事件驱动 AgentState（Reducer + ChatController 去直写 + runtime 唯一 Agent→Pet 链 + 断线 UI） | 单测 10/10、T1–T4 |
| P1-004 | release 构建回归（`npm run tauri build`，exe 20.24 MB） | 启动/连接/对话/退出 |
| P1-005 | NSIS 安装包回归（setup 13.22 MB，安装/运行/对话/卸载） | 安装 exit 0、runId `0c46a932`、卸载清理 |

## 五、未完成与已知问题

- Approval UI：桌面端尚无审批卡片；客户端 caps 已加，待验证事件是否到达。
- 无自动重连：断线后需重开桌面端。
- MSI 安装包、代码签名、自动更新未做。
- 已知缺陷（已记录、**暂不修**）：`GatewayChatAdapter` 先 `chat.send` 后订阅事件，run 秒失败会漏 `lifecycle error`，UI 可能卡 `thinking`。

## 六、硬规则（踩过坑，别重复）

1. **一次一个 STEP**，格式：目标 / 为什么 / 执行 / 预期 / 回传 / 风险。
2. 命令必须兼容 **Windows PowerShell 5.1**：不要用 `??`、`&&`、`||`、三元运算符。
3. **改中文文件**只能用完整文件 + UTF-8，或 Base64；写后自检 `???` 必须为 0，出错立即 `git checkout -- <文件>`。
   **禁止**用 `Get-Content`/`Set-Content`/`-replace` 直接改含中文的文件（会写坏）。
4. **不要用 `git apply` 打补丁**（上下文经常不匹配）；改用整文件替换。
5. 卡巴斯基会拦 Rust 新生成的 build script（`os error 5 / 32`）：删除对应 `target\debug\build\<crate>` 后重试一次，仍失败则加 `target` 排除项。
6. **代理冲突**：系统代理 `127.0.0.1:7897` 开着 → GitHub 可推，但 OpenClaw 触发 `SsrFBlockedError`（模型秒失败）；关着 → 模型正常但推 GitHub 失败。建议切 TUN 模式。
   - 打包/推送阶段可开代理；运行对话验证前必须关。
7. 不改 identifier / productName / version；不签名；不改 OpenClaw Core。
8. 提交信息用 `feat:` / `fix:` / `docs:` / `chore:`；不 force push。

## 七、验证约定

- 本地验证助手会检查：git 状态、`tsc`、`node --test packages/agent-state/*.test.mjs`、关键符号与文件内容、`???` 编码。
- 网页端只需要依赖【本地检查 · STEP N】摘要（结论 / 证据 / 下一步），不要索要完整日志。
- 未验证的内容必须标「未验证」，不得写成已验证。
- **输出纪律与精简 STEP 格式以 `.ai-context/START_HERE.md` 第八节为准**：说明文字 ≤10 行、代码照给不减料、一次一个 STEP。

## 八、下一步

1. 新建 / 删除会话（写操作，风险较高；删除前必须二次确认）——**进行中**：STEP 1b 已通过本地验收，待提交与 STEP 2。
2. ~~自动重连~~ —— 已完成（P1-013，已实测）。
3. Settings 更多项（工具开关、执行模式展示）。
4. （可选）快速失败的确定性复现；MSI / 签名 / 自动更新。

## 九、命令索引规范（本地验收依赖，2026-11-22 起）

> 目的：让本地验证助手用**一条 grep 或一行日志**就能核验每条命令，减少往返与 token。

1. **判定行**：每条命令最后必须输出唯一判定行 `TAG=PATCH_OK` / `TAG=PATCH_FAIL <code>`，并附退出码。
2. **自证行**：每条命令输出 1 行 `KEY=VALUE`（例：`SESSION_ID_FIELD_COUNT=2`、`hits=2`），作为可机读证据。
3. **字面量预期**：预期写成具体值（`hits=2`、`sessionId: 46aa601f`），不写「应显示真实值」这类需推断的描述。
4. **一命令一目标**：禁止用 `;` / `&&` 串联多步；失败时必须能归因到单条命令。
5. **同号约定**：`-Tag` = STEP 号 = 日志文件名（`step1b` ↔ `tag=C1b` ↔ `C1b_PATCH_OK`）。
6. **归因标签**：环境类失败标 `ENV_BLOCK`（`spawn EPERM`、代理 7897 开启），与代码 FAIL 分开。
7. **影响面声明**：注明改哪些文件、是否写 git、是否联网、是否 `NEED=FULL_ACCESS`、是否 `GUI=USER`。
8. **GUI 项**：必须同时给数据层证据（Gateway 行数/字段数），否则回传只能写「数据满足，界面待确认」。

**回传模板（网页 AI 按此索取）**：

```text
【本地检查 · STEP N】
结论：通过 / 有条件通过 / 阻塞
C<step>.1=<判定行>  C<step>.2=<判定行>
build=PASS / FAIL
<KEY>=<VALUE>
```

