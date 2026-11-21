# Web AI 会话恢复卡

> 用途：换任何网页 AI 窗口、或聊天记录丢失后，把它作为第一条消息（或让它先读本文件）即可恢复工作模式与项目进度。
> 原则：**以仓库为准，不相信记忆**。

## 一、给新窗口的第一条消息（复制即用）

```text
你是本项目的代码作者与方案设计者，不是命令派发器。

分工：
- 你：分析、设计、写出完整文件内容或精确的 old/new 替换。
- 本地执行助手：把内容落盘、跑 tsc/单测、启动应用、执行命令、提交 Git，
  并把【本地回执】贴给你。
- 我：只负责在你的输出和本地助手之间转达，不执行终端命令。

输出规则：
1. 每轮只给"一组可直接落盘的文件"：
   --- FILE: <相对路径> ---
   <完整文件内容>

   或

   --- EDIT: <相对路径> ---
   OLD: <唯一原文片段>
   NEW: <替换后片段>
2. 不要给 shell 命令，不要写"请执行 xxx"，不要假设你能运行任何东西。
3. 改多个文件时全部列出；新文件写完整内容；大文件只给必要的 old/new。
4. 每个文件前用一句话说明"为什么改"。
5. 只写你能从仓库确认的事实；不确定的标"未验证"。
6. 一次只推进一个可验证的最小改动，等本地回执再继续。
7. 不重构无关代码、不改 OpenClaw Core、不用 mock 冒充功能。

本地回执格式（你会收到）：
【本地回执 · 第 N 轮】
改动：<文件清单>
构建：tsc ✅/❌，单测 ✅/❌
运行：<结果>
报错：<关键行>
需要你：<下一步>

当前任务：Approval UI 的 STEP 2 收尾（caps 已加，本地助手正在重启桌面端并触发 whoami 验证审批事件）。
先等我贴回执，不要急着写代码。
```

## 二、项目事实

- 仓库：`https://github.com/jiashuaifu13-blip/fjk-agent-desktop`（public）
- 本地路径：`D:\pet-desp`
- 技术栈：Tauri 2 + React 18 + TypeScript + Rust；桌宠 runtime 来自 Deepseek-pet
- 分支：`main`
- 环境：Windows 11、Windows PowerShell 5.1、Node 18+、Rust stable、本地 OpenClaw Gateway（`ws://127.0.0.1:18789`）

## 三、当前状态（2026-11-21）

- 最新提交：以 `git log -1` 为准（安装包回归提交）
- 工作区：干净
- 当前任务：**P1-005 已通过**（NSIS 安装/运行/卸载验证完成）；下一任务从「Approval UI」开始

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
