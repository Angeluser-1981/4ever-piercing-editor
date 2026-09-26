<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadBrowserImage, preprocessJewelryImage } from '../../services/image.js'
import { renderOccludedJewelry } from '../../services/occlusion.js'
import { CANVAS_HEIGHT as BASE_HEIGHT, CANVAS_WIDTH as BASE_WIDTH } from '../../config/canvas.js'

const props = defineProps({
  earSource: { type: String, required: true },
  earSide: { type: String, default: 'right' },
  earTransform: { type: Object, required: true },
  mode: { type: String, default: 'stack' },
  pieces: { type: Array, required: true },
  selectedId: { type: String, default: null },
  placementPoints: { type: Array, default: () => [] },
  selectedPlacementId: { type: String, default: null },
  snapEnabled: { type: Boolean, default: true },
  brushMode: { type: String, default: 'hide' },
  brushSize: { type: Number, default: 28 },
})

const emit = defineEmits([
  'select',
  'update-piece',
  'update-ear',
  'add-placement-point',
  'select-placement-point',
  'update-placement-point',
  'update-mask',
])

// 只有真正需要穿过耳洞固定的饰品参与吸附：耳骨夹是夹在耳朵上的，不吸附。
const SNAP_TYPES = ['STUD', 'HOOP', 'CHAIN']
const host = ref(null)
const backgroundRef = ref(null)
const selectionOutlineRef = ref(null)
const shapeRefs = new Map()
const maskedCanvases = new Map()
const width = ref(360)
const earImage = ref(null)
const pieceImages = ref({})
const maskedPieceImages = ref({})
const pieceHitBounds = ref({})
const coarsePointer = ref(false)
const snapGuide = ref(null)
const brushCursor = ref(null)
let resizeObserver
let earLoadToken = 0
let gesture = null
let suppressTapUntil = 0
let lastTap = null
let lastPointTap = null
let activeMaskStroke = null

const isAdjustingEar = computed(() => props.mode === 'ear')
const isEditingStack = computed(() => props.mode === 'stack')
const isMarkingPiercings = computed(() => props.mode === 'piercings')
const isOccluding = computed(() => props.mode === 'occlusion')
const showPlacementPoints = computed(() => isEditingStack.value || isMarkingPiercings.value)
const viewportScale = computed(() => width.value / BASE_WIDTH)
const height = computed(() => BASE_HEIGHT * viewportScale.value)
const selectedPiece = computed(() => props.pieces.find((piece) => piece.id === props.selectedId))
const stageConfig = computed(() => ({
  width: width.value,
  height: height.value,
  scaleX: viewportScale.value,
  scaleY: viewportScale.value,
}))

const backgroundConfig = computed(() => {
  if (!earImage.value) return { visible: false }
  const fit = Math.max(BASE_WIDTH / earImage.value.width, BASE_HEIGHT / earImage.value.height)
  const mirrored = props.earSide === 'left'
  const imageScale = fit * props.earTransform.scale
  return {
    image: earImage.value,
    x: BASE_WIDTH / 2 + props.earTransform.x,
    y: BASE_HEIGHT / 2 + props.earTransform.y,
    width: earImage.value.width,
    height: earImage.value.height,
    offsetX: earImage.value.width / 2,
    offsetY: earImage.value.height / 2,
    scaleX: mirrored ? -imageScale : imageScale,
    scaleY: imageScale,
    rotation: mirrored ? -props.earTransform.rotation : props.earTransform.rotation,
    draggable: isAdjustingEar.value,
    listening: isAdjustingEar.value,
    name: 'ear-background',
  }
})

