<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { brand } from '../config/brand.js'
import { CANVAS_WIDTH } from '../config/canvas.js'
import { jewelryArchive, jewelryCategories } from '../data/jewelry.js'
import { PLACEMENT_REGIONS, PLACEMENT_STATUS, PLACEMENT_STATUS_LABEL, createPlacementPoint, isPlanned, mirrorPointsAcross } from '../data/placement.js'
import WindowChrome from '../components/common/WindowChrome.vue'
import EarCanvas from '../components/editor/EarCanvas.vue'
import { createStackId, getStack, nextStackName, putStack, sourceToBlob } from '../services/stackArchive.js'
import demoEarSource from '../assets/images/test-ear-sharp.png'

const route = useRoute()
const router = useRouter()

const earSide = ref('right')
const earSource = ref(demoEarSource)
const earInput = ref(null)
const canvasRef = ref(null)
const earImageName = ref('test-ear-sharp.png')
const hasCustomEar = ref(false)
const earUploadError = ref('')
const editorMode = ref('stack')
const activeCategory = ref('ALL')
const selectedId = ref('piece-001')
const sequence = ref(1)
const placementPoints = ref([])
const placementSequence = ref(0)
const selectedPlacementId = ref(null)
const newPlacementStatus = ref(PLACEMENT_STATUS.EXISTING)
const newPlacementRegion = ref(PLACEMENT_REGIONS[0])
const snapEnabled = ref(true)
const brushMode = ref('hide')
const brushSize = ref(28)
const quickAddPlacementId = ref(null)
const undoStack = ref([])
const redoStack = ref([])
const currentStackId = ref(null)
const currentStackName = ref('')
const currentStackCreatedAt = ref(null)
const archiveNotice = ref('')
const isSaving = ref(false)
const isExporting = ref(false)
const HISTORY_LIMIT = 80
let uploadedEarUrl = null
let suppressNextEarMirror = false
let noticeTimer = null
const restoredJewelryUrls = new Set()

const earTransform = reactive({ x: 0, y: 0, scale: 1, rotation: 0 })
const firstJewelry = jewelryArchive[0]
const pieces = ref([
  {
    id: 'piece-001',
    catalogId: firstJewelry.id,
    source: firstJewelry.source,
    nameZh: firstJewelry.zh,
    nameEn: firstJewelry.en,
    x: 445,
    y: 650,
    scale: firstJewelry.scale,
    rotation: 0,
    zIndex: 1,
    type: firstJewelry.type,
    size: firstJewelry.size,
    mask: { strokes: [] },
  },
])

const selectedPiece = computed(() => pieces.value.find((piece) => piece.id === selectedId.value))
const selectedIndex = computed(() => pieces.value.findIndex((piece) => piece.id === selectedId.value))
const selectedPlacement = computed(() => placementPoints.value.find((point) => point.id === selectedPlacementId.value))
const quickAddPlacement = computed(() => placementPoints.value.find((point) => point.id === quickAddPlacementId.value))
const filteredJewelry = computed(() => activeCategory.value === 'ALL'
  ? jewelryArchive
  : jewelryArchive.filter((item) => item.type === activeCategory.value))
const currentMaskCount = computed(() => selectedPiece.value?.mask?.strokes?.length || 0)
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const stackDisplayName = computed(() => currentStackName.value || 'UNTITLED_001')
const modeStatus = computed(() => {
  if (editorMode.value === 'ear') return '正在调整耳朵 / ADJUST EAR'
  if (editorMode.value === 'piercings') return '正在标记耳洞 / MARK PIERCINGS'
  if (editorMode.value === 'occlusion') return `${brushMode.value === 'hide' ? '隐藏' : '恢复'}遮挡 / OCCLUSION`
  return '拖动 · 缩放 · 旋转'
})

function normalizeZIndexes() {
  pieces.value.forEach((piece, index) => { piece.zIndex = index + 1 })
}

function clonePiece(piece) {
  return { ...piece, mask: cloneMask(piece.mask) }
}

function snapshotEditor() {
  return {
    pieces: pieces.value.map(clonePiece),
    placementPoints: placementPoints.value.map((point) => ({ ...point })),
    selectedId: selectedId.value,
    selectedPlacementId: selectedPlacementId.value,
    sequence: sequence.value,
    placementSequence: placementSequence.value,
  }
}

