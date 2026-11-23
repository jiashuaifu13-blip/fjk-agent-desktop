import { invoke } from '@tauri-apps/api/core'

import { DEFAULT_COMMAND_POLICY } from '../policy/CommandPolicy'
import type { CommandPolicyRules, PolicyGrant } from '../policy/CommandPolicy'

/*
 * 用户级策略文件（Global 策略）
 *
 * 位置：%APPDATA%\com.fjk.agent\policy.json
 * 语义：文件里出现的键替换默认键，缺省的键继续用内置默认
 *       { "allow": ["^regex"], "deny": ["^regex"], "protected": ["^regex"] }
 */

export interface AppPolicyState {
  rules: CommandPolicyRules
  source: 'file' | 'defaults' | 'invalid'
  path: string
  error: string | null
}

const POLICY_TEMPLATE = JSON.stringify(
  {
    allow: DEFAULT_COMMAND_POLICY.allow,
    deny: DEFAULT_COMMAND_POLICY.deny,
    protected: DEFAULT_COMMAND_POLICY.protected,
    projectRoots: [] as string[],
    grants: [] as PolicyGrant[],
  },
  null,
  2,
)

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isValidRegexList(patterns: unknown): patterns is string[] {
  if (!Array.isArray(patterns)) {
    return false
  }

  return patterns.every((pattern) => {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return false
    }

    try {
      new RegExp(pattern, 'i')
      return true
    } catch {
      return false
    }
  })
}

export async function loadAppPolicy(): Promise<AppPolicyState> {
  const fallback: AppPolicyState = {
    rules: DEFAULT_COMMAND_POLICY,
    source: 'defaults',
    path: '',
    error: null,
  }

  if (!hasTauri()) {
    return fallback
  }

  try {
    const raw = (await invoke('policy_load')) as {
      path?: string
      exists?: boolean
      content?: string | null
      error?: string
    }

    const path = raw.path ?? ''

    if (raw.error) {
      return { rules: DEFAULT_COMMAND_POLICY, source: 'invalid', path, error: raw.error }
    }

    if (!raw.exists || !raw.content) {
      return { ...fallback, path }
    }

    const parsed = JSON.parse(raw.content) as Partial<CommandPolicyRules>

    const rules: CommandPolicyRules = {
      allow: isValidRegexList(parsed.allow)
        ? parsed.allow
        : DEFAULT_COMMAND_POLICY.allow,
      deny: isValidRegexList(parsed.deny)
        ? parsed.deny
        : DEFAULT_COMMAND_POLICY.deny,
      protected: isValidRegexList(parsed.protected)
        ? parsed.protected
        : DEFAULT_COMMAND_POLICY.protected,
      grants: Array.isArray(parsed.grants)
        ? parsed.grants.filter(
            (grant): grant is PolicyGrant =>
              typeof (grant as PolicyGrant)?.id === 'string' &&
              typeof (grant as PolicyGrant)?.pattern === 'string' &&
              typeof (grant as PolicyGrant)?.expiresAt === 'number' &&
              (() => {
                try {
                  new RegExp((grant as PolicyGrant).pattern, 'i')
                  return true
                } catch {
                  return false
                }
              })(),
          )
        : DEFAULT_COMMAND_POLICY.grants,
      projectRoots: Array.isArray(parsed.projectRoots)
        ? parsed.projectRoots.filter((root): root is string => typeof root === 'string')
        : DEFAULT_COMMAND_POLICY.projectRoots,
    }

    return { rules, source: 'file', path, error: null }
  } catch (error) {
    return {
      ...fallback,
      source: 'invalid',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function addPolicyGrant(
  pattern: string,
  resource: string | null,
  minutes: number,
): Promise<{ ok: boolean; grant: PolicyGrant | null; error: string | null }> {

  if (!hasTauri()) {
    return { ok: false, grant: null, error: '非 Tauri 环境' }
  }

  const state = await loadAppPolicy()

  if (state.source === 'invalid') {
    return { ok: false, grant: null, error: state.error ?? 'policy.json 无效' }
  }

  const now = Date.now()

  const grant: PolicyGrant = {
    id: `g-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    pattern,
    ...(resource ? { resource } : {}),
    expiresAt: now + Math.max(1, minutes) * 60_000,
    createdAt: now,
  }

  const next: CommandPolicyRules = {
    ...state.rules,
    grants: [...state.rules.grants, grant],
  }

  const content = JSON.stringify(next, null, 2)

  try {
    const result = (await invoke('policy_save', { content })) as string

    if (typeof result === 'string' && result.startsWith('ERROR:')) {
      return { ok: false, grant: null, error: result.slice(6).trim() }
    }

    return { ok: true, grant, error: null }
  } catch (error) {
    return {
      ok: false,
      grant: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}


/**
 * 打开 policy.json：
 * - 文件不存在时先写入完整模板，再打开
 * - 用系统默认程序（记事本/VSCode 等）打开
 * 返回空字符串表示成功，否则是错误说明
 */
export async function openPolicyFile(): Promise<string> {

  if (!hasTauri()) {
    return '非 Tauri 环境'
  }

  const template = await writePolicyTemplate()

  if (!template.ok) {
    return `写入模板失败：${template.error ?? '未知'}`
  }

  try {
    const result = (await invoke('policy_open')) as string

    return result ?? ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** 在资源管理器中定位 policy.json（不存在时先创建模板） */
export async function revealPolicyFile(): Promise<string> {

  if (!hasTauri()) {
    return '非 Tauri 环境'
  }

  const template = await writePolicyTemplate()

  if (!template.ok) {
    return `写入模板失败：${template.error ?? '未知'}`
  }

  try {
    const result = (await invoke('policy_reveal')) as string

    return result ?? ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}


export async function writePolicyTemplate(): Promise<{
  ok: boolean
  path: string
  error: string | null
}> {
  if (!hasTauri()) {
    return { ok: false, path: '', error: '非 Tauri 环境' }
  }

  try {
    const result = (await invoke('policy_save', {
      content: POLICY_TEMPLATE,
    })) as string

    if (typeof result === 'string' && result.startsWith('ERROR:')) {
      return { ok: false, path: '', error: result.slice(6).trim() }
    }

    return { ok: true, path: result, error: null }
  } catch (error) {
    return {
      ok: false,
      path: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
