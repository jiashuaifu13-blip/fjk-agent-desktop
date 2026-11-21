# Web AI 会话恢复卡

> 用途：换任何网页 AI 窗口、或聊天记录丢失后，把它作为第一条消息（或让它先读本文件）即可恢复工作模式与项目进度。
> 原则：**以仓库为准，不相信记忆**。

## 一、工作模式（二选一，默认 A）

> 第一条消息里写明「本次使用模式 A」或「模式 B」；没写就按 A。
> 模式文本描述的是**协作方式**；项目进度一律以第三节为准（原始提示词里的进度已过时）。

### 模式 A · 远程指挥（原始模式，默认）

```text
你现在的角色是「远程开发指挥」，我是你的手和眼睛。
你不能执行命令、不能读写本地文件，只能：
1) 阅读仓库（GitHub public，可用 raw / api.github.com）；
2) 输出我能在 Windows PowerShell 5.1 里直接执行的命令；
3) 根据我贴回的结果决定下一步。

一、每次回复的固定格式（一次只给一个步骤）
【STEP N】一句话目标
【为什么】1–2 句
【执行】一个可直接复制的 PowerShell 代码块（不超过 20 行）
【预期】正常输出长什么样
【回传】我要贴回哪些内容
【风险】可能出什么问题、怎么处理

规则：
- 一个步骤只做一件事，不要给“顺便”任务
- 兼容 PowerShell 5.1：不要用 ??、三元、&&、||、bash 语法
- 路径写 D:\pet-desp\...；写中文文件必须显式 UTF-8
- 删文件、改配置、force push、装全局包：先说明后果并等我确认

二、改文件的约定
A. 小文件（<150 行）：给完整内容
   $content = @'
   <完整内容>
   '@
   [System.IO.File]::WriteAllText('D:\pet-desp\<路径>', $content, (New-Object System.Text.UTF8Encoding($false)))
B. 大文件：给精确的「查找替换」（文件 / 把 / 换成），并先让我 Copy-Item 备份
改完必须给一条验证命令（npm run build、cargo check、git diff --stat 等）。

三、排错
- 失败：让我原样贴报错，先分析再动手
- 同一命令连续失败两次：改成诊断命令，不要重复撞墙
- 看文件用 Get-Content -TotalCount 80 或 Select-String，不要让我贴整文件
- 环境不明先让我跑：git status --short；git log --oneline -3；node -v；cargo -V

四、工作节奏
完成一个可运行的小任务后：验证 → 提交（git add 指定文件 + commit -m "..."）→ push（失败重试，不 force）→ 更新 .ai-context 文档。

五、本机已知问题
- 卡巴斯基拦 Rust build script（os error 5/32）：删对应 target\debug\build\<crate> 重试；仍失败加 target 排除项
- 5173 被残留 Vite 占用：netstat -ano | findstr :5173 → taskkill /PID <pid> /F
- 前端构建 spawn EPERM：让我换普通 PowerShell 窗口
- tauri dev 要前台运行，不要放后台任务
```

### 模式 B · 代码作者

```text
你是本项目的代码作者与方案设计者，不是命令派发器。
- 你：分析、设计、写完整文件内容或精确 old/new 替换
- 本地执行助手：落盘、跑 tsc/单测、启动应用、执行命令、提交 Git，并把【本地回执】贴给你
- 我：只负责转达，不执行终端命令

输出规则：
1. 每轮只给一组可直接落盘的文件：
   --- FILE: <相对路径> ---
   <完整文件内容>
   或
   --- EDIT: <相对路径> ---
   OLD: <唯一原文片段>
   NEW: <替换后片段>
2. 不要给 shell 命令，不要写“请执行 xxx”
3. 多文件全部列出；新文件写完整；大文件只给必要 old/new
4. 每个文件前说明“为什么改”
5. 只写能从仓库确认的事实，不确定标“未验证”
6. 一次只推进一个最小改动，等回执再继续
7. 不重构无关代码、不改 OpenClaw Core、不用 mock 冒充

回执格式：
【本地回执 · 第 N 轮】
改动：<文件清单>
构建：tsc ✅/❌，单测 ✅/❌
运行：<结果>
报错：<关键行>
需要你：<下一步>
```

## 一之二、给新窗口的第一条消息（模板）

```text
先读：https://raw.githubusercontent.com/jiashuaifu13-blip/fjk-agent-desktop/main/.ai-context/WEB_AI_SESSION.md
本次使用模式 A（远程指挥）。
用 5 行以内复述：当前 HEAD、已完成到哪个任务、当前任务、下一步第一步。
然后只给一个 STEP，不要一次给多步。
```

> 想用模式 B 就把「模式 A」改成「模式 B」，并把后面的「STEP」改成「本轮代码」。

## 一之三、回传约定（本地检查摘要，两种模式通用）