function restoreEditor(snapshot) {
  pieces.value = snapshot.pieces.map(clonePiece)
  placementPoints.value = snapshot.placementPoints.map((point) => ({ ...point }))
  sequence.value = snapshot.sequence
  placementSequence.value = snapshot.placementSequence
  selectedId.value = pieces.value.some((piece) => piece.id === snapshot.selectedId) ? snapshot.selectedId : null
  selectedPlacementId.value = placementPoints.value.some((point) => point.id === snapshot.selectedPlacementId)
    ? snapshot.selectedPlacementId
    : null
  quickAddPlacementId.value = null
  if (editorMode.value === 'occlusion' && !selectedId.value) editorMode.value = 'stack'
}

function pushHistory(snapshot = snapshotEditor()) {
  undoStack.value = [...undoStack.value.slice(-(HISTORY_LIMIT - 1)), snapshot]
  redoStack.value = []
}

function clearHistory() {
  undoStack.value = []
  redoStack.value = []
}

function undoEditor() {
  if (!canUndo.value) return
  const previous = undoStack.value.at(-1)
  redoStack.value = [...redoStack.value.slice(-(HISTORY_LIMIT - 1)), snapshotEditor()]
  undoStack.value = undoStack.value.slice(0, -1)
  restoreEditor(previous)
}

function redoEditor() {
  if (!canRedo.value) return
  const next = redoStack.value.at(-1)
  undoStack.value = [...undoStack.value.slice(-(HISTORY_LIMIT - 1)), snapshotEditor()]
  redoStack.value = redoStack.value.slice(0, -1)
  restoreEditor(next)
}

function updatePiece(id, patch) {
  const piece = pieces.value.find((entry) => entry.id === id)
  if (!piece || !Object.entries(patch).some(([key, value]) => piece[key] !== value)) return
  pushHistory()
  Object.assign(piece, patch)
}

function updateEar(patch) {
  const before = { ...earTransform }
  const next = {
    x: 'x' in patch ? patch.x : before.x,
    y: 'y' in patch ? patch.y : before.y,
    scale: 'scale' in patch ? Math.max(0.45, Math.min(3.5, patch.scale)) : before.scale,
    rotation: 'rotation' in patch ? Math.max(-15, Math.min(15, patch.rotation)) : before.rotation,
  }

  // 耳洞标记跟着耳朵照片一起位移 / 缩放 / 旋转，保持和照片上的真实位置对齐。
  if (placementPoints.value.length) {
    const oldCenter = { x: CANVAS_WIDTH / 2 + before.x, y: 480 + before.y }
    const newCenter = { x: CANVAS_WIDTH / 2 + next.x, y: 480 + next.y }
    const scaleRatio = next.scale / before.scale
    const direction = earSide.value === 'left' ? -1 : 1
    const angle = (next.rotation - before.rotation) * direction * Math.PI / 180
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    for (const point of placementPoints.value) {
      const relativeX = (point.x - oldCenter.x) * scaleRatio
      const relativeY = (point.y - oldCenter.y) * scaleRatio
      point.x = newCenter.x + relativeX * cosine - relativeY * sine
      point.y = newCenter.y + relativeX * sine + relativeY * cosine
    }
  }

  const changed = Object.keys(next).some((key) => next[key] !== before[key])
  Object.assign(earTransform, next)
  if (changed) clearHistory()
}

function resetEar() {
  updateEar({ x: 0, y: 0, scale: 1, rotation: 0 })
}

// 切换左右耳时照片会镜像，标记点必须一起镜像才不会脱离耳朵。
watch(earSide, () => {
  if (suppressNextEarMirror) {
    suppressNextEarMirror = false
    return
  }
  if (placementPoints.value.length) {
    placementPoints.value = mirrorPointsAcross(placementPoints.value, CANVAS_WIDTH / 2 + earTransform.x)
  }
  clearHistory()
})

function enterMode(mode) {
  if (mode === 'occlusion' && !selectedPiece.value) return
  editorMode.value = mode
  quickAddPlacementId.value = null
  if (mode === 'ear' || mode === 'piercings') selectedId.value = null
}

function finishMode() {
  editorMode.value = 'stack'
}

function nudgeScale(amount) {
  if (!selectedPiece.value) return
  pushHistory()
  selectedPiece.value.scale = Math.max(0.22, Math.min(2.8, selectedPiece.value.scale + amount))
}

function nudgeRotation(amount) {
  if (!selectedPiece.value) return
  pushHistory()
  selectedPiece.value.rotation = (selectedPiece.value.rotation + amount + 360) % 360
}

function deleteSelected() {
  if (!selectedId.value) return
  pushHistory()
  pieces.value = pieces.value.filter((piece) => piece.id !== selectedId.value)
  selectedId.value = null
  normalizeZIndexes()
  finishMode()
}

