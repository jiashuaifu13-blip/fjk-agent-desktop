const KEY = 'fjk-setup-completed-v1'

export function isSetupCompleted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markSetupCompleted(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // 忽略
  }
}

export function resetSetup(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // 忽略
  }
}
