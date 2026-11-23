# Architecture Decisions

## ADR-001：Agent Core

Decision:
FJK Agent 优先使用 OpenClaw 作为 Agent Core。

Reason:
避免重复开发 Agent Runtime、Gateway、Session、Memory、Tool、Provider 和 Approval 等基础能力。

Status:
Planned / 待 Phase 0 源码验证。


## ADR-002：Desktop

Decision:
桌面端计划采用 Tauri 2 + React + TypeScript + Rust。

Status:
Planned / 待技术验证。


## ADR-003：AI Pet

Decision:
Deepseek-pet 作为桌宠 Runtime 和资源来源，不从零重新开发桌宠系统。

桌宠动作资源后续继续扩充，但不得阻塞主体项目开发。

Status:
Confirmed project direction.


## ADR-004：Agent State

Decision:
Desktop Terminal 与 AI Pet 必须共享统一 AgentState。

Status:
Confirmed project direction.


## ADR-005：Git

Decision:
每完成一个开发阶段必须执行测试、更新文档、Commit 并 Push 到远程仓库。

Status:
Confirmed.


## ADR-006：Desktop Frontend

Decision:
FJK Desktop 前端独立于 Deepseek-pet，放在主仓库 /apps/desktop/（Tauri 2 + React + TS + Vite）。
桌宠运行时与资源从 Deepseek-pet 逐字迁移到 apps/desktop（保持 plain JS，不重写、不重命名）。

Reason:
Deepseek-pet 定位是"资源来源"而非运行依赖；其 submodule 状态不健康（无 .gitmodules）。
迁移解耦后前端不再依赖该 submodule。桌宠运行时已稳定，遵守"现有稳定能力优先于重写"。

Status:
Confirmed（最小可运行闭环已实现，构建通过）。


## ADR-007：Permission System 分期

Decision:
权限与审批系统采用分期落地：**当前只排期第一阶段（P1-020 审批审计落盘）**，
P1/P2/P3（风险引擎、Scope、Grant、桌宠审批卡、安全中心、Git/Blog 细分）暂不排期，
等第一阶段验收后再逐条确认。

Reason:
完整草案（2026-11-23）确认了目标方向与 §18 落地协议（先盘点现状、再定计划、写进任务大纲）。
一次性铺开 10+ 任务会超出当前可承担的开发量，且多数能力依赖审计数据与 OpenClaw 接口验证（`exec.approvals.set`、
`exec.approval.grants.*`）才能安全实现。审计落盘是所有后续验收场景（§19 七个场景）的前置。

边界（MUST）:
- FJK 只做前置判断 + 人机交互 + 审计；底层执行与安全仍由 OpenClaw 承担，不绕过、不削弱。
- 第一阶段只新增记录，**不改变现有审批行为**。

Status:
Confirmed（2026-11-23，用户确认收敛范围）。
