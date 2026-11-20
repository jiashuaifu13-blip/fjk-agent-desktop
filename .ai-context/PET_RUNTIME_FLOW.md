# Deepseek-pet Runtime Flow

> This document defines the currently verified runtime flow boundary.
> Exact relationships must come from the generated audit files.

## Source Evidence

Read together:

- PET_DEPENDENCY_AUDIT.md
- PET_SYMBOL_AUDIT.md
- PET_STATE_AUDIT.md
- PET_RESOURCE_LOADING_AUDIT.md
- PET_RUNTIME_CONSTRUCTION.md
- runtime-audit/

## Expected Architectural Areas

The existing pet runtime must be understood in the following order:

1. Application entry
2. App/component bootstrap
3. Resource loading
4. Runtime object construction
5. Pet state initialization
6. Animation selection
7. Animation playback
8. Renderer
9. Interaction handling
10. Audio
11. Chat / mock AI integration

## Important Rule

Do not assume the order above matches the exact current implementation.

The audit files are authoritative.

## FJK Integration Target

The eventual FJK integration boundary should preferably be:

OpenClaw Gateway Event
↓
FJK AgentState Store
↓
PetState Adapter
↓
Existing Deepseek-pet runtime
↓
Animation / Renderer / Audio

The exact injection point will be selected only after the real runtime constructor and state APIs are confirmed.

## Do Not Do Yet

- do not rewrite PetStateMachine
- do not rewrite PetAnimator
- do not replace PetRenderer
- do not remove mock chat code yet
- do not import OpenClaw into random pet files
- do not directly bind Gateway messages to animation filenames
