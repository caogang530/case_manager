<template>
  <div v-if="plan && draft" class="page-card detail-card">
    <div class="page-toolbar">
      <el-button text @click="$router.push('/plans')">← 返回</el-button>
      <h3 style="margin: 0">{{ plan.name }}</h3>
      <el-tag type="info" effect="plain">来源:{{ plan.libraryName }}</el-tag>
      <el-tag v-if="dirty" type="warning" effect="dark">未保存</el-tag>
      <span class="spacer" />
      <el-button size="small" type="primary" :disabled="!dirty" @click="onSave">保存</el-button>
      <el-button size="small" :disabled="!libraryStore.loaded" @click="onSync">同步到用例库</el-button>
      <el-dropdown trigger="click" @command="onSetAll">
        <el-button size="small">
          整份计划标记<el-icon style="margin-left: 4px"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="passed">全部标记为通过</el-dropdown-item>
            <el-dropdown-item command="skipped">全部标记为跳过</el-dropdown-item>
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
        <el-option label="跳过" value="skipped" />
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
      <span v-if="filtering" class="filter-match-count" role="status">匹配 {{ visibleCases.length }}/{{ stats.total }} 条</span>
      <el-button v-if="filtering && visibleCases.length" text type="primary" size="small" @click="locateFirstMatch">定位首条</el-button>
      <el-button v-if="statusFilter.length" text type="primary" size="small" title="按修改后的状态重新筛选" @click="reapplyFilters">刷新匹配</el-button>
      <el-button v-if="filtering" text type="primary" size="small" @click="clearFilter">清除过滤</el-button>
    </div>

    <div class="plan-selection-bar">
      <el-button size="small" :disabled="!visibleCases.length" @click="selectVisibleCases">
        {{ filtering ? '全选匹配用例' : '全选用例' }}
      </el-button>
      <el-dropdown trigger="click" :disabled="!selectedCases.length" @command="onSetSelected">
        <el-button size="small" :disabled="!selectedCases.length">
          标记所选<el-icon style="margin-left: 4px"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="(option, value) in STATUS" :key="value" :command="value">
              {{ option.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span v-if="selectedCases.length" role="status">已选 {{ selectedCases.length }} 条</span>
      <el-button v-if="selection.size" text size="small" @click="selectedId = null">清除选择</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="双击或 F2 编辑标题，点击状态标签选择结果。⌘/Ctrl + 点击多选，Shift + 点击选范围。修改后请保存。"
      style="margin-bottom: 12px"
    />

    <MindCanvas v-if="filteredRoot" ref="canvasRef" @blank-click="selectedId = null">
      <div class="mind-tree">
        <MindTreeNode
          :node="filteredRoot"
          mode="plan"
          :results="draft.results"
          :selected-ids="selection"
          :editing-id="editingId"
          @add-child="onAddChild"
          @remove="onRemove"
          @rename="onRename"
          @set-status="(node, status) => setCaseResults([node], status)"
          @select="onSelect"
          @edit-done="editingId = null"
        />
      </div>
      <template #overlay>
        <SelectedNodePanel
          v-if="selectedNode"
          :node="selectedNode"
          :is-leaf="selectedIsLeaf"
          @update="onUpdateProp"
        />
      </template>
    </MindCanvas>
    <el-empty v-else description="没有匹配的用例,请调整过滤条件" />
  </div>
  <div v-else-if="!store.loaded && !store.loadError" class="page-card plan-loading" role="status">
    正在加载测试计划…
  </div>
  <el-result v-else-if="store.loadError" icon="error" title="测试计划加载失败" sub-title="请检查后端服务，然后重试。">
    <template #extra>
      <el-button type="primary" @click="store.load()">重试</el-button>
      <el-button @click="$router.push('/plans')">返回列表</el-button>
    </template>
  </el-result>
  <el-result v-else icon="warning" title="测试计划不存在">
    <template #extra>
      <el-button type="primary" @click="$router.push('/plans')">返回列表</el-button>
    </template>
  </el-result>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import MindTreeNode from '../components/MindTreeNode.vue'
import MindCanvas from '../components/MindCanvas.vue'
import SelectedNodePanel from '../components/SelectedNodePanel.vue'
import { useNodeShortcuts } from '../composables/useNodeShortcuts'
import StatsBar from '../components/StatsBar.vue'
import { usePlanStore, STATUS } from '../stores/plan'
import { useLibraryStore } from '../stores/library'
import { cloneTree, computeStats, caseFilter, filterTree, findNode, genId, getLeaves, walkTree } from '../utils/tree'
import { exportXmind } from '../utils/xmind'
import { fileToImageData } from '../utils/image'

const route = useRoute()
const store = usePlanStore()
const libraryStore = useLibraryStore()

const plan = computed(() => store.getById(route.params.id))

/** 草稿:所有编辑先在草稿上进行,保存后才写入 store */
const draft = ref(null)
const dirty = ref(false)
const selection = ref(new Set())
const selectionAnchor = ref(null)
const selectedId = computed({
  get: () => (selection.value.size === 1 ? selection.value.values().next().value : null),
  set: (id) => {
    selection.value = new Set(id ? [id] : [])
    selectionAnchor.value = id
  },
})
const editingId = ref(null)
const canvasRef = ref(null)
// 筛选结果使用操作前的状态快照,避免操作节点状态后节点立即被筛掉。
const filterResultsSnapshot = ref({})
/** 撤销/重做栈(在 loadDraft 之前声明,避免立即执行的 watch 触发 TDZ) */
const undoStack = ref([])
const redoStack = ref([])

function loadDraft() {
  if (!plan.value) {
    draft.value = null
    return
  }
  draft.value = {
    root: cloneTree(plan.value.root),
    results: { ...plan.value.results },
  }
  filterResultsSnapshot.value = { ...draft.value.results }
  dirty.value = false
  selectedId.value = null
  editingId.value = null
  undoStack.value = []
  redoStack.value = []
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

function refreshFilterSnapshot() {
  filterResultsSnapshot.value = draft.value ? { ...draft.value.results } : {}
}

watch(
  [keyword, statusFilter, priorityFilter],
  refreshFilterSnapshot,
  { deep: true, flush: 'sync' }
)

const filteredRoot = computed(() => {
  if (!draft.value) return null
  if (!filtering.value) return draft.value.root
  return filterTree(
    draft.value.root,
    caseFilter(
      { keyword: keyword.value, priorities: priorityFilter.value, statuses: statusFilter.value },
      filterResultsSnapshot.value
    )
  )
})

const visibleCases = computed(() => (filteredRoot.value ? getLeaves(filteredRoot.value) : []))
const visibleNodeIds = computed(() => {
  const ids = new Set()
  if (filteredRoot.value) walkTree(filteredRoot.value, (node) => ids.add(node.id))
  return ids
})
const selectedCases = computed(() => visibleCases.value.filter((node) => selection.value.has(node.id)))

function locateFirstMatch() {
  canvasRef.value?.focusNode(visibleCases.value[0]?.id)
}

async function reapplyFilters() {
  refreshFilterSnapshot()
  await nextTick()
  locateFirstMatch()
}

watch([keyword, statusFilter, priorityFilter], () => {
  if (filtering.value) locateFirstMatch()
  else canvasRef.value?.resetZoom()
}, { deep: true, flush: 'post' })

watch(visibleNodeIds, (visibleIds) => {
  if (!selection.value.size) return
  const allowedIds = selection.value.size > 1
    ? new Set(visibleCases.value.map((node) => node.id))
    : visibleIds
  const remaining = [...selection.value].filter((id) => allowedIds.has(id))
  if (remaining.length !== selection.value.size) selection.value = new Set(remaining)
  if (!visibleIds.has(selectionAnchor.value)) selectionAnchor.value = null
}, { flush: 'post' })

function selectVisibleCases() {
  selection.value = new Set(visibleCases.value.map((node) => node.id))
  selectionAnchor.value = visibleCases.value[0]?.id ?? null
}

function onSelect(node, event) {
  const toggle = event.metaKey || event.ctrlKey
  if (!toggle && !event.shiftKey) {
    selectedId.value = node.id
    return
  }
  if (node.children?.length) return

  if (event.shiftKey) {
    const start = visibleCases.value.findIndex((item) => item.id === selectionAnchor.value)
    const end = visibleCases.value.findIndex((item) => item.id === node.id)
    if (start >= 0 && end >= 0) {
      const range = visibleCases.value.slice(Math.min(start, end), Math.max(start, end) + 1)
      selection.value = new Set(range.map((item) => item.id))
      return
    }
  }

  const next = new Set(toggle ? selectedCases.value.map((item) => item.id) : [])
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  selection.value = next
  selectionAnchor.value = node.id
}

function clearFilter() {
  keyword.value = ''
  statusFilter.value = []
  priorityFilter.value = []
}

/* ---------- 选中节点属性(优先级/图标/颜色/备注) ---------- */
const selectedNode = computed(() => {
  if (!selectedId.value || !draft.value) return null
  return findNode(draft.value.root, selectedId.value)?.node || null
})

const selectedIsLeaf = computed(() => {
  const n = selectedNode.value
  return !!n && (!n.children || n.children.length === 0)
})

function onUpdateProp(key, value) {
  const found = findNode(draft.value.root, selectedId.value)
  if (!found) return
  pushHistory()
  if (value === null || value === undefined) delete found.node[key]
  else found.node[key] = value
  markDirty()
}

/** 粘贴外部图片到选中节点 */
async function onPasteImage(node, file) {
  const data = await fileToImageData(file)
  const found = findNode(draft.value.root, node.id)
  if (!found) return
  pushHistory()
  found.node.image = data
  markDirty()
  ElMessage.success(`已插入图片到「${node.title}」(未保存)`)
}

function markDirty() {
  dirty.value = true
}

/* ---------- 撤销 / 重做(草稿快照历史) ---------- */
const MAX_HISTORY = 30

function snapshotDraft() {
  return JSON.stringify({ root: draft.value.root, results: draft.value.results })
}

/** 每次草稿变更前调用 */
function pushHistory() {
  undoStack.value.push(snapshotDraft())
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

function restoreDraft(json) {
  const s = JSON.parse(json)
  draft.value.root = s.root
  draft.value.results = s.results
  selectedId.value = null
  editingId.value = null
  markDirty()
}

async function undoDraft() {
  if (undoStack.value.length === 0) return false
  redoStack.value.push(snapshotDraft())
  restoreDraft(undoStack.value.pop())
  return true
}

async function redoDraft() {
  if (redoStack.value.length === 0) return false
  undoStack.value.push(snapshotDraft())
  restoreDraft(redoStack.value.pop())
  return true
}

/* ---------- 编辑操作(作用于草稿) ---------- */

function setCaseResults(cases, status) {
  if (!Object.hasOwn(STATUS, status)) return
  const changed = cases.filter((node) => (draft.value.results[node.id] || 'unexecuted') !== status)
  if (!changed.length) return
  pushHistory()
  for (const node of changed) draft.value.results[node.id] = status
  markDirty()
  ElMessage.success(`已将 ${changed.length} 条用例标记为${STATUS[status].label}（未保存）`)
}

function onSetSelected(status) {
  setCaseResults(selectedCases.value, status)
}

function onAddChild(node) {
  const found = findNode(draft.value.root, node.id)
  if (!found) return null
  pushHistory()
  if (!found.node.children) found.node.children = []
  const created = { id: genId(), title: '子主题', children: [] }
  found.node.children.push(created)
  markDirty()
  return created
}

function onAddSibling(parent, node) {
  pushHistory()
  const created = { id: genId(), title: '子主题', children: [] }
  const idx = parent.children.findIndex((c) => c.id === node.id)
  parent.children.splice(idx + 1, 0, created)
  markDirty()
  return created
}

/** 粘贴子树(已是新 id 副本) */
function onInsertSubtree(parent, subtree) {
  const found = findNode(draft.value.root, parent.id)
  if (!found) return null
  pushHistory()
  if (!found.node.children) found.node.children = []
  found.node.children.push(subtree)
  markDirty()
  return subtree
}

function onRename(node, title) {
  const found = findNode(draft.value.root, node.id)
  if (!found) return
  pushHistory()
  found.node.title = title
  markDirty()
}

/** 无确认直接删除(剪切/确认弹窗共用),同时清理执行结果 */
function removeNodeDirect(node) {
  const found = findNode(draft.value.root, node.id)
  if (!found || !found.parent) return
  pushHistory()
  const removedIds = []
  const collect = (n) => {
    removedIds.push(n.id)
    ;(n.children || []).forEach(collect)
  }
  collect(found.node)
  removedIds.forEach((rid) => delete draft.value.results[rid])
  found.parent.children = found.parent.children.filter((c) => c.id !== node.id)
  markDirty()
}

function onRemove(node) {
  const found = findNode(draft.value.root, node.id)
  if (!found?.parent) return
  const leafCount = getLeaves(found.node).length
  ElMessageBox.confirm(
    leafCount > 0 ? `该节点包含 ${leafCount} 条用例及其执行结果,确定删除?` : '确定删除该节点?',
    '删除确认',
    { type: 'warning' }
  ).then(() => removeNodeDirect(node))
}

async function onSetAll(status) {
  const cases = getLeaves(draft.value.root)
  try {
    await ElMessageBox.confirm(
      `将整份计划的 ${cases.length} 条用例标记为「${STATUS[status].label}」，包括筛选隐藏的用例。`,
      '整份计划标记',
      { type: 'warning', confirmButtonText: '确认标记', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  setCaseResults(cases, status)
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

/* ---------- xmind 风格快捷键 ---------- */
useNodeShortcuts({
  getRoot: () => draft.value?.root,
  getNavigationRoot: () => filteredRoot.value,
  isMultiSelecting: () => selection.value.size > 1,
  selectedId,
  editingId,
  addChild: (parent) => onAddChild(parent),
  addSibling: (parent, node) => onAddSibling(parent, node),
  removeNode: onRemove,
  insertSubtree: (parent, subtree) => onInsertSubtree(parent, subtree),
  deleteDirect: (node) => removeNodeDirect(node),
  pasteImage: onPasteImage,
  undo: undoDraft,
  redo: redoDraft,
})
</script>
