<template>
  <div class="mind-node-row">
    <!-- 节点本体 -->
    <div
      class="mind-node-box"
      :data-node-id="node.id"
      :class="{
        'is-root': depth === 0,
        'is-case': isCase && mode === 'plan',
        'is-selected': selectedId === node.id || selectedIds?.has(node.id),
        'has-image': !!node.image,
        [`status-${status}`]: isCase && mode === 'plan' && status !== 'unexecuted',
      }"
      :style="boxStyle"
      @click="onBoxClick"
      @dblclick.stop="startEdit"
    >
      <div class="mind-node-main">
        <!-- 叶子 case 状态徽章(计划模式) -->
        <span v-if="isCase && mode === 'plan'" class="case-status-control" @click.stop @dblclick.stop>
          <el-dropdown trigger="click" :persistent="false" @command="emit('set-status', node, $event)">
            <button
              type="button"
              class="case-status"
              :class="status"
              :aria-label="`${node.title}，当前状态：${STATUS[status].label}，更改状态`"
            >
              {{ STATUS[status].label }} <el-icon aria-hidden="true"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="(option, value) in STATUS" :key="value" :command="value" :disabled="value === status">
                  {{ option.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </span>

        <!-- 节点图标 -->
        <span v-if="node.icon && ICON_BY_KEY[node.icon]" class="node-icon">
          {{ ICON_BY_KEY[node.icon].emoji }}
        </span>

        <!-- 优先级徽章 -->
        <span v-if="node.priority" class="case-priority" :class="node.priority.toLowerCase()">
          {{ node.priority }}
        </span>

        <span v-if="!editing" class="mind-node-title">{{ node.title }}</span>
        <el-input
          v-else
          ref="inputRef"
          v-model="editTitle"
          size="small"
          class="mind-node-title-input"
          @keyup.enter="commitEdit"
          @keyup.esc="cancelEdit"
          @blur="commitEdit"
          @click.stop
          @dblclick.stop
        />

        <!-- 备注标记(悬停查看) -->
        <el-tooltip v-if="node.note" :content="node.note" placement="top" :show-after="200">
          <span class="note-flag">📝</span>
        </el-tooltip>

        <!-- 父节点执行进度(计划模式) -->
        <span v-if="!isCase && mode === 'plan' && progress.total > 0" class="node-progress">
          {{ progress.passed }}/{{ progress.total }}
        </span>

        <!-- 操作按钮 -->
        <span class="node-ops" @dblclick.stop>
          <el-tooltip content="添加子节点" placement="top">
            <span class="op-btn" @click.stop="emit('add-child', node)">＋</span>
          </el-tooltip>
          <el-tooltip v-if="depth > 0" content="删除节点" placement="top">
            <span class="op-btn" @click.stop="emit('remove', node)">✕</span>
          </el-tooltip>
        </span>
      </div>

      <!-- 节点图片(点击放大) -->
      <el-image
        v-if="node.image"
        :src="node.image.src"
        :style="imageStyle"
        class="mind-node-img"
        fit="contain"
        :preview-src-list="[node.image.src]"
        preview-teleported
        hide-on-click-modal
        @click.stop
        @dblclick.stop
      />
    </div>

    <!-- 子节点 -->
    <div v-if="node.children && node.children.length" class="mind-children">
      <div v-for="child in node.children" :key="child.id" class="mind-child-item">
        <MindTreeNode
          :node="child"
          :depth="depth + 1"
          :mode="mode"
          :results="results"
          :selected-id="selectedId"
          :selected-ids="selectedIds"
          :editing-id="editingId"
          @add-child="(n) => emit('add-child', n)"
          @remove="(n) => emit('remove', n)"
          @rename="(n, t) => emit('rename', n, t)"
          @set-status="(n, value) => emit('set-status', n, value)"
          @select="(n, e) => emit('select', n, e)"
          @edit-done="emit('edit-done')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { STATUS } from '../stores/plan'
import { computeNodeStats } from '../utils/tree'
import { ICON_BY_KEY } from '../utils/nodeProps'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  mode: { type: String, default: 'library' }, // 'library' | 'plan'
  results: { type: Object, default: () => ({}) },
  selectedId: { type: String, default: null },
  selectedIds: { type: Set, default: null },
  editingId: { type: String, default: null },
})

const emit = defineEmits(['add-child', 'remove', 'rename', 'set-status', 'select', 'edit-done'])

const isCase = computed(() => !props.node.children || props.node.children.length === 0)
const status = computed(() => props.results[props.node.id] || 'unexecuted')
const progress = computed(() => computeNodeStats(props.node, props.results))

/** 节点底色:计划模式下已执行的用例由状态色接管,其余用自定义颜色 */
const boxStyle = computed(() => {
  if (props.mode === 'plan' && isCase.value && status.value !== 'unexecuted') return null
  return props.node.color ? { background: props.node.color, borderColor: props.node.color } : null
})

/** 图片按原始宽高比缩放到最大 240px 宽 */
const imageStyle = computed(() => {
  const img = props.node.image
  if (!img) return {}
  if (img.width && img.height) {
    const maxW = 240
    if (img.width > maxW) {
      return { width: `${maxW}px`, height: `${Math.round((img.height * maxW) / img.width)}px` }
    }
    return { width: `${img.width}px`, height: `${img.height}px` }
  }
  return {}
})

const editing = ref(false)
const editTitle = ref('')
const inputRef = ref(null)

function startEdit() {
  if (editing.value) return
  editTitle.value = props.node.title
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

// 外部(快捷键)请求进入编辑
watch(
  () => props.editingId,
  (id) => {
    if (id && id === props.node.id && !editing.value) startEdit()
  }
)

function commitEdit() {
  if (!editing.value) return
  editing.value = false
  const t = editTitle.value.trim()
  if (t && t !== props.node.title) emit('rename', props.node, t)
  emit('edit-done')
}

function cancelEdit() {
  if (!editing.value) return
  editing.value = false
  emit('edit-done')
}

function onBoxClick(event) {
  if (editing.value) return
  emit('select', props.node, event)
}
</script>