function defaultPosition(type) {
  if (type === 'CUFF') return { x: 492, y: 390 }
  if (type === 'CHAIN') return { x: 438, y: 555 }
  if (type === 'HOOP') return { x: 438, y: 650 }
  return { x: 430, y: 610 }
}

function addPiece(item) {
  pushHistory()
  sequence.value += 1
  const id = `piece-${String(sequence.value).padStart(3, '0')}`
  const position = defaultPosition(item.type)
  pieces.value.push({
    id,
    catalogId: item.id,
    source: item.source,
    nameZh: item.zh,
    nameEn: item.en,
    x: position.x + (sequence.value % 3) * 18,
    y: position.y + (sequence.value % 2) * 18,
    scale: item.scale,
    rotation: 0,
    zIndex: pieces.value.length + 1,
    type: item.type,
    size: item.size,
    mask: { strokes: [] },
  })
  selectedId.value = id
}

function addPieceAtPlacement(item) {
  const point = quickAddPlacement.value
  if (!point) return
  pushHistory()
  sequence.value += 1
  const id = `piece-${String(sequence.value).padStart(3, '0')}`
  pieces.value.push({
    id,
    catalogId: item.id,
    source: item.source,
    nameZh: item.zh,
    nameEn: item.en,
    x: point.x,
    y: point.y,
    scale: item.scale,
    rotation: 0,
    zIndex: pieces.value.length + 1,
    type: item.type,
    size: item.size,
    mask: { strokes: [] },
  })
  selectedId.value = id
  quickAddPlacementId.value = null
}

function selectPiece(id) {
  selectedId.value = id
  quickAddPlacementId.value = null
}

function selectPlacementPoint(id) {
  selectedPlacementId.value = id
  if (editorMode.value === 'stack') quickAddPlacementId.value = id
}

function cloneMask(mask) {
  return {
    strokes: (mask?.strokes || []).map((stroke) => ({
      mode: stroke.mode,
      size: stroke.size,
      points: [...stroke.points],
    })),
  }
}

function duplicateSelected() {
  if (!selectedPiece.value) return
  pushHistory()
  sequence.value += 1
  const id = `piece-${String(sequence.value).padStart(3, '0')}`
  pieces.value.push({
    ...selectedPiece.value,
    id,
    x: selectedPiece.value.x + 28,
    y: selectedPiece.value.y + 28,
    zIndex: pieces.value.length + 1,
    mask: cloneMask(selectedPiece.value.mask),
  })
  selectedId.value = id
}

function bringForward() {
  const index = selectedIndex.value
  if (index < 0 || index >= pieces.value.length - 1) return
  pushHistory()
  const next = pieces.value[index + 1]
  pieces.value[index + 1] = pieces.value[index]
  pieces.value[index] = next
  normalizeZIndexes()
}

function sendBackward() {
  const index = selectedIndex.value
  if (index <= 0) return
  pushHistory()
  const previous = pieces.value[index - 1]
  pieces.value[index - 1] = pieces.value[index]
  pieces.value[index] = previous
  normalizeZIndexes()
}

// 完全由用户点击产生，不做任何自动识别。
function addPlacementPoint(position) {
  pushHistory()
  placementSequence.value += 1
  const point = createPlacementPoint({
    x: position.x,
    y: position.y,
    index: placementSequence.value,
    status: newPlacementStatus.value,
    region: newPlacementRegion.value,
    points: placementPoints.value,
  })
  placementPoints.value.push(point)
  selectedPlacementId.value = point.id
}

function updatePlacementPoint(id, patch) {
  const point = placementPoints.value.find((entry) => entry.id === id)
  if (!point || !Object.entries(patch).some(([key, value]) => point[key] !== value)) return
  pushHistory()
  Object.assign(point, patch)
}

function deleteSelectedPlacementPoint() {
  if (!selectedPlacementId.value) return
  pushHistory()
  placementPoints.value = placementPoints.value.filter((point) => point.id !== selectedPlacementId.value)
  selectedPlacementId.value = placementPoints.value.at(-1)?.id || null
}

function updateMask(id, strokes) {
  const piece = pieces.value.find((entry) => entry.id === id)
  if (!piece) return
  pushHistory()
  piece.mask = { strokes }
}

function setSelectedPlacementStatus(status) {
  if (!selectedPlacement.value || selectedPlacement.value.status === status) return
  pushHistory()
  selectedPlacement.value.status = status
}

function undoMask() {
  if (!selectedPiece.value || !currentMaskCount.value) return
  updateMask(selectedPiece.value.id, selectedPiece.value.mask.strokes.slice(0, -1))
}