const selectionOutline = computed(() => {
  const piece = selectedPiece.value
  if (!isEditingStack.value || !piece) return null
  const bounds = pieceHitBounds.value[piece.source] || { x: 0, y: 0, width: 1, height: 1 }
  const padding = piece.size * 0.045
  return {
    piece,
    group: {
      x: piece.x,
      y: piece.y,
      offsetX: piece.size / 2,
      offsetY: piece.size / 2,
      scaleX: piece.scale,
      scaleY: piece.scale,
      rotation: piece.rotation,
      listening: false,
    },
    rect: {
      x: bounds.x * piece.size - padding,
      y: bounds.y * piece.size - padding,
      width: bounds.width * piece.size + padding * 2,
      height: bounds.height * piece.size + padding * 2,
      stroke: 'rgba(211, 207, 195, .58)',
      strokeWidth: 1,
      dash: [4, 4],
      fillEnabled: false,
      strokeScaleEnabled: false,
      perfectDrawEnabled: false,
      listening: false,
    },
  }
})

function setShapeRef(node, id) {
  if (node) shapeRefs.set(id, node)
  else shapeRefs.delete(id)
}

function syncSelectionOutline(node, piece) {
  if (piece.id !== props.selectedId) return
  const outline = selectionOutlineRef.value?.getNode?.()
  if (!outline) return
  outline.position({ x: node.x(), y: node.y() })
  outline.scale({ x: node.scaleX(), y: node.scaleY() })
  outline.rotation(node.rotation())
}

function alphaBounds(image) {
  try {
    const maximum = 256
    const ratio = Math.min(1, maximum / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
    const sampleWidth = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio))
    const sampleHeight = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = sampleWidth
    canvas.height = sampleHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight)
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
    let minX = sampleWidth
    let minY = sampleHeight
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] < 18) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 1, height: 1 }
    return {
      x: minX / sampleWidth,
      y: minY / sampleHeight,
      width: (maxX - minX + 1) / sampleWidth,
      height: (maxY - minY + 1) / sampleHeight,
    }
  } catch {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
}

function pieceHitFunc(piece) {
  return (context, shape) => {
    const bounds = pieceHitBounds.value[piece.source] || { x: 0, y: 0, width: 1, height: 1 }
    const scale = viewportScale.value * Math.max(piece.scale, 0.18)
    const selected = piece.id === props.selectedId
    const minimumSize = (selected ? 56 : 46) / scale
    const padding = (coarsePointer.value ? 10 : 6) / scale
    const visibleWidth = bounds.width * piece.size
    const visibleHeight = bounds.height * piece.size
    const hitWidth = Math.max(minimumSize, visibleWidth + padding * 2)
    const hitHeight = Math.max(minimumSize, visibleHeight + padding * 2)
    const centerX = (bounds.x + bounds.width / 2) * piece.size
    const centerY = (bounds.y + bounds.height / 2) * piece.size
    context.beginPath()
    context.rect(centerX - hitWidth / 2, centerY - hitHeight / 2, hitWidth, hitHeight)
    context.closePath()
    context.fillStrokeShape(shape)
  }
}

function pieceOpacity(piece) {
  if (isAdjustingEar.value) return 0.38
  if (isMarkingPiercings.value) return 0.3
  if (isOccluding.value) return piece.id === props.selectedId ? 1 : 0.16
  return 1
}

function displayImageFor(piece) {
  return maskedPieceImages.value[piece.id] || pieceImages.value[piece.source]
}

function pieceConfig(piece) {
  return {
    image: displayImageFor(piece),
    x: piece.x,
    y: piece.y,
    width: piece.size,
    height: piece.size,
    offsetX: piece.size / 2,
    offsetY: piece.size / 2,
    scaleX: piece.scale,
    scaleY: piece.scale,
    rotation: piece.rotation,
    draggable: isEditingStack.value,
    listening: isEditingStack.value || (isOccluding.value && piece.id === props.selectedId),
    opacity: pieceOpacity(piece),
    name: 'jewelry-piece',
    pieceId: piece.id,
    dragDistance: coarsePointer.value ? 0 : 1,
    hitFunc: pieceHitFunc(piece),
    perfectDrawEnabled: false,
  }
}

function maskStrokesFor(piece) {
  const strokes = [...(piece.mask?.strokes || [])]
  if (activeMaskStroke?.pieceId === piece.id) strokes.push(activeMaskStroke.stroke)
  return strokes
}

