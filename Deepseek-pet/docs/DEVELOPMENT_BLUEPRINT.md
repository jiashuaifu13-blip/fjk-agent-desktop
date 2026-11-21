# Deepseek-pet 开发蓝图

## 1. 项目最终目标

`Deepseek-pet` 的最终目标不再是“网页中的桌宠”，而是开发一个真正运行在 Windows PC 桌面环境中的 AI 桌宠应用。

最终用户看到的主要形态应当是：

```text
Windows 桌面

        👧
      dsh1 桌宠
```

平时只显示角色本体。

不应长期显示：

- 浏览器窗口
- 网页背景
- 固定聊天面板
- 不透明桌宠窗口
- 调试面板
- 多余标题栏或边框

桌宠应尽量保持“精灵直接出现在桌面上”的视觉效果。

---

## 2. 核心设计原则

### 2.1 桌面优先

从 Phase 7 开始，项目正式从 Web 原型阶段进入 Windows 桌面应用阶段。

后续所有设计优先考虑：

```text
Windows 桌面体验
↓
桌宠本体
↓
桌宠交互
↓
聊天能力
↓
AI 服务
```

而不是继续围绕浏览器页面进行设计。

---

### 2.2 Web 技术作为渲染引擎，而不是最终产品形态

Phase 0–6 已经验证的：

```text
HTML
CSS
JavaScript
Canvas
WebP spritesheet
Audio
Pointer Events
状态机
Mock Chat
```

继续保留。

但它们以后运行在桌面应用内部，而不是要求用户打开网页。

整体关系：

```text
Windows Desktop Host
        ↓
现有 Vite / Canvas Runtime
        ↓
dsh1 spritesheet
```

因此前六个阶段不是临时代码，而是桌面版的核心运行层。

---

### 2.3 桌宠“精灵化”

dsh1 本身采用：

```text
透明 WebP spritesheet
+
帧元数据
+
Canvas.drawImage
```

桌面版继续保持这一设计。

不转换为：

```text
Live2D
3D 模型
原生 Windows 动画格式
视频窗口
```

目标是尽可能原汁原味地保持当前网页中已经验证过的 dsh1 动画效果。

---

### 2.4 原生窗口只作为透明承载层

Windows 桌面应用仍然需要一个系统窗口承载 WebView / Canvas。

但是这个窗口在视觉上必须尽量“消失”。

要求：

```text
无边框
无标题栏
透明背景
无窗口底色
无普通窗口阴影
不显示普通网页框架
```

用户最终只能看到：

```text
dsh1 实体像素
```

而不应该明显感觉自己在看一个矩形窗口。

---

### 2.5 桌宠本体永远优先于 UI

正常状态：

```text
只显示桌宠
```

聊天 UI、设置 UI、调试 UI 都属于按需出现的附属界面。

禁止让一个大聊天窗口长期跟随桌宠显示。

推荐体验：

```text
平时
↓
👧


需要聊天
↓
点击 / 快捷操作
↓
临时显示轻量聊天 UI


结束聊天
↓
UI 隐藏
↓
👧
```

---

## 3. 总体系统架构

新的整体架构：

```text
Windows
 │
 ▼
Desktop Host
 │
 ├───────────────► Pet Window
 │                     │
 │                     ▼
 │                 Canvas
 │                     │
 │                     ▼
 │                dsh1 Runtime
 │
 ├───────────────► Desktop Interaction
 │                     │
 │                     ├─ 拖动
 │                     ├─ 点击
 │                     ├─ Alpha 命中
 │                     └─ 点击穿透
 │
 ├───────────────► Chat UI
 │                     │
 │                     ▼
 │               ChatController
 │                     │
 │                     ▼
 │                /api/chat
 │
 └───────────────► Desktop Services
                       │
                       ├─ 位置保存
                       ├─ 托盘
                       ├─ 启动/退出
                       ├─ 配置
                       └─ 多显示器
```

AI 数据链：

```text
用户
↓
ChatController
↓
/api/chat
↓
个人服务器
↓
AI Provider
↓
LLM API
```

动画联动：

```text
用户发送
↓
THINKING
↓
收到第一个 token
↓
SPEAKING
↓
stream done
↓
IDLE
```

---

## 4. 项目层级划分

