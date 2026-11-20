# Deepseek-pet Runtime Reuse Map

> Generated from the real Deepseek-pet directory.
> This file is descriptive, not speculative.

## 1. Current Role

Deepseek-pet is the existing source for:

- pet runtime
- animation playback
- pet state handling
- audio playback
- interaction handling
- pet asset loading
- existing pet resources

FJK Agent must reuse these capabilities before considering replacement implementations.

---

## 2. Project Configuration

- Deepseek-pet\frontend\package.json
- Deepseek-pet\frontend\package-lock.json
- Deepseek-pet\docs\DEVELOPMENT_BLUEPRINT.md

---

## 3. Frontend Entry Candidates

- Deepseek-pet\frontend\src\main.js

---

## 4. Existing Pet Runtime Files

- Deepseek-pet\frontend\src\chat\ChatController.js
- Deepseek-pet\frontend\src\pet\AnimationCache.js
- Deepseek-pet\frontend\src\pet\AnimationLibrary.js
- Deepseek-pet\frontend\src\pet\PetAnimator.js
- Deepseek-pet\frontend\src\pet\PetAudioManager.js
- Deepseek-pet\frontend\src\pet\PetDataLoader.js
- Deepseek-pet\frontend\src\pet\PetHitTest.js
- Deepseek-pet\frontend\src\pet\PetInteractionController.js
- Deepseek-pet\frontend\src\pet\PetRenderer.js
- Deepseek-pet\frontend\src\pet\PetStateMachine.js

---

## 5. Existing Pet Resources

- Deepseek-pet\frontend\public\pets\dsh1\actions.json
- Deepseek-pet\frontend\public\pets\dsh1\manifest.json
- Deepseek-pet\frontend\public\pets\dsh1\audio\工作加班.m4a
- Deepseek-pet\frontend\public\pets\dsh1\audio\熬夜刷手机.m4a
- Deepseek-pet\frontend\public\pets\dsh1\spritesheet\中国功夫.webp
- Deepseek-pet\frontend\public\pets\dsh1\spritesheet\工作加班.webp
- Deepseek-pet\frontend\public\pets\dsh1\spritesheet\熬夜刷手机.webp
- Deepseek-pet\frontend\public\pets\dsh1\spritesheet\站着晃神打瞌睡.webp
- Deepseek-pet\frontend\public\pets\dsh1\spritesheet\走路.webp

---

## 6. Resource Status

Action metadata files detected:

- Deepseek-pet\frontend\public\pets\dsh1\actions.json: PARSE_ERROR


Actual spritesheet files:

- 5

Actual audio files:

- 2

Important:

Action definitions and actual animation assets are separate concepts.

A large actions.json does NOT mean every defined action currently has a usable asset.

FJK Agent development must not be blocked by incomplete action assets.

---

## 7. Reuse Strategy

### Reuse directly where possible

- PetRenderer
- PetAnimator
- PetStateMachine
- PetAudioManager
- PetInteractionController
- PetHitTest
- AnimationCache
- AnimationLibrary
- PetDataLoader

### Adapt

The existing pet state system must eventually receive state from:

OpenClaw Event
→ FJK AgentState
→ Pet State Adapter
→ Existing PetStateMachine

### Do not duplicate

Do not create a second:

- renderer
- animator
- pet state machine
- audio manager
- hit-test system
- resource loader

unless the existing implementation is first proven unsuitable.

---

## 8. AI Responsibility Boundary

Deepseek-pet must NOT evolve into an independent second AI system inside FJK Agent.

Future AI/provider/chat responsibilities belong primarily to:

OpenClaw Agent Core
+
FJK Gateway integration.

Existing mock or standalone chat code may be retained temporarily for testing, but should not become the final Agent architecture.

---

## 9. Current Development Priority

1. Understand existing pet runtime.
2. Preserve reusable code.
3. Verify OpenClaw.
4. Build FJK Desktop host.
5. Connect AgentState to pet runtime.
6. Expand 100+ animation assets later.

Animation quantity is not a prerequisite for the core FJK Agent.