function redrawMaskedPiece(piece) {
  const image = pieceImages.value[piece.source]
  if (!image) return
  const strokes = maskStrokesFor(piece)
  if (!strokes.length) {
    maskedCanvases.delete(piece.id)
    const next = { ...maskedPieceImages.value }
    delete next[piece.id]
    maskedPieceImages.value = next
    return
  }
  const live = activeMaskStroke?.pieceId === piece.id
  const canvas = renderOccludedJewelry(image, strokes, piece.size, maskedCanvases.get(piece.id), live)
  maskedCanvases.set(piece.id, canvas)
  maskedPieceImages.value = { ...maskedPieceImages.value, [piece.id]: canvas }
  shapeRefs.get(piece.id)?.getNode?.()?.getLayer()?.batchDraw()
}

function redrawAllMasks() {
  for (const piece of props.pieces) redrawMaskedPiece(piece)
  const currentIds = new Set(props.pieces.map((piece) => piece.id))
  for (const id of maskedCanvases.keys()) {
    if (currentIds.has(id)) continue
    maskedCanvases.delete(id)
    const next = { ...maskedPieceImages.value }
    delete next[id]
    maskedPieceImages.value = next
  }
}

function updatePieceFromNode(event, piece) {
  const node = event.target
  emit('update-piece', piece.id, {
    x: node.x(),
    y: node.y(),
    scale: Math.max(0.18, Math.min(2.8, node.scaleX())),
    rotation: node.rotation(),
  })
}

function beginPieceDrag(event, piece) {
  if (!isEditingStack.value || gesture) return
  event.evt?.preventDefault?.()
  snapGuide.value = null
  emit('select', piece.id)
}

/**
 * 轻微吸附：只吸用户自己标记的 placementPoints，没有系统预设耳位。
 * 越接近越明显，但始终保留自由拖动；吸附开关关闭时完全不干预。
 */
function magneticPosition(x, y, piece) {
  const canSnap = props.snapEnabled
    && props.placementPoints.length
    && SNAP_TYPES.includes(piece.type)
  if (!canSnap) return { x, y, target: null }

  const radius = coarsePointer.value ? 44 : 34
  let closest = null
  for (const target of props.placementPoints) {
    const distance = Math.hypot(target.x - x, target.y - y)
    if (distance <= radius && (!closest || distance < closest.distance)) closest = { ...target, distance }
  }
  if (!closest) return { x, y, target: null }
  if (closest.distance <= 5) return { x: closest.x, y: closest.y, target: closest }
  const proximity = 1 - closest.distance / radius
  const pull = 0.08 + proximity * proximity * 0.24
  return {
    x: x + (closest.x - x) * pull,
    y: y + (closest.y - y) * pull,
    target: closest,
  }
}

function movePiece(event, piece) {
  if (!isEditingStack.value || gesture) return
  event.evt?.preventDefault?.()
  const node = event.target
  const snapped = magneticPosition(node.x(), node.y(), piece)
  node.position({ x: snapped.x, y: snapped.y })
  syncSelectionOutline(node, piece)
  if (snapGuide.value?.id !== snapped.target?.id) snapGuide.value = snapped.target
}

function endPieceDrag(event, piece) {
  if (gesture) return
  event.evt?.preventDefault?.()
  updatePieceFromNode(event, piece)
  snapGuide.value = null
}

function handlePieceTap(event, id) {
  if (!isEditingStack.value || performance.now() < suppressTapUntil) return
  if (event.type === 'click' && lastTap?.eventType === 'tap' && performance.now() - lastTap.time < 450) return
  event.cancelBubble = true
  const stage = syncPointer(event)
  const point = stage?.getPointerPosition?.()
  if (!point) return
  const now = performance.now()
  const sameSpot = lastTap && now - lastTap.time < 900 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 24
  const intersectingIds = [...new Set(
    stage.getAllIntersections(point)
      .map((shape) => shape.getAttr('pieceId'))
      .filter(Boolean)
      .reverse(),
  )]
  let nextId = id
  if (sameSpot && intersectingIds.length > 1 && intersectingIds.includes(props.selectedId)) {
    nextId = intersectingIds[(intersectingIds.indexOf(props.selectedId) + 1) % intersectingIds.length]
  }
  emit('select', nextId)
  lastTap = { x: point.x, y: point.y, time: now, eventType: event.type }
}

