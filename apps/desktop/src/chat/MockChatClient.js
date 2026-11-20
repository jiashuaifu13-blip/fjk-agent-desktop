export class MockChatClient {

  constructor({
    thinkingDelay = 900,
    tokenDelay = 45,
  } = {}) {

    this.thinkingDelay =
      thinkingDelay

    this.tokenDelay =
      tokenDelay
  }


  async send({
    message,
    signal,
    onStart,
    onToken,
  }) {

    if (
      !message ||
      !message.trim()
    ) {
      throw new Error(
        'Message cannot be empty'
      )
    }


    /*
     * 模拟模型思考时间。
     */
    await this.sleep(
      this.thinkingDelay,
      signal
    )


    this.throwIfAborted(
      signal
    )


    const reply =
      this.createReply(
        message.trim()
      )


    if (
      typeof onStart ===
      'function'
    ) {
      await onStart()
    }


    /*
     * 逐字符模拟 Streaming。
     */
    for (
      const token
      of Array.from(reply)
    ) {

      this.throwIfAborted(
        signal
      )


      await this.sleep(
        this.tokenDelay,
        signal
      )


      this.throwIfAborted(
        signal
      )


      if (
        typeof onToken ===
        'function'
      ) {
        onToken(token)
      }
    }


    return reply
  }


  createReply(message) {

    return (
      `这是当前 Mock AI 的测试回复。` +
      `你刚才说的是：“${message}”。` +
      `现在正在验证聊天界面、流式输出以及桌宠状态切换。`
    )
  }


  throwIfAborted(signal) {

    if (
      signal?.aborted
    ) {
      throw new DOMException(
        'The operation was aborted',
        'AbortError'
      )
    }
  }


  sleep(
    ms,
    signal
  ) {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        if (
          signal?.aborted
        ) {
          reject(
            new DOMException(
              'The operation was aborted',
              'AbortError'
            )
          )

          return
        }


        const timer =
          setTimeout(
            () => {

              cleanup()

              resolve()
            },
            ms
          )


        const handleAbort =
          () => {

            clearTimeout(
              timer
            )

            cleanup()

            reject(
              new DOMException(
                'The operation was aborted',
                'AbortError'
              )
            )
          }


        const cleanup =
          () => {

            signal
              ?.removeEventListener(
                'abort',
                handleAbort
              )
          }


        signal
          ?.addEventListener(
            'abort',
            handleAbort,
            {
              once: true,
            }
          )
      }
    )
  }
}