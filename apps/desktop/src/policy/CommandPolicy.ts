/*
 * CommandPolicy —— exec 审批的风险分级
 *
 * 分三档：
 * - allow：只读、无副作用，自动放行（不含管道/重定向/串联）
 * - deny ：明确破坏性，自动拒绝
 * - ask  ：其余一律弹审批（当前默认行为）
 */

export type PolicyDecision = 'allow' | 'deny' | 'ask'

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
}

export interface CommandPolicyRules {
  allow: string[]
  deny: string[]
}

export const DEFAULT_COMMAND_POLICY: CommandPolicyRules = {
  allow: [
    '^\\s*(dir|ls|pwd)\\b',
    '^\\s*cd\\s',
    '^\\s*type\\s',
    '^\\s*Get-Content\\b',
    '^\\s*Get-ChildItem\\b',
    '^\\s*Get-Item\\b',
    '^\\s*Test-Path\\b',
    '^\\s*where\\s',
    '^\\s*which\\s',
    '^\\s*echo\\s',
    '^\\s*netstat\\b',
    '^\\s*findstr\\b',
    '^\\s*git\\s+(status|diff|log|show|branch|remote|rev-parse|ls-files)\\b',
    '^\\s*(node|npm|pnpm|yarn|python|cargo|rustc)\\s+(--version|-v|version)\\b',
    '^\\s*git\\s+--version\\b',
    '^\\s*cmd(\\.exe)?\\s+/c\\s+(dir|type|where|findstr|echo)\\b',
    '^\\s*(powershell|pwsh)(\\.exe)?\\s+.*(-command|-c)[\\s"\']*(get-childitem|get-content|test-path|get-item)\\b',
  ],
  deny: [
    '\\brm\\s+-[a-z]*r[a-z]*f\\b',
    '\\bRemove-Item\\b.*-Recurse\\b.*-Force\\b',
    '\\bdel\\s+/[fsq]\\b',
    '\\bformat\\s+[a-z]:',
    '\\bshutdown\\b',
    '\\brestart-computer\\b',
    '\\bgit\\s+push\\s+--force\\b',
    '\\bgit\\s+reset\\s+--hard\\b',
    '\\breg\\s+delete\\b',
    '\\bmkfs\\b',
    '\\bdiskpart\\b',
    '\\bRemove-Item\\b.*(Windows|Program Files)',
    '^\\s*cmd(\\.exe)?\\s+/c\\s+(del|rd|rmdir|format|diskpart|shutdown)\\b',
    '^\\s*(powershell|pwsh)(\\.exe)?\\s+.*(-command|-c)[\\s"\']*(remove-item|rm)\\b',
  ],
}

const STORAGE_KEY = 'fjk-command-policy-v1'

function compile(patterns: string[]): RegExp[] {
  return patterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, 'i')]
    } catch {
      return []
    }
  })
}

export class CommandPolicy {

  constructor(rules: CommandPolicyRules = DEFAULT_COMMAND_POLICY) {
    this.rules = rules
    this.allowRules = compile(rules.allow)
    this.denyRules = compile(rules.deny)
  }

  rules: CommandPolicyRules
  private allowRules: RegExp[]
  private denyRules: RegExp[]

  summary() {
    return {
      allow: this.allowRules.length,
      deny: this.denyRules.length,
    }
  }

  /* 分级主函数 */
  classify(commandText: string): PolicyResult {
    const text = String(commandText ?? '').trim()

    if (!text) {
      return { decision: 'ask', reason: 'empty command' }
    }

    if (this.denyRules.some((rule) => rule.test(text))) {
      return { decision: 'deny', reason: '命中危险命令规则' }
    }

    /*
     * 只读命令必须“单条且无副作用”才自动放行：
     * 含管道、重定向、串联的，一律交人工。
     */
    const hasChaining = /[|&;><`\n]/.test(text)

    if (
      !hasChaining &&
      this.allowRules.some((rule) => rule.test(text))
    ) {
      return { decision: 'allow', reason: '命中只读命令规则' }
    }

    return { decision: 'ask', reason: '未命中规则，需人工审批' }
  }
}

export function loadCommandPolicy(): CommandPolicyRules {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return DEFAULT_COMMAND_POLICY
    }

    const parsed = JSON.parse(raw) as Partial<CommandPolicyRules>

    return {
      allow: Array.isArray(parsed.allow) ? parsed.allow : DEFAULT_COMMAND_POLICY.allow,
      deny: Array.isArray(parsed.deny) ? parsed.deny : DEFAULT_COMMAND_POLICY.deny,
    }
  } catch {
    return DEFAULT_COMMAND_POLICY
  }
}

export function createCommandPolicy(): CommandPolicy {
  return new CommandPolicy(loadCommandPolicy())
}
