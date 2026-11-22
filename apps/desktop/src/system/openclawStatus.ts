import { invoke } from '@tauri-apps/api/core'

export interface OpenClawStatus {
  installed: boolean
  cliPath: string | null
  version: string | null
  gatewayRunning: boolean
  configFound: boolean
}

function hasTauri() {
  return Boolean(
    typeof window !== 'undefined' &&
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__,
  )
}

type RawStatus = {
  installed?: boolean
  cli_path?: string | null
  version?: string | null
  gateway_running?: boolean
  config_found?: boolean
}

export async function readOpenClawStatus(): Promise<OpenClawStatus | null> {
  if (!hasTauri()) {
    return null
  }

  const raw = (await invoke('openclaw_status')) as RawStatus

  return {
    installed: raw.installed === true,
    cliPath: raw.cli_path ?? null,
    version: raw.version ?? null,
    gatewayRunning: raw.gateway_running === true,
    configFound: raw.config_found === true,
  }
}
