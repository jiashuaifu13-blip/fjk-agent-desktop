import {
  PetStates,
} from '../pet/PetStates.js'


export class ChatController {

  constructor({
    client,
    stateMachine,
  }) {

    this.client =
      client

    this.stateMachine =
      stateMachine


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
      await this.stateMachine
        .setState(
          PetStates.THINKING,
          {
            reason:
              'chat-request',
          }
        )


      let speakingStarted =
        false


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
        onStart:
          async () => {

            if (
              speakingStarted
            ) {
              return
            }


            speakingStarted =
              true


            await this.stateMachine
              .setState(
                PetStates.SPEAKING,
                {
                  reason:
                    'chat-stream-start',
                }
              )
          },


        onToken:
          (token) => {

            assistantMessage.content +=
              token


            this.setBubble(
              assistantMessage.content
            )


            this.emitMessages()
          },
      })


      assistantMessage.status =
        'done'


      this.emitMessages()


      /*
       * 回复结束：
       *
       * SPEAKING
       * ↓
       * IDLE
       */
      await this.stateMachine
        .idle(
          'chat-complete'
        )


      return true

    } catch (error) {

      if (
        error?.name ===
        'AbortError'
      ) {

        assistantMessage.status =
          'aborted'


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


        try {
          await this.stateMachine
            .idle(
              'chat-aborted'
            )
        } catch (
          stateError
        ) {
          console.error(
            stateError
          )
        }


        return false
      }


      assistantMessage.status =
        'error'

      assistantMessage.content =
        '模拟聊天发生错误。'


      this.emitMessages()


      this.setBubble(
        assistantMessage.content
      )


      try {

        await this.stateMachine
          .setState(
            PetStates.ERROR,
            {
              reason:
                'chat-error',
            }
          )

      } catch (
        stateError
      ) {

        console.error(
          stateError
        )
      }


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


  emitMessages() {

    if (
      typeof this.onMessageChange ===
      'function'
    ) {

      this.onMessageChange(
        [...this.messages]
      )
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