项目从现在开始划分为六个核心层。

### A. dsh1 资源层

负责：

```text
manifest.json
actions.json
spritesheet
audio
```

原则：

```text
原始资源尽量保持不修改
```

---

### B. Pet Runtime

现有模块继续使用：

```text
PetDataLoader
AnimationLibrary
AnimationCache
PetRenderer
PetAnimator
PetAudioManager
PetStateMachine
```

负责：

```text
资源读取
动作播放
帧时间轴
音频同步
动作缓存
状态切换
```

---

### C. Interaction Layer

负责：

```text
点击
拖动
Alpha hit-test
屏幕边界
点击穿透
位置保存
```

Web 阶段：

```text
Pointer Events
Canvas Alpha hit-test
```

Desktop 阶段增加：

```text
原生窗口命中
Windows 透明区域点击穿透
```

---

### D. Desktop Host

从 Phase 7 开始新增。

职责：

```text
创建透明窗口
窗口置顶
窗口位置控制
窗口大小控制
桌面生命周期
系统托盘
多显示器
Windows 打包
```

桌面宿主与 Pet Runtime 分离。

Pet Runtime 不应该直接依赖具体桌面框架。

---

### E. Chat System

现有：

```text
MockChatClient
ChatController
```

后续增加：

```text
ServerChatClient
StreamParser
ChatHistory
```

聊天系统只知道：

```text
THINKING
SPEAKING
IDLE
ERROR
```

不得直接指定具体 dsh1 中文动作。

---

### F. Server / AI Layer

服务器负责：

```text
/api/chat
API Key
Provider
Streaming
Rate Limit
Timeout
错误处理
日志脱敏
```

浏览器/WebView 永远不保存正式 API Key。

---

# 5. 已完成开发阶段

以下阶段作为当前稳定基础，不再重新设计。

```text
Phase 0 ✅
项目骨架

Phase 1 ✅
dsh1 元数据读取

Phase 2 ✅
最小 spritesheet 播放器

Phase 3 ✅
完整动画 / 音频引擎

Phase 4 ✅
PetStateMachine

Phase 5 ✅
桌宠交互
Pointer Events
拖动
Alpha 命中
屏幕边界

Phase 6 ✅ / 收尾阶段
Mock Chat
流式模拟
聊天 UI
THINKING → SPEAKING → IDLE
```

Phase 0–6 定义为：

> Web Runtime Prototype

它们共同证明核心桌宠运行逻辑成立。

---

# 6. 新开发路线

## Phase 7 — Desktop Foundation

目标：

把当前 Vite 项目真正运行在 Windows 桌面应用中。

第一版桌面宿主优先验证轻量桌面框架方案，当前首选方向：

```text
Tauri
```

但 Pet Runtime 不与 Tauri API 强耦合。

第一阶段只要求：

```text
桌面程序可以启动
↓
加载现有 frontend
↓
dsh1 正常运行
```

要求：

- Windows 应用可以独立运行
- 不需要打开 Chrome / Edge 页面
- Canvas 动画与 Web 版一致
- dsh1 音频正常
- 状态机正常

验收：

```text
关闭浏览器
↓
启动 Deepseek-pet Desktop
↓
角色正常播放 IDLE
```

Git：

```text
feat: add desktop application foundation
tag: phase-7
```

---

## Phase 8 — Transparent Pet Window

目标：

把普通桌面应用窗口变成真正的透明桌宠承载窗口。

实现：

```text
无边框
无标题栏
透明背景
窗口置顶
隐藏普通页面背景
只显示 pet Canvas
```

Desktop Mode 下隐藏：

```text
Debug
网页背景
永久聊天框
测试按钮
开发状态文字
```

最终视觉：

```text
Windows 桌面

        👧
```

而不是：

```text
┌─────────────┐
│      👧      │
└─────────────┘
```

验收：

- 看不到矩形窗口背景
- 看不到标题栏
- 看不到网页底色
- dsh1 Alpha 保持正确
- 动画视觉与当前 Web 版一致

Git：

```text
feat: add transparent desktop pet window
tag: phase-8
```

---

## Phase 9 — Desktop Hit Testing & Click-through

这是桌面版最关键的技术阶段之一。

当前 Web 版已有：

