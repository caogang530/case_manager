<template>
  <aside class="inspector" aria-label="节点属性">
    <header class="inspector-head"><div><span aria-hidden="true">▤</span> 节点属性</div>
      <div class="inspector-actions"><button v-if="canRemove" type="button" class="quiet-button danger-text" @click="$emit('remove')">删除节点</button>
        <button type="button" class="icon-button" aria-label="关闭属性栏" @click="$emit('close')">×</button></div>
    </header>
    <div v-if="node" class="inspector-body" :key="node.id">
      <div class="node-meta"><span :class="['type-chip', node.kind]">{{ node.kind === 'module' ? '模块' : '测试用例' }}</span><span v-if="address" class="node-address">{{ address }}</span></div>
      <h2>{{ node.title }}</h2>
      <div v-if="path" class="node-path" :title="path">{{ path }}</div>
      <section v-if="node.kind === 'case' && plan" class="property">
        <label for="case-status">执行状态</label>
        <div class="property-status" :class="status"><span>{{ statuses[status].symbol }}</span><select id="case-status" :value="status" @change="$emit('status', $event.target.value)">
          <option v-for="(item, key) in statuses" :key="key" :value="key">{{ item.label }}</option>
        </select></div>
      </section>
      <section v-if="node.kind === 'case'" class="property">
        <h3>优先级</h3>
        <div class="priority-control"><button v-for="key in ['P0', 'P1', 'P2', '']" :key="key" type="button" :aria-pressed="node.priority === key" @click="$emit('update', 'priority', key)">{{ key || '无' }}</button></div>
      </section>
      <section v-else class="property">
        <h3>分支颜色</h3>
        <div class="swatches"><button v-for="(color, i) in palette" :key="color" type="button" :class="color" :aria-label="`颜色 ${i + 1}`" :aria-pressed="node.color === color" @click="$emit('update', 'color', node.color === color ? null : color)"></button></div>
      </section>
      <section class="property" aria-labelledby="node-icons-title">
        <div class="node-icon-heading">
          <h3 id="node-icons-title">节点图标</h3>
          <button v-if="selectedIcons.length" class="quiet-button" type="button" @click="$emit('update', 'icons', [])">清除图标</button>
        </div>
        <div class="node-icon-groups">
          <div v-for="group in nodeIconGroups" :key="group.label" class="node-icon-group" role="group" :aria-label="group.label">
            <span>{{ group.label }}</span>
            <button v-for="icon in group.icons" :key="icon.id" class="node-icon-option node-icon-glyph" type="button"
              :style="{ color: icon.color }" :title="icon.label" :aria-label="icon.label" :aria-pressed="selectedIcons.some(({ id }) => id === icon.id)"
              @click="toggleIcon(group, icon)">{{ icon.glyph }}</button>
          </div>
        </div>
      </section>
      <section v-if="node.kind === 'case'" class="property text-fields">
        <label for="steps">测试步骤</label><textarea id="steps" v-model="draft.steps" rows="3" placeholder="填写操作步骤" @blur="save('steps')"></textarea>
        <label for="expected">预期结果</label><textarea id="expected" v-model="draft.expected" rows="2" placeholder="填写预期结果" @blur="save('expected')"></textarea>
      </section>
      <section class="property text-fields"><label for="note">备注</label><textarea id="note" v-model="draft.note" rows="2" placeholder="添加备注" @blur="save('note')"></textarea></section>
      <section class="property">
        <h3>附件</h3><button v-if="node.image" class="attachment" type="button" @click="$emit('preview', node.image)"><img :src="node.image" alt="查看节点附件"></button>
        <div class="attachment-actions"><button type="button" class="quiet-button" @click="upload?.click()">{{ node.image ? '替换图片' : '＋ 添加图片' }}</button><button v-if="node.image" type="button" class="quiet-button danger-text" @click="$emit('update', 'image', null)">移除</button></div>
        <input ref="upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="pickImage">
      </section>
    </div>
    <div v-else class="inspector-empty"><span aria-hidden="true">{{ selectedCount > 1 ? '◫' : '◇' }}</span><h2>{{ selectedCount > 1 ? `已选 ${selectedCount} 个节点` : '选择一个节点' }}</h2>
      <p>{{ selectedCount > 1 ? '使用画布工具栏批量操作。' : '在这里查看和编辑节点属性。' }}</p></div>
  </aside>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { palette, statuses } from './model.js'
import { iconsFor, nodeIconGroups } from './nodeIcons.js'
const props = defineProps({ node: Object, plan: Boolean, status: String, path: String, address: String, selectedCount: Number, canRemove: Boolean })
const emit = defineEmits(['close', 'update', 'status', 'image', 'preview', 'remove'])
const upload = ref(null)
const selectedIcons = computed(() => iconsFor(props.node?.icons))
const draft = reactive({ steps: '', expected: '', note: '' })
watch(() => [props.node?.id, props.node?.steps, props.node?.expected, props.node?.note], () => {
  for (const key of ['steps', 'expected', 'note']) draft[key] = props.node?.[key] || ''
}, { immediate: true })
function save(key) {
  if (props.node && draft[key] !== (props.node[key] || '')) emit('update', key, draft[key])
}
function toggleIcon(group, icon) {
  const remaining = selectedIcons.value.filter(({ id }) => !group.icons.some((item) => item.id === id))
  if (!selectedIcons.value.some(({ id }) => id === icon.id)) remaining.push(icon)
  emit('update', 'icons', remaining.map(({ id }) => id))
}
function pickImage(event) {
  const image = event.target.files?.[0]
  event.target.value = ''
  if (image && props.node) emit('image', props.node.id, image)
}
</script>
