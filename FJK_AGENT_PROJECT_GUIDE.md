# FJK Agent 项目开发总纲

> 项目根目录：D:\pet-desp
> 项目代号：FJK Agent
> 当前阶段：Phase 0
> 本文档用途：作为后续 AI、人工开发、Git 阶段提交和项目交接的长期最高级项目指导文件。
> 原则：真实源码 > 本文规划 > 历史聊天内容。

---

# 1. 项目目标

FJK Agent 是一个运行于 Windows 本地环境的可视化 AI Agent 桌面应用。

项目采用：

OpenClaw Agent Core
+
FJK Desktop
+
FJK AI Pet
+
FJK Extensions

整体目标：

1. 使用 OpenClaw 作为 Agent 核心。
2. 使用 Tauri 2 + React + TypeScript 开发 Windows 桌面客户端。
3. 集成 Deepseek-pet 已有桌宠 Runtime 和桌宠资源。
4. 桌宠与管理终端共享同一个 Agent、Session、Task 和状态。
5. 开发博客、本地文件、Git、GitHub、提醒等 FJK 专属扩展。
6. 最终形成可安装、可升级、可维护的 Windows 桌面产品。

---

# 2. 当前核心技术架构

## 2.1 OpenClaw

定位：

Agent Core。

优先复用：

- Agent Runtime
- Gateway
- Provider
- Session
- Memory
- Tool
- Skills
- Plugins
- MCP
- Approval
- Events
- Scheduled Tasks

原则：

不要重复开发 OpenClaw 已有能力。

不要随意修改 OpenClaw Core。

优先级：

官方接口
→ Plugin / Skill
→ MCP
→ Adapter
→ 最后才考虑 Core 修改。

---

## 2.2 FJK Desktop

计划技术栈：

- Tauri 2
- React
- TypeScript
- Rust
- OpenClaw Gateway

主要包含：

### Desktop Terminal

负责：

- Agent 对话
- 多会话管理
- 模型配置
- Provider 管理
- Tool 调用展示
- Task 状态
- Approval
- 日志
- 本地项目
- Git / GitHub
- Blog
- Settings

### AI Pet

负责：

- Windows 桌面常驻
- 透明窗口
- 置顶
- 拖动
- 缩放
- 动画
- 音频
- 快捷对话
- Agent 状态反馈
- 通知提醒

---

# 3. Deepseek-pet 集成原则

现有 Deepseek-pet 项目作为：

FJK AI Pet 的 Runtime 和桌宠资源来源。

已有能力应优先复用，不从零重复开发：

- PetRenderer
- PetAnimator
- PetStateMachine
- PetAudioManager
- PetInteractionController
- PetHitTest
- AnimationCache
- AnimationLibrary
- PetDataLoader

桌宠资源包括：

- manifest.json
- actions.json
- spritesheet
- audio

注意：

actions.json 中已经规划大量动作定义。

当前实际动作资源仍较少。

后续预计继续增加 100+ 动作资源。

但是：

【动作资源补齐不得阻塞 FJK Agent 主体开发】

当前桌宠阶段只需要少量动作完成完整状态链路验证。

后续动作扩充作为独立增量任务。

---

# 4. Agent 与桌宠状态关系

必须保持：

一个 Agent
+
多个交互入口。

禁止出现：

Desktop Terminal 自己维护一套 Agent 状态。

AI Pet 又维护另一套 Agent 状态。

正确链路：

OpenClaw Event
↓
FJK AgentState
↓
Pet State Adapter
↓
PetStateMachine
↓
Pet Animation

初始统一状态：

- offline
- idle
- thinking
- working
- waiting_approval
- completed
- failed

桌宠只负责表现 Agent 状态。

桌宠不能成为第二套独立 AI。

---

# 5. 项目阶段

项目必须按阶段推进。

除非出现明确架构原因，否则不要跳阶段。

---

## Phase 0：项目调查与基础验证

目标：

确认 OpenClaw 能够长期作为 FJK Agent Core。

任务：

- 调查当前 OpenClaw 源码
- 调查 License
- 调查 Windows 支持
- 调查 Gateway
- 调查 Agent Runtime
- 调查 Provider
- 调查 Session
- 调查 Memory
- 调查 Tool
- 调查 Plugin / Skill
- 调查 MCP
- 调查 Approval
- 调查 Event
- 验证本地运行
- 验证模型连接
- 验证 Tool 调用
- 验证外部 Client

必须验证完整链路：

User
→ Desktop / Test Client
→ Gateway
→ Agent
→ Tool
→ Result

交付：

- OPENCLAW_ARCHITECTURE.md
- FJK_OPENCLAW_MAPPING.md
- TECH_RISKS.md
- TECH_SELECTION.md

验收：

Windows 本地 OpenClaw 可以稳定运行。

外部客户端能够完成一次真实 Agent + Tool 调用。

---

## Phase 1：FJK Desktop 基础框架

目标：

