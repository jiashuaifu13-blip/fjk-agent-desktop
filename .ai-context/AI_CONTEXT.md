# FJK Agent - AI Context

## Project
FJK Agent

## Purpose
Windows 本地 AI Agent 桌面应用。

## Core Architecture
- OpenClaw：Agent Core
- FJK Desktop：桌面管理终端
- Deepseek-pet：桌宠 Runtime 与资源来源
- FJK Extensions：博客、文件、Git、GitHub、提醒等扩展

## Current Phase
Phase 0：OpenClaw 调查与技术验证

## Development Principles
1. 真实源码优先于历史聊天。
2. 真实测试结果优先于推测。
3. 优先复用 OpenClaw 已有能力。
4. 优先使用官方 API、Plugin、Skill、MCP 和 Adapter。
5. 不随意修改 OpenClaw Core。
6. 桌宠与管理终端共享同一个 Agent 状态来源。
7. 桌宠动作资源不足不得阻塞主体项目开发。
8. 每个阶段完成后必须 Git Commit + Git Push。
9. 未测试功能不得标记为完成。
10. 重大架构调整必须先记录决策。
