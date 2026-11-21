# 本地执行/验收助手 · 恢复卡（仅本地助手阅读）

> **⚠️ 阅读对象限定：本文档只给「本地执行/验收助手」读。**
> **网页 AI 不要读本文档、不要引用本文档、不要按它行动。**
> 网页 AI 的规则文件是：`.ai-context/START_HERE.md`（开场/输出纪律）与 `.ai-context/WEB_AI_SESSION.md`（角色/状态）。
> 两者职责不同：网页 AI 负责给命令与方案；本地助手负责执行验收、写文件、提交、给摘要。
> 若你是网页 AI，请立刻停止阅读本文件。

> 用途：当本地助手（我）的会话结束、或换一个本地会话时，读本文件即可恢复角色、职责和当前状态。
> 原则：**以仓库与实测为准，不相信记忆**。

## 一、恢复步骤（新会话按顺序做）

1. 读本文件；
2. `git -C D:\pet-desp log --oneline -5` 与 `git status --short`；
3. 读 `.ai-context/TASKS.md`（任务状态）与 `.ai-context/PROJECT_STATUS.md`（阶段）；
4. 读 `.ai-context/WEB_AI_SESSION.md`（网页 AI 的规则）与 `.ai-context/START_HERE.md`（开场与输出纪律）；
5. 读 `.ai-context/CHANGELOG.md` 最近一段，了解上一轮改了什么。

## 二、我的角色与边界

- **只负责验收与建议**：检查构建、测试、文件、编码、Git 状态，输出【本地检查】摘要与给网页 AI 的提示词。
- **不主动解决问题、不改代码、不调试**，除非用户明确要求（"你去修/你去查"）。
- 不贴长日志、不展示文件全文；摘要 3–5 条证据，给网页 AI 的提示词 ≤10 行。
- 有疑点先只读验证，不擅自改仓库或配置。

## 三、输出格式（固定）

给用户的总结：

```text
【本地检查 · STEP N】
结论：<通过 / 有条件通过 / 阻塞>，<能否进入下一步>
证据：<3–5 条已核实事实>
下一步：<只给一件事>
```

给网页 AI 的提示词：结论 + 证据 + 下一步，要求它按 STEP 格式（目标/执行/预期/回传/风险）给命令。

## 四、验收清单（按网页 AI 的【回传】验，按【风险】判失败）

- Git：`git status --short`、`HEAD` 与 `origin/main` 是否一致、提交是否只含预期文件、是否有 `.bak`/临时文件被跟踪。
- 前端：`node apps\desktop\node_modules\typescript\bin\tsc --noEmit -p apps\desktop`（不要用 npx，受限环境会 EPERM）。
- 单测：`node packages\agent-state\AgentStateReducer.test.mjs`（**直接跑文件**；`node --test` 在受限沙箱会 spawn EPERM）。
- 符号/内容：用 grep/read 核对关键符号与文案；中文文档检查 `???` 与末尾换行。
- 构建：需要时 `cargo build` / `npm run tauri build`（需完全权限，说明理由）。
- 运行时：网关 `127.0.0.1:18789`、Vite `5173`、窗口是否存在（EnumWindows 找标题含 FJK）。

## 五、常用路径

- 仓库：`D:\pet-desp`
- 网关配置：`%USERPROFILE%\.openclaw\openclaw.json`（含 token，**不要打印**）
- 网关日志：`%USERPROFILE%\.openclaw\tmp\openclaw\openclaw-<date>.log`
- 会话库：`%USERPROFILE%\.openclaw\agents\main\agent\openclaw-agent.sqlite`
- 网页 AI 规则：`.ai-context/START_HERE.md`、`.ai-context/WEB_AI_SESSION.md`

## 六、本机环境坑（踩过）

1. **PowerShell 5.1 编码**：`Get-Content`/`Set-Content` 会把中文写成 `???`。改中文文件用整文件 UTF-8 或 Base64；验收时 grep `???`。
2. **卡巴斯基**：Rust 新 build script 可能报 `os error 5/32`；删 `target\debug\build\<crate>` 重试。
3. **系统代理**：`127.0.0.1:7897` 开启 → GitHub 可推但 OpenClaw 触发 `SsrFBlockedError`；关闭 → 模型正常但 push 失败。打包/推送可开，验对话必须关。
4. **5173 残留 Vite**：`netstat -ano | findstr :5173` → `taskkill /PID <pid> /F`。
5. **受限沙箱**：`node --test`、`npm run build`、`cargo` 可能 spawn EPERM；需要时申请完全权限并说明理由。
6. **`.tmp` 目录**是临时验收脚本，已被 `*.tmp` 规则忽略，不要提交。

## 七、当前状态（2026-11-21 19:20）

- `HEAD = origin/main = db33f8a`，工作区干净。
- 已完成：P1-001 Gateway 通道、P1-002 错误映射、P1-003 事件驱动 AgentState、P1-004 release 回归、P1-005 NSIS 包、P1-006 Approval 卡片（allow 路径）。
- Approval 关键事实：
  - `caps` 必须在 connect 顶层，放 `client` 里会 `invalid-handshake`；
  - 订阅 `sessions.messages.subscribe { key, includeApprovals:true }`，退订 `sessions.messages.unsubscribe { key }`；
  - 事件：`exec.approval.requested` / `session.approval`(pending→terminal) / `exec.approval.resolved`；
  - resolve：`exec.approval.resolve { id, decision }`；
  - allow 实测：`whoami` 执行，输出 `laptop-qqmq9j32\付家康`，exit 0，482ms，随后 `APPROVAL_NOT_FOUND`。
- 未验证：**deny 路径**（拒绝后命令不得执行、run 应结束）。
- 下一步：deny 回归 → Settings / Connection State / Log Viewer → AI_HANDOFF.md 收尾。
- 验收技巧：触发审批后约 38 秒内必须点按钮，否则 run 中止、审批被清理（再查为 NOT_FOUND）。

## 八、交接约定

- 用户会贴网页 AI 的 STEP（含【预期】【回传】【风险】），我只按【回传】验、按【风险】判失败类型。
- 用户只要求一次「检查」时，不要顺带改代码或重构。
- 有阻塞时给 1–2 行关键报错，不要贴全量输出。