function handleStageTap(event) {
  if (isEditingStack.value) {
    if (performance.now() < suppressTapUntil) return
    if (event.target === event.target.getStage()) emit('select', null)
    return
  }
  if (!isMarkingPiercings.value) return
  if (event.target?.getAttr?.('placementId')) return
  const now = performance.now()
  if (event.type === 'click' && lastPointTap?.eventType === 'tap' && now - lastPointTap.time < 450) return
  event.evt?.preventDefault?.()
  const point = stagePoint(event)
  if (!point) return
  emit('add-placement-point', {
    x: Math.max(0, Math.min(BASE_WIDTH, point.x)),
    y: Math.max(0, Math.min(BASE_HEIGHT, point.y)),
  })
  lastPointTap = { time: now, eventType: event.type }
}

function selectPlacementPoint(event, id) {
  event.cancelBubble = true
  emit('select-placement-point', id)
}

// 点错了可以直接把已选中的标记拖到正确位置，不需要删掉重来。
function finishPointDrag(event, id) {
  event.cancelBubble = true
  const node = event.target
  emit('update-placement-point', id, {
    x: Math.max(0, Math.min(BASE_WIDTH, node.x())),
    y: Math.max(0, Math.min(BASE_HEIGHT, node.y())),
  })
}

function updateEarFromNode(event) {
  const node = event.target
  emit('update-ear', {
    x: node.x() - BASE_WIDTH / 2,
    y: node.y() - BASE_HEIGHT / 2,
  })
}

function touchMetrics(touches) {
  const [a, b] = touches
  return {
    centerX: (a.clientX + b.clientX) / 2,
    centerY: (a.clientY + b.clientY) / 2,
    distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
    angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI,
  }
}

function normalizedAngleDelta(current, starting) {
  let delta = current - starting
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return delta
}

function beginEarGesture(touches) {
  const node = backgroundRef.value?.getNode()
  if (!node) return
  node.stopDrag()
  node.draggable(false)
  gesture = {
    mode: 'ear',
    node,
    ...touchMetrics(touches),
    x: props.earTransform.x,
    y: props.earTransform.y,
    scale: props.earTransform.scale,
    rotation: props.earTransform.rotation,
  }
}

function beginPieceGesture(touches) {
  const pieceId = props.selectedId
  const piece = props.pieces.find((entry) => entry.id === pieceId)
  const node = shapeRefs.get(pieceId)?.getNode?.()
  if (!piece || !node) return

  for (const entry of props.pieces) {
    const entryNode = shapeRefs.get(entry.id)?.getNode?.()
    if (!entryNode) continue
    entryNode.stopDrag()
    if (entry.id !== pieceId) entryNode.position({ x: entry.x, y: entry.y })
  }

  gesture = {
    mode: 'piece',
    node,
    piece,
    ...touchMetrics(touches),
    x: node.x(),
    y: node.y(),
    scale: node.scaleX(),
    rotation: node.rotation(),
  }
  node.stopDrag()
  node.draggable(false)
  snapGuide.value = null
}

/**
 * 用事件自身的坐标刷新 Konva 的指针位置，再交给 Konva 换算。
 *
 * 不能只依赖 stage.getPointerPosition() 的缓存：mousemove 与 mousedown 被合并派发时，
 * 缓存可能还停在上一次的位置（例如刚点过右侧面板），涂抹与落点会静默失效。
 * setPointersPositions 是 Konva 官方替代 _setPointerPosition 的公开方法，
 * 所以这里不改动任何坐标换算语义。
 */
function syncPointer(event) {
  const stage = event?.target?.getStage?.() || event?.target
  const evt = event?.evt
  if (stage && evt && typeof evt.clientX === 'number' && typeof stage.setPointersPositions === 'function') {
    stage.setPointersPositions(evt)
  }
  return stage || null
}

