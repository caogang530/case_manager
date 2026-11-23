<template>
  <section class="map-surface" ref="surface" :class="{ panning: gesture?.type === 'pan', 'hand-mode': hand || space }"
    aria-label="用例导图" tabindex="-1" @pointerdown="startGesture" @pointermove="moveGesture"
    @pointerup="endGesture" @pointercancel="endGesture" @wheel.prevent="wheel" @keydown="onSpace" @keyup="releaseSpace" @blur="space = false">
    <canvas ref="lines" class="connections" aria-hidden="true"></canvas>
    <div class="map-world" :style="worldStyle">
      <div v-for="entry in layout.entries" :key="entry.node.id" class="map-slot" :class="[colorOf(entry), entry.kind]"
        :style="{ left: `${entry.x}px`, top: `${entry.y}px`, width: `${entry.width}px`, height: `${entry.height}px` }">
        <div v-measure-node="entry.node.id" class="map-node" :class="[plan && entry.kind === 'case' && statusOf(entry.node.id), { selected: selection.has(entry.node.id), matched: matches.has(entry.node.id), current: currentMatch === entry.node.id, 'drop-target': dropTarget === entry.node.id }]"
          :style="editing === entry.node.id ? { width: `${entry.width}px` } : undefined"
          :data-node-id="entry.node.id" :aria-pressed="selection.has(entry.node.id)" role="button" tabindex="0"
          :draggable="entry.depth > 0 && editing !== entry.node.id && !hand && !space"
          @dragstart="dragStart(entry, $event)" @dragover="dragOver(entry, $event)" @dragleave="dragLeave(entry, $event)"
          @drop.prevent="dropOn(entry)" @dragend="stopDrag"
          @pointerdown="nodePointerDown($event)" @click="clickNode(entry.node.id, $event)" @dblclick.stop="editNode(entry.node.id)"
          @keydown.enter.self.stop.prevent="emit('select', entry.node.id, $event)" @keydown.space.self.stop.prevent="emit('select', entry.node.id, $event)">
          <div class="node-header">
            <span v-if="entry.kind === 'root'" class="root-mark" aria-hidden="true">✳</span>
            <span v-else-if="entry.kind === 'module'" class="module-mark" aria-hidden="true"></span>
            <span v-else class="node-dot" aria-hidden="true"></span>
            <span v-for="icon in iconsFor(entry.node.icons)" :key="icon.id" class="node-icon-glyph" role="img"
              :aria-label="icon.label" :title="icon.label" :style="{ color: icon.color }">{{ icon.glyph }}</span>
            <textarea v-if="editing === entry.node.id" :ref="focusTitle" class="node-input" aria-label="编辑节点名称" rows="1" v-model="title"
              @input="resizeTitle($event.currentTarget)" @pointerdown.stop @click.stop @dblclick.stop @keydown.stop="editKeydown" @blur="commitTitle(false)"></textarea>
            <span v-else class="node-text"><strong>{{ entry.node.title }}</strong>
              <small v-if="entry.kind === 'root'">{{ total }} 条测试用例</small>
            </span>
            <span v-if="entry.kind === 'case' && entry.node.priority" class="priority-chip" :class="entry.node.priority.toLowerCase()">{{ entry.node.priority }}</span>
            <button v-if="entry.kind === 'case' && plan" class="node-status" :class="statusOf(entry.node.id)" type="button"
              :aria-label="`${entry.node.title}的状态，${statuses[statusOf(entry.node.id)].label}`" :title="`设置状态 · ${statuses[statusOf(entry.node.id)].label}`"
              @pointerdown.stop @click.stop="emit('node-status', entry.node.id, $event.currentTarget.getBoundingClientRect())" @dblclick.stop>
              {{ statuses[statusOf(entry.node.id)].symbol }}
            </button>
            <span v-if="entry.kind === 'module' && !entry.node.children.length" class="module-empty" aria-hidden="true">—</span>
          </div>
          <button v-if="entry.node.image" type="button" class="node-image" aria-label="放大节点图片" @pointerdown.stop
            @click.stop="emit('preview', entry.node.image)" @dblclick.stop>
            <img :src="entry.node.image" alt="节点图片" draggable="false">
          </button>
        </div>
        <button v-if="entry.depth && entry.node.children.length && !filtering" class="fold-button" type="button"
          :aria-expanded="!collapsed.has(entry.node.id)" :aria-label="`${collapsed.has(entry.node.id) ? '展开' : '折叠'}${entry.node.title}`"
          :class="{ folded: collapsed.has(entry.node.id) }" @pointerdown.stop @click.stop="emit('fold', entry.node.id)"
          @dblclick.stop>
          {{ collapsed.has(entry.node.id) ? entry.node.children.length : '−' }}
        </button>
      </div>
    </div>
    <div v-if="lasso" class="lasso" :style="{ left: `${lasso.x}px`, top: `${lasso.y}px`, width: `${lasso.width}px`, height: `${lasso.height}px` }"></div>
    <div class="canvas-tools" aria-label="画布工具" @pointerdown.stop>
      <button type="button" class="tool-icon" aria-label="选择工具" title="选择 · 可用 Shift 拖拽框选" :aria-pressed="!hand" @click="hand = false">↖</button>
      <button type="button" class="tool-icon" aria-label="平移工具" title="平移 · 也可按住空格" :aria-pressed="hand" @click="hand = true">✥</button>
      <span class="control-rule"></span>
      <button type="button" class="tool-icon" aria-label="缩小" title="缩小" @click="zoom(-1)">−</button>
      <button type="button" class="zoom-value" title="重置缩放" @click="setZoom(1)">{{ Math.round(camera.scale * 100) }}%</button>
      <button type="button" class="tool-icon" aria-label="放大" title="放大" @click="zoom(1)">+</button>
      <span class="control-rule"></span>
      <button type="button" class="tool-icon" aria-label="适应画布" title="适应画布" @click="fit">⛶</button>
    </div>
    <div class="minimap" @pointerdown.stop>
      <button class="minimap-label" type="button" :aria-expanded="minimapOpen" @click="minimapOpen = !minimapOpen"><span>小地图</span><span aria-hidden="true">{{ minimapOpen ? '−' : '+' }}</span></button>
      <canvas v-show="minimapOpen" ref="minimap" width="168" height="86" aria-label="小地图，点击移动视口" tabindex="0"
        @pointerdown.stop="startMini" @pointermove="moveMini" @pointerup="miniPointer = null" @pointercancel="miniPointer = null"
        @keydown.enter.prevent="fit" @keydown.space.prevent="fit"></canvas>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { statuses } from './model.js'
