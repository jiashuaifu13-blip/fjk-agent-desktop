#!/usr/bin/env node
/*
 * fjk-cua —— @trycua/cua-driver 的薄适配层（不改 SDK 源码）
 *
 * 只做参数解析、BigInt 安全序列化、错误归一化；桌面能力全部来自官方 SDK。
 * 设计原则：只读命令默认可用；写操作交由 fjkctl / 上层审批控制。
 */

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CANDIDATES = [
  process.env.FJK_CUA_DRIVER_PATH,
  process.env.APPDATA &&
    `${process.env.APPDATA}/npm/node_modules/openclaw/node_modules/@trycua/cua-driver/dist/index.js`,
  process.env.LOCALAPPDATA &&
    `${process.env.LOCALAPPDATA}/npm/node_modules/openclaw/node_modules/@trycua/cua-driver/dist/index.js`,
].filter(Boolean)

function out(value) {
  console.log(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)))
}

function fail(message, extra) {
  out({ ok: false, error: message, ...(extra ?? {}) })
  process.exit(1)
}

function flag(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function flagNumber(args, name) {
  const raw = flag(args, name)
  return raw === undefined ? undefined : Number(raw)
}

async function loadDriver() {
  let lastError = '未找到 @trycua/cua-driver'

  for (const candidate of CANDIDATES) {
    try {
      const mod = await import(pathToFileURL(candidate).href)
      const CuaDriver = mod.CuaDriver ?? mod.default?.CuaDriver ?? mod.default
      if (typeof CuaDriver?.create !== 'function') {
        lastError = `SDK 缺少 create()：${candidate}`
        continue
      }
      return { driver: CuaDriver.create(), path: candidate }
    } catch (error) {
      lastError = `${candidate} → ${String(error && error.message).slice(0, 200)}`
    }
  }

  fail(lastError)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    console.log(
      [
        'fjk-cua —— 基于 @trycua/cua-driver 的只读桌面能力',
        '',
        '  fjk-cua list-windows',
        '  fjk-cua window-elements --pid P --window-id W [--max N] [--tree]',
        '  fjk-cua desktop-state [--screenshot-out PATH]',
        '  fjk-cua screenshot --out PATH',
        '  fjk-cua clipboard-get',
        '',
        '说明：写操作（点击/输入）请用 fjkctl，便于统一审批与审计。',
      ].join('\n'),
    )
    return
  }

  const { driver } = await loadDriver()

  if (command === 'list-windows') {
    const result = await driver.listWindows({})
    const windows = (result.windows ?? []).map((item) => ({
      windowId: String(item.windowId),
      pid: Number(item.pid),
      title: item.title ?? '',
      appName: item.appName ?? '',
      bounds: item.bounds ?? null,
      isOnScreen: Boolean(item.isOnScreen),
      minimized: Boolean(item.minimized),
      zIndex: item.zIndex ?? null,
    }))

    out({ ok: true, count: windows.length, windows })
    return
  }

  if (command === 'window-elements') {
    const pid = flagNumber(args, '--pid')
    const windowId = flag(args, '--window-id')
    const maxElements = flagNumber(args, '--max') ?? 30

    if (!pid || !windowId) fail('需要 --pid 与 --window-id')

    const state = await driver.getWindowState({
      pid,
      windowId: BigInt(windowId),
      includeAccessibilityTree: true,
      maxElements,
      timeoutMs: 2500,
    })

    const elements = (state.elements ?? []).map((element) => ({
      role: element.role ?? element.controlType ?? null,
      name: element.name ?? element.title ?? null,
      bounds: element.bounds ?? null,
      actions: element.actions ?? null,
    }))

    out({
      ok: true,
      title: state.windowTitle ?? null,
      elementCount: String(state.elementCount ?? 0),
      totalElementCount: String(state.totalElementCount ?? 0),
      degraded: Boolean(state.degraded),
      degradedReason: state.degradedReason ?? null,
      elements,
      ...(args.includes('--tree') ? { treeMarkdown: state.treeMarkdown ?? '' } : {}),
    })
    return
  }

  if (command === 'desktop-state' || command === 'screenshot') {
    const outPath = flag(args, '--screenshot-out') ?? flag(args, '--out')
    const state = await driver.getDesktopState({ includeAccessibilityTree: false })
    const structured = JSON.parse(state.structuredJson ?? '{}')
    const image = (state.images ?? [])[0]

    let savedPath = null

    if (outPath && image?.dataBase64) {
      writeFileSync(outPath, Buffer.from(image.dataBase64, 'base64'))
      savedPath = outPath
    }

    out({
      ok: true,
      width: structured.screenshot_width ?? structured.screen_width ?? null,
      height: structured.screenshot_height ?? structured.screen_height ?? null,
      scaleFactor: structured.scale_factor ?? null,
      display: structured.display ?? null,
      path: savedPath,
    })
    return
  }

  if (command === 'clipboard-get') {
    const clip = await driver.clipboardRead({ includeText: true })
    const structured = JSON.parse(clip.structuredJson ?? '{}')

    out({
      ok: true,
      supported: structured.supported ?? false,
      types: structured.available_types ?? structured.types ?? null,
      text: structured.text ?? null,
    })
    return
  }

  fail(`未知命令：${command}`)
}

await main()