/** stage 虚拟坐标（与饰品 x/y 同一空间） */
function stagePoint(event) {
  const stage = syncPointer(event)
  return stage?.getRelativePointerPosition?.() ?? null
}

function localMaskPoint(event) {
  const piece = selectedPiece.value
  const node = shapeRefs.get(piece?.id)?.getNode?.()
  if (!piece || !node) return null
  syncPointer(event)
  const local = node.getRelativePointerPosition()
  if (!local || local.x < 0 || local.y < 0 || local.x > piece.size || local.y > piece.size) return null
  return { piece, node, x: local.x, y: local.y }
}

function updateBrushCursor(event) {
  if (!isOccluding.value || !selectedPiece.value) {
    brushCursor.value = null
    return
  }
  const point = stagePoint(event)
  const local = localMaskPoint(event)
  brushCursor.value = local && point
    ? { x: point.x, y: point.y, radius: props.brushSize * selectedPiece.value.scale / 2 }
    : null
}

function beginMaskStroke(event) {
  if (!isOccluding.value) return
  event.evt?.preventDefault?.()
  const point = localMaskPoint(event)
  if (!point) return
  event.cancelBubble = true
  activeMaskStroke = {
    pieceId: point.piece.id,
    stroke: {
      mode: props.brushMode,
      size: props.brushSize,
      points: [point.x, point.y],
    },
  }
  updateBrushCursor(event)
  redrawMaskedPiece(point.piece)
}

function continueMaskStroke(event) {
  if (!activeMaskStroke) {
    updateBrushCursor(event)
    return
  }
  event.evt?.preventDefault?.()
  const point = localMaskPoint(event)
  if (!point || point.piece.id !== activeMaskStroke.pieceId) return
  const points = activeMaskStroke.stroke.points
  const lastX = points[points.length - 2]
  const lastY = points[points.length - 1]
  if (Math.hypot(point.x - lastX, point.y - lastY) < 1.2) return
  points.push(point.x, point.y)
  updateBrushCursor(event)
  redrawMaskedPiece(point.piece)
}

function finishMaskStroke(event) {
  if (!activeMaskStroke) {
    if (event?.type === 'mouseleave') brushCursor.value = null
    return
  }
  event?.evt?.preventDefault?.()
  const completed = activeMaskStroke
  activeMaskStroke = null
  const piece = props.pieces.find((entry) => entry.id === completed.pieceId)
  if (!piece) return
  emit('update-mask', piece.id, [...(piece.mask?.strokes || []), completed.stroke])
  redrawMaskedPiece(piece)
}

function handlePointerDown(event) {
  if (isOccluding.value) beginMaskStroke(event)
}

function handlePointerMove(event) {
  if (isOccluding.value) continueMaskStroke(event)
}

function handleTouchStart(event) {
  const touches = event.evt.touches
  if (touches.length) event.evt.preventDefault()
  if (isOccluding.value) {
    if (touches.length === 1) beginMaskStroke(event)
    return
  }
  if (isMarkingPiercings.value) return
  if (touches.length !== 2) return
  suppressTapUntil = performance.now() + 350
  if (isAdjustingEar.value) beginEarGesture(touches)
  else if (isEditingStack.value) beginPieceGesture(touches)
}

function handleTouchMove(event) {
  if (isOccluding.value) {
    continueMaskStroke(event)
    return
  }
  if (!gesture || event.evt.touches.length !== 2) return
  event.evt.preventDefault()
  suppressTapUntil = performance.now() + 350
  const metrics = touchMetrics(event.evt.touches)
  const x = gesture.x + (metrics.centerX - gesture.centerX) / viewportScale.value
  const y = gesture.y + (metrics.centerY - gesture.centerY) / viewportScale.value
  const ratio = metrics.distance / Math.max(gesture.distance, 1)
  const rotation = gesture.rotation + normalizedAngleDelta(metrics.angle, gesture.angle)

  if (gesture.mode === 'ear') {
    emit('update-ear', {
      x,
      y,
      scale: Math.max(0.45, Math.min(3.5, gesture.scale * ratio)),
      rotation: Math.max(-15, Math.min(15, rotation)),
    })
    return
  }

  const scale = Math.max(0.18, Math.min(2.8, gesture.scale * ratio))
  gesture.node.position({ x, y })
  gesture.node.scale({ x: scale, y: scale })
  gesture.node.rotation(rotation)
  syncSelectionOutline(gesture.node, gesture.piece)
  gesture.node.getLayer()?.batchDraw()
}

