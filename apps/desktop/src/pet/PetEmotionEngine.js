/*
 * PetEmotionEngine —— 桌宠的情绪状态机
 *
 * 职责：把「互动事件」翻译成「一种情绪 + 一组动作 tags」，
 * 供 PetStateMachine.setState(PetStates.EMOTION, { tags }) 使用。
 *
 * 设计约束：
 * - 纯 JS，无第三方依赖；clock / timers 可注入，便于单测。
 * - 情绪有强度与衰减：到期自动回 neutral。
 * - 只做「情绪 → tags」，不直接碰动画与资源。
 */

const DEFAULT_EMOTION = 'neutral'

export class PetEmotionEngine {

  constructor({
    character,
    memory = null,
    onChange = null,
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  } = {}) {

    this.character = character ?? {}
    this.memory = memory
    this.onChange = onChange
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer

    this.current = DEFAULT_EMOTION
    this.intensity = 0
    this.expiresAt = 0
    this.timer = null
    this.mode = 'daily'

    this.recentClicks = []
  }


  getEmotionConfig(name) {

    return (
      this.character?.emotions?.[name] ??
      this.character?.emotions?.[DEFAULT_EMOTION] ??
      null
    )
  }


  getTags(emotion = this.current) {

    return (
      this.getEmotionConfig(emotion)?.tags ??
      []
    )
  }


  getLines(emotion = this.current) {

    const lines =
      this.getEmotionConfig(emotion)?.lines

    if (Array.isArray(lines)) {
      return lines
    }

    if (
      !lines ||
      typeof lines !== 'object'
    ) {
      return []
    }

    return (
      lines[this.mode] ??
      lines.daily ??
      []
    )
  }


  setMode(mode) {

    if (
      !mode ||
      mode === this.mode
    ) {
      return
    }

    this.mode = mode
  }


  pickLine(emotion = this.current) {

    const lines = this.getLines(emotion)

    if (lines.length === 0) {
      return null
    }

    return lines[
      Math.floor(Math.random() * lines.length)
    ]
  }


  /* 事件名 → 情绪名（来自 character.interactions） */
  resolveEmotion(kind) {

    return (
      this.character?.interactions?.[kind] ??
      DEFAULT_EMOTION
    )
  }


  /*
   * 记一次互动事件。
   * kind: click / rapidClick / doubleClick / dragStart / dragEnd
   *       / chatStart / chatEnd / toolError / offline
   */
  note(kind, detail = {}) {

    const emotion = this.resolveEmotion(kind)

    if (this.memory) {

      if (kind === 'click') {
        this.memory.bumpCounter('clicks')
        this.memory.addAffinity(
          this.character?.memory?.affinityPerClick ?? 1,
        )
      }

      if (kind === 'chatEnd') {
        this.memory.bumpCounter('chats')
        this.memory.addAffinity(
          this.character?.memory?.affinityPerChat ?? 1,
        )
      }

      if (kind === 'dragEnd') {
        this.memory.bumpCounter('drags')
      }

      this.memory.rememberEvent(kind, detail)
    }

    this.setEmotion(emotion)
    return emotion
  }


  /* 连点检测：默认 1.6 秒内 3 次 → rapidClick */
  registerClick() {

    const at = this.now()
    const windowMs = 1600

    this.recentClicks.push(at)
    this.recentClicks = this.recentClicks.filter(
      (t) => at - t <= windowMs,
    )

    if (this.recentClicks.length >= 3) {

      this.recentClicks = []
      return this.note('rapidClick')
    }

    return this.note('click')
  }


  setEmotion(emotion, { silent = false } = {}) {

    if (!emotion) {
      return
    }

    const config = this.getEmotionConfig(emotion)
    const decayMs = config?.decayMs ?? 0

    this.current = emotion
    this.intensity = Math.min(3, this.intensity + 1)
    this.expiresAt = this.now() + decayMs

    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
    }

    if (decayMs > 0) {

      this.timer = this.setTimer(() => {

        this.timer = null

        if (this.now() >= this.expiresAt) {
          this.setEmotion(DEFAULT_EMOTION, { silent })
        }
      }, decayMs)
    }

    if (!silent && typeof this.onChange === 'function') {

      this.onChange({
        emotion: this.current,
        tags: this.getTags(),
        line: this.pickLine(),
        mode: this.mode,
      })
    }
  }


  dispose() {

    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
    }

    this.onChange = null
  }
}
