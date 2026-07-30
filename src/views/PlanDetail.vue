<template>
  <div v-if="plan && draft" class="page-card detail-card">
    <div class="page-toolbar">
      <el-button text @click="$router.push('/plans')">← 返回</el-button>
      <h3 style="margin: 0">{{ plan.name }}</h3>
      <el-tag type="info" effect="plain">来源:{{ plan.libraryName }}</el-tag>
      <el-tag v-if="dirty" type="warning" effect="dark">未保存</el-tag>
      <span class="spacer" />
      <el-button size="small" type="primary" :disabled="!dirty" @click="onSave">保存</el-button>
      <el-button size="small" @click="onSync">同步到用例库</el-button>
      <el-dropdown @command="onSetAll">
        <el-button size="small">
          批量标记<el-icon style="margin-left: 4px"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="passed">全部标记为通过</el-dropdown-item>
            <el-dropdown-item command="unexecuted">全部重置为未执行</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" type="primary" plain @click="onExport">导出 XMind(含结果)</el-button>
    </div>

    <div class="page-card" style="margin-bottom: 16px; background: #fafcff; box-shadow: none; border: 1px solid #e4e7ed">
      <StatsBar :stats="stats" />
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
        v-model="statusFilter"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="状态"
        clearable
        style="width: 180px"
      >
        <el-option label="未执行" value="unexecuted" />
        <el-option label="通过" value="passed" />
        <el-option label="失败" value="failed" />
        <el-option label="阻塞" value="blocked" />
      </el-select>
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
      <span v-if="filtering" class="filter-match-count">匹配 {{ matchCount }}/{{ stats.total }} 条</span>
      <el-button v-if="filtering" text type="primary" size="small" @click="clearFilter">清除过滤</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="画布操作:滚轮平移,Ctrl/⌘+滚轮缩放,拖拽空白处平移。单击选中用例节点,再次点击切换状态:未执行 → 通过 → 失败 → 阻塞。修改需「保存」后生效,离开前会提醒。"
      style="margin-bottom: 12px"
    />

    <MindCanvas v-if="filteredRoot" @blank-click="selectedId = null">
      <div class="mind-tree">
        <MindTreeNode
          :node="filteredRoot"
          mode="plan"
          :results="draft.results"
          :selected-id="selectedId"
          @add-child="onAddChild"
          @remove="onRemove"
          @rename="onRename"
          @cycle-status="onCycleStatus"
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
  <el-result v-else icon="warning" title="测试计划不存在">
    <template #extra>
      <el-button type="primary" @click="$router.push('/plans')">返回列表</el-button>
    </template>
  </el-result>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import MindTreeNode from '../components/MindTreeNode.vue'
import MindCanvas from '../components/MindCanvas.vue'
import StatsBar from '../components/StatsBar.vue'
import { usePlanStore, STATUS_CYCLE } from '../stores/plan'
import { useLibraryStore } from '../stores/library'
import { cloneTree, computeStats, caseFilter, filterTree, findNode, genId, getLeaves } from '../utils/tree'
import { exportXmind } from '../utils/xmind'

const route = useRoute()
const store = usePlanStore()
const libraryStore = useLibraryStore()

const plan = computed(() => store.getById(route.params.id))

/** 草稿:所有编辑先在草稿上进行,保存后才写入 store */
const draft = ref(null)
const dirty = ref(false)
const selectedId = ref(null)

function loadDraft() {
  if (!plan.value) {
    draft.value = null
    return
  }
  draft.value = {
    root: cloneTree(plan.value.root),
    results: { ...plan.value.results },
  }
  dirty.value = false
  selectedId.value = null
}

// 路由切换或 store 异步加载完成后重建草稿;编辑中(dirty)不被打断
watch(
  [() => route.params.id, plan],
  () => {
    if (!dirty.value) loadDraft()
  },
  { immediate: true }
)

const stats = computed(() =>
  draft.value ? computeStats(draft.value.root, draft.value.results) : null
)

/* ---------- 过滤 ---------- */
const keyword = ref('')
const statusFilter = ref([])
const priorityFilter = ref([])

const filtering = computed(
  () =>
    keyword.value.trim() !== '' ||
    statusFilter.value.length > 0 ||
    priorityFilter.value.length > 0
)

const filteredRoot = computed(() => {
  if (!draft.value) return null
  if (!filtering.value) return draft.value.root
  return filterTree(
    draft.value.root,
    caseFilter(
      { keyword: keyword.value, priorities: priorityFilter.value, statuses: statusFilter.value },
      draft.value.results
    )
  )
})

