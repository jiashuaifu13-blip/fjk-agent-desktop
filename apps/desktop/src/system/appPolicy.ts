import { invoke } from '@tauri-apps/api/core'

import { DEFAULT_COMMAND_POLICY } from '../policy/CommandPolicy'
import type { CommandPolicyRules } from '../policy/CommandPolicy'

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