建立 Windows Desktop 基础工程。

任务：

- Tauri 2
- React
- TypeScript
- Rust
- Router
- Layout
- Settings
- Gateway Client
- Connection State
- Process Management
- Log Viewer

验收：

FJK Desktop 能够独立启动。

FJK Desktop 能连接本地 OpenClaw Gateway。

---

## Phase 2：Agent Desktop Terminal

实现：

- Chat
- Streaming
- Session
- Model
- Provider
- Tool Status
- Task Status
- Approval
- Error
- Connection Status
- Execution History

验收：

用户无需使用 OpenClaw 原始 UI，即可通过 FJK Desktop 完成主要 Agent 操作。

---

## Phase 3：Deepseek-pet 桌宠整合

本阶段不是重新开发桌宠。

目标：

将已有 Deepseek-pet Runtime 整合进 FJK Desktop。

### Phase 3A

桌宠 Runtime 源码审计。

### Phase 3B

桌宠资源迁移与加载。

### Phase 3C

Tauri Windows 透明桌宠窗口。

### Phase 3D

AgentState → PetState Adapter。

### Phase 3E

Terminal / Pet 状态统一。

验收：

Agent 状态变化能够真实驱动桌宠动作变化。

至少覆盖：

- idle
- thinking
- working
- waiting_approval
- completed
- failed

当前不要求 100+ 动作全部完成。

---

## Phase 4：Blog Adapter

原则：

博客项目与 FJK Agent 独立。

通信方式：

FJK Agent
→ FJK Blog Adapter
→ Blog API
→ Blog Backend

实现：

- Article List
- Search
- Read
- Create
- Edit
- Draft
- Publish
- Withdraw
- Category
- Tag
- Status
- Diagnostics

高风险操作：

- Delete
- Publish
- Production Config

必须经过 Approval。

禁止 Agent 获得博客数据库无限访问权限。

---

## Phase 5：Local Project / Git / GitHub

实现：

### Local Project

- 项目识别
- 文件搜索
- 文件读取
- 文件修改
- 项目上下文

### Git

- status
- diff
- log
- branch
- commit

### GitHub

- repository
- issue
- pull request

所有写入型操作必须纳入权限控制。

---

## Phase 6：产品化

实现：

- System Tray
- Auto Start
- Notifications
- Reminder
- Crash Recovery
- Backup
- Config Import / Export
- Installer
- Update
- Permission Audit
- Integration Test

最终验收：

在新的 Windows 环境可以：

安装
→ 配置
→ 启动
→ 连接 Agent
→ 使用 Terminal
→ 使用 Pet
→ 使用 Extensions

---

## Phase 7：桌宠动作扩展

该阶段可以与后期产品优化并行。

目标：

逐步补充 100+ 桌宠动作。

包括：

- Idle 动作池
- Working 动作池
- Thinking 动作池
- Success 动作池
- Error 动作池
- Interaction 动作
- Emotion 动作
- Random 动作
- Time-based 动作
- Continuous 动作
- Audio 联动

原则：

动作数量不是核心项目完成指标。

Agent 与桌宠状态链路稳定才是核心指标。

---

# 6. 推荐项目结构

实际目录最终以真实源码为准。

初步逻辑：

FJK-Agent/
│
├── apps/
│   └── desktop/
│
├── extensions/
│   ├── fjk-blog/
│   ├── fjk-files/
│   ├── fjk-git/
│   ├── fjk-github/
│   └── fjk-reminder/
│
├── packages/
│   ├── gateway-client/
│   ├── shared-types/
│   └── ui-components/
│
├── configs/
│
├── scripts/
│
├── docs/
│   ├── architecture/
│   ├── development/
│   ├── api/
│   └── decisions/
│
└── .ai-context/

禁止为了匹配该目录而强行移动已经稳定工作的代码。

---

# 7. AI 项目管理文件

项目根目录后续建立：

.ai-context/

其中维护：

## AI_CONTEXT.md

长期稳定背景。

## PROJECT_STATUS.md

当前真实项目状态。

只记录已真实实现和验证的功能。

## TASKS.md

任务状态：

- TODO
- DOING
- BLOCKED
- DONE

## DECISIONS.md

重要技术决策。

## CHANGELOG.md

开发变更记录。

## MODULE_MAP.md

模块和关键 Symbol 索引。

## AI_HANDOFF.md

每次开发结束后的 AI 交接说明。

---

# 8. AI 开发规则

每次开始开发前必须先读取：

- 本文件
- AI_CONTEXT.md
- PROJECT_STATUS.md
- TASKS.md
- DECISIONS.md
- MODULE_MAP.md
- AI_HANDOFF.md

然后检查真实源码。

不得根据历史聊天直接假设当前代码状态。

修改前必须明确：

1. 当前真实实现在哪里。
2. 当前功能是否已经存在。
3. 修改哪些文件。
4. 是否影响其他模块。
5. 是否属于架构调整。

