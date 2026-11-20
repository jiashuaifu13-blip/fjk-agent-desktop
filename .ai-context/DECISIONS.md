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