function handleTouchEnd(event) {
  if (isOccluding.value) {
    finishMaskStroke(event)
    return
  }
  if (!gesture || event.evt.touches.length >= 2) return
  const completedGesture = gesture
  gesture = null
  suppressTapUntil = performance.now() + 350
  if (completedGesture.mode === 'ear') {
    completedGesture.node.draggable(isAdjustingEar.value)
    return
  }

  const snapped = magneticPosition(completedGesture.node.x(), completedGesture.node.y(), completedGesture.piece)
  completedGesture.node.position({ x: snapped.x, y: snapped.y })
  syncSelectionOutline(completedGesture.node, completedGesture.piece)
  completedGesture.node.draggable(true)
  emit('update-piece', completedGesture.piece.id, {
    x: snapped.x,
    y: snapped.y,
    scale: completedGesture.node.scaleX(),
    rotation: completedGesture.node.rotation(),
  })
  snapGuide.value = null
}

async function loadEarSource(source) {
  const token = ++earLoadToken
  const image = await loadBrowserImage(source)
  if (token === earLoadToken) earImage.value = image
}

async function loadPieceImages() {
  for (const piece of props.pieces) {
    if (pieceImages.value[piece.source]) continue
    const image = await preprocessJewelryImage(piece.source)
    pieceImages.value = { ...pieceImages.value, [piece.source]: image }
    pieceHitBounds.value = { ...pieceHitBounds.value, [piece.source]: alphaBounds(image) }
  }
}

onMounted(async () => {
  coarsePointer.value = window.matchMedia('(pointer: coarse)').matches
  await loadPieceImages()
  redrawAllMasks()
  resizeObserver = new ResizeObserver(([entry]) => {
    width.value = Math.round(Math.max(280, Math.min(BASE_WIDTH, entry.contentRect.width)))
  })
  resizeObserver.observe(host.value)
})