```text
Canvas getImageData
↓
alpha > threshold
↓
Pet hit
```

桌面版进一步实现：

```text
实体像素
→ 桌宠接收输入

透明像素
→ Windows 鼠标事件穿透
→ 下面的软件正常接收点击
```

目标体验：

```text
桌宠周围透明区域
完全不影响其他软件操作
```

同时保留：

```text
点击角色
拖动角色
INTERACT
DRAGGING
```

需要研究并验证：

- Windows 原生窗口 hit-test
- WebView 与原生窗口命中关系
- Canvas Alpha 与桌面 hit region 同步方式
- 动态动作切换后的命中变化

第一版允许使用当前帧 Alpha hit-test。

后续如性能需要，再考虑：

```text
Alpha mask cache
```

验收：

```text
点角色
→ 桌宠响应

点角色旁边透明区域
→ 点击下面的窗口

拖角色
→ 桌宠移动
```

Git：

```text
feat: add native alpha click-through
tag: phase-9
```

---

## Phase 10 — Desktop Position & Display System

目标：

让桌宠真正适合长期运行。

实现：

```text
位置保存
启动恢复位置
屏幕边界
多显示器
DPI / 缩放
分辨率变化
```

支持：

```text
拖到第二显示器
重启应用
恢复合理位置
```

避免：

```text
显示器断开后桌宠留在屏幕外
```

桌宠尺寸也需要进入配置。

例如：

```text
scale
0.6
0.8
1.0
1.2
```

验收：

- 重启位置保持
- 屏幕变化不丢失桌宠
- 不同 DPI 下尺寸正常

Git：

```text
feat: add desktop positioning and display support
tag: phase-10
```

---

## Phase 11 — Desktop Lifecycle

目标：

解决真正桌面应用的生命周期。

加入：

```text
系统托盘
显示桌宠
隐藏桌宠
重新定位
设置
退出
```

托盘只作为控制入口。

它不是用户主要交互 UI。

可选：

```text
开机启动
```

但默认是否启用由用户选择。

验收：

```text
关闭可见 UI
桌宠仍可运行

从托盘
→ 隐藏
→ 显示
→ 退出
```

Git：

```text
feat: add desktop lifecycle and tray controls
tag: phase-11
```

---

# 7. 桌面聊天设计阶段

## Phase 12 — Lightweight Desktop Chat

目标：

把 Phase 6 的聊天 UI 从“网页聊天区域”改造成“桌宠附属临时界面”。

原则：

```text
平时不显示聊天窗口
```

用户触发：

```text
点击桌宠
快捷按钮
快捷键
其他交互
```

才显示。

设计方向继续沿用 Phase 6 已确定的 Companion UI：

```text
白色用户气泡
蓝紫助手气泡
轻量 Composer
圆角
半透明
可移动
可折叠
```

但桌面版必须做到：

```text
不聊天时自动隐藏
```

聊天 UI 不得抢占桌面。

推荐关系：

```text
        对话内容
      ╭──────────╮
      │          │
      ╰──────────╯
           👧
```

或者：

```text
       Composer

          👧
```

而不是常驻大型 IM 窗口。

验收：

- Chat UI 可以呼出
- 可以关闭
- 不影响桌宠继续运行
- 不聊天时只剩桌宠

Git：

```text
feat: add lightweight desktop chat interface
tag: phase-12
```

---

# 8. AI 后端阶段

## Phase 13 — Personal Server Chat API

建立：

```text
POST /api/chat
```

数据流：

```text
Desktop App
↓
HTTPS
↓
个人服务器
↓
AI Provider
```

服务器配置：

```text
AI_BASE_URL
AI_API_KEY
AI_MODEL
```

要求：

```text
API Key
绝不进入 Desktop Frontend Bundle
```

服务器至少加入：

- 请求大小限制
- timeout
- rate limit
- CORS
- 错误隐藏
- 日志脱敏
- HTTPS

Git：

```text
feat: add server chat api
tag: phase-13
```

---

## Phase 14 — AI Provider Abstraction

建立统一接口：

```text
ChatProvider
```

第一阶段：

```text
OpenAI-compatible
```

后续可以扩展：

```text
DeepSeek
OpenAI
Local Model
其他兼容 API
```

