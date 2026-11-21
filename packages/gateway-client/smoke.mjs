import {
  readFileSync,
} from 'node:fs'

import {
  homedir,
} from 'node:os'

import {
  join,
} from 'node:path'

import {
  GatewayClient,
} from './client.js'


const config =
  JSON.parse(
    readFileSync(
      join(homedir(), '.openclaw', 'openclaw.json'),
      'utf8'
    )
  )

const token =
  config?.gateway?.auth?.token


const client =
  new GatewayClient({ debug: false })


client.onStateChange((state) => {
  console.log('STATE ->', state)
})


client.onEvent((event) => {

  if (event.type !== 'agent') {
    return
  }

  const {
    stream,
    data,
  } = event

  if (stream === 'lifecycle') {
    console.log(
      'AGENT lifecycle phase =',
      data?.phase
    )
    return
  }

  if (stream === 'assistant') {
    process.stdout.write(
      String(data?.delta ?? data?.text ?? '')
    )
    return
  }

  if (stream === 'tool') {
    console.log(
      'AGENT tool',
      data?.phase,
      data?.name,
      data?.isError ? 'ERROR' : ''
    )
    return
  }
})


await client.connect({
  url: 'ws://127.0.0.1:18789',
  token,
})


console.log('connected, connId =', client.connId)


/*
 * Find the main session.
 */

const list =
  await client.send('sessions.list', {})

const sessions =
  list?.sessions ?? []

const main =
  sessions.find((s) => s.isMain) ?? sessions[0]

const sessionKey =
  main?.key

console.log(
  'main session key =',
  sessionKey
)


/*
 * Subscribe to session messages.
 */

const sub =
  await client.send('sessions.messages.subscribe', {
    key: sessionKey,
  })

console.log(
  'subscribe result =',
  JSON.stringify(sub)?.slice(0, 200)
)


/*
 * Send a chat message.
 */

console.log('=== sending message ===')

const send =
  await client.sendMessage(
    sessionKey,
    '你好，用一句话介绍你自己。'
  )

console.log(
  'chat.send result =',
  JSON.stringify(send)?.slice(0, 200)
)


/*
 * Observe the run for a while.
 */

await new Promise((r) => setTimeout(r, 15000))

console.log('\n=== final state =', client.state)

client.disconnect()
