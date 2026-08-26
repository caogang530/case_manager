<template>
  <div class="selected-panel">
    <div class="sp-title" :title="node.title">「{{ node.title }}」</div>

    <div v-if="isLeaf" class="sp-row">
      <span class="sp-label">优先级</span>
      <el-radio-group
        :model-value="node.priority || ''"
        size="small"
        @update:model-value="(v) => emit('update', 'priority', v || null)"
      >
        <el-radio-button value="P0">P0</el-radio-button>
        <el-radio-button value="P1">P1</el-radio-button>
        <el-radio-button value="P2">P2</el-radio-button>
        <el-radio-button value="">无</el-radio-button>
      </el-radio-group>
    </div>

    <div class="sp-row">
      <span class="sp-label">图标</span>
      <div class="icon-picker">
        <span
          v-for="ic in NODE_ICONS"
          :key="ic.key"
          class="icon-opt"
          :class="{ active: node.icon === ic.key }"
          @click="emit('update', 'icon', node.icon === ic.key ? null : ic.key)"
        >
          {{ ic.emoji }}
        </span>
      </div>
    </div>

    <div class="sp-row">
      <span class="sp-label">颜色</span>
      <div class="color-picker">
        <span
          v-for="c in NODE_COLORS"
          :key="c"
          class="color-opt"
          :class="{ active: node.color === c }"
          :style="{ background: c }"
          @click="emit('update', 'color', node.color === c ? null : c)"
        />
        <span
          class="color-opt color-none"
          :class="{ active: !node.color }"
          title="默认(无颜色)"
          @click="emit('update', 'color', null)"
        >
          ✕
        </span>
      </div>
    </div>

    <div v-if="node.image" class="sp-row">
      <span class="sp-label">图片</span>
      <img :src="node.image.src" class="sp-thumb" alt="" />
      <el-button size="small" type="danger" text @click="emit('update', 'image', null)">
        删除图片
      </el-button>
    </div>

    <div class="sp-row sp-note">
      <span class="sp-label">备注</span>
      <el-input
        type="textarea"
        :rows="2"
        v-model="noteDraft"
        placeholder="添加备注...(失焦保存)"
        @blur="commitNote"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NODE_ICONS, NODE_COLORS } from '../utils/nodeProps'

const props = defineProps({
  node: { type: Object, required: true },
  isLeaf: { type: Boolean, default: false },
})

const emit = defineEmits(['update']) // (key, value),value 为 null 表示清除

const noteDraft = ref('')

watch(
  () => props.node.note,
  (note) => {
    noteDraft.value = note || ''
  },
  { immediate: true }
)

function commitNote() {
  const value = noteDraft.value.trim() || null
  if (value !== (props.node.note || null)) emit('update', 'note', value)
}
</script>