const matchCount = computed(() => (filteredRoot.value ? getLeaves(filteredRoot.value).length : 0))

function clearFilter() {
  keyword.value = ''
  statusFilter.value = []
  priorityFilter.value = []
}

/* ---------- 选中 case 的优先级 ---------- */
const selectedCase = computed(() => {
  if (!selectedId.value || !draft.value) return null
  const found = findNode(draft.value.root, selectedId.value)
  if (!found) return null
  const isLeaf = !found.node.children || found.node.children.length === 0
  return isLeaf ? found.node : null
})

function onSetPriority(p) {
  const found = findNode(draft.value.root, selectedId.value)
  if (!found) return
  if (p) found.node.priority = p
  else delete found.node.priority
  markDirty()
}

function markDirty() {
  dirty.value = true
}

/* ---------- 编辑操作(作用于草稿) ---------- */

function onCycleStatus(node) {
  const current = draft.value.results[node.id] || 'unexecuted'
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
  draft.value.results[node.id] = next
  markDirty()
  const label = { passed: '通过', failed: '失败', blocked: '阻塞', unexecuted: '未执行' }[next]
  ElMessage({ message: `「${node.title}」→ ${label}(未保存)`, type: next === 'failed' ? 'error' : next === 'passed' ? 'success' : 'info', duration: 1200 })
}

function onAddChild(node) {
  const found = findNode(draft.value.root, node.id)
  if (!found) return
  if (!found.node.children) found.node.children = []
  const created = { id: genId(), title: '子主题', children: [] }
  found.node.children.push(created)
  markDirty()
}

function onRename(node, title) {
  const found = findNode(draft.value.root, node.id)
  if (!found) return
  found.node.title = title
  markDirty()
}

function onRemove(node) {
  const leafCount = getLeaves(node).length
  ElMessageBox.confirm(
    leafCount > 0 ? `该节点包含 ${leafCount} 条用例及其执行结果,确定删除?` : '确定删除该节点?',
    '删除确认',
    { type: 'warning' }
  ).then(() => {
    const found = findNode(draft.value.root, node.id)
    if (!found || !found.parent) return
    const removedIds = []
    const collect = (n) => {
      removedIds.push(n.id)
      ;(n.children || []).forEach(collect)
    }
    collect(found.node)
    removedIds.forEach((rid) => delete draft.value.results[rid])
    found.parent.children = found.parent.children.filter((c) => c.id !== node.id)
    markDirty()
  })
}

function onSetAll(status) {
  for (const leaf of getLeaves(draft.value.root)) {
    draft.value.results[leaf.id] = status
  }
  markDirty()
  ElMessage.success((status === 'passed' ? '已全部标记为通过' : '已全部重置为未执行') + '(未保存)')
}

/* ---------- 保存 / 同步 ---------- */

async function onSave() {
  await store.update(plan.value.id, {
    root: cloneTree(draft.value.root),
    results: { ...draft.value.results },
  })
  dirty.value = false
  ElMessage.success('已保存到数据库')
}

function onSync() {
  const lib = libraryStore.getById(plan.value.libraryId)
  if (!lib) {
    ElMessage.error(`来源用例库「${plan.value.libraryName}」已被删除,无法同步`)
    return
  }
  ElMessageBox.confirm(
    `将把当前计划的用例结构覆盖同步到用例库「${lib.name}」,用例库原有结构将被替换。同时会保存当前计划。是否继续?`,
    '同步确认',
    { type: 'warning', confirmButtonText: '同步并保存', cancelButtonText: '取消' }
  ).then(async () => {
    await libraryStore.replaceRoot(lib.id, cloneTree(draft.value.root))
    await onSave()
    ElMessage.success(`已同步到用例库「${lib.name}」并保存计划`)
  })
}

async function onExport() {
  await exportXmind(draft.value.root, plan.value.name, draft.value.results)
  ElMessage.success('已导出 .xmind 文件(执行结果以标记形式写入)')
}

/* ---------- 离开提醒 ---------- */

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('当前计划有未保存的修改,离开前是否保存?', '未保存提醒', {
      type: 'warning',
      distinguishCancelAndClose: true,
      confirmButtonText: '保存并离开',
      cancelButtonText: '放弃修改并离开',
    })
    await onSave() // confirm:保存并离开
    return true
  } catch (action) {
    // cancel:放弃修改并离开;close(X/ESC):留在本页
    return action === 'cancel'
  }
})

function onBeforeUnload(e) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>
