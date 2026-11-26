import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** 消息条数 */
  count: number
  /** 每条消息的稳定 key（用于缓存高度） */
  keys: string[]
  /** 滚动容器 */
  containerRef: React.RefObject<HTMLDivElement>
  /** 未测量项的估算高度 */
  estimate?: number
  /** 可视区上下额外渲染条数 */
  overscan?: number
  /** 关闭时返回 null，调用方走全量渲染 */
  enabled: boolean
}

interface Range {
  start: number
  end: number
  padTop: number
  padBottom: number
}

const EMPTY: Range = { start: 0, end: 0, padTop: 0, padBottom: 0 }

/**
 * 轻量消息虚拟滚动（可变高度）。
 *
 * 设计目标：只渲染可视区 + overscan，其余用上下两个 spacer 撑开高度。
 * - 高度缓存在 Map<key, number>，新消息先按 estimate 估算，渲染后实测修正
 * - 监听滚动与容器尺寸变化，rAF 合并更新，避免滚动时抖动
 * - 关闭（enabled=false）时直接返回 null，调用方保持原有全量渲染
 */
export function useVirtualMessages({
  count,
  keys,
  containerRef,
  estimate = 96,
  overscan = 6,
  enabled,
}: Options): Range | null {
  const heightsRef = useRef<Map<string, number>>(new Map())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  const frameRef = useRef<number | null>(null)

  // 滚动 / 尺寸监听
  useEffect(() => {
    if (!enabled) return

    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        setScrollTop(el.scrollTop)
      })
    }

    const observer = new ResizeObserver(() => {
      setViewport(el.clientHeight)
    })

    observer.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    setScrollTop(el.scrollTop)
    setViewport(el.clientHeight)

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [containerRef, enabled])

  // 渲染后实测可见项高度，写回缓存
  useEffect(() => {
    if (!enabled) return

    const el = containerRef.current
    if (!el) return

    const raf = window.requestAnimationFrame(() => {
      const nodes = el.querySelectorAll<HTMLElement>('[data-vms-key]')
      let changed = false

      nodes.forEach((node) => {
        const key = node.dataset.vmsKey
        if (!key) return
        const height = node.getBoundingClientRect().height
        if (height <= 0) return
        const previous = heightsRef.current.get(key)
        if (previous === undefined || Math.abs(previous - height) > 1) {
          heightsRef.current.set(key, height)
          changed = true
        }
      })

      // 高度变化后重算：通过 scrollTop 归零后恢复，触发一次重排
      if (changed) {
        setScrollTop((current) => current + 0)
      }
    })

    return () => window.cancelAnimationFrame(raf)
  })

  const measure = useCallback(
    (key: string): number => heightsRef.current.get(key) ?? estimate,
    [estimate],
  )

  if (!enabled || count === 0) {
    return null
  }

  // 累加偏移，找可视区间
  let offset = 0
  let start = 0
  let end = count

  for (let index = 0; index < count; index += 1) {
    const height = measure(keys[index] ?? String(index))
    const next = offset + height

    if (next <= scrollTop) {
      start = index + 1
    }

    if (offset >= scrollTop + (viewport || 600)) {
      end = index
      break
    }

    offset = next
  }

  start = Math.max(0, Math.min(start - overscan, count))
  end = Math.min(count, Math.max(end + overscan, start + 1))

  let padTop = 0
  for (let index = 0; index < start; index += 1) {
    padTop += measure(keys[index] ?? String(index))
  }

  let padBottom = 0
  for (let index = end; index < count; index += 1) {
    padBottom += measure(keys[index] ?? String(index))
  }

  return { start, end, padTop, padBottom }
}

export const EMPTY_RANGE = EMPTY