function resetMask() {
  if (!selectedPiece.value) return
  updateMask(selectedPiece.value.id, [])
}

function openEarPicker() {
  earUploadError.value = ''
  if (!earInput.value) return
  earInput.value.value = ''
  earInput.value.click()
}

function handleEarUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    earUploadError.value = '请选择图片文件。'
    return
  }
  const nextUrl = URL.createObjectURL(file)
  if (uploadedEarUrl) URL.revokeObjectURL(uploadedEarUrl)
  uploadedEarUrl = nextUrl
  earSource.value = nextUrl
  earImageName.value = file.name
  hasCustomEar.value = true
  earUploadError.value = ''
  placementPoints.value = []
  selectedPlacementId.value = null
  placementSequence.value = 0
  clearHistory()
  resetEar()
  enterMode('ear')
}

function showArchiveNotice(message) {
  archiveNotice.value = message
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { archiveNotice.value = '' }, 2800)
}

function releaseRestoredJewelryUrls() {
  for (const url of restoredJewelryUrls) URL.revokeObjectURL(url)
  restoredJewelryUrls.clear()
}

async function serializeJewelryLayer(piece) {
  const catalogItem = jewelryArchive.find((item) => item.id === piece.catalogId)
  const customSource = !catalogItem || catalogItem.source !== piece.source
  return {
    id: piece.id,
    catalogId: piece.catalogId || null,
    source: piece.source,
    sourceBlob: customSource ? await sourceToBlob(piece.source) : null,
    nameZh: piece.nameZh,
    nameEn: piece.nameEn,
    type: piece.type,
    size: piece.size,
    x: piece.x,
    y: piece.y,
    scale: piece.scale,
    rotation: piece.rotation,
    zIndex: piece.zIndex,
    mask: cloneMask(piece.mask),
  }
}

async function saveCurrentStack() {
  if (isSaving.value || !canvasRef.value) return
  isSaving.value = true
  archiveNotice.value = '正在写入本机档案… / SAVING'
  try {
    const now = new Date().toISOString()
    const id = currentStackId.value || createStackId()
    const name = currentStackName.value || await nextStackName()
    const [earBlob, jewelryLayers, thumbnailBlob] = await Promise.all([
      sourceToBlob(earSource.value),
      Promise.all(pieces.value.map(serializeJewelryLayer)),
      canvasRef.value.createThumbnailBlob(),
    ])
    const record = {
      schemaVersion: 1,
      id,
      name,
      createdAt: currentStackCreatedAt.value || now,
      updatedAt: now,
      ear: {
        side: earSide.value,
        image: {
          blob: earBlob,
          fileName: earImageName.value,
          mimeType: earBlob.type || 'image/png',
          custom: hasCustomEar.value,
        },
        transform: { ...earTransform },
      },
      placementPoints: placementPoints.value.map((point) => ({ ...point })),
      jewelryLayers,
      editor: {
        sequence: sequence.value,
        placementSequence: placementSequence.value,
        snapEnabled: snapEnabled.value,
      },
      thumbnailBlob,
    }
    await putStack(record)
    currentStackId.value = id
    currentStackName.value = name
    currentStackCreatedAt.value = record.createdAt
    await router.replace({ name: 'editor', query: { ...route.query, stack: id } })
    showArchiveNotice(`${name} 已保存到本机 / ARCHIVED`)
  } catch (error) {
    showArchiveNotice(`保存失败 / ${error?.message || 'SAVE FAILED'}`)
  } finally {
    isSaving.value = false
  }
}