ChatController 不知道 Provider 类型。

结构：

```text
ChatController
↓
ServerChatClient
↓
/api/chat
↓
ProviderManager
↓
Provider
```

Git：

```text
feat: add ai provider abstraction
tag: phase-14
```

---

## Phase 15 — Real Streaming AI Integration

正式替换：

```text
MockChatClient
```

为：

```text
ServerChatClient
```

完整流程：

```text
用户输入
↓
THINKING
↓
POST /api/chat
↓
服务器请求 AI
↓
第一个 token
↓
SPEAKING
↓
持续 Streaming
↓
done
↓
IDLE
```

支持：

```text
AbortController
停止生成
请求取消
错误恢复
重新发送
```

原则：

```text
AI 服务异常
≠
桌宠程序崩溃
```

错误：

```text
ERROR
↓
提示
↓
恢复 IDLE
```

Git：

```text
feat: add streaming ai desktop chat
tag: phase-15
```

---

# 9. 配置与体验完善

## Phase 16 — Configuration System

建立公开配置：

```text
app.config
pet.config
chat.config
personality.config
```

负责：

### app

```text
启动行为
窗口行为
托盘
更新
```

### pet

```text
角色尺寸
动作映射
idle 行为
互动行为
```

### chat

```text
UI
服务器地址
历史数量
```

### personality

```text
名称
System Prompt
欢迎语
模型参数
```

秘密配置仍只存在服务器。

---

## Phase 17 — Animation Behavior Upgrade

Phase 4 目前的状态动作主要是测试映射。

这一阶段正式从 dsh1 的 167 个动作中整理：

```text
idle pool
thinking pool
speaking pool
interaction pool
greeting pool
error pool
walking pool
special pool
```

目标：

```text
语义状态
↓
随机 / 条件动作池
↓
dsh1 动作
```

加入：

- 动作随机化
- 动作冷却
- 避免连续重复
- 优先级
- 可中断性
- 空闲随机行为

仍然禁止聊天逻辑直接写：

```javascript
play("具体中文动作")
```

---

## Phase 18 — Performance Optimization

dsh1 总资源较大。

禁止：

```text
167 个动作启动时全部加载
```

策略：

```text
核心动作预加载
+
其他动作按需加载
```

核心动作：

```text
idle
thinking
speaking
interaction
```

优化：

- AnimationCache
- LRU
- 图片释放
- Audio cache
- Alpha hit mask
- Startup preload
- Desktop memory profile

目标：

```text
长期运行
不持续增长内存
```

---

# 10. Stability

## Phase 19 — Stability & Error Testing

测试：

### 桌面

```text
窗口丢失
显示器拔出
DPI 变化
睡眠 / 唤醒
锁屏 / 解锁
Explorer 重启
应用重启
```

### 资源

```text
WebP 加载失败
Audio 加载失败
actions.json 错误
资源缺失
```

### 网络

```text
断网
超时
401
429
500
Streaming 中断
请求取消
```

原则：

```text
任何单个子系统故障
都不应导致整个桌宠退出
```

最低恢复状态：

```text
IDLE
```

---

# 11. Windows Packaging

## Phase 20 — Windows Release Build

目标：

生成真正可以安装和运行的 Windows 版本。

需要确认：

```text
正式 exe
Installer
应用图标
版本号
配置目录
缓存目录
日志目录
卸载
```

发布测试：

```text
Windows 11
Windows 10（如果目标支持）
不同 DPI
不同分辨率
单屏
双屏
```

正式版本：

```text
v1.0.0
```

---

# 12. V1 完成标准

V1 不再以“网页可以打开”为完成标准。

真正的 V1 必须满足：

1. 不打开浏览器即可启动桌宠。
2. Windows 桌面只明显看到角色本身。
3. 桌宠背景透明。
4. 无普通窗口边框。
5. 可以拖动桌宠。
6. 点击实体像素可交互。
7. 透明区域尽量不阻挡其他程序。
8. 桌宠可以待机和播放多个动作。
9. 支持 THINKING / SPEAKING / IDLE。
10. 可以呼出轻量聊天界面。
11. 聊天界面平时可以完全隐藏。
12. AI 回复支持 Streaming。
13. API Key 不存在于桌面前端 Bundle。
14. 网络错误不导致桌宠退出。
15. 桌宠位置可以保存。
16. 支持正常退出应用。
17. 可以生成正式 Windows 安装版本。

