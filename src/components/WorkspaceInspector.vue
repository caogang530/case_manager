<template>
  <aside class="inspector" aria-label="节点属性">
    <header class="inspector-header">
      <span><el-icon><Tickets /></el-icon>节点属性</span>
      <button class="icon-btn" type="button" aria-label="关闭属性栏" @click="emit('close')"><el-icon><Close /></el-icon></button>
    </header>
    <div v-if="node" class="inspector-body">
      <span class="inspector-kind">{{ isLeaf ? '测试用例' : '模块' }}</span>
      <h2>{{ node.title }}</h2>
      <p v-if="path" class="inspector-path" :title="path">{{ path }}</p>
      <section v-if="plan && isLeaf" class="property-group">
        <h3>执行状态</h3>
        <StatusPicker :status="status" :title="node.title" @change="emit('status', $event)" />
      </section>
      <section v-if="isLeaf" class="property-group">
        <h3>优先级</h3>
        <div class="priority-options">
          <button v-for="p in ['P0', 'P1', 'P2']" :key="p" type="button" :aria-pressed="node.priority === p"
            class="priority-tag" :class="p.toLowerCase()" @click="emit('update', 'priority', node.priority === p ? null : p)">{{ p }}</button>
          <button type="button" class="priority-tag none" :aria-pressed="!node.priority" @click="emit('update', 'priority', null)">无</button>
        </div>
      </section>
      <section class="property-group">
        <h3>备注</h3>
        <textarea v-model="noteDraft" :key="node.id" rows="3" aria-label="节点备注" placeholder="添加备注…" @blur="commitNote" />
      </section>
      <section class="property-group">
        <h3>图标</h3>
        <div class="choices">
          <button v-for="option in NODE_ICONS" :key="option.key" type="button" :aria-label="option.label || option.key"
            :aria-pressed="node.icon === option.key" @click="emit('update', 'icon', node.icon === option.key ? null : option.key)">{{ option.emoji }}</button>
        </div>
      </section>
      <section class="property-group">
        <h3>颜色</h3>
        <div class="choices">
          <button v-for="(color, index) in NODE_COLORS" :key="color" type="button" :aria-label="`运用颜色 ${index + 1}`"
            :aria-pressed="node.color === color" :style="{ background: color }" @click="emit('update', 'color', node.color === color ? null : color)" />
          <button type="button" aria-label="清除颜色" :aria-pressed="!node.color" @click="emit('update', 'color', null)">×</button>
        </div>
      </section>
      <section class="property-group">
        <h3>图片</h3>
        <el-image v-if="node.image" :src="node.image.src" :preview-src-list="[node.image.src]" preview-teleported fit="contain" class="inspector-image" />
        <div class="attachment-actions">
          <el-button size="small" :icon="Picture" @click="fileInput?.click()">{{ node.image ? '替换图片' : '添加图片' }}</el-button>
          <el-button v-if="node.image" size="small" text type="danger" @click="emit('update', 'image', null)">移除</el-button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="pickFile" />
        </div>
      </section>
    </div>
    <div v-else class="inspector-empty">
      <span class="empty-icon"><el-icon><Tickets /></el-icon></span>
      <strong>{{ count > 1 ? `已选 ${count} 个节点` : '选择一个节点' }}</strong>
      <p>{{ count > 1 ? '可从工具栏批量标记用例。' : '选择节点后，可在这里编辑优先级、备注和图片。' }}</p>
    </div>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Close, Picture, Tickets } from '@element-plus/icons-vue'
import StatusPicker from './StatusPicker.vue'
import { NODE_ICONS, NODE_COLORS } from '../utils/nodeProps'

const props = defineProps({ node: Object, isLeaf: Boolean, path: String, plan: Boolean, status: String, count: Number })
const emit = defineEmits(['update', 'status', 'image', 'close'])
const noteDraft = ref('')
const fileInput = ref(null)
watch([() => props.node?.id, () => props.node?.note], () => {
  noteDraft.value = props.node?.note || ''
}, { immediate: true })
function commitNote() {
  const note = noteDraft.value.trim() || null
  if (props.node && note !== (props.node.note || null)) emit('update', 'note', note)
}
function pickFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file && props.node) emit('image', props.node, file)
}
</script>