watch(() => props.earSource, loadEarSource, { immediate: true })
watch([() => props.selectedId, () => props.mode], () => {
  if (!isOccluding.value) {
    activeMaskStroke = null
    brushCursor.value = null
    redrawAllMasks()
  }
})
watch(
  () => props.pieces.map((piece) => ({ id: piece.id, source: piece.source, mask: piece.mask?.strokes || [] })),
  async () => {
    await loadPieceImages()
    redrawAllMasks()
  },
  { deep: true },
)

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div
    ref="host"
    class="canvas-host"
    :class="{
      'canvas-host--adjusting': isAdjustingEar,
      'canvas-host--marking': isMarkingPiercings,
      'canvas-host--occluding': isOccluding,
    }"
  >
    <v-stage
      :config="stageConfig"
      @mousedown="handlePointerDown"
      @mousemove="handlePointerMove"
      @mouseup="finishMaskStroke"
      @mouseleave="finishMaskStroke"
      @click="handleStageTap"
      @tap="handleStageTap"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <v-layer>
        <v-image ref="backgroundRef" :config="backgroundConfig" @dragend="updateEarFromNode" />
        <v-rect :config="{ x: 10, y: 10, width: 700, height: 940, stroke: isAdjustingEar || isMarkingPiercings || isOccluding ? 'rgba(207,226,240,.78)' : 'rgba(239,246,255,.38)', strokeWidth: isAdjustingEar || isMarkingPiercings || isOccluding ? 2 : 1, dash: isMarkingPiercings || isOccluding ? [7, 6] : [], listening: false }" />
      </v-layer>
      <v-layer>
        <template v-if="showPlacementPoints">
          <v-group
            v-for="point in placementPoints"
            :key="point.id"
            :config="{
              x: point.x,
              y: point.y,
              opacity: isMarkingPiercings ? 1 : 0.68,
              placementId: point.id,
              draggable: isMarkingPiercings && selectedPlacementId === point.id,
            }"
            @click="selectPlacementPoint($event, point.id)"
            @tap="selectPlacementPoint($event, point.id)"
            @dragend="finishPointDrag($event, point.id)"
          >
            <v-circle v-if="selectedPlacementId === point.id && isMarkingPiercings" :config="{ radius: 15, stroke: 'rgba(225,239,248,.8)', strokeWidth: 1.5, dash: [3, 3], listening: false }" />
            <!-- 实心 = 已有耳洞 / 空心 = 计划穿刺 -->
            <v-circle :config="{ radius: 7, fill: point.status === 'existing' ? 'rgba(230,241,247,.92)' : 'rgba(41,51,59,.34)', stroke: 'rgba(226,241,248,.95)', strokeWidth: 2, dash: point.status === 'planned' ? [3, 3] : [], listening: false }" />
            <v-circle :config="{ radius: coarsePointer ? 23 : 16, fill: 'rgba(0,0,0,.001)', placementId: point.id }" />
            <v-text :config="{ x: 13, y: -8, text: point.label, fill: 'rgba(235,245,250,.92)', fontFamily: 'Arial, sans-serif', fontSize: 13, stroke: 'rgba(31,38,44,.7)', strokeWidth: 2, fillAfterStrokeEnabled: true, listening: false }" />
          </v-group>
        </template>

        <template v-if="snapGuide">
          <v-circle :config="{ x: snapGuide.x, y: snapGuide.y, radius: 22, stroke: 'rgba(214,238,249,.82)', strokeWidth: 2, dash: [5, 5], listening: false }" />
          <v-text :config="{ x: snapGuide.x + 28, y: snapGuide.y - 8, text: snapGuide.label, fill: 'rgba(229,244,250,.9)', fontFamily: 'Arial, sans-serif', fontSize: 13, listening: false }" />
        </template>

        <v-image
          v-for="piece in pieces"
          :key="piece.id"
          :ref="(node) => setShapeRef(node, piece.id)"
          :config="pieceConfig(piece)"
          @click="handlePieceTap($event, piece.id)"
          @tap="handlePieceTap($event, piece.id)"
          @dragstart="beginPieceDrag($event, piece)"
          @dragmove="movePiece($event, piece)"
          @dragend="endPieceDrag($event, piece)"
        />

        <v-group v-if="selectionOutline" ref="selectionOutlineRef" :config="selectionOutline.group">
          <v-rect :config="selectionOutline.rect" />
        </v-group>

        <v-circle v-if="brushCursor" :config="{ x: brushCursor.x, y: brushCursor.y, radius: brushCursor.radius, stroke: brushMode === 'hide' ? 'rgba(242,205,220,.95)' : 'rgba(205,237,246,.95)', strokeWidth: 2, dash: brushMode === 'restore' ? [5, 4] : [], fill: 'rgba(255,255,255,.04)', listening: false }" />
      </v-layer>
    </v-stage>
    <div class="canvas-label canvas-label--top">耳朵画布 <small>EAR CANVAS</small></div>
    <div v-if="isAdjustingEar" class="canvas-adjust-hint">单指拖动 · 双指缩放 / 旋转</div>
    <div v-else-if="isMarkingPiercings" class="canvas-adjust-hint">轻点真实耳洞位置 · 拖动已选标记可微调</div>
    <div v-else-if="isOccluding" class="canvas-adjust-hint">{{ brushMode === 'hide' ? '涂抹隐藏' : '涂抹恢复' }} · {{ brushSize }} PX</div>
    <div v-else class="canvas-label canvas-label--bottom">拖动饰品 · 双指缩放旋转 · 重叠处连续轻点切换</div>
  </div>
</template>
