/*
 * PetMemoryStore —— 桌宠的「关系记忆」（不是对话记忆）
 *
 * 只存结构化的小数据：亲密度、互动计数、最近事件摘要。
 * 不存对话原文；对话记忆交给 OpenClaw agent 自己的 workspace（IDENTITY/USER 等）。
 *
 * 当前用 localStorage（WebView 内持久化）；后续可平滑迁移到 Tauri fs。
 */

const DEFAULT_KEY = 'fjk-pet-memory-v1'

function nowMs() {
  return Date.now()
}

const EMPTY = () => ({
  petId: null,
  firstMetAt: nowMs(),
  lastInteractionAt: nowMs(),
  affinity: 0,
  counters: {
    clicks: 0,
    chats: 0,
    drags: 0,
    approvals: 0,
  },
  moodBaseline: 'neutral',
  recent: [],
})

export class PetMemoryStore {

  constructor({
    key = DEFAULT_KEY,
    storage = (
      typeof window !== 'undefined'
        ? window.localStorage
        : null
    ),
    character = null,
    backend = null,
  } = {}) {

    this.key = key
    this.storage = storage
    this.character = character
    this.backend = backend
    this.data = this.load()
  }


  load() {

    try {

      const raw =
        this.storage?.getItem(this.key)

      if (!raw) {
        return EMPTY()
      }

      const parsed =
        JSON.parse(raw)

      if (
        !parsed ||
        typeof parsed !== 'object'
      ) {
        return EMPTY()
      }

      return {
        ...EMPTY(),
        ...parsed,
        counters: {
          ...EMPTY().counters,
          ...(parsed.counters ?? {}),
        },
        recent: Array.isArray(parsed.recent)
          ? parsed.recent
          : [],
      }
    } catch (error) {
      console.warn('[FJK] pet memory load failed:', error)
      return EMPTY()
    }
  }


  /* 从 AppData 的 pet-memory.json 恢复（有则覆盖 localStorage 版本） */
  async hydrate() {

    if (!this.backend || typeof this.backend.load !== 'function') {
      return false
    }

    try {

      const raw = await this.backend.load()

      if (!raw) {
        return false
      }

      const parsed = JSON.parse(raw)

      if (!parsed || typeof parsed !== 'object') {
        return false
      }

      this.data = {
        ...EMPTY(),
        ...parsed,
        counters: {
          ...EMPTY().counters,
          ...(parsed.counters ?? {}),
        },
        recent: Array.isArray(parsed.recent)
          ? parsed.recent
          : [],
      }

      this.save()

      return true
    } catch (error) {
      console.warn('[FJK] pet memory hydrate failed:', error)
      return false
    }
  }


  save() {

    try {
      const serialized =
        JSON.stringify(this.data)

      this.storage?.setItem(
        this.key,
        serialized,
      )

      if (this.backend && typeof this.backend.save === 'function') {
        void this.backend
          .save(serialized)
          .catch((error) => {
            console.warn('[FJK] pet memory file save failed:', error)
          })
      }
    } catch (error) {
      console.warn('[FJK] pet memory save failed:', error)
    }
  }


  bumpCounter(name, by = 1) {

    if (
      !this.data.counters[name] &&
      this.data.counters[name] !== 0
    ) {
      this.data.counters[name] = 0
    }

    this.data.counters[name] += by
    return this.data.counters[name]
  }


  addAffinity(by) {

    const max =
      this.character?.memory?.affinityMax ??
      100

    this.data.affinity =
      Math.max(
        0,
        Math.min(
          max,
          (this.data.affinity ?? 0) + by,
        ),
      )

    return this.data.affinity
  }


  rememberEvent(kind, detail = {}) {

    const limit =
      this.character?.memory?.recentLimit ??
      50

    this.data.lastInteractionAt = nowMs()

    this.data.recent.unshift({
      at: this.data.lastInteractionAt,
      kind,
      ...detail,
    })

    this.data.recent =
      this.data.recent.slice(0, limit)

    this.save()
  }


  /* 久别重逢：超过 24 小时没互动 */
  isReunion(thresholdMs = 24 * 60 * 60 * 1000) {
    return (
      nowMs() - (this.data.lastInteractionAt ?? 0) >
      thresholdMs
    )
  }


  clear() {

    this.data = EMPTY()
    this.save()

    if (this.backend && typeof this.backend.clear === 'function') {
      void this.backend.clear().catch(() => undefined)
    }
  }
}
