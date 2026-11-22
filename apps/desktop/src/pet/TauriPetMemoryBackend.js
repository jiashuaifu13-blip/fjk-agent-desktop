/*
 * TauriPetMemoryBackend —— 把桌宠关系记忆落到 AppData 的 pet-memory.json
 *
 * 仅在有 Tauri 运行时时启用；浏览器/Mock 模式下 load() 返回 null，前端自动退回 localStorage。
 */

import { invoke } from '@tauri-apps/api/core'

function hasTauri() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.__TAURI_INTERNALS__,
  )
}

export class TauriPetMemoryBackend {

  constructor() {
    this.kind = 'tauri-file'
  }

  available() {
    return hasTauri()
  }

  async load() {
    if (!this.available()) {
      return null
    }

    const data = await invoke('pet_memory_load')

    return typeof data === 'string' && data.length > 0
      ? data
      : null
  }

  async save(text) {
    if (!this.available()) {
      return
    }

    await invoke('pet_memory_save', { data: text })
  }

  async clear() {
    if (!this.available()) {
      return
    }

    await invoke('pet_memory_clear')
  }
}
