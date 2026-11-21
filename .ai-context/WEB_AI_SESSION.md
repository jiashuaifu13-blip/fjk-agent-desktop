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

## 三、当前状态（2026-11-21 17:55 更新）

- 最新提交：以 `git log -1` 为准（恢复卡/规则文档更新）
- 未提交改动：`apps/desktop/src-tauri/src/gateway.rs`
  （connect 参数已把 `caps` 移到顶层 `["approvals","exec-approvals"]`，握手已验证通过）

- 当前任务：**Approval UI**，现状必须按下面事实理解，不要凭记忆：

  | 项 | 真实状态 |
  |---|---|
  | 审批 UI 代码 | **不存在**（`apps/desktop/src` 中 approval 匹配为 0），不会出现审批卡片 |
  | runtime 订阅 | **未实现**：没有调用 `sessions.messages.subscribe(includeApprovals:true)` |
  | caps | 已加且握手成功 |
  | 订阅能力 | **已用独立探针验证可用**：返回 `subscribed:true` + `approvalReplay` |
  | 真实审批事件 | **未验证**：Agent 尚未真正发起 command-mode exec，无 `exec.approval.requested` / `session.approval` 样本 |

- 因此下一步不是"再发一次消息看卡片"，而是**把订阅接进 runtime**，再验证事件。

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
- **输出纪律与精简 STEP 格式以 `.ai-context/START_HERE.md` 第八节为准**：每条回复 ≤10 行、不贴大段代码、一次一个 STEP。

## 八、下一步

1. **Approval UI**：先验证 `sessions.messages.subscribe(includeApprovals: true)` 能否让桌面端收到
   `session.approval`；确认后再做审批卡片与 resolve 调用。
2. Settings / Connection State / Log Viewer。
3. （可选）MSI 安装包、代码签名、自动更新。