import { iconsFor } from './nodeIcons.js'

const props = defineProps({
  layout: { type: Object, required: true }, selection: { type: Set, required: true }, collapsed: { type: Set, required: true },
  matches: { type: Set, required: true }, results: { type: Object, required: true },
  currentMatch: String, editing: String, plan: Boolean, filtering: Boolean, total: Number,
})
const emit = defineEmits(['select', 'clear', 'rename', 'edit', 'edit-end', 'fold', 'node-status', 'select-many', 'move', 'measure', 'preview'])
const surface = ref(null)
const lines = ref(null)
const minimap = ref(null)
const minimapOpen = ref(true)
const camera = reactive({ x: 0, y: 0, scale: 1 })
const viewport = reactive({ width: 0, height: 0 })
const hand = ref(false)
const space = ref(false)
const gesture = shallowRef(null)
const lasso = ref(null)
const title = ref('')
const dropTarget = ref(null)
let titleId = null
let dragId = null
let miniPointer = null
let observer
let autoFit = true
let centeredNode = null
let drawFrame = 0
let firstFit = true
let suppressClick = false
const touches = new Map()
let pinching = false
const nodeSizes = new ResizeObserver((changes) => {
  const sizes = changes.map(({ target }) => [target.dataset.nodeId, { width: target.offsetWidth, height: target.offsetHeight }])
  if (sizes.length) emit('measure', sizes)
})
const vMeasureNode = {
  mounted: (element) => nodeSizes.observe(element, { box: 'border-box' }),
  beforeUnmount: (element) => nodeSizes.unobserve(element),
}

