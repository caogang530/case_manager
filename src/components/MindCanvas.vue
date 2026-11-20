<template>
  <div
    ref="viewportRef"
    class="mind-viewport"
    data-node-surface
    tabindex="-1"
    :class="{ panning: isPanning }"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
  >
    <div ref="canvasRef" class="mind-canvas" :style="canvasStyle">
      <slot />
    </div>
    <div class="canvas-controls">
      <button class="ctrl-btn" type="button" aria-label="缩小" @click="zoomBy(-0.15)">−</button>
      <button class="ctrl-scale" type="button" aria-label="重置缩放" @click="resetZoom">
        {{ Math.round(scale * 100) }}%
      </button>
      <button class="ctrl-btn" type="button" aria-label="放大" @click="zoomBy(0.15)">＋</button>
      <button class="ctrl-btn ctrl-fit" type="button" title="缩放以适应全部内容" @click="fit">适应</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['blank-click'])

const viewportRef = ref(null)
const canvasRef = ref(null)
const scale = ref(1)
const x = ref(0)
const y = ref(0)
const isPanning = ref(false)

const MIN_SCALE = 0.1
const MAX_SCALE = 2.5

const canvasStyle = computed(() => ({
  transform: `translate(${x.value}px, ${y.value}px) scale(${scale.value})`,
}))

/** 以 (cx, cy) 为锚点缩放到 next */
function zoomAt(next, cx, cy) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
  const ratio = s / scale.value
  x.value = cx - (cx - x.value) * ratio
  y.value = cy - (cy - y.value) * ratio
  scale.value = s
}

function zoomBy(delta) {
  const vp = viewportRef.value
  zoomAt(scale.value + delta, vp.clientWidth / 2, vp.clientHeight / 2)
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    // Ctrl/⌘ + 滚轮:以鼠标位置为锚点缩放
    const rect = viewportRef.value.getBoundingClientRect()
    zoomAt(
      scale.value * (e.deltaY < 0 ? 1.1 : 0.9),
      e.clientX - rect.left,
      e.clientY - rect.top
    )
  } else {
    // 普通滚轮:平移
    x.value -= e.deltaX
    y.value -= e.deltaY
  }
}

/* ---------- 空白处拖拽平移 ---------- */
let moved = 0
let lastX = 0
let lastY = 0
let activePointer = null

function onPointerDown(e) {
  if (e.button !== 0 || activePointer !== null) return
  if (!e.target.closest('button, input, select')) viewportRef.value?.focus({ preventScroll: true })
  // 从节点/面板/控件上按下时不触发平移
  if (
    e.target.closest('.mind-node-box') ||
    e.target.closest('.canvas-controls')
  ) {
    return
  }
  isPanning.value = true
  activePointer = e.pointerId
  moved = 0
  lastX = e.clientX
  lastY = e.clientY
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e) {
  if (activePointer !== e.pointerId) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  moved += Math.abs(dx) + Math.abs(dy)
  x.value += dx
  y.value += dy
  lastX = e.clientX
  lastY = e.clientY
}

function onPointerUp(event) {
  if (activePointer !== event.pointerId) return
  if (event.type === 'pointerup' && moved < 4) emit('blank-click')
  stopTrackingPan()
}

function stopTrackingPan() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  activePointer = null
  isPanning.value = false
}

onBeforeUnmount(stopTrackingPan)

function resetZoom() {
  scale.value = 1
  x.value = 0
  y.value = 0
}

/** 缩放并居中,使整棵树可见 */
function fit() {
  const vp = viewportRef.value
  const content = vp?.querySelector('.mind-tree')
  if (!vp || !content) return resetZoom()
  const w = content.scrollWidth
  const h = content.scrollHeight
  if (!w || !h) return
  const s = Math.min(
    1.15,
    Math.max(MIN_SCALE, Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.95)
  )
  scale.value = s
  x.value = (vp.clientWidth - w * s) / 2
  y.value = (vp.clientHeight - h * s) / 2
}

/** 在 100% 缩放下定位单个节点，避免大量匹配结果把文字缩得过小。 */
function focusNode(id) {
  const viewport = viewportRef.value
  const canvas = canvasRef.value
  const node = id && canvas?.querySelector(`[data-node-id="${CSS.escape(id)}"]`)
  if (!viewport || !node) return
  const nodeRect = node.getBoundingClientRect()
  const canvasRect = canvas.getBoundingClientRect()
  const nodeX = (nodeRect.left - canvasRect.left + nodeRect.width / 2) / scale.value
  const nodeY = (nodeRect.top - canvasRect.top + nodeRect.height / 2) / scale.value
  x.value = viewport.clientWidth / 2 - nodeX
  y.value = viewport.clientHeight / 2 - nodeY
  scale.value = 1
}

defineExpose({ fit, resetZoom, focusNode })
onMounted(() => fit())
</script>
