import { invoke } from '@tauri-apps/api/core'

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 读取外部人格卡生成的桌宠角色覆盖（无则返回 null，回退内置卡）。 */
export async function loadPetCharacterOverride(): Promise<unknown | null> {
  if (!hasTauri()) return null

  try {
    const raw = (await invoke('pet_character_override')) as string | null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
