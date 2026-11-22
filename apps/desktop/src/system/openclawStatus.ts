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

export interface AuthSaveResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}

type RawAuthSave = {
  ok?: boolean
  exit_code?: number | null
  stdout?: string
  stderr?: string
}

export interface GatewayWriteResult {
  ok: boolean
  error: string | null
  cleanedUp: string | null
}

function toMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: unknown })?.message ?? error)
}

async function callGateway(
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  await invoke('gateway_request', { method, params })
}

/*
 * 优先走 Gateway RPC（不停网关）。
 * OpenClaw 的 authSetApiKey 不接收 profileId，若目标档案是别的登录方式（如 token 型 <provider>:manual），
 * 会报 “belongs to another sign-in”。此时清掉这条 <provider>:manual 再重试一次。
 */
export async function setApiKeyViaGateway(
  provider: string,
  apiKey: string,
): Promise<GatewayWriteResult> {
  if (!hasTauri()) {
    return { ok: false, error: '非 Tauri 环境', cleanedUp: null }
  }

  const write = () =>
    callGateway('models.authSetApiKey', { provider, apiKey })

  try {
    await write()
    return { ok: true, error: null, cleanedUp: null }
  } catch (firstError) {
    const message = toMessage(firstError)

    if (!/belongs to another sign-in/i.test(message)) {
      return { ok: false, error: message, cleanedUp: null }
    }

    const profileId = `${provider}:manual`

    try {
      await callGateway('models.authLogout', {
        provider,
        profileIds: [profileId],
      })
    } catch (logoutError) {
      return {
        ok: false,
        error: `${message}；清理旧凭据失败：${toMessage(logoutError)}`,
        cleanedUp: null,
      }
    }

    try {
      await write()
      return { ok: true, error: null, cleanedUp: profileId }
    } catch (secondError) {
      return {
        ok: false,
        error: `${toMessage(secondError)}（已清理旧的 ${profileId}）`,
        cleanedUp: profileId,
      }
    }
  }
}

export async function saveApiKey(
  provider: string,
  key: string,
): Promise<AuthSaveResult | null> {
  if (!hasTauri()) {
    return null
  }

  const raw = (await invoke('openclaw_save_api_key', {
    provider,
    key,
  })) as RawAuthSave

  return {
    ok: raw.ok === true,
    exitCode: raw.exit_code ?? null,
    stdout: raw.stdout ?? '',
    stderr: raw.stderr ?? '',
  }
}

export interface ProviderModelsResult {
  ok: boolean
  supported: boolean
  status: number | null
  models: string[]
  error: string | null
}

type RawModels = {
  ok?: boolean
  supported?: boolean
  status?: number | null
  models?: string[]
  error?: string | null
}

export async function listProviderModels(
  provider: string,
  key: string,
): Promise<ProviderModelsResult | null> {
  if (!hasTauri()) {
    return null
  }

  const raw = (await invoke('provider_list_models', {
    provider,
    key,
  })) as RawModels

  return {
    ok: raw.ok === true,
    supported: raw.supported !== false,
    status: raw.status ?? null,
    models: Array.isArray(raw.models) ? raw.models : [],
    error: raw.error ?? null,
  }
}

export interface CustomModelsResult {
  ok: boolean
  status: number | null
  models: string[]
  error: string | null
}

export async function customListModels(
  baseUrl: string,
  key: string,
): Promise<CustomModelsResult | null> {
  if (!hasTauri()) {
    return null
  }

  const raw = (await invoke('custom_list_models', {
    baseUrl,
    key,
  })) as {
    ok?: boolean
    status?: number | null
    models?: string[]
    error?: string | null
  }

  return {
    ok: raw.ok === true,
    status: raw.status ?? null,
    models: Array.isArray(raw.models) ? raw.models : [],
    error: raw.error ?? null,
  }
}

export interface ConfigureResult {
  ok: boolean
  error: string | null
}

export async function configureCustomProvider(
  id: string,
  baseUrl: string,
  modelIds: string[],
): Promise<ConfigureResult> {
  if (!hasTauri()) {
    return { ok: false, error: '非 Tauri 环境' }
  }

  const raw = (await invoke('openclaw_configure_custom_provider', {
    id,
    baseUrl,
    modelIds,
  })) as {
    ok?: boolean
    stdout?: string
    stderr?: string
  }

  return {
    ok: raw.ok === true,
    error: raw.ok === true ? null : (raw.stderr || raw.stdout || '未知错误'),
  }
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
