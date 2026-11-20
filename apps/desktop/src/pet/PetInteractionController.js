import {
  PetStates,
} from './PetStates.js'


export class PetInteractionController {

  constructor({
    root,
    canvas,
    stateMachine,
    hitTest,
    dragThreshold = 6,
  }) {

    this.root =
      root

    this.canvas =
      canvas

    this.stateMachine =
      stateMachine

    this.hitTest =
      hitTest

    this.dragThreshold =
      dragThreshold


    this.pointerId =
      null

    this.pointerDown =
      false

    this.dragging =
      false


    this.startPointerX =
      0

    this.startPointerY =
      0

    this.startRootLeft =
      0

    this.startRootTop =
      0


    this.onInteraction =
      null


    this.handlePointerDown =
      this.handlePointerDown.bind(this)

    this.handlePointerMove =
      this.handlePointerMove.bind(this)

    this.handlePointerUp =
      this.handlePointerUp.bind(this)

    this.handlePointerCancel =
      this.handlePointerCancel.bind(this)

    this.handleResize =
      this.handleResize.bind(this)
  }


  mount() {

    this.canvas.addEventListener(
      'pointerdown',
      this.handlePointerDown
    )

    this.canvas.addEventListener(
      'pointermove',
      this.handlePointerMove
    )

    this.canvas.addEventListener(
      'pointerup',
      this.handlePointerUp
    )

    this.canvas.addEventListener(
      'pointercancel',
      this.handlePointerCancel
    )

    window.addEventListener(
      'resize',
      this.handleResize
    )
  }


  destroy() {

    this.canvas.removeEventListener(
      'pointerdown',
      this.handlePointerDown
    )

    this.canvas.removeEventListener(
      'pointermove',
      this.handlePointerMove
    )

    this.canvas.removeEventListener(
      'pointerup',
      this.handlePointerUp
    )

    this.canvas.removeEventListener(
      'pointercancel',
      this.handlePointerCancel
    )

    window.removeEventListener(
      'resize',
      this.handleResize
    )
  }


  async handlePointerDown(
    event
  ) {

    /*
     * 关键：
     * 先判断是不是角色实体像素。
     */
    const hit =
      this.hitTest.hit(
        event.clientX,
        event.clientY
      )

    if (!hit) {

      if (
        typeof this.onInteraction ===
        'function'
      ) {
        this.onInteraction({
          type:
            'transparent-pointerdown',
        })
      }

      return
    }


    event.preventDefault()

    this.pointerDown =
      true

    this.dragging =
      false

    this.pointerId =
      event.pointerId


    this.startPointerX =
      event.clientX

    this.startPointerY =
      event.clientY


    /*
     * 把 right / bottom 布局
     * 转换成明确的 left / top，
     * 后续拖动更简单。
     */
    const rect =
      this.root.getBoundingClientRect()

    this.startRootLeft =
      rect.left

    this.startRootTop =
      rect.top

    this.root.style.left =
      `${rect.left}px`

    this.root.style.top =
      `${rect.top}px`

    this.root.style.right =
      'auto'

    this.root.style.bottom =
      'auto'


    this.canvas.setPointerCapture(
      event.pointerId
    )


    if (
      typeof this.onInteraction ===
      'function'
    ) {
      this.onInteraction({
        type:
          'pointerdown',
      })
    }
  }


  async handlePointerMove(
    event
  ) {

    if (
      !this.pointerDown ||
      event.pointerId !==
      this.pointerId
    ) {
      return
    }


    const deltaX =
      event.clientX -
      this.startPointerX

    const deltaY =
      event.clientY -
      this.startPointerY


    const distance =
      Math.hypot(
        deltaX,
        deltaY
      )


    /*
     * 移动距离超过阈值后，
     * 才正式认为用户是在拖动。
     *
     * 这样普通点击不会误判成拖动。
     */
    if (
      !this.dragging &&
      distance >=
      this.dragThreshold
    ) {

      this.dragging =
        true

      try {
        await this.stateMachine
          .setState(
            PetStates.DRAGGING,
            {
              reason:
                'pointer-drag-start',
            }
          )
      } catch (error) {
        console.error(
          'Enter DRAGGING failed:',
          error
        )
      }
    }


    if (!this.dragging) {
      return
    }


    event.preventDefault()


    const proposedLeft =
      this.startRootLeft +
      deltaX

    const proposedTop =
      this.startRootTop +
      deltaY


    const position =
      this.clampPosition(
        proposedLeft,
        proposedTop
      )


    this.root.style.left =
      `${position.left}px`

    this.root.style.top =
      `${position.top}px`


    if (
      typeof this.onInteraction ===
      'function'
    ) {
      this.onInteraction({
        type:
          'drag',
        left:
          position.left,
        top:
          position.top,
      })
    }
  }


  async handlePointerUp(
    event
  ) {

    if (
      !this.pointerDown ||
      event.pointerId !==
      this.pointerId
    ) {
      return
    }


    event.preventDefault()


    try {
      if (
        this.canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        this.canvas.releasePointerCapture(
          event.pointerId
        )
      }
    } catch {
      /*
       * 某些情况下 pointer capture
       * 已经由浏览器自动释放。
       */
    }


    const wasDragging =
      this.dragging


    this.resetPointer()


    try {

      if (wasDragging) {

        /*
         * 拖动结束后回到待机。
         */
        await this.stateMachine.idle(
          'pointer-drag-end'
        )


        if (
          typeof this.onInteraction ===
          'function'
        ) {
          this.onInteraction({
            type:
              'drag-end',
          })
        }

        return
      }


      /*
       * 没有产生拖动：
       * 这是一次真正点击。
       */
      await this.stateMachine
        .setState(
          PetStates.INTERACT,
          {
            force: true,
            reason:
              'pointer-click',
          }
        )


      if (
        typeof this.onInteraction ===
        'function'
      ) {
        this.onInteraction({
          type:
            'click',
        })
      }

    } catch (error) {

      console.error(
        'Pointer interaction failed:',
        error
      )
    }
  }


  async handlePointerCancel(
    event
  ) {

    if (
      event.pointerId !==
      this.pointerId
    ) {
      return
    }


    const wasDragging =
      this.dragging


    this.resetPointer()


    if (wasDragging) {
      try {
        await this.stateMachine.idle(
          'pointer-cancel'
        )
      } catch (error) {
        console.error(
          error
        )
      }
    }
  }


  resetPointer() {

    this.pointerDown =
      false

    this.dragging =
      false

    this.pointerId =
      null
  }


  clampPosition(
    left,
    top
  ) {

    const rect =
      this.root.getBoundingClientRect()

    const maxLeft =
      Math.max(
        0,
        window.innerWidth -
        rect.width
      )

    const maxTop =
      Math.max(
        0,
        window.innerHeight -
        rect.height
      )


    return {
      left:
        Math.min(
          Math.max(
            0,
            left
          ),
          maxLeft
        ),

      top:
        Math.min(
          Math.max(
            0,
            top
          ),
          maxTop
        ),
    }
  }


  handleResize() {

    const rect =
      this.root.getBoundingClientRect()

    const position =
      this.clampPosition(
        rect.left,
        rect.top
      )

    this.root.style.left =
      `${position.left}px`

    this.root.style.top =
      `${position.top}px`

    this.root.style.right =
      'auto'

    this.root.style.bottom =
      'auto'
  }
}