async function exportImage() {
  if (isExporting.value || !canvasRef.value) return
  isExporting.value = true
  archiveNotice.value = '正在生成高清 PNG… / EXPORTING'
  try {
    const blob = await canvasRef.value.createExportBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (currentStackName.value || '4EVER_STACK').replace(/[^\w\-]+/g, '_')
    link.href = url
    link.download = `${safeName}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1200)
    showArchiveNotice('PNG 已导出 / EXPORT COMPLETE')
  } catch (error) {
    showArchiveNotice(`导出失败 / ${error?.message || 'EXPORT FAILED'}`)
  } finally {
    isExporting.value = false
  }
}

async function restoreSavedStack(record) {
  if (!record) return
  if (uploadedEarUrl) URL.revokeObjectURL(uploadedEarUrl)
  releaseRestoredJewelryUrls()

  const earBlob = record.ear?.image?.blob
  uploadedEarUrl = earBlob ? URL.createObjectURL(earBlob) : null
  earSource.value = uploadedEarUrl || demoEarSource
  earImageName.value = record.ear?.image?.fileName || 'ear-photo.png'
  hasCustomEar.value = Boolean(record.ear?.image?.custom)
  Object.assign(earTransform, { x: 0, y: 0, scale: 1, rotation: 0 }, record.ear?.transform || {})

  const restoredSide = record.ear?.side === 'left' ? 'left' : 'right'
  if (restoredSide !== earSide.value) suppressNextEarMirror = true
  earSide.value = restoredSide
  placementPoints.value = (record.placementPoints || []).map((point) => ({ ...point }))

  pieces.value = (await Promise.all((record.jewelryLayers || []).map(async (layer) => {
    const catalogItem = jewelryArchive.find((item) => item.id === layer.catalogId)
    let source = catalogItem?.source || layer.source
    if (layer.sourceBlob) {
      source = URL.createObjectURL(layer.sourceBlob)
      restoredJewelryUrls.add(source)
    }
    return { ...layer, source, mask: cloneMask(layer.mask) }
  }))).sort((a, b) => a.zIndex - b.zIndex)

  sequence.value = record.editor?.sequence || pieces.value.length
  placementSequence.value = record.editor?.placementSequence || placementPoints.value.length
  snapEnabled.value = record.editor?.snapEnabled ?? true
  selectedId.value = null
  selectedPlacementId.value = null
  quickAddPlacementId.value = null
  editorMode.value = 'stack'
  currentStackId.value = record.id
  currentStackName.value = record.name
  currentStackCreatedAt.value = record.createdAt
  clearHistory()
}

async function loadSavedStack(id) {
  try {
    const record = await getStack(id)
    if (!record) {
      showArchiveNotice('未找到这份本机档案 / FILE NOT FOUND')
      return
    }
    await restoreSavedStack(record)
    showArchiveNotice(`${record.name} 已恢复 / FILE OPENED`)
  } catch (error) {
    showArchiveNotice(`读取失败 / ${error?.message || 'OPEN FAILED'}`)
  }
}

function handleHistoryShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
  const key = event.key.toLowerCase()
  if (key === 'z' && event.shiftKey) {
    event.preventDefault()
    redoEditor()
  } else if (key === 'z') {
    event.preventDefault()
    undoEditor()
  } else if (key === 'y') {
    event.preventDefault()
    redoEditor()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleHistoryShortcut)
  if (typeof route.query.stack === 'string') await loadSavedStack(route.query.stack)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleHistoryShortcut)
  if (noticeTimer) window.clearTimeout(noticeTimer)
  if (uploadedEarUrl) URL.revokeObjectURL(uploadedEarUrl)
  releaseRestoredJewelryUrls()
})
</script>

<template>
  <main class="editor-page">
    <WindowChrome :title="`${brand.name}.EXE — 搭配编辑器 / ${stackDisplayName}`">
      <nav class="menu-strip editor-menu" aria-label="编辑器菜单">
        <RouterLink to="/">文件</RouterLink>
        <span>编辑</span><span>视图</span><span>搭配</span><span>饰品</span><RouterLink to="/memory">档案</RouterLink><span>帮助</span>
      </nav>

      <header class="editor-toolbar">
        <div class="editor-file">
          <p class="eyebrow">搭配编辑器 <small>STACK EDITOR</small></p>
          <strong>{{ stackDisplayName }}</strong>
        </div>

        <div class="history-controls" aria-label="编辑历史">
          <button type="button" :disabled="!canUndo" title="Ctrl+Z" @click="undoEditor"><b>↶ 撤销</b><small>UNDO</small></button>
          <button type="button" :disabled="!canRedo" title="Ctrl+Y / Ctrl+Shift+Z" @click="redoEditor"><b>↷ 重做</b><small>REDO</small></button>
        </div>

        <div class="mode-switch" aria-label="编辑模式">
          <button :class="{ active: editorMode === 'ear' }" @click="enterMode('ear')"><b>调整耳朵</b><small>ADJUST EAR</small></button>
          <button :class="{ active: editorMode === 'piercings' }" @click="enterMode('piercings')"><b>标记耳洞</b><small>MARK PIERCINGS</small></button>
          <button :class="{ active: editorMode === 'stack' }" @click="enterMode('stack')"><b>编辑搭配</b><small>EDIT STACK</small></button>
          <button :class="{ active: editorMode === 'occlusion' }" :disabled="!selectedPiece" @click="enterMode('occlusion')"><b>遮挡修正</b><small>OCCLUSION</small></button>
        </div>

        <div class="ear-switch" aria-label="选择耳朵方向">
          <button :class="{ active: earSide === 'left' }" @click="earSide = 'left'"><b>左耳</b><small>LEFT</small></button>
          <button :class="{ active: earSide === 'right' }" @click="earSide = 'right'"><b>右耳</b><small>RIGHT</small></button>
        </div>

        <div class="ear-upload">
          <input ref="earInput" class="visually-hidden" type="file" accept="image/*" @change="handleEarUpload" />
          <button class="ear-upload__button" type="button" @click="openEarPicker">
            <b>{{ hasCustomEar ? '更换耳朵照片' : '上传耳朵照片' }}</b>
            <small>{{ hasCustomEar ? 'REPLACE EAR' : 'UPLOAD EAR' }}</small>
          </button>
          <span v-if="earUploadError" role="alert">{{ earUploadError }}</span>
        </div>
      </header>

      <div class="stack-file-bar" aria-label="搭配文件操作">
        <button type="button" :disabled="isSaving" @click="saveCurrentStack"><b>保存搭配</b><small>ARCHIVE THIS STACK</small></button>
        <button type="button" :disabled="isExporting" @click="exportImage"><b>导出图片</b><small>EXPORT IMAGE · PNG</small></button>
        <RouterLink to="/memory"><b>搭配档案</b><small>MEMORY FILES</small></RouterLink>
        <span class="stack-file-bar__notice" aria-live="polite">{{ archiveNotice || '工程与图片分别保存 / LOCAL ONLY' }}</span>
      </div>

      <div class="editor-workspace">
        <aside class="archive-panel panel-surface" :class="{ 'panel-surface--inactive': editorMode !== 'stack' }">
          <div class="panel-heading">
            <span><b>饰品库</b><small>JEWELRY ARCHIVE</small></span>
            <small>{{ jewelryArchive.length }} 件</small>
          </div>
          <div class="archive-filters" aria-label="饰品分类">
            <button
              v-for="category in jewelryCategories"
              :key="category.value"
              :class="{ active: activeCategory === category.value }"
              :disabled="editorMode !== 'stack'"
              @click="activeCategory = category.value"
            ><b>{{ category.zh }}</b><small>{{ category.en }}</small></button>
          </div>
          <div class="archive-list">
            <button
              v-for="item in filteredJewelry"
              :key="item.id"
              class="archive-piece"
              type="button"
              :disabled="editorMode !== 'stack'"
              :aria-label="`添加${item.zh}`"
              @click="addPiece(item)"
            >
              <span class="archive-thumb"><img :src="item.source" :alt="item.zh" /></span>
              <span class="archive-piece__name"><b>{{ item.zh }}</b><small>{{ item.en }} · {{ item.type }}</small></span>
              <i aria-hidden="true">＋</i>
            </button>
          </div>
        </aside>

        <section class="canvas-panel">
          <EarCanvas
            ref="canvasRef"
            :ear-source="earSource"
            :ear-side="earSide"
            :ear-transform="earTransform"
            :mode="editorMode"
            :pieces="pieces"
            :selected-id="selectedId"
            :placement-points="placementPoints"
            :selected-placement-id="selectedPlacementId"
            :snap-enabled="snapEnabled"
            :brush-mode="brushMode"
            :brush-size="brushSize"
            @select="selectPiece"
            @update-piece="updatePiece"
            @update-ear="updateEar"
            @add-placement-point="addPlacementPoint"
            @select-placement-point="selectPlacementPoint"
            @update-placement-point="updatePlacementPoint"
            @update-mask="updateMask"
          />

          <div v-if="quickAddPlacement" class="quick-add-popover" role="dialog" aria-modal="false" :aria-label="`在${quickAddPlacement.label}添加饰品`">
            <div class="quick-add-popover__heading">
              <span><b>添加饰品</b><small>ADD TO {{ quickAddPlacement.label }} · {{ PLACEMENT_STATUS_LABEL[quickAddPlacement.status].zh }}</small></span>
              <button type="button" aria-label="关闭添加饰品" @click="quickAddPlacementId = null">×</button>
            </div>
            <div class="quick-add-list">
              <button
                v-for="item in jewelryArchive"
                :key="item.id"
                type="button"
                :aria-label="`将${item.zh}放到${quickAddPlacement.label}`"
                @click="addPieceAtPlacement(item)"
              >
                <span><img :src="item.source" :alt="item.zh" /></span>
                <b>{{ item.zh }}</b>
                <small>{{ item.type }}</small>
              </button>
            </div>
            <p>放置后不会绑定耳洞点，仍可自由拖动、缩放和旋转。</p>
          </div>
        </section>

        <aside v-if="editorMode === 'ear'" class="details-panel ear-adjust-panel panel-surface">
          <div class="panel-heading"><span><b>调整耳朵</b><small>ADJUST EAR</small></span><small>背景层</small></div>
          <p class="adjust-note">拖动照片改变位置；手机可双指缩放和旋转。</p>
          <div class="piece-readout">
            <span>横向<b>{{ Math.round(earTransform.x) }}</b></span>
            <span>缩放<b>{{ earTransform.scale.toFixed(2) }}</b></span>
            <span>角度<b>{{ Math.round(earTransform.rotation) }}°</b></span>
          </div>
          <div class="touch-controls">
            <div><small>缩放</small><button aria-label="缩小耳朵照片" @click="updateEar({ scale: earTransform.scale - 0.1 })">−</button><button aria-label="放大耳朵照片" @click="updateEar({ scale: earTransform.scale + 0.1 })">＋</button></div>
            <div><small>旋转</small><button aria-label="向左旋转耳朵照片" @click="updateEar({ rotation: earTransform.rotation - 2 })">↶</button><button aria-label="向右旋转耳朵照片" @click="updateEar({ rotation: earTransform.rotation + 2 })">↷</button></div>
          </div>
          <div class="adjust-actions">
            <button type="button" @click="resetEar"><b>重置</b><small>RESET</small></button>
            <button class="done-button" type="button" @click="finishMode"><b>完成</b><small>DONE</small></button>
          </div>
        </aside>

        <aside v-else-if="editorMode === 'piercings'" class="details-panel piercing-panel panel-surface">
          <div class="panel-heading"><span><b>标记耳洞</b><small>MARK PIERCINGS</small></span><small>{{ placementPoints.length }} 个</small></div>
          <p class="adjust-note">系统不会自动识别耳洞。先选状态和部位，再轻点照片上你自己的真实耳洞位置。</p>

          <div class="piercing-status-picker" aria-label="新标记状态">
            <button :class="{ active: newPlacementStatus === 'existing' }" @click="newPlacementStatus = 'existing'"><i></i><b>已有耳洞</b><small>EXISTING</small></button>
            <button :class="{ active: newPlacementStatus === 'planned' }" @click="newPlacementStatus = 'planned'"><i></i><b>计划穿刺</b><small>PLANNED</small></button>
          </div>

          <div class="placement-region">
            <small>部位标签 <b>REGION</b></small>
            <div class="placement-region-picker" aria-label="部位标签">
              <button
                v-for="region in PLACEMENT_REGIONS"
                :key="region"
                :class="{ active: newPlacementRegion === region }"
                @click="newPlacementRegion = region"
              >{{ region }}</button>
            </div>
          </div>

          <div class="placement-legend" aria-label="标记图例">
            <span><i class="legend-dot"></i>实心 · 已有 EXISTING</span>
            <span><i class="legend-dot legend-dot--planned"></i>空心 · 计划 PLANNED</span>
          </div>

          <div class="piercing-list" aria-label="已标记位置">
            <button
              v-for="point in placementPoints"
              :key="point.id"
              :class="{ active: selectedPlacementId === point.id, planned: isPlanned(point) }"
              @click="selectedPlacementId = point.id"
            >
              <i></i>
              <b>{{ point.label }}</b>
              <small>{{ point.id }} · {{ PLACEMENT_STATUS_LABEL[point.status].zh }}</small>
            </button>
            <p v-if="!placementPoints.length">还没有标记。轻点画布即可添加 P01。</p>
          </div>

          <div v-if="selectedPlacement" class="piercing-editor">
            <label>标记名称 <small>LABEL</small><input v-model.trim="selectedPlacement.label" maxlength="18" /></label>
            <div class="piercing-status-picker piercing-status-picker--compact">
              <button :class="{ active: selectedPlacement.status === 'existing' }" @click="setSelectedPlacementStatus('existing')"><b>已有</b><small>EXISTING</small></button>
              <button :class="{ active: selectedPlacement.status === 'planned' }" @click="setSelectedPlacementStatus('planned')"><b>计划</b><small>PLANNED</small></button>
            </div>
            <p class="piercing-tip">标记只作为定位参考，不会限制饰品自由移动。拖动已选中的标记可以直接微调位置。</p>
            <button class="delete-mark-button" @click="deleteSelectedPlacementPoint"><b>删除标记</b><small>DELETE MARK</small></button>
          </div>

          <div class="adjust-actions piercing-done">
            <button class="done-button" type="button" @click="finishMode"><b>完成</b><small>DONE</small></button>
          </div>
        </aside>

        <aside v-else-if="editorMode === 'occlusion'" class="details-panel occlusion-panel panel-surface">
          <div class="panel-heading"><span><b>遮挡修正</b><small>OCCLUSION</small></span><small>{{ selectedPiece?.nameZh }}</small></div>
          <p class="adjust-note">用手指涂抹耳饰。隐藏后会露出下方耳朵照片，原始素材不会被修改。</p>
          <div class="mask-mode-switch" aria-label="遮挡画笔模式">
            <button :class="{ active: brushMode === 'hide' }" @click="brushMode = 'hide'"><b>隐藏</b><small>HIDE</small></button>
            <button :class="{ active: brushMode === 'restore' }" @click="brushMode = 'restore'"><b>恢复</b><small>RESTORE</small></button>
          </div>
          <label class="brush-size-control">
            <span><b>画笔大小</b><small>BRUSH SIZE</small></span>
            <input v-model.number="brushSize" type="range" min="8" max="72" step="2" />
            <output>{{ brushSize }}</output>
          </label>
          <div class="mask-actions">
            <button :disabled="!currentMaskCount" @click="undoMask"><b>撤销</b><small>UNDO</small></button>
            <button :disabled="!currentMaskCount" @click="resetMask"><b>重置遮挡</b><small>RESET MASK</small></button>
            <button class="done-button" @click="finishMode"><b>完成</b><small>DONE</small></button>
          </div>
        </aside>

        <aside v-else class="details-panel panel-surface" :class="{ 'details-panel--empty': !selectedPiece }">
          <div class="panel-heading"><span><b>饰品详情</b><small>PIECE DETAILS</small></span><small>{{ selectedPiece ? selectedPiece.id.toUpperCase() : '未选择' }}</small></div>
          <template v-if="selectedPiece">
            <div class="selected-piece-name"><b>{{ selectedPiece.nameZh }}</b><small>{{ selectedPiece.nameEn }}</small></div>
            <div class="piece-readout">
              <span>类型<b>{{ selectedPiece.type }}</b></span>
              <span>大小<b>{{ selectedPiece.scale.toFixed(2) }}</b></span>
              <span>角度<b>{{ Math.round(selectedPiece.rotation) }}°</b></span>
            </div>
            <button class="snap-toggle" :class="{ active: snapEnabled }" type="button" @click="snapEnabled = !snapEnabled"><b>吸附自定义耳洞 {{ snapEnabled ? '开' : '关' }}</b><small>SNAP TO OWN MARKS · {{ placementPoints.length }}</small></button>
            <div class="touch-controls">
              <div><small>大小</small><button aria-label="缩小饰品" @click="nudgeScale(-0.1)">−</button><button aria-label="放大饰品" @click="nudgeScale(0.1)">＋</button></div>
              <div><small>旋转</small><button aria-label="向左旋转饰品" @click="nudgeRotation(-15)">↶</button><button aria-label="向右旋转饰品" @click="nudgeRotation(15)">↷</button></div>
            </div>
            <button class="occlusion-entry" type="button" @click="enterMode('occlusion')"><b>遮挡修正</b><small>OCCLUSION · {{ currentMaskCount }} STROKES</small></button>
            <div class="layer-actions">
              <button type="button" @click="duplicateSelected"><b>复制</b><small>DUPLICATE</small></button>
              <button type="button" :disabled="selectedIndex >= pieces.length - 1" @click="bringForward"><b>上移一层</b><small>BRING FORWARD</small></button>
              <button type="button" :disabled="selectedIndex <= 0" @click="sendBackward"><b>下移一层</b><small>SEND BACKWARD</small></button>
            </div>
            <button class="delete-button" type="button" @click="deleteSelected"><b>删除饰品</b><small>DELETE PIECE</small></button>
          </template>
          <template v-else>
            <p class="empty-selection">点击一件饰品开始编辑。<small>TAP A PIECE TO EDIT</small></p>
            <button class="snap-toggle snap-toggle--empty" :class="{ active: snapEnabled }" type="button" @click="snapEnabled = !snapEnabled"><b>吸附自定义耳洞 {{ snapEnabled ? '开' : '关' }}</b><small>SNAP TO OWN MARKS · {{ placementPoints.length }}</small></button>
          </template>
        </aside>
      </div>

      <div class="editor-status status-strip">
        <span>{{ pieces.length }} 件饰品 · {{ placementPoints.length }} 个标记点</span>
        <span>{{ modeStatus }}</span>
        <span>本地模式</span>
      </div>
    </WindowChrome>
  </main>
</template>
