import { useEffect, useRef, useState } from 'react'

interface PerfSample {
  fps: number
  worstFrameMs: number
  longTasks: number
  heapMb: number | null
}

/**
 * 隐藏性能 HUD：Ctrl+Shift+P 切换。
 * 只用 rAF 统计帧率与长任务，不产生额外渲染压力（1s 才 setState 一次）。
 */
export function PerfHud() {
  const [visible, setVisible] = useState(false)
  const [sample, setSample] = useState<PerfSample>({
    fps: 0,
    worstFrameMs: 0,
    longTasks: 0,
    heapMb: null,
  })

  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === 'P' || event.key === 'p')) {
        event.preventDefault()
        setVisible((value) => !value)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!visible) return

    let frames = 0
    let windowStart = performance.now()
    let worst = 0
    let last = performance.now()
    let longTasks = 0
    let raf = 0
    let stopped = false

    const observer =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
        ? new PerformanceObserver((list) => {
            longTasks += list.getEntries().length
          })
        : null

    observer?.observe({ type: 'longtask', buffered: true })

    const loop = (now: number) => {
      if (stopped) return

      const delta = now - last
      last = now

      if (delta > worst) worst = delta
      frames += 1

      const elapsed = now - windowStart

      if (elapsed >= 1000) {
        const fps = Math.round((frames * 1000) / elapsed)
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        const heapMb = memory ? Math.round(memory.usedJSHeapSize / 1048576) : null

        setSample({
          fps,
          worstFrameMs: Math.round(worst * 10) / 10,
          longTasks,
          heapMb,
        })

        const payload = { fps, worstFrameMs: worst, longTasks, heapMb }
        ;(window as unknown as { __fjkPerf?: unknown }).__fjkPerf = payload
        console.info('[fjk-perf]', JSON.stringify(payload))

        frames = 0
        worst = 0
        windowStart = now
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="fjk-perf-hud" role="status" aria-label="性能指标">
      <span>FPS {sample.fps}</span>
      <span>最差帧 {sample.worstFrameMs}ms</span>
      <span>长任务 {sample.longTasks}</span>
      {sample.heapMb !== null && <span>堆 {sample.heapMb}MB</span>}
      <span className="fjk-perf-hint">Ctrl+Shift+P 关闭</span>
    </div>
  )
}
