import {
  gatewayEventToAgentState,
} from '../agent-state/GatewayEventToAgentState.js'


/**
 * GatewayClient — OpenClaw Gateway protocol v4 client.
 *
 * Browser + Node 26 compatible (uses the global WebSocket).
 *
 * Wire contract (captured in .ai-context/OPENCLAW_GATEWAY_AUTH_CONTRACT.md):
 *   request : { type:"req", id, method, params }
 *   response: { type:"response"|"res", id, ok, result, error }
 *   event   : { type:"event", event, payload }
 *   hello-ok: { type:"hello-ok", protocol, server, features }
 */
export class GatewayClient {

  constructor({
    debug = false,
  } = {}) {

    this.debug = debug

    this.ws = null
    this.connected = false
    this.connId = null
    this.features = null
    this.serverCapabilities = []

    this._state = 'offline'
    this._pending = new Map()
    this._eventListeners = new Set()
    this._stateListeners = new Set()
    this._nextId = 1

    this._connectPromise = null
    this._connectResolve = null
    this._connectReject = null
    this._connectOptions = null
  }


  get state() {
    return this._state
  }


  connect(options) {

    if (
      this.ws &&
      this.connected
    ) {
      return Promise.resolve()
    }

    this._connectOptions = options

    this._connectPromise =
      new Promise((resolve, reject) => {

        this._connectResolve = resolve
        this._connectReject = reject

        const ws =
          new WebSocket(options.url)

        this.ws = ws

        ws.addEventListener(
          'open',
          () => {
            this._log('ws open — waiting for connect.challenge')
          }
        )

        ws.addEventListener(
          'message',
          (event) => {
            this._handleMessage(event.data)
          }
        )

        ws.addEventListener(
          'close',
          (event) => {
            this._log('ws closed', event.code, event.reason)
            this.connected = false
            this._setState('offline')
          }
        )

        ws.addEventListener(
          'error',
          (error) => {
            this._log('ws error', error)
            this._connectReject?.(
              new Error('gateway connect failed')
            )
          }
        )
      })

    return this._connectPromise
  }


  disconnect() {

    this.ws?.close()
  }


  onStateChange(listener) {

    this._stateListeners.add(listener)

    return () => {
      this._stateListeners.delete(listener)
    }
  }


  onEvent(listener) {

    this._eventListeners.add(listener)

    return () => {
      this._eventListeners.delete(listener)
    }
  }


  send(method, params) {

    return this._send(method, params)
  }


  subscribeSessionMessages(options) {

    return this._send(
      'sessions.messages.subscribe',
      options
    )
  }


  sendMessage(sessionKey, content) {

    return this._send(
      'chat.send',
      {
        sessionKey,
        message: content,
        idempotencyKey: this._makeIdempotencyKey(),
      }
    )
  }


  _makeIdempotencyKey() {

    try {
      if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
      ) {
        return crypto.randomUUID()
      }
    } catch {
      // fall through
    }

    return (
      `${Date.now()}-` +
      `${Math.random().toString(16).slice(2)}`
    )
  }


  /* ==========================
   * internal
   * ========================== */

  _log(...args) {

    if (this.debug) {
      console.log('[gateway-client]', ...args)
    }
  }


  _handleMessage(raw) {

    let msg

    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (this.debug) {
      this._log('<<', this._safeStringify(msg))
    }


    if (msg.type === 'event') {
      this._handleEvent(msg.event, msg.payload)
      return
    }


    if (msg.type === 'hello-ok') {
      this._handleHelloOk(msg)
      return
    }


    if (
      msg.type === 'response' ||
      msg.type === 'res'
    ) {
      this._handleResponse(msg)
      return
    }
  }


  _handleEvent(name, payload) {

    if (name === 'connect.challenge') {
      this._handleConnectChallenge(payload)
      return
    }


    const event = {
      type: name,
      ...(payload ?? {}),
    }


    const next =
      gatewayEventToAgentState(event)

    if (next) {
      this._setState(next)
    }


    for (
      const listener
      of this._eventListeners
    ) {
      listener(event)
    }
  }


  _handleConnectChallenge(payload) {

    const { nonce } = payload ?? {}

    this.serverCapabilities =
      payload?.capabilities ?? []

    this._log('connect.challenge nonce=', nonce)

    const options =
      this._connectOptions ?? {}

    const connectParams = {
      minProtocol: options.protocol ?? 4,
      maxProtocol: options.protocol ?? 4,
      client: {
        id: 'gateway-client',
        displayName: 'FJK Desktop',
        version: '0.1.0',
        mode: 'backend',
        platform: options.platform ?? 'win32',
      },
      auth: {
        token: options.token,
      },
      role: options.role ?? 'operator',
      scopes: options.scopes ?? [
        'operator.admin',
        'operator.read',
        'operator.write',
        'operator.sessions.read',
        'operator.sessions.write',
        'operator.approvals',
      ],
    }


    this._send(
      'connect',
      connectParams
    ).then(
      (connectResult) => {
        this._log('connect result', this._safeStringify(connectResult))

        /*
         * The `connect` response payload IS the hello-ok
         * ({ type:"hello-ok", protocol, server, features }).
         * There is no separate `hello` wire method.
         */
        this._handleHelloOk(connectResult)
      }
    ).catch(
      (error) => {
        this._log('connect failed', error)
        this._connectReject?.(error)
      }
    )
  }


  _handleHelloOk(msg) {

    this.connId =
      msg.server?.connId ?? null

    this.features =
      msg.features ?? null

    this.connected = true

    this._log('hello-ok connId=', this.connId)

    this._setState('idle')

    this._connectResolve?.(msg)
  }


  _handleResponse(msg) {

    const entry =
      this._pending.get(msg.id)

    if (!entry) {
      return
    }

    this._pending.delete(msg.id)


    if (
      msg.error !== undefined &&
      msg.error !== null
    ) {

      entry.reject(
        msg.error
      )

      return
    }


    if (msg.ok === false) {

      entry.reject(
        new Error(
          `gateway request failed: ${msg.method ?? entry.method ?? ''}`
        )
      )

      return
    }


    entry.resolve(
      msg.result ?? msg.payload ?? msg
    )
  }


  _send(method, params) {

    return new Promise((resolve, reject) => {

      if (
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN
      ) {

        reject(
          new Error('gateway not connected')
        )

        return
      }


      const id = String(this._nextId++)

      this._pending.set(id, {
        method,
        resolve,
        reject,
      })


      const frame = {
        type: 'req',
        id,
        method,
        params,
      }

      if (this.debug) {
        this._log('>>', this._safeStringify(frame))
      }

      this.ws.send(
        JSON.stringify(frame)
      )
    })
  }


  _safeStringify(value) {

    let safe

    try {
      safe = JSON.parse(JSON.stringify(value))
    } catch {
      return JSON.stringify(value).slice(0, 200)
    }

    this._redact(safe)

    return JSON.stringify(safe).slice(0, 200)
  }


  _redact(node) {

    if (Array.isArray(node)) {
      for (const item of node) {
        this._redact(item)
      }
      return
    }

    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (key === 'token' || key === 'password') {
          node[key] = '<redacted>'
        } else {
          this._redact(node[key])
        }
      }
    }
  }


  _setState(state) {

    if (state === this._state) {
      return
    }

    this._state = state

    for (
      const listener
      of this._stateListeners
    ) {
      listener(state)
    }
  }
}
