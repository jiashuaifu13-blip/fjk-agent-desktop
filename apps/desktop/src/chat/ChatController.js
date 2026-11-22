const MOOD_TAG = /\[\[mood:([a-z]+)(?::([0-9]))?\]\]/g

function stripMood(text) {
  const source = String(text ?? '')

  if (!source.includes('[[mood:')) {
    return source
  }

  return source.replace(MOOD_TAG, '').replace(/\[\[mood:[^\]]*$/, '').trimEnd()
}

function readMood(text) {
  const source = String(text ?? '')
  let match = null

  for (const item of source.matchAll(MOOD_TAG)) {
    match = item
  }

  if (!match) {
    return null
  }

  const intensity = match[2] ? Number(match[2]) : 1

  return { mood: match[1], intensity: Math.max(0, Math.min(2, intensity)) }
}

export class ChatController {

  constructor({
    client,
    dispatchAgentAction = action => {},
  }) {

    this.client =
      client

    this.dispatchAgentAction =
      dispatchAgentAction


    this.messages =
      []

    this.abortController =
      null

    this.generating =
      false


    this.onMessageChange =
      null

    this.onGeneratingChange =
      null

    this.onBubbleChange =
      null

    this.onMood =
      null

    this.onTiming =
      null

    this.flushTimer =
      null

    this.timings =
      null

    this.lastMoodMarker =
      null

    this.onError =
      null
  }


  get isGenerating() {
    return this.generating
  }


  async send(
    content
  ) {

    const message =
      content.trim()


    if (!message) {
      return false
    }


    /*
     * 当前先禁止两个回复并发。
     */
    if (
      this.generating
    ) {
      return false
    }


    this.addMessage(
      'user',
      message
    )


    this.timings = {
      sentAt: Date.now(),
      firstTokenAt: null,
      doneAt: null,
    }


    const assistantMessage = {
      id:
        this.createId(),

      role:
        'assistant',

      content:
        '',

      status:
        'streaming',
    }


    this.messages.push(
      assistantMessage
    )


    this.emitMessages()


    this.abortController =
      new AbortController()


    this.setGenerating(
      true
    )


    this.setBubble(
      '正在思考…'
    )


    try {

      /*
       * 用户提交后：
       *
       * IDLE
       * ↓
       * THINKING
       */
      this.dispatchAgentAction({ type: 'local/request-started' })


      await this.client.send({

        message,

        signal:
          this.abortController.signal,


        /*
         * Mock AI 即将开始输出。
         *
         * 第一批内容到来之前
         * 切换到 SPEAKING。
         */
        onToken:
          (token) => {

            if (
              this.timings &&
              this.timings.firstTokenAt === null
            ) {
              this.timings.firstTokenAt = Date.now()
            }

            assistantMessage.content +=
              token


            this.setBubble(
              assistantMessage.content
            )


            this.scheduleEmit()
          },
      })


      assistantMessage.status =
        'done'

      this.cancelScheduledEmit()
      this.reportTiming()

      this.emitMessages()


      /*
       * 回复结束：
       *
       * SPEAKING
       * ↓
       * IDLE
       */
      this.dispatchAgentAction({ type: 'local/request-settled', outcome: 'completed' })


      return true

    } catch (error) {

      if (
        error?.name ===
        'AbortError'
      ) {

        assistantMessage.status =
          'aborted'

        this.cancelScheduledEmit()
        this.reportTiming()


        if (
          !assistantMessage.content
        ) {
          assistantMessage.content =
            '（回复已停止）'
        } else {
          assistantMessage.content +=
            '\n（已停止）'
        }


        this.emitMessages()


        this.setBubble(
          assistantMessage.content
        )
        this.dispatchAgentAction({ type: 'local/request-settled', outcome: 'aborted' })


        return false
      }


      assistantMessage.status =
        'error'

      this.cancelScheduledEmit()
      this.reportTiming()

      assistantMessage.content =
        typeof error?.displayMessage === 'string' &&
        error.displayMessage
          ? error.displayMessage
          : '发送失败，请稍后重试。'


      this.emitMessages()


      this.setBubble(
        assistantMessage.content
      )
      this.dispatchAgentAction({ type: 'local/request-settled', outcome: 'failed' })


      if (
        typeof this.onError ===
        'function'
      ) {
        this.onError(
          error
        )
      }


      throw error

    } finally {

      this.abortController =
        null


      this.setGenerating(
        false
      )
    }
  }


  stop() {

    if (
      !this.abortController
    ) {
      return false
    }


    this.abortController.abort()

    return true
  }


  clear() {

    /*
     * 清空前先结束当前回复。
     */
    this.stop()


    this.messages = []


    this.setBubble(
      ''
    )


    this.emitMessages()
  }


  replaceMessages(
    messages
  ) {

    this.stop()

    this.messages =
      Array.isArray(messages)
        ? messages.map(
          (message) => ({
            ...message,
          })
        )
        : []

    this.setBubble(
      ''
    )

    this.emitMessages()
  }


  prependMessages(
    messages
  ) {

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return
    }

    this.messages =
      messages
        .map(
          (message) => ({
            ...message,
          })
        )
        .concat(this.messages)

    this.emitMessages()
  }


  addMessage(
    role,
    content
  ) {
    this.messages.push({
      id:
        this.createId(),

      role,

      content,

      status:
        'done',
    })


    this.emitMessages()
  }


  detectMood() {

    const assistant = [...this.messages]
      .reverse()
      .find((message) => message.role === 'assistant')

    if (!assistant) {
      return
    }

    const marker = readMood(assistant.content)

    if (!marker) {
      return
    }

    const key = `${marker.mood}:${marker.intensity}`

    if (key === this.lastMoodMarker) {
      return
    }

    this.lastMoodMarker = key

    if (typeof this.onMood === 'function') {
      this.onMood(marker.mood, marker.intensity)
    }
  }


  reportTiming() {

    const timings =
      this.timings

    this.timings =
      null

    if (!timings) {
      return
    }

    const doneAt = Date.now()

    if (typeof this.onTiming === 'function') {
      this.onTiming({
        ttftMs: timings.firstTokenAt
          ? timings.firstTokenAt - timings.sentAt
          : null,
        totalMs: doneAt - timings.sentAt,
      })
    }
  }


  scheduleEmit() {

    if (this.flushTimer !== null) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.emitMessages()
    }, 40)
  }


  cancelScheduledEmit() {

    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }


  emitMessages() {

    this.detectMood()

    if (
      typeof this.onMessageChange ===
      'function'
    ) {

      /*
       * 复用未变化的消息对象，配合 React.memo 让历史消息不重渲染。
       */
      if (!this.displayCache) {
        this.displayCache = new Map()
      }

      const nextMessages =
        this.messages.map((message) => {
          const content =
            stripMood(message.content)

          const cached =
            this.displayCache.get(message.id)

          if (
            cached &&
            cached.content === content &&
            cached.status === message.status
          ) {
            return cached.object
          }

          const object = {
            ...message,
            content,
          }

          this.displayCache.set(message.id, {
            content,
            status: message.status,
            object,
          })

          return object
        })

      this.onMessageChange(nextMessages)
    }
  }


  setGenerating(
    value
  ) {

    this.generating =
      value


    if (
      typeof this.onGeneratingChange ===
      'function'
    ) {

      this.onGeneratingChange(
        value
      )
    }
  }


  setBubble(
    value
  ) {

    if (
      typeof this.onBubbleChange ===
      'function'
    ) {

      this.onBubbleChange(
        value
      )
    }
  }


  createId() {

    return (
      `${Date.now()}-` +
      `${Math.random()
        .toString(16)
        .slice(2)}`
    )
  }
}