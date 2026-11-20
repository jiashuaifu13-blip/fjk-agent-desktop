export class PetHitTest {

  constructor({
    canvas,
    alphaThreshold = 25,
  }) {
    this.canvas = canvas

    this.ctx =
      canvas.getContext(
        '2d',
        {
          willReadFrequently: true,
        }
      )

    this.alphaThreshold =
      alphaThreshold
  }


  /*
   * 把浏览器 CSS 坐标
   * 转成 Canvas 实际像素坐标。
   */
  clientToCanvas(
    clientX,
    clientY
  ) {
    const rect =
      this.canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null
    }

    const x =
      (
        (clientX - rect.left) /
        rect.width
      ) *
      this.canvas.width

    const y =
      (
        (clientY - rect.top) /
        rect.height
      ) *
      this.canvas.height

    return {
      x: Math.floor(x),
      y: Math.floor(y),
    }
  }


  isInsideCanvas(
    x,
    y
  ) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.canvas.width &&
      y < this.canvas.height
    )
  }


  /*
   * 检查当前 Canvas 已经绘制出来的这一帧。
   *
   * alpha > threshold
   * 才认为真正点中了角色。
   */
  hit(
    clientX,
    clientY
  ) {
    const point =
      this.clientToCanvas(
        clientX,
        clientY
      )

    if (!point) {
      return false
    }

    if (
      !this.isInsideCanvas(
        point.x,
        point.y
      )
    ) {
      return false
    }

    try {
      const pixel =
        this.ctx.getImageData(
          point.x,
          point.y,
          1,
          1
        ).data

      const alpha =
        pixel[3]

      return (
        alpha >
        this.alphaThreshold
      )

    } catch (error) {
      console.error(
        'PetHitTest failed:',
        error
      )

      return false
    }
  }
}