达到以上要求：

```text
Deepseek-pet V1
```

才正式完成。

---

# 13. V1 暂缓功能

暂不开发：

- 长期记忆
- 向量数据库
- RAG
- 自动读取网页
- 博客上下文
- TTS
- 语音识别
- 用户账号
- 云同步
- 多用户
- 插件系统
- 复杂物理
- 多角色同时运行
- 自动桌面行走物理
- Steam 发布
- 自动更新服务

这些都不应该阻塞 V1。

---

# 14. 博客版本定位

博客版不再属于主产品路线。

主产品：

```text
Windows Desktop Pet
```

未来如果仍然希望博客中也显示桌宠：

```text
Desktop Core
与
Web Embed
```

视为两个不同的产品入口。

只有 Desktop V1 稳定以后，才重新评估：

- 博客框架
- CSP
- CORS
- 自定义 JS
- 自定义 CSS
- Web Component
- iframe
- Widget

不得为了博客兼容性破坏桌面版架构。

---

# 15. 推荐项目结构

后续项目逐步演进为：

```text
Deepseek-pet/
│
├─ frontend/
│  │
│  ├─ public/
│  │  └─ pets/
│  │     └─ dsh1/
│  │
│  └─ src/
│     ├─ pet/
│     ├─ chat/
│     ├─ ui/
│     ├─ config/
│     ├─ desktop/
│     └─ app/
│
├─ desktop/
│  └─ Desktop Host
│
├─ server/
│  ├─ routes/
│  ├─ providers/
│  ├─ middleware/
│  └─ config/
│
├─ docs/
│
├─ scripts/
│
└─ README.md
```

如果桌面框架最终采用 Tauri：

```text
desktop/
或
frontend/src-tauri/
```

具体目录以实际初始化结果为准，不提前硬编码。

---

# 16. 模块解耦原则

必须保持：

```text
Pet Runtime
不知道 Tauri

Pet Runtime
不知道 AI Provider

ChatController
不知道具体 dsh1 动作名

Desktop Host
不知道 AI Prompt

Server
不知道 Canvas
```

关系应该始终是：

```text
Desktop Host
↓
App

App
├─ Pet Runtime
├─ Chat System
└─ Desktop Adapter

Chat System
↓
Server API

Server
↓
AI Provider
```

这样将来即使更换：

```text
Tauri
Electron
Web
其他桌面框架
```

也不需要重写整个动画系统。

---

# 17. Git 开发原则

每一个 Desktop Phase 都至少创建稳定提交。

建议：

```text
phase-7
phase-8
phase-9
...
```

重大里程碑：

```text
desktop-prototype
desktop-alpha
v0.5.0
v0.9.0
v1.0.0
```

推荐 commit：

```text
feat: add desktop application foundation
feat: add transparent desktop pet window
feat: add native alpha click-through
feat: add desktop positioning
feat: add tray controls
feat: add lightweight desktop chat
feat: add server chat api
feat: add ai provider abstraction
feat: add streaming ai integration
perf: optimize pet asset loading
fix: ...
docs: ...
```

每次进入新 Phase 前：

```text
上一阶段功能验证
↓
git commit
↓
tag
↓
开始下一阶段
```

---

# 18. 当前项目位置

当前：

```text
Phase 0 ✅
Phase 1 ✅
Phase 2 ✅
Phase 3 ✅
Phase 4 ✅
Phase 5 ✅
Phase 6 ✅ / 最终收尾
```

下一阶段：

```text
Phase 7
Desktop Foundation
```

开发目标发生的核心变化：

旧路线：

```text
Web
↓
Server
↓
Blog
```

新路线：

```text
Web Runtime Prototype
↓
Windows Desktop Host
↓
Transparent Desktop Pet
↓
Native Interaction
↓
Lightweight Desktop Chat
↓
AI Server
↓
Windows V1
```

从 Phase 7 开始：

> **Deepseek-pet 正式以 Windows 桌面宠物作为主要产品形态。**

Web 版继续存在，但主要作为开发、调试和渲染运行时基础，不再作为最终用户产品。