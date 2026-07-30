<template>
  <div
    ref="viewportRef"
    class="mind-viewport"
    :class="{ panning: isPanning }"
    @wheel.prevent="onWheel"
    @mousedown="onMouseDown"
  >
    <div class="mind-canvas" :style="canvasStyle">
      <slot />
    </div>
    <!-- 悬浮层(不随画布缩放/平移) -->
    <slot name="overlay" />
    <div class="canvas-controls">
      <button class="ctrl-btn" title="缩小" @click="zoomBy(-0.15)">−</button>
      <span class="ctrl-scale" title="点击重置为 100%" @click="resetZoom">
        {{ Math.round(scale * 100) }}%
      </span>
      <button class="ctrl-btn" title="放大" @click="zoomBy(0.15)">＋</button>
      <button class="ctrl-btn ctrl-fit" title="缩放以适应全部内容" @click="fit">适应</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const emit = defineEmits(['blank-click'])

const viewportRef = ref(null)
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

function onMouseDown(e) {
  if (e.button !== 0) return
  // 从节点/面板/控件上按下时不触发平移
  if (
    e.target.closest('.mind-node-box') ||
    e.target.closest('.selected-panel') ||
    e.target.closest('.canvas-controls')
  ) {
    return
  }
  isPanning.value = true
  moved = 0
  lastX = e.clientX
  lastY = e.clientY
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!isPanning.value) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  moved += Math.abs(dx) + Math.abs(dy)
  x.value += dx
  y.value += dy
  lastX = e.clientX
  lastY = e.clientY
}

function onMouseUp() {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  // 几乎没移动视为点击空白 → 取消选中
  if (isPanning.value && moved < 4) emit('blank-click')
  isPanning.value = false
}

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
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.95)
  )
  scale.value = s
  x.value = (vp.clientWidth - w * s) / 2
  y.value = (vp.clientHeight - h * s) / 2
}

defineExpose({ fit, resetZoom })
</script>
