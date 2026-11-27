// FJK 语音合成辅助脚本
//
// 用法：node voice_tts.js <输出路径> [语音名]
// 文本从标准输入读取（避免中文与特殊字符在命令行里被转义）。
//
// 依赖 openclaw 自带的 node-edge-tts（由调用方通过 NODE_PATH 指向
// openclaw/node_modules），因此本软件不需要额外安装任何 npm 包。

const fs = require('node:fs')

let input = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})

process.stdin.on('end', async () => {
  const out = process.argv[2]
  const voice = process.argv[3] || 'zh-CN-XiaoxiaoNeural'

  if (!out) {
    console.error('缺少输出路径')
    process.exit(2)
  }

  const text = input.trim()

  if (!text) {
    console.error('文本为空')
    process.exit(2)
  }

  let EdgeTTS

  try {
    ;({ EdgeTTS } = require('node-edge-tts'))
  } catch (error) {
    console.error(
      'NODE_EDGE_TTS_MISSING: 未找到 node-edge-tts（需要 OpenClaw 已安装）：' +
        (error && error.message ? error.message : String(error)),
    )
    process.exit(3)
  }

  const tts = new EdgeTTS({
    voice,
    lang: 'zh-CN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    timeout: 25000,
  })

  try {
    await tts.ttsPromise(text, out)
    const size = fs.statSync(out).size

    if (size <= 0) {
      console.error('生成的音频为空')
      process.exit(4)
    }

    console.log('OK ' + size)
  } catch (error) {
    console.error('TTS_FAILED: ' + (error && error.message ? error.message : String(error)))
    process.exit(5)
  }
})
