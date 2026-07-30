<template>
  <div class="mind-node-row">
    <!-- 节点本体 -->
    <div
      class="mind-node-box"
      :class="{
        'is-root': depth === 0,
        'is-case': isCase && mode === 'plan',
        'is-selected': selectedId === node.id,
        'has-image': !!node.image,
        [`status-${status}`]: isCase && mode === 'plan' && status !== 'unexecuted',
      }"
      @click="onBoxClick"
    >
      <div class="mind-node-main">
        <!-- 叶子 case 状态徽章(计划模式) -->
        <el-tooltip
          v-if="isCase && mode === 'plan'"
          :content="`状态:${STATUS[status].label}(点击切换)`"
          placement="top"
        >
          <span class="case-status" :class="status">{{ STATUS[status].icon }}</span>
        </el-tooltip>

        <!-- 优先级徽章 -->
        <span v-if="node.priority" class="case-priority" :class="node.priority.toLowerCase()">
          {{ node.priority }}
        </span>

        <span v-if="!editing" class="mind-node-title" @dblclick.stop="startEdit">{{ node.title }}</span>
        <el-input
          v-else
          ref="inputRef"
          v-model="editTitle"
          size="small"
          class="mind-node-title-input"
          @keyup.enter="commitEdit"
          @keyup.esc="editing = false"
          @blur="commitEdit"
          @click.stop
        />

        <!-- 父节点执行进度(计划模式) -->
        <span v-if="!isCase && mode === 'plan' && progress.total > 0" class="node-progress">
          {{ progress.passed }}/{{ progress.total }}
        </span>

        <!-- 操作按钮 -->
        <span class="node-ops">
          <el-tooltip content="添加子节点" placement="top">
            <span class="op-btn" @click.stop="emit('add-child', node)">＋</span>
          </el-tooltip>
          <el-tooltip v-if="depth > 0" content="删除节点" placement="top">
            <span class="op-btn" @click.stop="emit('remove', node)">✕</span>
          </el-tooltip>
        </span>
      </div>

      <!-- 节点图片 -->
      <img
        v-if="node.image"
        :src="node.image.src"
        :style="imageStyle"
        class="mind-node-img"
        alt=""
        @click.stop
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
          @add-child="(n) => emit('add-child', n)"
          @remove="(n) => emit('remove', n)"
          @rename="(n, t) => emit('rename', n, t)"
          @cycle-status="(n) => emit('cycle-status', n)"
          @select="(n) => emit('select', n)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { STATUS } from '../stores/plan'
import { computeNodeStats } from '../utils/tree'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  mode: { type: String, default: 'library' }, // 'library' | 'plan'
  results: { type: Object, default: () => ({}) },
  selectedId: { type: String, default: null },
})

const emit = defineEmits(['add-child', 'remove', 'rename', 'cycle-status', 'select'])

const isCase = computed(() => !props.node.children || props.node.children.length === 0)
const status = computed(() => props.results[props.node.id] || 'unexecuted')
const progress = computed(() => computeNodeStats(props.node, props.results))

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
  editTitle.value = props.node.title
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function commitEdit() {
  if (!editing.value) return
  editing.value = false
  const t = editTitle.value.trim()
  if (t && t !== props.node.title) emit('rename', props.node, t)
}

function onBoxClick() {
  if (editing.value) return
  // 计划模式下的用例节点:只有已选中时再次点击才切换状态
  if (props.mode === 'plan' && isCase.value && props.selectedId === props.node.id) {
    emit('cycle-status', props.node)
    return
  }
  emit('select', props.node)
}
</script>
