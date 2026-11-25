import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

import { markSetupCompleted } from '../system/setupState'

interface Probe {
  ok: boolean
  version: string | null
  path: string | null
  detail: string | null
}

interface EnvCheck {
  webview2: Probe
  node: Probe
  openclaw: Probe
}

interface InstallStatus {
  running: boolean
  exit_code: number | null
  log: string
}

const NODE_URL = 'https://nodejs.org/zh-cn/download'
const WEBVIEW2_URL = 'https://developer.microsoft.com/microsoft-edge/webview2/'
const MIRROR = 'https://registry.npmmirror.com'

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function statusText(probe: Probe | undefined): string {
  if (!probe) return '检测中…'
  if (probe.ok) return probe.version ? `已就绪（${probe.version}）` : '已就绪'
  return probe.detail ?? '未就绪'
}

function explainFailure(log: string, exitCode: number | null): string {
  const text = log.toLowerCase()

  if (text.includes('econnreset') || text.includes('etimedout') || text.includes('network') || text.includes('fetch failed')) {
    return '网络连接被中断（常见于访问 npm 官方源）。请点「使用国内源安装」重试。'
  }

  if (text.includes('eperm') || text.includes('eacces') || text.includes('operation not permitted')) {
    return '权限被拒绝（可能被杀毒软件拦截）。请把 Node.js / npm 加入白名单后重试，或手动执行：npm i -g openclaw'
  }

  if (text.includes('404') || text.includes('not found')) {
    return 'npm 源里找不到包，可能源异常。请换国内源重试。'
  }

  if (text.includes('enotfound') || text.includes('getaddrinfo')) {
    return 'DNS 解析失败，请检查网络或代理设置。'
  }

  if (text.includes('未找到 npm')) {
    return '没有找到 npm，请先安装 Node.js 18+ 并点「重新检测」。'
  }

  return `安装失败（exit ${exitCode ?? '未知'}）。可先尝试「使用国内源安装」。`
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [env, setEnv] = useState<EnvCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)
  const [lastFailed, setLastFailed] = useState(false)
  const pollTimer = useRef<number | null>(null)
  const autoRetried = useRef(false)

  const check = useCallback(async () => {
    if (!hasTauri()) {
      setEnv({
        webview2: { ok: true, version: null, path: null, detail: '浏览器环境' },
        node: { ok: true, version: null, path: null, detail: '浏览器环境' },
        openclaw: { ok: false, version: null, path: null, detail: '需要桌面端' },
      })
      return
    }

    setChecking(true)
    try {
      const result = (await invoke('env_check')) as EnvCheck
      setEnv(result)
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check()
    const timer = window.setInterval(() => {
      void check()
    }, 5000)

    return () => {
      window.clearInterval(timer)
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [check])

  const openUrl = async (url: string) => {
    if (!hasTauri()) {
      window.open(url, '_blank')
      return
    }
    try {
      await invoke('open_url', { url })
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error))
    }
  }

  const installOpenClaw = useCallback(
    async (registry?: string, isAutoRetry = false) => {
      if (!hasTauri()) return

      setInstalling(true)
      setInstallError(null)
      setLastFailed(false)
      if (!isAutoRetry) setInstallLog('')

      try {
        await invoke('openclaw_install', { registry: registry ?? null })
      } catch (error) {
        setInstalling(false)
        setLastFailed(true)
        setInstallError(error instanceof Error ? error.message : String(error))
        return
      }

      if (pollTimer.current) window.clearInterval(pollTimer.current)

      pollTimer.current = window.setInterval(async () => {
        try {
          const status = (await invoke('openclaw_install_status')) as InstallStatus
          setInstallLog(status.log ?? '')

          if (status.running) return

          if (pollTimer.current) window.clearInterval(pollTimer.current)
          pollTimer.current = null
          setInstalling(false)

          if (status.exit_code === 0) {
            setLastFailed(false)
            autoRetried.current = false
            await check()
            return
          }

          // 先试官方源失败：自动用国内源再试一次
          if (!registry && !autoRetried.current) {
            autoRetried.current = true
            setInstallLog((current) => `${current}\n\n[自动重试] 官方源失败，改用国内镜像…\n`)
            await installOpenClaw(MIRROR, true)
            return
          }

          setLastFailed(true)
          setInstallError(explainFailure(status.log ?? '', status.exit_code))
        } catch {
          // 忽略单次轮询失败
        }
      }, 800)
    },
    [check],
  )

  const finish = () => {
    markSetupCompleted()
    onDone()
  }

  const nodeReady = env?.node.ok === true
  const openclawReady = env?.openclaw.ok === true
  const allReady = nodeReady && openclawReady && env?.webview2.ok === true
  const showLog = installing || lastFailed || installLog.length > 0

  return (
    <div className="fjk-setup" role="dialog" aria-label="环境检查">
      <div className="fjk-setup-card">
        <div className="fjk-setup-head">
          <h2>环境检查</h2>
          <p>FJK 依赖下面三项，全部就绪后即可开始对话。</p>
        </div>

        <div className="fjk-setup-rows">
          <div className="fjk-setup-row">
            <div>
              <strong>WebView2</strong>
              <small>{statusText(env?.webview2)}</small>
            </div>
            {env?.webview2.ok ? (
              <span className="fjk-setup-ok">✓</span>
            ) : (
              <button type="button" onClick={() => void openUrl(WEBVIEW2_URL)}>
                打开下载页
              </button>
            )}
          </div>

          <div className="fjk-setup-row">
            <div>
              <strong>Node.js 18+</strong>
              <small>{statusText(env?.node)}</small>
            </div>
            {nodeReady ? (
              <span className="fjk-setup-ok">✓</span>
            ) : (
              <button type="button" onClick={() => void openUrl(NODE_URL)}>
                打开下载页
              </button>
            )}
          </div>

          <div className="fjk-setup-row">
            <div>
              <strong>OpenClaw CLI</strong>
              <small>{statusText(env?.openclaw)}</small>
            </div>
            {openclawReady ? (
              <span className="fjk-setup-ok">✓</span>
            ) : (
              <div className="fjk-setup-buttons">
                <button
                  type="button"
                  className="fjk-setup-primary"
                  disabled={!nodeReady || installing}
                  onClick={() => void installOpenClaw(MIRROR)}
                >
                  {installing ? '安装中…' : nodeReady ? '使用国内源安装' : '需先装 Node'}
                </button>
                <button
                  type="button"
                  disabled={!nodeReady || installing}
                  onClick={() => void installOpenClaw()}
                >
                  官方源安装
                </button>
              </div>
            )}
          </div>
        </div>

        {installError && (
          <div className="fjk-setup-error">
            <div>{installError}</div>
            <div className="fjk-setup-error-actions">
              <button
                type="button"
                disabled={!nodeReady || installing}
                onClick={() => void installOpenClaw(MIRROR)}
              >
                使用国内源重试
              </button>
              <button
                type="button"
                disabled={!nodeReady || installing}
                onClick={() => void installOpenClaw()}
              >
                官方源重试
              </button>
            </div>
          </div>
        )}

        {showLog && (
          <div className="fjk-setup-log">
            <div className="fjk-setup-log-head">npm 输出</div>
            <pre>{installLog.slice(-4000) || (installing ? '正在启动 npm…' : '暂无输出')}</pre>
          </div>
        )}

        <div className="fjk-setup-actions">
          <button type="button" onClick={() => void check()} disabled={checking}>
            {checking ? '检测中…' : '重新检测'}
          </button>
          <button type="button" className="fjk-setup-primary" onClick={finish} disabled={!allReady}>
            {allReady ? '完成，进入主界面' : '三项就绪后才能继续'}
          </button>
          <button type="button" className="fjk-setup-skip" onClick={finish}>
            跳过，稍后配置
          </button>
        </div>
      </div>
    </div>
  )
}
