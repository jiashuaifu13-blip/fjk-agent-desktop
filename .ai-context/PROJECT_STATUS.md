# Project Status

## 当前阶段

Phase 0（项目调查与基础验证）— 收尾中，尚未进入 Phase 1。

> 注：本文件曾误记为「Phase 3 完成」。经核对真实源码，实际进度仍处于 Phase 0 收尾，
> 且 Phase 1 / Phase 2 尚未开始。以下内容以真实源码为准。

## 真实状态概述

- OpenClaw 已验证可作为 FJK Agent Core（Gateway / DeepSeek 模型 / Agent / Session / Tool / Approval 链路跑通）。
- 统一状态层 `packages/agent-state/` 已实现并通过测试（真实代码，非 Mock）。
- Deepseek-pet 已作为 gitlink 引入，但 `.gitmodules` 缺失，属「未正确注册的子模块」状态。
- FJK Desktop 前端已建 `/apps/desktop/`（Tauri 2 + React + TS），终端 + 桌宠最小闭环已实现、构建通过；尚未接入 Gateway。
- 尚未有 Gateway Client、任何 Extensions。
- 无远程仓库配置，未完成任何 Git Push（无异地备份）。

## 阶段进度对照

| 阶段 | 目标 | 真实状态 | 证据 / 说明 |
|---|---|---|---|
| Phase 0 | OpenClaw 调查与基础验证 | **进行中（约 65%）** | P0-001~015 已完成；P0-016 进行中；P0-017~023 待办 |
| Phase 1 | FJK Desktop 基础框架（Tauri 2 + React + TS + Rust） | 🟡 **进行中（前端最小闭环）** | `/apps/desktop/` 已建，终端 + 桌宠闭环构建通过；Gateway Client / Settings / 日志未做 |
| Phase 2 | Agent Desktop Terminal | **未开始** | 仅有未提交的 Mock `DesktopTerminal.tsx`（模拟连接/硬编码响应） |
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
| P0-016 Gateway 事件语义调查 | 🔄 进行中 |
| P0-017 Gateway 认证契约 / P0-018 Agent turn 事件 / P0-019 Tool 事件 / P0-020 Approval 事件 | ⏳ 待办 |
| P0-021 事件→AgentState 映射 / P0-022 Gateway Client 接口 / P0-023 Phase 0 最终技术选型报告 | ⏳ 待办 |

## 已实现且验证的功能

- `packages/agent-state/AgentStates.js` — 统一 7 状态（offline/idle/thinking/working/waiting_approval/completed/failed）。
- `packages/agent-state/AgentToPetState.js` — AgentState → PetState 语义适配（部分状态为临时映射）。
- `packages/agent-state/AgentToPetState.test.mjs` — 适配器测试。
- OpenClaw 本地运行 + 完整 Agent/Tool/Approval 链路（经 OpenClaw Control UI 验证）。
- `/apps/desktop/` — Tauri 2 + React + TS 前端最小闭环（桌宠渲染/动画/拖动/点击 + 终端 Mock 聊天），`npm run build` 通过。

## 已知问题（需处理）

1. **文档曾虚报进度**：`PROJECT_STATUS.md` 曾写「Phase 3 完成」，commit `71bc77a` 亦标「complete Phase 3」，与实际不符。
2. **子模块未正确注册**：`Deepseek-pet` 为 gitlink（160000 → e258387），但无 `.gitmodules`，`git submodule status` 报错，新克隆无法拉取。
3. **无远程仓库**：`git remote -v` 为空，从未 Push，无异地备份。
4. **未提交的 Mock 代码**：submodule 工作区含 `frontend/tauri/tauri.conf.json`、`DesktopTerminal.tsx`（模拟连接）、`App.tsx` 等未提交内容，其中 Terminal 为 Mock，不能视为 Phase 2 成果。
5. **安全风险**：`frontend/tauri/tauri.conf.json` 设 `allowlist.all = true`，违反最小权限原则。

## 下一步

继续 P0-016（真实 Gateway 事件语义），完成 P0-017~023，产出 Phase 0 技术选型报告后，方可进入 Phase 1 Desktop 开发。