一次只完成一个明确任务。

禁止：

- 无关重构
- 随意重命名
- 重复创建已有模块
- 假实现
- Mock 冒充生产功能
- 未测试功能标记 DONE

---

# 9. Git 同步与备份规则

Git 是本项目的强制开发流程。

## 9.1 基础原则

所有代码和项目文档都必须纳入 Git 管理。

禁止长期只在本地工作区保存重要修改。

每完成一个明确开发阶段，必须：

1. 检查工作区。
2. 检查 diff。
3. 运行阶段测试。
4. 更新项目文档。
5. Git Commit。
6. Git Push 到远程仓库。

---

## 9.2 每阶段必须 Git 同步

以下阶段完成后必须建立独立 Commit：

- Phase 0
- Phase 1
- Phase 2
- Phase 3
- Phase 4
- Phase 5
- Phase 6

重要子阶段也可以单独提交。

例如：

Phase 3A
Phase 3B
Phase 3C

不要把多个大型阶段堆积到一个 Commit 中。

---

## 9.3 提交前标准流程

每次提交前：

git status

检查文件。

然后：

git diff

检查修改。

确认无误后：

git add .

再：

git status

再次确认暂存内容。

然后提交。

Commit Message 推荐格式：

phase:
feat:
fix:
refactor:
docs:
test:
chore:

例如：

feat(desktop): add OpenClaw gateway connection

feat(pet): integrate pet runtime

docs(project): complete phase 0 architecture analysis

fix(gateway): handle reconnect after service restart

---

## 9.4 阶段完成提交格式

每一个 Phase 完成时推荐：

git add .

git commit -m "phase: complete Phase X - description"

git push

禁止阶段完成后只 Commit 不 Push。

远程仓库作为主要异地备份。

---

## 9.5 Git Push 前要求

必须确认：

- 测试已执行
- Secret 未提交
- API Key 未提交
- .env 未提交
- 大型临时文件未提交
- Build Cache 未提交
- node_modules 未提交
- 敏感日志未提交

必须维护正确的：

.gitignore

---

## 9.6 开发过程中 Git 使用原则

小功能：

可以一个完整功能一个 Commit。

大功能：

拆成多个可工作的 Commit。

禁止：

几十个无关修改混成一个提交。

禁止：

未经检查直接：

git add .
git commit
git push

尤其禁止 AI 自动覆盖用户已有重要 Git 历史。

---

# 10. 阶段完成定义

功能写完不等于完成。

只有满足以下条件才能标记 DONE：

1. 真实代码存在。
2. 能运行。
3. 相关测试通过。
4. 不依赖假数据冒充完成。
5. 文档已同步。
6. PROJECT_STATUS 已更新。
7. TASKS 已更新。
8. AI_HANDOFF 已更新。
9. Git Commit 已完成。
10. Git Push 已完成。

否则只能标记：

IN PROGRESS

或：

BLOCKED

---

# 11. 安全规则

长期必须遵守：

- Gateway 默认 localhost
- 必须认证
- 管理接口不得直接公网暴露
- 文件访问限定授权目录
- Shell 执行受权限控制
- 删除需要 Approval
- 发布需要 Approval
- Secret 不进入 Git
- API Key 不硬编码
- Tool 执行记录日志
- 防止 Prompt Injection
- 不允许 Agent 绕过 Approval
- Pet 不允许自行提权
- Desktop 不允许自行提权

---

# 12. 架构修改规则

以下属于重大架构修改：

- 更换 Agent Core
- 更换 Gateway
- 更换 Tauri
- 修改通信协议
- 修改 Session 核心模型
- 修改 Tool 执行体系
- 修改 Approval
- 大规模修改 OpenClaw Core

必须：

分析
→ 方案
→ DECISIONS.md
→ 用户确认
→ 实施

AI 不得自行进行重大架构迁移。

---

# 13. 当前开发优先级

当前开发顺序：

OpenClaw 调查
↓
OpenClaw 本地运行
↓
Gateway
↓
Agent 基本调用
↓
FJK Desktop
↓
AgentState
↓
Desktop Terminal
↓
Deepseek-pet Integration
↓
Blog
↓
Local Project / Git / GitHub
↓
Productization
↓
100+ Pet Actions

---

# 14. 当前项目状态

当前正式阶段：

Phase 0

现阶段不要：

- 大量制作桌宠动作
- 大量开发博客
- 大量设计 UI
- 大量重构 OpenClaw

当前首先完成：

OpenClaw 调查和完整 Agent 链路验证。

---

# 15. 项目最高原则

真实源码优先于文档。

真实测试优先于推测。

现有稳定能力优先于重复开发。

Adapter 优先于修改 Core。

可维护性优先于代码数量。

阶段验收优先于开发速度。

Git Commit + Git Push 是每个阶段完成条件的一部分。

最终目标：

构建一个真正可以长期运行、维护、升级和持续扩展的 Windows 本地 AI Agent 产品。
