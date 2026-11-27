import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Phase = 'idle' | 'loading' | 'playing'

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 去掉情绪标记与代码块，避免把标记和代码念出来。 */
function speakable(text: string): string {
  return text
    .replace(/\[\[mood:[^\]]*\]\]/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function voiceEnabled(): boolean {
  try {
    return window.localStorage.getItem('fjk-voice-enabled') !== 'off'
  } catch {
    return true
  }
}

export function VoiceBar({ text }: { text: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [duration, setDuration] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(() => voiceEnabled())

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    const onStorage = () => setEnabled(voiceEnabled())
    window.addEventListener('fjk-voice-changed', onStorage)
    return () => window.removeEventListener('fjk-voice-changed', onStorage)
  }, [])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      audioRef.current?.pause()
    },
    [],
  )

  const play = useCallback(async () => {
    if (!hasTauri() || phase === 'loading') return

    setError(null)

    // 已经合成过：直接重播
    if (audioRef.current && urlRef.current) {
      audioRef.current.currentTime = 0
      await audioRef.current.play().catch(() => undefined)
      setPhase('playing')
      return
    }

    const clean = speakable(text)

    if (clean.length === 0) {
      setError('这条消息没有可朗读的文本')
      return
    }

    setPhase('loading')

    try {
      const buffer = (await invoke('voice_speak', { text: clean })) as ArrayBuffer

      if (!buffer || buffer.byteLength === 0) {
        throw new Error('合成结果为空')
      }

      const blob = new Blob([buffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      urlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio

      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration)) {
          setDuration(audio.duration)
        }
      })

      audio.addEventListener('ended', () => setPhase('idle'))
      audio.addEventListener('pause', () => setPhase((current) => (current === 'playing' ? 'idle' : current)))

      await audio.play()
      setPhase('playing')
    } catch (err) {
      setPhase('idle')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [phase, text])

  const stop = () => {
    audioRef.current?.pause()
    if (audioRef.current) audioRef.current.currentTime = 0
    setPhase('idle')
  }

  if (!enabled) return null

  const label =
    phase === 'loading' ? '…' : phase === 'playing' ? '❚❚' : duration ? `▶ ${Math.max(1, Math.round(duration))}″` : '🔊'

  return (
    <div className="fjk-voice-row">
      <button
        type="button"
        className={`fjk-voice-btn${phase === 'playing' ? ' is-playing' : ''}`}
        onClick={() => (phase === 'playing' ? stop() : void play())}
        disabled={phase === 'loading'}
        title={error ?? '朗读这条回复（Edge TTS）'}
      >
        {label}
      </button>

      {error && <span className="fjk-voice-error">{error.slice(0, 80)}</span>}
    </div>
  )
}

/** 设置页里的语音开关（写在 localStorage，跨重启保留）。 */
export function VoiceToggle() {
  const [enabled, setEnabled] = useState(() => voiceEnabled())

  const flip = () => {
    const next = !enabled
    try {
      window.localStorage.setItem('fjk-voice-enabled', next ? 'on' : 'off')
    } catch {
      // 忽略
    }
    setEnabled(next)
    window.dispatchEvent(new Event('fjk-voice-changed'))
  }

  return (
    <div className="connection-state-row">
      <span className="connection-state-key">语音朗读</span>

      <div className="connection-state-value">
        <div>{enabled ? '已开启（助手回复下方出现 🔊 按钮，点击朗读）' : '已关闭'}</div>

        <div className="fjk-persona-actions">
          <button type="button" className="fjk-persona-secondary" onClick={flip}>
            {enabled ? '关闭语音' : '开启语音'}
          </button>
        </div>

        <div className="fjk-persona-hint">
          使用 Edge TTS（微软在线神经网络语音），需要联网；音频缓存在本机，重复内容不再请求。
        </div>
      </div>
    </div>
  )
}
