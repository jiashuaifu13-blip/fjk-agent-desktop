# 桌宠动作目录与选择器 · 借鉴方案（源自 D:\Personal Blog）

> 状态：方案稿（只写设计，不改代码）
> 来源仓库：`D:\Personal Blog`（Astro 博客，含完整桌宠实现）
> 生成时间：2026-11-22

## 一、背景

FJK Agent 桌面端的桌宠当前是「8 状态 + 固定 actionId」：

- `apps/desktop/src/pet/PetStates.js`：`BOOT/IDLE/THINKING/SPEAKING/WALKING/INTERACT/DRAGGING/ERROR`，
  每个状态**写死一个 actionId**，且多为占位复用（THINKING=`中国功夫`、SPEAKING=`走路`、
  DRAGGING/ERROR=`站着晃神打瞌睡`）。
- `packages/agent-state/AgentToPetState.js`：WORKING→SPEAKING、**WAITING_APPROVAL→IDLE**、
  COMPLETED→INTERACT、FAILED→ERROR —— 都是临时回退。
- 资源只有 `public/pets/dsh1` 的 **5 个动作**（18 文件 / 22.9 MB）。

结果：桌宠能反映 Agent 状态，但表现力弱、待机不动、审批/完成没有可辨识反馈。

## 二、Personal Blog 项目的可借鉴点（已核对源码）

| 能力 | 文件 | 要点 |
|---|---|---|
| 动作目录 | `src/lib/pet/PetActionCatalog.js`（1474 行） | 登记 **101 个动作**；每项含 `states[]`（可多状态）、`tags[]`、`weight`、`loop`、`priority`；`tags` 为 AI 情绪联动预留 |
| 动作选择器 | `src/lib/pet/PetActionSelector.js`（404 行） | 加权随机 `weightedPick`；同状态**不连续重复**；标签筛选（过严时自动回退到仅状态）；`library.has()` 可用性过滤 |
| 状态模型 | `src/lib/pet/PetStates.js` | **11 状态**：比我们多 `EMOTION` / `REACTION` / `SPECIAL` |
| 状态配置 | 同上 `PetStateConfig` | **不再绑定 actionId**；新增 `rotateOnEnd`（IDLE 播完自动换下一个待机动作） |
| 状态机 | `src/lib/pet/PetStateMachine.js` | 构造时注入 `actionSelector`，`setState` 内由 selector 选动作；带 `transitionToken` 防竞态 |
| 资源 | `public/pets/dsh` | **209 文件 / 95.8 MB**（112 张 spritesheet） |

关键设计差异一句话：**Blog 是“状态 → selector → 动作”，我们是“状态 → 写死动作”。**

## 三、动作子集建议（不整包搬）

整包 95.8 MB 会把安装包从 ~13 MB 推到 ~110 MB，不能全量。建议先取 **12–15 个动作（约 20–25 MB）**：

| 用途 | 建议动作 | tags |
|---|---|---|
| IDLE 轮播 | 待机呼吸休闲、东张西望、哈欠连天、超大伸懒腰、撸猫 | neutral/ambient/sleepy/relax |
| THINKING | 工作状态-思考冒泡、工作状态-原地踱步张望、深度思考碎碎念 | thinking/focused |
| WORKING（工具执行） | 工作状态-忙碌点按、写代码、轻快记录 | work/busy/coding |
| SPEAKING（流式输出） | 碎碎念-对屏碎碎念 | speaking/talking |
| WAITING_APPROVAL | 点击回应-元气挥手、女仆屈膝礼仪 | greeting/attention/polite |
| COMPLETED | 工作状态-雀跃庆祝、凭空生花 | success/celebrate/happy |
| FAILED / ERROR | 工作状态-垂头叹气冒汗、玩游戏气急败坏 | error/sad/frustrated |
| DRAGGING | 被鼠标拖拽悬空反馈（loop + priority 100） | dragging/mouse |
| INTERACT（点击） | 点击回应-开心跃动、点击回应-害羞惊讶、点击回应-挠痒咯咯笑 | interaction/happy |

其余 80+ 动作（节日/吃播/魔术/演奏）留作后续「SPECIAL 演出」与节日彩蛋，按需懒加载。

## 四、迁移方案（分阶段，每步可独立验收）

**阶段 A · 引入目录与选择器（不改现有行为）**
- 新增 `apps/desktop/src/pet/PetActionCatalog.js`（先只登记子集 12–15 个）、`PetActionSelector.js`（照 Blog 实现）。
- 不改 `PetStateMachine`；用 `selector.select({ state })` 的结果替换现有写死 actionId。
- 验收：现有 8 状态表现与现在一致（仅动作来源变了），`tsc` 0、`build` PASS。

**阶段 B · 扩展状态与 IDLE 轮播**
- `PetStates` 加 `EMOTION` / `REACTION` / `SPECIAL`；`PetStateConfig` 去掉 actionId，加
  `rotateOnEnd`（IDLE true）与 `returnState`；`PetStateMachine` 接 `rotateOnEnd` 逻辑。
- 验收：IDLE 播放完自动换动作（不重复同一条）；点击触发 INTERACT 后回 IDLE；拖拽播 `被鼠标拖拽悬空反馈`。

**阶段 C · Agent 语义映射**
- 改 `AgentToPetState`：WORKING→THINKING(work tag 优先)、WAITING_APPROVAL→`EMOTION/greeting`、
  COMPLETED→`EMOTION/success`、FAILED→`ERROR`、OFFLINE→`ERROR`。
- 可选：`GatewayChatAdapter` 的工具事件（`session.tool`）驱动 WORKING。
- 验收：真实对话看到 thinking→working→completed→idle 的动作差异；审批出现时挥手动效。

**阶段 D · 资源策略**
- 方案 1（默认）：只打包子集，其余动作不进 `public/`。
- 方案 2：动作包按需下载到 `AppData` 并注册进 `AnimationLibrary`（需 Tauri fs 权限与缓存策略）。
- 验收：安装包体积 ≤ 40 MB；缺动作时 `selector` 自动回退（`library.has()` 已支持）。

## 五、风险与回退

1. **体积**：方案 1 最稳；方案 2 需新增网络/缓存逻辑，失败要能静默回退到子集。
2. **状态机改动**：`rotateOnEnd` 会改变现有“无限循环”行为，需保留 `loop:true` 的显式场景（WORKING/DRAGGING）。
3. **竞态**：Blog 用 `transitionToken` 防快速切换；我们现有 `PetStateMachine` 也要保留等价保护。
4. **回退**：Catalog/Selector 是新增文件，回退只需恢复 `PetStateConfig` 的 actionId 绑定。

## 六、验收清单（建议写进 TASKS）

- 单测：`PetActionSelector` 权重分布、不重复、标签回退、缺资源回退（可提 `packages/` 复用）。
- GUI：IDLE 轮播、THINKING/WORKING/SPEAKING 差异、审批挥手、完成庆祝、拖拽反馈、点击互动。
- 体积：`dist/assets` 与安装包对比基线（exe 20.24 MB / NSIS 13.22 MB）。

## 七、结论

Blog 的 `PetActionCatalog + PetActionSelector + rotateOnEnd` 是可直接复用的成熟设计，
能把我们的桌宠从“5 个动作的占位状态机”提升到“可扩展的动作池”。
建议按 **A→B→C→D** 推进，先只搬 12–15 个动作，把体积控制在可接受范围。