const strokes = { iris: '#ad9de2', ocean: '#78b5d0', peach: '#dfa484', mint: '#83b7a2', rose: '#d991a7', gold: '#d1b274' }
const worldStyle = computed(() => ({ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }))
const colorOf = (entry) => entry.color
const statusOf = (id) => statuses[props.results[id]] ? props.results[id] : 'unexecuted'

watch(() => props.editing, (id) => {
  titleId = id
  title.value = props.layout.entries.find((entry) => entry.node.id === id)?.node.title || ''
})

function focusTitle(input) {
  if (!input || input === document.activeElement) return
  // Measure after Vue inserts the textarea and sets its value.
  nextTick(() => {
    if (!input.isConnected) return
    resizeTitle(input)
    input.focus({ preventScroll: true })
    input.select()
  })
}
function resizeTitle(input) {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight}px`
}
function commitTitle(returnFocus) {
  if (!titleId) return
  const id = titleId
  titleId = null
  if (title.value.trim()) emit('rename', id, title.value.trim())
  emit('edit-end', id, returnFocus)
}
function cancelTitle() {
  if (!titleId) return
  const id = titleId
  titleId = null
  emit('edit-end', id, true)
}
function editKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitTitle(true)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelTitle()
  }
}

function fit() {
  autoFit = true
  centeredNode = null
  const { width, height } = viewport
  if (!width || !height) return
  const padding = width < 550 ? 50 : 104
  const reserved = height < 460 ? 80 : 112
  const scale = Math.max(.08, Math.min(1.13, (width - padding) / props.layout.width, (height - reserved) / props.layout.height))
  camera.scale = scale
  camera.x = (width - props.layout.width * scale) / 2
  camera.y = (height - 30 - props.layout.height * scale) / 2
}
function focusNode(id, force = false) {
  const entry = props.layout.entries.find((item) => item.node.id === id)
  if (!entry) return
  const bounds = { x: entry.x * camera.scale + camera.x, y: entry.y * camera.scale + camera.y }
  if (!force && bounds.x >= 25 && bounds.y >= 36 && bounds.x + entry.width * camera.scale <= viewport.width - 25 && bounds.y + entry.height * camera.scale <= viewport.height - 74) return
  autoFit = false
  centeredNode = force ? id : null
  if (force) camera.scale = Math.max(camera.scale, Math.min(1, (viewport.width - 65) / entry.width))
  camera.x = viewport.width / 2 - (entry.x + entry.width / 2) * camera.scale
  camera.y = (viewport.height - 35) / 2 - (entry.y + entry.height / 2) * camera.scale
}
function setZoom(scale, x = viewport.width / 2, y = viewport.height / 2) {
  autoFit = false
  centeredNode = null
  const next = Math.max(.08, Math.min(2.4, scale))
  const ratio = next / camera.scale
  camera.x = x - (x - camera.x) * ratio
  camera.y = y - (y - camera.y) * ratio
  camera.scale = next
}
function zoom(direction) { setZoom(camera.scale * (direction > 0 ? 1.17 : 1 / 1.17)) }
function wheel(event) {
  if (event.ctrlKey || event.metaKey) {
    const box = surface.value.getBoundingClientRect()
    setZoom(camera.scale * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .007), event.clientX - box.left, event.clientY - box.top)
  } else {
    autoFit = false
    centeredNode = null
    const multiplier = event.deltaMode === 1 ? 16 : 1
    camera.x -= event.deltaX * multiplier
    camera.y -= event.deltaY * multiplier
  }
}

function startGesture(event) {
  if (event.button !== 0 && event.button !== 1) return
  if (event.target.closest('button, input')) return
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touches.size > 1) {
      surface.value.setPointerCapture(event.pointerId)
      pinching = true
      cancelGesture()
      return
    }
  }
  if (!hand.value && !space.value && event.target.closest('.map-node')) return
  const { left, top } = surface.value.getBoundingClientRect()
  const x = event.clientX - left
  const y = event.clientY - top
  surface.value.focus({ preventScroll: true })
  surface.value.setPointerCapture(event.pointerId)
  gesture.value = { id: event.pointerId, x, y, tx: camera.x, ty: camera.y, left, top,
    type: event.shiftKey && !hand.value ? 'lasso' : 'pan', moved: false }
}
function moveGesture(event) {
  if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
    const before = touchGeometry()
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const after = touchGeometry()
    if (before && after && before.distance > 0) {
      const box = surface.value.getBoundingClientRect()
      setZoom(camera.scale * after.distance / before.distance, before.x - box.left, before.y - box.top)
      camera.x += after.x - before.x
      camera.y += after.y - before.y
      return
    }
  }
  const active = gesture.value
  if (!active || event.pointerId !== active.id) return
  const x = event.clientX - active.left
  const y = event.clientY - active.top
  const dx = x - active.x
  const dy = y - active.y
  if (!active.moved && Math.hypot(dx, dy) < 4) return
  active.moved = true
  if (active.type === 'pan') {
    autoFit = false
    centeredNode = null
    camera.x = active.tx + dx
    camera.y = active.ty + dy
  } else {
    lasso.value = { x: Math.min(x, active.x), y: Math.min(y, active.y), width: Math.abs(dx), height: Math.abs(dy) }
  }
}
function endGesture(event) {
  touches.delete(event.pointerId)
  if (pinching) {
    if (!touches.size) pinching = false
    return
  }
  const active = gesture.value
  if (!active || event.pointerId !== active.id) return
  if (event.type === 'pointercancel') { cancelGesture(); return }
  if (lasso.value) {
    const rect = lasso.value
    const ids = props.layout.entries.filter((entry) => {
      if (entry.kind !== 'case') return false
      const x = (entry.x + entry.width / 2) * camera.scale + camera.x
      const y = (entry.y + entry.height / 2) * camera.scale + camera.y
      return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
    }).map((entry) => entry.node.id)
    emit('select-many', ids)
  } else if (!active.moved && !hand.value && !space.value) emit('clear')
  suppressClick = active.moved || hand.value || space.value
  if (suppressClick) window.setTimeout(() => { suppressClick = false }, 0)
  cancelGesture()
}
function cancelGesture() { gesture.value = null; lasso.value = null }
function touchGeometry() {
  if (touches.size < 2) return null
  const [first, second] = touches.values()
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y) }
}
function nodePointerDown(event) {
  if (event.pointerType === 'touch') return
  if (hand.value || space.value) return
  event.stopPropagation()
}
function clickNode(id, event) {
  if (!hand.value && !space.value && !suppressClick) emit('select', id, event)
}
function editNode(id) {
  if (!hand.value && !space.value) emit('edit', id)
}
function onSpace(event) {
  if (event.code === 'Space' && event.target === surface.value) { event.preventDefault(); space.value = true }
}
function releaseSpace(event) { if (event.code === 'Space') space.value = false }

function dragStart(entry, event) {
  if (event.target.closest('input') || props.filtering) { event.preventDefault(); return }
  dragId = entry.node.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', entry.node.title)
}
function dragOver(entry, event) {
  if (!dragId || dragId === entry.node.id || entry.kind === 'case') return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTarget.value = entry.node.id
}
function dragLeave(entry, event) {
  if (entry.node.id === dropTarget.value && !event.currentTarget.contains(event.relatedTarget)) dropTarget.value = null
}
function dropOn(entry) {
  if (dragId && entry.node.id === dropTarget.value) emit('move', dragId, entry.node.id)
  stopDrag()
}
function stopDrag() { dragId = null; dropTarget.value = null }

function drawEdges() {
  const canvas = lines.value
  if (!canvas || !viewport.width || !viewport.height) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { width, height } = viewport
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.scale, camera.scale)
  ctx.lineWidth = 1.7
  ctx.lineCap = 'round'
  for (const { from, to } of props.layout.edges) {
    const x = from.x + from.width
    const y = from.y + from.height / 2
    const ty = to.y + to.height / 2
    const middle = x + (to.x - x) * .53
    ctx.strokeStyle = strokes[colorOf(to)] || strokes.iris
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(middle, y, middle, ty, to.x, ty)
    ctx.stroke()
  }
}

function miniGeometry() {
  const scale = Math.min(144 / props.layout.width, 68 / props.layout.height)
  return { scale, x: (168 - props.layout.width * scale) / 2, y: (86 - props.layout.height * scale) / 2 }
}
function drawMini() {
  const canvas = minimap.value
  if (!canvas || !minimapOpen.value) return
  const ctx = canvas.getContext('2d')
  const { x, y, scale } = miniGeometry()
  ctx.clearRect(0, 0, 168, 86)
  ctx.fillStyle = '#f5f3f9'
  ctx.fillRect(0, 0, 168, 86)
  for (const entry of props.layout.entries) {
    ctx.fillStyle = entry.kind === 'root' ? '#685c88' : strokes[colorOf(entry)] || strokes.iris
    ctx.fillRect(x + entry.x * scale, y + entry.y * scale, Math.max(1, entry.width * scale), Math.max(1, entry.height * scale))
  }
  ctx.strokeStyle = '#8171b2'
  ctx.lineWidth = 1
  const left = Math.max(1, x - camera.x / camera.scale * scale)
  const top = Math.max(1, y - camera.y / camera.scale * scale)
  const right = Math.min(167, x + (viewport.width - camera.x) / camera.scale * scale)
  const bottom = Math.min(85, y + (viewport.height - camera.y) / camera.scale * scale)
  if (right > left && bottom > top) ctx.strokeRect(left, top, right - left, bottom - top)
}
function miniTo(event) {
  autoFit = false
  centeredNode = null
  const box = minimap.value.getBoundingClientRect()
  const { x, y, scale } = miniGeometry()
  camera.x = viewport.width / 2 - ((event.clientX - box.left) * 168 / box.width - x) / scale * camera.scale
  camera.y = viewport.height / 2 - ((event.clientY - box.top) * 86 / box.height - y) / scale * camera.scale
}
function startMini(event) {
  miniPointer = event.pointerId
  minimap.value.setPointerCapture(event.pointerId)
  miniTo(event)
}
function moveMini(event) { if (miniPointer === event.pointerId) miniTo(event) }
function queueDraw() {
  if (drawFrame) return
  drawFrame = requestAnimationFrame(() => { drawFrame = 0; drawEdges(); drawMini() })
}
watch([camera, viewport, () => props.layout, minimapOpen], queueDraw, { flush: 'post' })
watch(() => props.layout, () => {
  if (autoFit) fit()
  else if (props.editing) focusNode(props.editing)
  else if (centeredNode && centeredNode === props.currentMatch) focusNode(centeredNode, true)
}, { flush: 'post' })
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (!firstFit) { camera.x += (width - viewport.width) / 2; camera.y += (height - viewport.height) / 2 }
    Object.assign(viewport, { width, height })
    if (width && height && (firstFit || autoFit)) { firstFit = false; fit() }
  })
  observer.observe(surface.value)
  nextTick(queueDraw)
})
onBeforeUnmount(() => { observer?.disconnect(); nodeSizes.disconnect(); cancelAnimationFrame(drawFrame) })
defineExpose({ fit, focusNode, zoom, focus: () => surface.value?.focus({ preventScroll: true }) })
</script>
