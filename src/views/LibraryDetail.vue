<template>
  <div v-if="library" class="page-card detail-card">
    <div class="page-toolbar">
      <el-button text @click="$router.push('/libraries')">← 返回</el-button>
      <h3 style="margin: 0">{{ library.name }}</h3>
      <el-tag type="info" effect="plain">共 {{ caseCount }} 条用例</el-tag>
      <span class="spacer" />
      <el-button size="small" @click="onAddRootChild">添加模块</el-button>
      <el-button size="small" type="primary" @click="onExport">导出 XMind</el-button>
    </div>

    <!-- 过滤条 -->
    <div class="filter-bar">
      <span class="filter-label">过滤:</span>
      <el-input
        v-model="keyword"
        placeholder="关键词(命中用例或父级标题)"
        clearable
        style="width: 220px"
      />
      <el-select
        v-model="priorityFilter"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="优先级"
        clearable
        style="width: 170px"
      >
        <el-option v-for="p in ['P0', 'P1', 'P2']" :key="p" :label="p" :value="p" />
      </el-select>
      <span v-if="filtering" class="filter-match-count">匹配 {{ matchCount }}/{{ caseCount }} 条</span>
      <el-button v-if="filtering" text type="primary" size="small" @click="clearFilter">清除过滤</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="画布操作:滚轮平移,Ctrl/⌘+滚轮缩放,拖拽空白处平移。双击节点编辑标题;单击选中叶子用例后,在右下角悬浮面板设置优先级。"
      style="margin-bottom: 12px"
    />
    <MindCanvas v-if="filteredRoot" @blank-click="selectedId = null">
      <div class="mind-tree">
        <MindTreeNode
          :node="filteredRoot"
          mode="library"
          :selected-id="selectedId"
          @add-child="onAddChild"
          @remove="onRemove"
          @rename="onRename"
          @select="(n) => (selectedId = n.id)"
        />
      </div>
      <template #overlay>
        <div v-if="selectedCase" class="selected-panel">
          <div class="sp-title">「{{ selectedCase.title }}」优先级</div>
          <el-radio-group
            :model-value="selectedCase.priority || ''"
            size="small"
            @update:model-value="onSetPriority"
          >
            <el-radio-button value="P0">P0</el-radio-button>
            <el-radio-button value="P1">P1</el-radio-button>
            <el-radio-button value="P2">P2</el-radio-button>
            <el-radio-button value="">无</el-radio-button>
          </el-radio-group>
        </div>
      </template>
    </MindCanvas>
    <el-empty v-else description="没有匹配的用例,请调整过滤条件" />
  </div>
  <el-result v-else icon="warning" title="用例库不存在">
    <template #extra>
      <el-button type="primary" @click="$router.push('/libraries')">返回列表</el-button>
    </template>
  </el-result>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MindTreeNode from '../components/MindTreeNode.vue'
import MindCanvas from '../components/MindCanvas.vue'
import { useLibraryStore } from '../stores/library'
import { caseFilter, filterTree, findNode, getLeaves } from '../utils/tree'
import { exportXmind } from '../utils/xmind'

const route = useRoute()
const store = useLibraryStore()
const library = computed(() => store.getById(route.params.id))

/* ---------- 过滤 ---------- */
const keyword = ref('')
const priorityFilter = ref([])

const filtering = computed(() => keyword.value.trim() !== '' || priorityFilter.value.length > 0)

const filteredRoot = computed(() => {
  if (!library.value) return null
  if (!filtering.value) return library.value.root
  return filterTree(library.value.root, caseFilter({
    keyword: keyword.value,
    priorities: priorityFilter.value,
  }))
})

const matchCount = computed(() => (filteredRoot.value ? getLeaves(filteredRoot.value).length : 0))

function clearFilter() {
  keyword.value = ''
  priorityFilter.value = []
}

/* ---------- 选中 + 优先级 ---------- */
const selectedId = ref(null)

const selectedCase = computed(() => {
  if (!selectedId.value || !library.value) return null
  const found = findNode(library.value.root, selectedId.value)
  if (!found) return null
  const isLeaf = !found.node.children || found.node.children.length === 0
  return isLeaf ? found.node : null
})

async function onSetPriority(p) {
  await store.setPriority(library.value.id, selectedId.value, p || null)
}

/* ---------- 编辑 ---------- */
const caseCount = computed(() => (library.value ? getLeaves(library.value.root).length : 0))

async function onAddChild(node) {
  const created = await store.addChild(library.value.id, node.id)
  if (created) ElMessage.success('已添加子节点,双击编辑')
}

async function onAddRootChild() {
  const created = await store.addChild(library.value.id, library.value.root.id, '新模块')
  if (created) ElMessage.success('已添加模块')
}

function onRemove(node) {
  const leafCount = getLeaves(node).length
  ElMessageBox.confirm(
    leafCount > 0 ? `该节点包含 ${leafCount} 条用例,确定删除?` : '确定删除该节点?',
    '删除确认',
    { type: 'warning' }
  ).then(() => store.removeNode(library.value.id, node.id))
}

async function onRename(node, title) {
  await store.renameNode(library.value.id, node.id, title)
}

async function onExport() {
  await exportXmind(library.value.root, library.value.name)
  ElMessage.success('已导出 .xmind 文件')
}
</script>
