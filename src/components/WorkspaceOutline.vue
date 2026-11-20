<template>
  <div ref="outline" class="outline" data-node-surface tabindex="-1" @click.self="emit('clear')">
    <div class="outline-head" :class="{ 'has-results': plan }" aria-hidden="true">
      <span>用例名称</span><span>优先级</span><span v-if="plan">执行状态</span>
    </div>
    <div v-for="row in rows" :key="row.node.id" :data-row-id="row.node.id" class="outline-row"
      :class="{ 'has-results': plan, 'is-selected': selected.has(row.node.id), 'is-active': activeId === row.node.id }"
      :style="{ '--indent': `${Math.min(row.depth, 15) * 18}px` }"
      @click="select(row.node, $event)" @dblclick="emit('edit', row.node)">
      <div class="outline-name">
        <button v-if="!row.isCase && !filtering" class="icon-btn row-chevron" type="button" :aria-expanded="!collapsed.has(row.node.id)"
          :aria-label="`${collapsed.has(row.node.id) ? '展开' : '折叠'}${row.node.title}`" @click.stop="emit('toggle', row.node.id)" @dblclick.stop>
          <el-icon :class="{ rotated: !collapsed.has(row.node.id) }"><ArrowRight /></el-icon>
        </button>
        <input v-else-if="plan && row.isCase" class="row-checkbox" type="checkbox" :aria-label="`选择${row.node.title}`"
          :checked="selected.has(row.node.id)" @change="emit('toggle-selection', row.node)" @click.stop @dblclick.stop />
        <span v-else class="row-depth-spacer" />
        <span v-if="row.node.icon && ICON_BY_KEY[row.node.icon]" class="outline-kind">{{ ICON_BY_KEY[row.node.icon].emoji }}</span>
        <el-icon v-else class="outline-kind" :class="{ folder: !row.isCase }"><component :is="row.isCase ? Document : FolderOpened" /></el-icon>
        <span v-if="row.node.color" class="node-color-dot" :style="{ background: row.node.color }" />
        <input v-if="editingId === row.node.id" :ref="focusInput" class="outline-editor" aria-label="编辑节点标题"
          v-model="titleDraft" @click.stop @dblclick.stop @keydown.enter.prevent.stop="finish(row.node)"
          @keydown.esc.prevent.stop="emit('edit-done')" @blur="finish(row.node)" />
        <button v-else class="outline-title" type="button" :title="row.node.title" :aria-pressed="selected.has(row.node.id)" @mousedown.prevent>
          {{ row.node.title }}
        </button>
        <el-icon v-if="row.node.image" class="outline-extra" title="有图片"><Picture /></el-icon>
        <el-icon v-if="row.node.note" class="outline-extra" title="有备注"><ChatLineSquare /></el-icon>
      </div>
      <div><span v-if="row.node.priority" class="priority-tag" :class="row.node.priority.toLowerCase()">{{ row.node.priority }}</span><span v-else class="outline-dash">—</span></div>
      <div v-if="plan">
        <StatusPicker v-if="row.isCase" :status="results[row.node.id]" :title="row.node.title" @change="emit('status', row.node, $event)" />
        <span v-else class="outline-dash">—</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ArrowRight, ChatLineSquare, Document, FolderOpened, Picture } from '@element-plus/icons-vue'
import StatusPicker from './StatusPicker.vue'
import { ICON_BY_KEY } from '../utils/nodeProps'

const props = defineProps({
  rows: { type: Array, required: true },
  selected: { type: Set, required: true },
  collapsed: { type: Set, required: true },
  activeId: String,
  editingId: String,
  plan: Boolean,
  filtering: Boolean,
  results: Object,
})
const emit = defineEmits(['clear', 'select', 'edit', 'rename', 'edit-done', 'toggle', 'toggle-selection', 'status'])
const outline = ref(null)
const titleDraft = ref('')
let editing = null
watch(() => props.editingId, (id) => {
  editing = id
  titleDraft.value = props.rows.find((row) => row.node.id === id)?.node.title ?? ''
}, { immediate: true })
function focusInput(element) {
  if (element && document.activeElement !== element) {
    element.focus()
    element.select()
  }
}
function select(node, event) {
  if (event.detail || !event.target.closest('button, input, select')) outline.value?.focus({ preventScroll: true })
  emit('select', node, event)
}
function finish(node) {
  if (editing !== node.id || props.editingId !== node.id) return
  editing = null
  const title = titleDraft.value.trim()
  if (title && title !== node.title) emit('rename', node, title)
  emit('edit-done')
}
function focusNode(id) {
  const element = id && outline.value?.querySelector(`[data-row-id="${CSS.escape(id)}"]`)
  if (!element) return
  const frame = outline.value.getBoundingClientRect()
  const row = element.getBoundingClientRect()
  if (row.top < frame.top + 38 || row.bottom > frame.bottom) {
    outline.value.scrollTop += row.top - (frame.top + frame.height / 2)
  }
}
defineExpose({ focusNode })
</script>
