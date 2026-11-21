# Project Status

## 当前阶段

Phase 0（项目调查与基础验证）— **已全部完成（P0-001~023）**，进入 Phase 1。

> 注：本文件曾误记为「Phase 3 完成」。经核对真实源码并完成 Phase 0 收尾后，现状如下。

## 真实状态概述

- OpenClaw 已验证可作为 FJK Agent Core（Gateway / DeepSeek 模型 / Agent / Session / Tool / Approval 链路跑通）。
- 统一状态层 `packages/agent-state/` 已实现并通过测试（真实代码，非 Mock）。
- Deepseek-pet 已作为 gitlink 引入，但 `.gitmodules` 缺失，属「未正确注册的子模块」状态。
- FJK Desktop 前端已建 `/apps/desktop/`（Tauri 2 + React + TS），终端 + 桌宠最小闭环已实现、构建通过。
- **Terminal 已接入真实 Gateway**：WS 连接位于 Rust 侧（`src-tauri/src/gateway.rs`），握手不带 `Origin` 头，避免 OpenClaw 对「浏览器来源 + 共享 token」清空 operator scopes；2026-11-20 实测桌面端真实对话往返成功。
- Gateway 错误已映射为未授权 / 未配对 / 来源拒绝 / 离线 / 超时 / 配置等状态并在 UI 呈现。
- Gateway Client 接口已定义（`packages/gateway-client/`，仅类型/接口，未实现）。
- 尚未有任何 Extensions。
- 无远程仓库配置，未完成任何 Git Push（无异地备份）。

## 阶段进度对照

| 阶段 | 目标 | 真实状态 | 证据 / 说明 |
|---|---|---|---|
| Phase 0 | OpenClaw 调查与基础验证 | ✅ **完成** | P0-001~023 全部完成；技术选型报告 GO（OpenClaw 作为 Agent Core） |
| Phase 1 | FJK Desktop 基础框架（Tauri 2 + React + TS + Rust） | 🟡 **进行中（真实 Gateway 已接通）** | `/apps/desktop/` 已建；Rust 侧 Gateway 通道 + 权限探测 + 错误映射完成；Settings / Log Viewer / 事件驱动 AgentState 未做 |
| Phase 2 | Agent Desktop Terminal | 🟡 **部分（真实收发已通）** | 真实 Gateway 对话已跑通；Session 管理、Approval UI、历史记录未做 |
| Phase 3 | Deepseek-pet 桌宠整合 | **部分（仅 3A + 部分 3D）** | 3A 审计已完成；3D Adapter 已实现；3B/3C/3E 未完成 |
| Phase 4 | Blog Adapter | **未开始** | 无对应代码 |
| Phase 5 | Local Project / Git / GitHub | **未开始** | 无对应代码 |
| Phase 6 | 产品化 | **未开始** | 无对应代码 |
| Phase 7 | 桌宠动作扩展 | **未开始** | actions.json 已规划动作，实际资源仍少 |

## Phase 0 子任务明细

| 范围 | 状态 |
|---|---|
| P0-001 项目总纲 / P0-002 AI context / P0-003 Git 基线 | ✅ 完成 |
| P0-004 Deepseek-pet 导入 / P0-005 架构审计 / P0-006 集成边界 / P0-007 AgentState 适配器 | ✅ 完成 |
| P0-008 OpenClaw 安装 / P0-009 Windows Gateway / P0-010 DeepSeek Provider / P0-011 模型推理 | ✅ 完成 |
| P0-012 模型传输 / P0-013 Agent Runtime / P0-014 Session 持久化 / P0-015 Tool + Approval 链路 | ✅ 完成 |
| P0-016 Gateway 事件语义调查 | ✅ 完成 |
| P0-017 Gateway 认证契约 | ✅ 完成 |
| P0-018 Agent turn 事件 / P0-019 Tool 事件 / P0-020 Approval 事件 | ✅ 完成 |
| P0-021 事件→AgentState 映射 / P0-022 Gateway Client 接口 / P0-023 Phase 0 最终技术选型报告 | ✅ 完成 |

## 已实现且验证的功能

- `packages/agent-state/AgentStates.js` — 统一 7 状态（offline/idle/thinking/working/waiting_approval/completed/failed）。
- `packages/agent-state/AgentToPetState.js` — AgentState → PetState 语义适配（部分状态为临时映射）。
- `packages/agent-state/AgentToPetState.test.mjs` — 适配器测试。
- `packages/agent-state/GatewayEventToAgentState.js` + 测试 — Gateway 事件 → AgentState 映射（P0-021，27 用例通过）。
- `packages/gateway-client/` — `types.ts` + `GatewayClient.ts` 接口契约（P0-022）。
- OpenClaw 本地运行 + 完整 Agent/Tool/Approval 链路（经 OpenClaw Control UI 验证）。
- `/apps/desktop/` — Tauri 2 + React + TS 前端最小闭环（桌宠渲染/动画/拖动/点击 + 终端），`npm run build` 通过。
- **真实 Gateway 通道（Rust）**：`src-tauri/src/gateway.rs` 实现协议 v4 握手（connect.challenge → connect → hello-ok）、请求/响应关联、事件转发、断开清理；Tauri 命令 `gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`；token 不下发到 WebView。
- **真实对话**：桌面端经 Rust 通道完成 `sessions.list` 权限探测与 `chat.send` 流式回复，2026-11-20 实测「hfhf」「你好」两轮成功。
- **Gateway 错误映射**：`src/gateway/GatewayError.ts` 覆盖 `MISSING_SCOPE`（未授权）、`DEVICE_IDENTITY_REQUIRED`（未配对）、`CONTROL_UI_ORIGIN_NOT_ALLOWED`（来源拒绝）、离线 / 超时 / 配置 / 协议错误；8 条断言通过。
- **UI 状态**：模式徽标（`Gateway` / `Gateway · 未授权` / `离线 · Mock`）、未授权/离线提示条、聊天气泡与错误块的标题/详情/建议/原始负载。
- `.ai-context/OPENCLAW_*` 系列文档 — Gateway 事件语义 / 认证契约 / 活动事件 / 状态映射 / Client 接口 / 技术选型报告。

## 已知问题（需处理）

1. **文档曾虚报进度**：`PROJECT_STATUS.md` 曾写「Phase 3 完成」，commit `71bc77a` 亦标「complete Phase 3」，与实际不符。
2. **子模块未正确注册**：`Deepseek-pet` 为 gitlink（160000 → e258387），但无 `.gitmodules`，`git submodule status` 报错，新克隆无法拉取。
3. **无远程仓库**：`git remote -v` 为空，从未 Push，无异地备份。
4. **未提交的 Mock 代码**：submodule 工作区含 `frontend/tauri/tauri.conf.json`、`DesktopTerminal.tsx`（模拟连接）、`App.tsx` 等未提交内容，其中 Terminal 为 Mock，不能视为 Phase 2 成果。
5. **安全风险**：`frontend/tauri/tauri.conf.json` 设 `allowlist.all = true`，违反最小权限原则。
6. **打包模式尚未验证**：dev 模式经 Rust 通道已通；`tauri build` 产物的窗口/连接需在打包后回归一次。
7. **`packages/gateway-client/client.js` 已不被桌面端使用**（保留为协议参考/烟测脚本）；后续要么补设备身份配对，要么明确其仅为测试工具。

## 下一步

继续 **Phase 1/2**：把 Gateway 事件真正驱动 `AgentState`（thinking / working / waiting_approval / completed / failed），补齐 Settings、Connection State、Log Viewer 与 Approval UI；再回归一次打包产物（`npm run tauri build`）下的连接与窗口。