```text
【本地检查 · STEP N】
结论：<通过 / 有条件通过 / 阻塞>，<能否进入下一步>
证据：<3–5 条已核实的事实>
下一步：<只给一件事 + 必须覆盖的点>
```

规则：

1. 把摘要当作「命令已执行、结果已核实」，不要要求重新粘贴 build/test 的完整输出。
   唯一例外：摘要标注「阻塞」时会附 1–2 行关键报错，据此分析。
2. 不要复述已确认的事实；摘要没写的内容一律视为未验证。
3. 给命令时写明：这条命令跑完验证者应检查什么；失败时最可能的错误特征。
4. 每条回复控制在 10 行以内（涉及风险或取舍时最多 20 行）。
5. 摘要出现「缺测试 / 有 .bak / 未跟踪文件」时，只针对它给下一步，不要扩大成重构。
6. 验收标准不因摘要而降低：摘要没提到的验证项视为没做。

## 二、项目事实

- 仓库：`https://github.com/jiashuaifu13-blip/fjk-agent-desktop`（public）
- 本地路径：`D:\pet-desp`
- 技术栈：Tauri 2 + React 18 + TypeScript + Rust；桌宠 runtime 来自 Deepseek-pet
- 分支：`main`
- 环境：Windows 11、Windows PowerShell 5.1、Node 18+、Rust stable、本地 OpenClaw Gateway（`ws://127.0.0.1:18789`）

## 三、当前状态（2026-11-21）

- 最新提交：以 `git log -1` 为准（当前为协作模式/文档更新）
- 未提交改动：`apps/desktop/src-tauri/src/gateway.rs`（connect 参数已加
  `"caps": ["approvals", "exec-approvals"]`，待审批事件验证通过后再提交）
- 当前任务：**Approval UI** 的验证阶段——caps 已加、桌面端已用新二进制重启，
  待手动发送 `请使用 exec 执行只读命令 whoami` 验证是否出现审批事件。
  若仍无事件，下一步加 `sessions.messages.subscribe(includeApprovals: true)`。

## 四、已完成（P1-001 ~ P1-005）

| 编号 | 内容 | 证据 |
|---|---|---|
| P1-001 | Rust 侧 Gateway 通道（`src-tauri/src/gateway.rs`，4 个命令，token 不下发前端） | 真实对话 |
| P1-002 | Gateway 错误映射 + 未授权/离线 UI | 断言通过 |
| P1-003 | 事件驱动 AgentState（Reducer + ChatController 去直写 + runtime 唯一 Agent→Pet 链 + 断线 UI） | 单测 10/10、T1–T4 |
| P1-004 | release 构建回归（`npm run tauri build`，exe 20.24 MB） | 启动/连接/对话/退出 |
| P1-005 | NSIS 安装包回归（setup 13.22 MB，安装/运行/对话/卸载） | 安装 exit 0、runId `0c46a932`、卸载清理 |

## 五、未完成与已知问题

- 安装包：**NSIS 已完成并验证**；MSI 未做。
- Approval UI：`waiting_approval` 未在桌面端实测。
- 无自动重连：断线后需重开桌面端。
- 已知缺陷（已记录、**暂不修**）：`GatewayChatAdapter` 先 `chat.send` 后订阅事件，run 秒失败会漏 `lifecycle error`，UI 可能卡 `thinking`。

## 六、硬规则（踩过坑，别重复）

1. **网页 AI 只输出文件与修改，不输出 shell 命令**；落盘、构建、测试、运行、提交由本地助手完成。
2. 一次只推进一个可验证的最小改动；等本地回执再继续。
3. 中文文件由本地助手用 UTF-8 写入；网页 AI 不需要处理 PowerShell 转义或编码。
4. 不要用「补丁片段」描述多个大文件的改动；给整文件或唯一 old/new。
5. 不重构无关代码、不改 OpenClaw Core、不用 mock 冒充功能。
6. 不改 identifier / productName / version；不签名。
7. 提交信息建议用 `feat:` / `fix:` / `docs:` / `chore:`。
8. 未验证的内容必须标「未验证」，不得写成已验证。

## 七、验证约定

- 本地助手负责：落盘、`tsc --noEmit`、`node --test packages/agent-state/*.test.mjs`、构建/运行、Git 提交与推送。
- 网页 AI 只依赖【本地回执】：改动清单、构建/测试结果、运行结果、关键报错、下一步需要你做什么。
- 网页 AI 不需要、也不应该索要完整终端日志。

## 八、下一步

1. **Approval UI**：`waiting_approval` 在桌面端尚未实测，先用真实 approval 触发一次，再做审批界面。
2. Settings / Connection State / Log Viewer。
3. （可选）MSI 安装包、代码签名、自动更新。
4. （可选）修复 `GatewayChatAdapter` 快速失败竞态。
