const MIN_RENDER_SIZE = 512
const MAX_RENDER_SIZE = 1024

// 每个饰品输出 canvas 对应一份 mask 缓存，涂抹时不再逐帧重建整张画布。
const renderStates = new WeakMap()

function renderSizeFor(image) {
  const sourceSize = Math.max(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0)
  return Math.max(MIN_RENDER_SIZE, Math.min(MAX_RENDER_SIZE, sourceSize || MIN_RENDER_SIZE))
}

/**
 * 把一笔画到 mask 上。
 * fromIndex 用于正在涂抹的那一笔：只补画新增的线段，避免整笔重画。
 */
function paintStroke(context, stroke, logicalSize, renderSize, fromIndex = 0) {
  const points = stroke.points || []
  const total = points.length / 2
  if (!total) return
  const start = Math.max(0, Math.min(fromIndex, total - 1))
  const scale = renderSize / logicalSize

  context.save()
  // hide = destination-out（擦掉 mask）· restore = source-over（补回 mask）
  context.globalCompositeOperation = stroke.mode === 'restore' ? 'source-over' : 'destination-out'
  context.strokeStyle = '#fff'
  context.fillStyle = '#fff'
  context.lineWidth = Math.max(1, stroke.size * scale)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(points[start * 2] * scale, points[start * 2 + 1] * scale)
  for (let index = start + 1; index < total; index += 1) {
    context.lineTo(points[index * 2] * scale, points[index * 2 + 1] * scale)
  }
  if (total - start === 1) context.lineTo(points[start * 2] * scale + 0.01, points[start * 2 + 1] * scale)
  context.stroke()
  context.restore()
}

function clearMask(context, renderSize) {
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = '#fff'
  context.fillRect(0, 0, renderSize, renderSize)
  context.restore()
}

/**
 * 非破坏性遮挡渲染：原始饰品图片 + mask 笔画 => 显示用 canvas。
 *
 * 原始 PNG 永远不被改写，用户擦除的只是 mask。
 * 笔画是追加式的，所以只把新增的笔画（以及正在涂抹的那一笔的新线段）画进缓存的 mask，
 * 撤销 / 重置导致笔画变少时才整张重画。
 *
 * @param {boolean} live 最后一笔是否仍在涂抹中（笔画长度还会继续增长）
 */
export function renderOccludedJewelry(image, strokes, logicalSize, existingCanvas, live = false) {
  if (!image) return null
  const renderSize = renderSizeFor(image)
  const output = existingCanvas || document.createElement('canvas')
  if (output.width !== renderSize || output.height !== renderSize) {
    output.width = renderSize
    output.height = renderSize
  }

  let state = renderStates.get(output)
  if (state && (state.renderSize !== renderSize || state.logicalSize !== logicalSize)) {
    state.mask.width = renderSize
    state.mask.height = renderSize
    state.renderSize = renderSize
    state.logicalSize = logicalSize
    state.baked = -1
    state.points = 0
  }
  if (!state) {
    const mask = document.createElement('canvas')
    mask.width = renderSize
    mask.height = renderSize
    state = { mask, maskContext: mask.getContext('2d'), logicalSize, renderSize, baked: -1, points: 0 }
    renderStates.set(output, state)
  }

  const maskContext = state.maskContext
  if (state.baked < 0 || state.baked > strokes.length) {
    clearMask(maskContext, renderSize)
    state.baked = 0
    state.points = 0
  }

  // 已经画完的笔画
  const completed = strokes.length - (live && strokes.length ? 1 : 0)
  while (state.baked < completed) {
    paintStroke(maskContext, strokes[state.baked], logicalSize, renderSize, 0)
    state.baked += 1
    state.points = 0
  }

  // 正在涂抹的那一笔：只补画新增线段
  if (live && strokes.length) {
    const stroke = strokes[strokes.length - 1]
    const total = (stroke.points || []).length / 2
    const painted = state.baked === strokes.length ? state.points : 0
    if (total > painted) {
      paintStroke(maskContext, stroke, logicalSize, renderSize, Math.max(0, painted - 1))
      state.baked = strokes.length
      state.points = total
    }
  } else {
    state.points = 0
  }

  const context = output.getContext('2d')
  context.globalCompositeOperation = 'source-over'
  context.clearRect(0, 0, renderSize, renderSize)
  context.drawImage(image, 0, 0, renderSize, renderSize)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(state.mask, 0, 0)
  context.globalCompositeOperation = 'source-over'
  return output
}
