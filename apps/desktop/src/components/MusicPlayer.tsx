import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Track {
  name: string
  path: string
  size: number
}

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'audio/mpeg'
}

export function MusicPlayer() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const releaseUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!hasTauri()) return
    try {
      const list = (await invoke('music_list')) as Track[]
      setTracks(list)
      return list
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      releaseUrl()
    }
  }, [refresh, releaseUrl])

  const playAt = useCallback(
    async (i: number, list: Track[]) => {
      if (!hasTauri() || i < 0 || i >= list.length) return

      setBusy(true)
      setNote(null)

      try {
        const buffer = (await invoke('music_read', { path: list[i].path })) as ArrayBuffer

        releaseUrl()

        const blob = new Blob([buffer], { type: mimeOf(list[i].path) })
        const url = URL.createObjectURL(blob)
        urlRef.current = url

        if (!audioRef.current) {
          audioRef.current = new Audio()
        }

        const audio = audioRef.current
        audio.src = url
        audio.volume = 0.8

        await audio.play()

        setIndex(i)
        setPlaying(true)
      } catch (error) {
        setPlaying(false)
        setNote(`播放失败：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setBusy(false)
      }
    },
    [releaseUrl],
  )

  const start = async () => {
    if (busy) return

    const list = tracks.length > 0 ? tracks : ((await refresh()) ?? [])

    if (list.length === 0) {
      setNote('music 目录里还没有音频，点「打开目录」放几首歌')
      return
    }

    const pick = Math.floor(Math.random() * list.length)
    await playAt(pick, list)
  }

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      await audio.play().catch(() => undefined)
      setPlaying(true)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const next = async () => {
    const list = tracks.length > 0 ? tracks : ((await refresh()) ?? [])
    if (list.length === 0) return
    await playAt((index + 1) % list.length, list)
  }

  const stop = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
    }
    releaseUrl()
    setPlaying(false)
    setIndex(-1)
  }

  const openDir = async () => {
    if (!hasTauri()) return
    try {
      await invoke('music_open_dir')
      await refresh()
    } catch (error) {
      setNote(`打开目录失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const current = index >= 0 ? tracks[index] : null

  if (!playing && !current) {
    return (
      <div className="fjk-music-idle">
        <button type="button" className="fjk-music-trigger" disabled={busy} onClick={() => void start()}>
          ♪ {busy ? '准备中…' : '唱歌'}
        </button>
        <button type="button" className="fjk-music-link" onClick={() => void openDir()}>
          打开目录
        </button>
        {note && <div className="fjk-music-note">{note}</div>}
      </div>
    )
  }

  return (
    <div className="fjk-music">
      <span className="fjk-music-icon" aria-hidden="true">
        ♪
      </span>
      <span className="fjk-music-title" title={current?.name ?? ''}>
        {current?.name ?? '播放中'}
      </span>

      <button type="button" className="fjk-music-btn" onClick={() => void toggle()} aria-label="播放或暂停">
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="fjk-music-btn" onClick={() => void next()} aria-label="下一首">
        ⏭
      </button>
      <button type="button" className="fjk-music-btn" onClick={stop} aria-label="停止">
        ✕
      </button>

      {note && <span className="fjk-music-note">{note}</span>}
    </div>
  )
}
