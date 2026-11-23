/*
 * CommandPolicy —— exec 审批的风险分级
 *
 * 判定顺序：
 *   1. strict 模式 → 全部人工确认
 *   2. 危险命令 → 自动拒绝
 *   3. 只读命令（单条、无管道/重定向）→ 自动放行
 *   4. 命中受保护路径（且不是只读命令）→ 自动拒绝
 *   5. 其余 → 人工审批
 *
 * 受保护路径只拦“有副作用”的命令；`dir .git` 这类只读查看仍然放行。
 */

export type PolicyDecision = 'allow' | 'deny' | 'ask'

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
}

export interface PolicyGrant {
  id: string
  /** 命令正则（整条命令匹配，忽略大小写） */
  pattern: string
  /** 可选资源前缀约束，例如 D:\\pet-desp */
  resource?: string
  /** Unix 毫秒时间戳；<= Date.now() 视为过期 */
  expiresAt: number
  createdAt: number
}

export interface CommandPolicyRules {
  allow: string[]
  deny: string[]
  protected: string[]
  projectRoots: string[]
  grants: PolicyGrant[]
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
  /**
   * 项目范围（Project Scope）。空数组 = 不启用。
   * 启用后：只读跨项目 → 人工审批；写/删跨项目 → 直接拒绝。
   */
  projectRoots: [],

  /** 用户/会话级授权（FJK 自建，非 OpenClaw 原生 grant） */
  grants: [],

  protected: [
    '[\\\\/]\\.git[\\\\/]',
    '[\\\\/]\\.ai-context[\\\\/]',
    '[\\\\/]\\.openclaw[\\\\/]',
    '[\\\\/]node_modules[\\\\/]',
    '[\\\\/]src-tauri[\\\\/]target[\\\\/]',
    '[A-Za-z]:\\\\Windows\\\\',
    '[A-Za-z]:\\\\Program Files',
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
    this.protectedRules = compile(rules.protected)
    this.grants = (rules.grants ?? [])
      .filter(
        (grant) =>
          typeof grant?.id === 'string' &&
          typeof grant?.pattern === 'string' &&
          typeof grant?.expiresAt === 'number',
      )
      .map((grant) => ({
        ...grant,
        matcher: (() => {
          try {
            return new RegExp(grant.pattern, 'i')
          } catch {
            return null
          }
        })(),
      }))

    this.projectRoots = (rules.projectRoots ?? []).map((root) =>
      root.trim().replace(/[\\/]+$/, '').toLowerCase(),
    )
  }

  rules: CommandPolicyRules
  private allowRules: RegExp[]
  private denyRules: RegExp[]
  private protectedRules: RegExp[]
  private projectRoots: string[]
  private grants: Array<PolicyGrant & { matcher: RegExp | null }>

  summary() {
    return {
      allow: this.allowRules.length,
      deny: this.denyRules.length,
      protectedPaths: this.protectedRules.length,
      projectRoots: this.projectRoots.length,
      grants: this.grants.length,
    }
  }

  /* 分级主函数 */
  private findGrant(
    text: string,
  ): PolicyGrant | null {

    const now = Date.now()

    for (const grant of this.grants) {
      if (!grant.matcher || grant.expiresAt <= now) {
        continue
      }

      if (!grant.matcher.test(text)) {
        continue
      }

      if (grant.resource) {
        const prefix = grant.resource.toLowerCase()
        const lower = text.toLowerCase()

        if (!lower.includes(prefix)) {
          continue
        }
      }

      return grant
    }

    return null
  }


  private checkProjectScope(
    text: string,
    hasChaining: boolean,
  ): PolicyResult | null {

    if (this.projectRoots.length === 0) {
      return null
    }

    const pathMatch = text.match(/[A-Za-z]:\\[^\s"']+/)

    if (!pathMatch) {
      return null
    }

    const target = pathMatch[0]
      .replace(/[\\/]+$/, '')
      .toLowerCase()

    const inside = this.projectRoots.some(
      (root) =>
        target === root ||
        target.startsWith(root + '\\') ||
        target.startsWith(root + '/'),
    )

    if (inside) {
      return null
    }

    const writeLike =
      hasChaining ||
      /\b(mkdir|md|copy|move|ren|rename|set-content|out-file|new-item|del|erase|rmdir|rd|remove-item|unlink)\b/i.test(
        text,
      )

    return writeLike
      ? { decision: 'deny', reason: '目标路径超出项目范围（写/删）' }
      : { decision: 'ask', reason: '目标路径超出项目范围（只读也需人工确认）' }
  }


  classify(
    commandText: string,
    mode: 'tiered' | 'strict' = 'tiered',
  ): PolicyResult {
    const text = String(commandText ?? '').trim()

    if (!text) {
      return { decision: 'ask', reason: 'empty command' }
    }

    if (mode === 'strict') {
      return { decision: 'ask', reason: '严格模式：一律人工确认' }
    }

    if (this.denyRules.some((rule) => rule.test(text))) {
      return { decision: 'deny', reason: '命中危险命令规则' }
    }

    /*
     * 只读命令必须“单条且无副作用”才自动放行：
     * 含管道、重定向、串联的，一律交人工。
     */
    const hasChaining = /[|&;><`\n]/.test(text)

    const grant = this.findGrant(text)

    if (grant) {
      return { decision: 'allow', reason: `grant:${grant.id}` }
    }

    /*
     * 项目范围优先于“只读自动放行”：
     * 跨项目的只读也要人工确认，跨项目的写入直接拒绝。
     */
    const scope = this.checkProjectScope(text, hasChaining)

    if (scope) {
      return scope
    }

    if (
      !hasChaining &&
      this.allowRules.some((rule) => rule.test(text))
    ) {
      return { decision: 'allow', reason: '命中只读命令规则' }
    }

    if (this.protectedRules.some((rule) => rule.test(text))) {
      return { decision: 'deny', reason: '命中受保护路径（禁止写入/删除）' }
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
      allow: Array.isArray(parsed.allow)
        ? parsed.allow
        : DEFAULT_COMMAND_POLICY.allow,
      deny: Array.isArray(parsed.deny)
        ? parsed.deny
        : DEFAULT_COMMAND_POLICY.deny,
      protected: Array.isArray(parsed.protected)
        ? parsed.protected
        : DEFAULT_COMMAND_POLICY.protected,
      grants: Array.isArray(parsed.grants)
        ? parsed.grants.filter(
            (grant): grant is PolicyGrant =>
              typeof (grant as PolicyGrant)?.id === 'string' &&
              typeof (grant as PolicyGrant)?.pattern === 'string' &&
              typeof (grant as PolicyGrant)?.expiresAt === 'number',
          )
        : DEFAULT_COMMAND_POLICY.grants,
      projectRoots: Array.isArray(parsed.projectRoots)
        ? parsed.projectRoots.filter((root) => typeof root === 'string')
        : DEFAULT_COMMAND_POLICY.projectRoots,
    }
  } catch {
    return DEFAULT_COMMAND_POLICY
  }
}

export function createCommandPolicy(
  rules?: CommandPolicyRules,
): CommandPolicy {
  return new CommandPolicy(rules ?? loadCommandPolicy())
}
