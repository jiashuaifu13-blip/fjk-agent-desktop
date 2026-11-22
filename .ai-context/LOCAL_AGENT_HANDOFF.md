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
7. **DSH 沙箱写 `.git` 被拒**：workspace-write 模式下 `git add/commit/push` 会报
   `Unable to create '.git/index.lock': Permission denied`（.git 受保护，属预期限制）。
   处理：用一次「完全权限」重试同一条 git 命令（说明理由即可），不要改 ACL。
   同样地，**写 `apps\desktop\src` 下的源文件**也会 `Access to the path ... is denied`（apply-patch 也一样），
   需要完全权限；`.ai-context` 下的文档写入不受影响。

## 七、当前状态（2026-11-22 16:40）

- `HEAD = origin/main = 35701ac`；`STATE_ID = 20261122-1640`（仍以 `STATE.md` 为唯一实时源）。
- 已完成：P1-001~P1-018（Approval、Connection State、Log Viewer、Settings 只读+模型回滚+三字段、
  Session 列表/切换/新建/删除/切换加载历史、UI 布局、自动重连、面板错误自清）。
- 2026-11-22 当天进度：新建会话 → 删除会话（archived→delete）→ 切换加载历史 → 面板错误自清
  → Settings 三项只读 → 清空测试会话（16→1）→ 恢复卡加「命令索引 / 摘要块 / 补丁锚点」三节。
- **进行中（P1-019 聊天历史分页）**：`usePetRuntime.ts` 有 2 行**未提交**的悬空声明
  （`prependMessages` / `loadOlderHistory`），`ChatController.js` 尚未实现；
  创建处是 `as ChatControllerLike` 强转，`tsc` 不报错，但调用会 `TypeError`。
  已备好 `prependMessages` 补丁：DryRun `hits=1 firstLine=309`，等指令实跑。
- 未验证：快速失败瞬时事件（开代理表现为挂起，非秒失败）。
- 已知小隐患：重连内层 1s 等待未接 `cancelled`（卸载后最多多跑 4s）。
- 环境：网关 `18789` 运行中；代理 `7897` 开着但 TLS 偶发失败，push 用
  `git -c http.proxy="" -c https.proxy=""` 直连可成；`build` 需完全权限（esbuild spawn EPERM）。

## 八、交接约定

- **每次状态变化（完成任务/出现阻塞/改待办）后更新 `.ai-context/STATE.md`**：改 `STATE_ID`、`HEAD_AT_SYNC`、`UPDATED`、任务与未验证项，并提交；否则网页 AI 会读到旧进度。
- 用户会贴网页 AI 的 STEP（含【预期】【回传】【风险】），我只按【回传】验、按【风险】判失败类型。
- 用户只要求一次「检查」时，不要顺带改代码或重构。
- **截图、点击、GUI 操作默认由用户完成**：不要申请截图/自动化权限，也不要绕过。
- **用户能直接确认的测试**：用户回复「没问题 / 测试通过 / 无异常」等，即视为已实测通过；
  记录为「用户口头确认」即可，不必再索要截图。
- **用户没把握时**会主动发截图或实际证据；不要追问，也不要把"没给证据"当成失败。
- 有阻塞时给 1–2 行关键报错，不要贴全量输出。

### （补充）STEP 留痕协议（2026-11-22 起，用户选定）

- 用户执行网页 AI 的 STEP 时：命令整段存 `.ai-context\.tmp\stepN.ps1`（N=步骤号），
  输出重定向到同目录 `stepN.log`；执行完只说一句「STEP N 跑完了」。
- 我收到后**先读 `stepN.ps1` + `stepN.log`**（对号 C1.x、看真实报错），再自己跑
  `tsc` / 单测 / 必要的 `git diff` 做独立复核；不用用户再贴大段终端文字。
- `.ai-context/.tmp/` 已在 `.gitignore` 中，日志与脚本都不入库。

## 九、故障处理权责（重要）

**网页 AI 是我的第一工具。** 遇到异常时按这个顺序：

1. **先定位原因**：自己只读排查（日志、diff、tsc、复现），不急着改代码；
2. **把原因总结成提示词给网页 AI**：带上证据、当前状态、期望、约束，让它给方案/命令；
3. **只有网页 AI 确实解决不了**，用户会说类似「还是你亲自动手」的话；
   这时我**必须先确认**：`确认此错误由我亲自改正吗？`，得到明确同意后才动手。
4. **例外（不需要问）**：更新 `.ai-context` 恢复卡/STATE/文档、项目进度记录、Git 提交与备份推送——
   这些本来就是我的活，直接做。

即：**排错先找根因 → 交网页 AI → 亲自改必须征得同意；文档/提交/备份不用问。**
