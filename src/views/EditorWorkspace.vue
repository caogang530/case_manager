<template>
  <section v-if="record && draft" class="editor-workspace" ref="workspace">
    <header class="editor-header">
      <div class="editor-heading">
        <span class="row-icon" :class="isPlan ? 'cyan' : 'violet'"><el-icon><component :is="isPlan ? List : Collection" /></el-icon></span>
        <div><h1 :title="record.name">{{ record.name }}</h1><p v-if="isPlan">来自 {{ record.libraryName || '用例库' }}</p><p v-else>{{ stats.total }} 条用例</p></div>
      </div>
      <div class="editor-actions">
        <span class="save-indicator" :class="{ dirty }" role="status"><i />{{ saving ? '保存中…' : dirty ? '未保存' : '已保存' }}</span>
        <el-button :icon="Download" @click="exportDraft">导出 XMind</el-button>
        <el-dropdown v-if="isPlan" trigger="click" placement="bottom-end" @command="handlePlanCommand">
          <button class="icon-btn bordered" type="button" aria-label="计划操作"><el-icon><MoreFilled /></el-icon></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="sync" :icon="Refresh" :disabled="!libraryStore.loaded || saving">同步到来源用例库</el-dropdown-item>
              <el-dropdown-item v-for="(status, key) in STATUS" :key="key" :command="key" :divided="key === 'unexecuted'">整份计划标记为{{ status.label }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :icon="Check" :loading="saving" :disabled="!dirty" @click="saveDraft()">保存</el-button>
      </div>
    </header>

    <section v-if="isPlan" class="execution-summary" aria-label="执行统计">
      <div class="execution-total">
        <span>执行进度</span><strong>{{ stats.execRate }}%</strong><small>{{ stats.executed }} / {{ stats.total }} 条</small>
        <div class="progress-track"><span v-for="key in resultKeys" :key="key" :class="key" :style="{ width: `${stats.total ? stats[key] / stats.total * 100 : 0}%` }" /></div>
      </div>
      <div class="execution-counts">
        <button v-for="(option, key) in STATUS" :key="key" class="execution-count" type="button" :class="key"
          :aria-pressed="statuses.includes(key)" :title="`按${option.label}筛选`" @click="toggleStatusFilter(key)">
          <span><i />{{ option.label }}</span><strong>{{ stats[key] }}</strong>
        </button>
      </div>
      <div class="execution-rate"><span>通过率</span><strong>{{ stats.passRate }}%</strong></div>
    </section>

    <div class="editor-frame">
      <div class="editor-toolbar">
        <div class="editor-tool-group">
          <div class="view-switch" role="group" aria-label="查看方式">
            <button type="button" :aria-pressed="view === 'outline'" @click="switchView('outline')"><el-icon><List /></el-icon>大纲</button>
            <button type="button" :aria-pressed="view === 'map'" @click="switchView('map')"><el-icon><Connection /></el-icon>导图</button>
          </div>
          <span class="tool-divider" />
          <button class="icon-btn" type="button" aria-label="撤销" title="撤销" :disabled="!history.undo.length" @click="undo"><el-icon><Back /></el-icon></button>
          <button class="icon-btn" type="button" aria-label="重做" title="重做" :disabled="!history.redo.length" @click="redo"><el-icon><Right /></el-icon></button>
          <button v-if="view === 'outline' && !filtering" class="icon-btn" type="button" :aria-label="collapsed.size ? '展开全部模块' : '折叠全部模块'"
            :title="collapsed.size ? '展开全部模块' : '折叠全部模块'" @click="toggleAllFolders"><el-icon><component :is="collapsed.size ? Expand : Fold" /></el-icon></button>
        </div>
        <div class="editor-tool-group">
          <el-button v-if="activeNode && !filtering" size="small" :icon="Plus" title="添加子节点" @click="addAndEdit(activeNode)">子节点</el-button>
          <el-button v-if="!filtering" size="small" :icon="Plus" @click="addAndEdit(draft.root)">顶层节点</el-button>
          <button class="icon-btn bordered" type="button" aria-label="节点属性" title="节点属性" :aria-pressed="inspectorOpen" @click="inspectorOpen = !inspectorOpen"><el-icon><Tickets /></el-icon></button>
        </div>
      </div>
      <div class="filterbar">
        <el-input v-model="keyword" :prefix-icon="Search" placeholder="搜索用例或模块" aria-label="搜索用例或模块" clearable />
        <el-select v-if="isPlan" v-model="statuses" multiple collapse-tags clearable placeholder="执行状态" aria-label="按执行状态筛选">
          <el-option v-for="(status, key) in STATUS" :key="key" :value="key" :label="status.label" />
        </el-select>
        <el-select v-model="priorities" multiple collapse-tags clearable placeholder="优先级" aria-label="按优先级筛选">
          <el-option v-for="priority in ['P0', 'P1', 'P2']" :key="priority" :value="priority" :label="priority" />
        </el-select>
        <div v-if="filtering" class="filter-nav">
          <span role="status">{{ matchingCases.length }} 条匹配<span v-if="matchIndex >= 0"> · {{ matchIndex + 1 }}/{{ matchingCases.length }}</span></span>
          <button class="icon-btn" type="button" title="上一条匹配" aria-label="上一条匹配" :disabled="!matchingCases.length" @click="stepMatch(-1)"><el-icon><ArrowUp /></el-icon></button>
          <button class="icon-btn" type="button" title="下一条匹配" aria-label="下一条匹配" :disabled="!matchingCases.length" @click="stepMatch(1)"><el-icon><ArrowDown /></el-icon></button>
          <button v-if="statuses.length && filterStale" class="text-button" type="button" @click="reapplyFilters">刷新匹配</button>
          <button class="text-button" type="button" @click="clearFilters">清除</button>
        </div>
      </div>
      <div v-if="isPlan || selection.size" class="selection-bar">
        <span><strong v-if="selection.size">已选 {{ selection.size }} 项</strong><span v-else>选择用例后可批量标记</span></span>
        <button v-if="isPlan && matchingCases.length" class="text-button" type="button" @click="selectAll">{{ filtering ? '全选匹配' : '全选用例' }}</button>
        <el-dropdown v-if="isPlan && selectedCases.length" trigger="click" @command="setSelectedStatus">
          <el-button size="small" type="primary" plain>标记所选<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu><el-dropdown-item v-for="(status, key) in STATUS" :key="key" :command="key">{{ status.label }}</el-dropdown-item></el-dropdown-menu>
          </template>
        </el-dropdown>
        <button v-if="activeNode" class="icon-btn" type="button" aria-label="编辑标题" title="编辑标题 (F2)" @click="startEdit(activeNode)"><el-icon><EditPen /></el-icon></button>
        <button v-if="activeNode && activeNode.id !== draft.root.id" class="icon-btn" type="button" aria-label="删除所选节点" title="删除节点" @click="confirmRemove(activeNode)"><el-icon><Delete /></el-icon></button>
        <button v-if="selection.size" class="text-button" type="button" @click="clearSelection">取消选择</button>
      </div>

      <div class="editor-body" :class="{ 'with-inspector': inspectorOpen }">
        <div class="editor-surface" @paste="onPaste">
          <div v-if="!filteredRoot" class="empty-state">
            <span class="empty-icon"><el-icon><Search /></el-icon></span>
            <h3>没有匹配的用例</h3><p>试试其他关键词或筛选条件。</p><el-button @click="clearFilters">清除筛选</el-button>
          </div>
          <WorkspaceOutline v-else-if="view === 'outline'" ref="outline" :rows="outlineRows" :selected="selection" :collapsed="effectiveCollapsed" :filtering="filtering"
            :active-id="activeNode?.id" :editing-id="editingId" :plan="isPlan" :results="draft.results"
            @select="onSelect" @edit="startEdit" @edit-done="editingId = null" @rename="renameNode" @toggle="toggleFolder" @toggle-selection="toggleSelection" @status="setSingleStatus" @clear="clearSelection" />
          <MindCanvas v-else ref="canvas" @blank-click="clearSelection">
            <div class="mind-tree">
              <MindTreeNode :node="filteredRoot" :mode="mode" :results="draft.results" :selected-ids="selection" :editing-id="editingId" :can-add="!filtering"
                @select="onSelect" @rename="renameNode" @edit-done="editingId = null" @set-status="setSingleStatus"
                @add-child="addAndEdit" @remove="confirmRemove" />
            </div>
          </MindCanvas>
        </div>
        <WorkspaceInspector v-if="inspectorOpen" :node="activeNode" :is-leaf="!!activeNode && !activeNode.children?.length"
          :path="activePath" :plan="isPlan" :status="draft.results[activeNode?.id]" :count="selection.size"
          @close="inspectorOpen = false" @update="updateProperty" @status="(status) => setSingleStatus(activeNode, status)" @image="attachImage" />
      </div>
      <footer class="editor-footer">
        <span>{{ filtering ? `${matchingCases.length} / ${stats.total} 条用例` : `${stats.total} 条用例` }}</span>
        <span v-if="isPlan">Shift + 点击选范围<span class="footer-separator">·</span>按 1–5 快速标记</span>
        <span v-else>修改自动保存</span>
      </footer>
    </div>
  </section>
  <section v-else class="workspace-state empty-state" :role="store.loadError || detailError ? 'alert' : 'status'">
    <template v-if="store.loadError || detailError"><span class="empty-icon"><el-icon><Warning /></el-icon></span><h3>加载失败</h3><p>请检查后端连接后重试。</p><el-button :icon="Refresh" @click="retryLoad">重新加载</el-button></template>
    <template v-else-if="!store.loaded || detailLoading"><div class="list-skeleton editor-skeleton" :aria-label="`正在加载${label}`"><i v-for="n in 4" :key="n" /></div></template>
    <template v-else><span class="empty-icon"><el-icon><Search /></el-icon></span><h3>{{ label }}不存在</h3><RouterLink :to="isPlan ? '/plans' : '/libraries'">返回{{ label }}</RouterLink></template>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowReactive, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Back, Check, Collection, Connection, Delete, Download, EditPen, Expand, Fold, List, MoreFilled, Plus, Refresh, Right, Search, Tickets, Warning } from '@element-plus/icons-vue'
import { useLibraryStore } from '../stores/library'
import { usePlanStore, STATUS } from '../stores/plan'
import { caseFilter, computeStats, filterTree, genId, getLeaves, walkTree } from '../utils/tree'
import { copyNode, peekClipboard } from '../utils/clipboard'
import { exportXmind } from '../utils/xmind'
import { fileToImageData } from '../utils/image'
import MindCanvas from '../components/MindCanvas.vue'
import MindTreeNode from '../components/MindTreeNode.vue'
import WorkspaceInspector from '../components/WorkspaceInspector.vue'
import WorkspaceOutline from '../components/WorkspaceOutline.vue'

const props = defineProps({ mode: { type: String, required: true } })
const route = useRoute()
const libraryStore = useLibraryStore()
const planStore = usePlanStore()
const isPlan = computed(() => props.mode === 'plan')
const store = computed(() => isPlan.value ? planStore : libraryStore)
const label = computed(() => isPlan.value ? '测试计划' : '用例库')
const record = computed(() => store.value.getById(route.params.id))
const workspace = ref(null)
const canvas = ref(null)
const outline = ref(null)
const view = ref(localStorage.getItem(`casework:view:${props.mode}`) || (isPlan.value ? 'outline' : 'map'))
const inspectorOpen = ref(window.innerWidth >= 1050)
const draft = ref(null)
const detailLoading = ref(false)
const detailError = ref(false)
const revision = ref(0)
const savedRevision = ref(0)
let nextRevision = 0
const history = shallowReactive({ undo: [], redo: [] })
const dirty = computed(() => revision.value !== savedRevision.value)
const saving = ref(false)
let pendingSave = null
let autosaveTimer
let disposed = false
const resultKeys = ['passed', 'failed', 'blocked', 'skipped']
const stats = computed(() => draft.value ? computeStats(draft.value.root, draft.value.results) : null)

const selection = ref(new Set())
const anchor = ref(null)
const editingId = ref(null)
const collapsed = ref(new Set())
const keyword = ref('')
const statuses = ref([])
const priorities = ref([])
const filterResults = ref({})
const filterStale = ref(false)
const matchIndex = ref(-1)
const filtering = computed(() => !!(keyword.value.trim() || statuses.value.length || priorities.value.length))
const effectiveCollapsed = computed(() => filtering.value ? new Set() : collapsed.value)
const activeNode = computed(() => selection.value.size === 1 ? nodeIndex.value.get([...selection.value][0])?.node : null)
const activePath = computed(() => {
  const titles = []
  let entry = activeNode.value && nodeIndex.value.get(activeNode.value.id)
  while (entry?.parent) {
    titles.unshift(entry.parent.title)
    entry = nodeIndex.value.get(entry.parent.id)
  }
  return titles.join(' / ')
})
const nodeIndex = computed(() => indexTree(draft.value?.root))
const filteredRoot = computed(() => {
  if (!draft.value || !filtering.value) return draft.value?.root ?? null
  return filterTree(draft.value.root, caseFilter({
    keyword: keyword.value, statuses: statuses.value, priorities: priorities.value,
  }, filterResults.value))
})
const visibleIndex = computed(() => filtering.value ? indexTree(filteredRoot.value) : nodeIndex.value)
const matchingCases = computed(() => filteredRoot.value ? getLeaves(filteredRoot.value) : [])
const selectedCases = computed(() => matchingCases.value.filter((node) => selection.value.has(node.id)))
const outlineRows = computed(() => {
  const rows = []
  function visit(node, depth) {
    const isCase = !node.children?.length
    rows.push({ node, depth, isCase })
    if (!isCase && !effectiveCollapsed.value.has(node.id)) {
      for (const child of node.children) visit(child, depth + 1)
    }
  }
  if (filteredRoot.value) visit(filteredRoot.value, 0)
  return rows
})

watch(() => record.value?.id, (id) => {
  if (id) void loadDetail(id)
}, { immediate: true })

watch(revision, () => scheduleAutosave())

watch([keyword, statuses, priorities], () => {
  refreshFilter()
  matchIndex.value = -1
}, { deep: true })
watch([keyword, statuses, priorities], () => {
  if (filtering.value && matchingCases.value.length) void stepMatch(1, false)
  else if (view.value === 'map') canvas.value?.resetZoom()
}, { deep: true, flush: 'post' })
watch(visibleIndex, (index) => {
  const kept = [...selection.value].filter((id) => index.has(id))
  if (kept.length !== selection.value.size) selection.value = new Set(kept)
  if (!index.has(anchor.value)) anchor.value = null
  if (!index.has(editingId.value)) editingId.value = null
})

function indexTree(root) {
  const index = new Map()
  if (root) walkTree(root, (node, parent) => index.set(node.id, { node, parent }))
  return index
}

async function loadDetail(id) {
  detailError.value = false
  detailLoading.value = true
  try {
    const item = await store.value.detail(id)
    if (disposed || route.params.id !== id) return
    draft.value = { root: copyTree(item.root), results: { ...item.results } }
    clearSelection()
    if (getLeaves(draft.value.root).length > 300) {
      collapsed.value = new Set(draft.value.root.children.filter((node) => node.children?.length).map((node) => node.id))
    }
  } catch (error) {
    console.error('加载工作台详情失败', error)
    detailError.value = true
  } finally {
    detailLoading.value = false
  }
}

function retryLoad() {
  if (store.value.loadError) void store.value.load()
  else if (record.value) void loadDetail(record.value.id)
}

function copyTree(node) {
  return { ...node, children: (node.children || []).map(copyTree), ...(node.image ? { image: { ...node.image } } : {}) }
}

function snapshot() {
  return { root: copyTree(draft.value.root), results: { ...draft.value.results }, revision: revision.value }
}

function change(update) {
  history.undo = [...history.undo.slice(-29), snapshot()]
  history.redo = []
  update()
  revision.value = ++nextRevision
}

function restore(from, to) {
  if (!history[from].length) return
  const previous = history[from].at(-1)
  history[to] = [...history[to], snapshot()]
  history[from] = history[from].slice(0, -1)
  draft.value = { root: previous.root, results: previous.results }
  revision.value = previous.revision
  editingId.value = null
  if (statuses.value.length) filterStale.value = true
}

const undo = () => restore('undo', 'redo')
const redo = () => restore('redo', 'undo')

function clearSelection() {
  selection.value = new Set()
  anchor.value = null
}
function selectOne(id) {
  selection.value = new Set([id])
  anchor.value = id
}
function onSelect(node, event) {
  const toggle = event.metaKey || event.ctrlKey
  if (!isPlan.value || node.children?.length || (!toggle && !event.shiftKey)) {
    selectOne(node.id)
    return
  }
  const orderedCases = view.value === 'outline'
    ? outlineRows.value.filter((row) => row.isCase).map((row) => row.node)
    : matchingCases.value
  if (event.shiftKey) {
    const start = orderedCases.findIndex((item) => item.id === anchor.value)
    const end = orderedCases.findIndex((item) => item.id === node.id)
    if (start >= 0 && end >= 0) {
      const range = orderedCases.slice(Math.min(start, end), Math.max(start, end) + 1)
      selection.value = new Set(range.map((item) => item.id))
      return
    }
  }
  if (toggle) toggleSelection(node)
  else selectOne(node.id)
}
function toggleSelection(node) {
  const ids = new Set(selectedCases.value.map((item) => item.id))
  if (ids.has(node.id)) ids.delete(node.id)
  else ids.add(node.id)
  selection.value = ids
  anchor.value = node.id
}
function selectAll() {
  selection.value = new Set(matchingCases.value.map((node) => node.id))
  anchor.value = matchingCases.value[0]?.id ?? null
}
function toggleFolder(id) {
  if (filtering.value) return
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}
function toggleAllFolders() {
  collapsed.value = collapsed.value.size ? new Set() : new Set(draft.value.root.children.filter((node) => node.children?.length).map((node) => node.id))
}
function revealAncestors(id) {
  if (view.value !== 'outline') return
  const next = new Set(collapsed.value)
  let entry = nodeIndex.value.get(id)
  while (entry?.parent) {
    next.delete(entry.parent.id)
    entry = nodeIndex.value.get(entry.parent.id)
  }
  collapsed.value = next
}
async function focusNode(id) {
  if (!id) return
  revealAncestors(id)
  await nextTick()
  if (view.value === 'outline') outline.value?.focusNode(id)
  else canvas.value?.focusNode(id)
}
async function switchView(next) {
  if (view.value === next) return
  view.value = next
  localStorage.setItem(`casework:view:${props.mode}`, next)
  await nextTick()
  const match = matchingCases.value[matchIndex.value]
  if (activeNode.value || match) void focusNode(activeNode.value?.id || match.id)
  else if (next === 'map') canvas.value?.fit()
}
function refreshFilter() {
  filterResults.value = statuses.value.length ? { ...draft.value?.results } : {}
  filterStale.value = false
}
async function reapplyFilters() {
  refreshFilter()
  matchIndex.value = -1
  await nextTick()
  if (matchingCases.value.length) void stepMatch(1, false)
}
function clearFilters() {
  keyword.value = ''
  statuses.value = []
  priorities.value = []
}
function toggleStatusFilter(status) {
  statuses.value = statuses.value.includes(status) ? statuses.value.filter((key) => key !== status) : [...statuses.value, status]
}
function stepMatch(delta, select = true) {
  const count = matchingCases.value.length
  if (!count) return
  const current = matchIndex.value >= 0 ? matchIndex.value : delta < 0 ? 0 : -1
  matchIndex.value = (current + delta + count) % count
  const node = matchingCases.value[matchIndex.value]
  if (select) selectOne(node.id)
  return focusNode(node.id)
}

async function startEdit(node) {
  if (!node || !visibleIndex.value.has(node.id)) return
  selectOne(node.id)
  await focusNode(node.id)
  editingId.value = node.id
}
function renameNode(node, title) {
  const entry = nodeIndex.value.get(node.id)
  if (entry && entry.node.title !== title) change(() => { entry.node.title = title })
}
function insertChild(parent, node, position = parent.children.length) {
  change(() => { parent.children.splice(position, 0, node) })
  return node
}
function addAndEdit(parent, sibling = null) {
  if (filtering.value || !parent) return
  const entry = nodeIndex.value.get(parent.id)
  if (!entry) return
  const position = sibling ? entry.node.children.findIndex((node) => node.id === sibling.id) + 1 : entry.node.children.length
  const node = insertChild(entry.node, { id: genId(), title: '新节点', children: [] }, position)
  void startEdit(node)
}
function removeNode(node) {
  const entry = nodeIndex.value.get(node.id)
  if (!entry?.parent) return
  change(() => {
    walkTree(entry.node, (child) => { delete draft.value.results[child.id] })
    const children = entry.parent.children
    children.splice(children.indexOf(entry.node), 1)
  })
  clearSelection()
}
async function confirmRemove(node) {
  const entry = nodeIndex.value.get(node.id)
  if (!entry?.parent) return
  const count = getLeaves(entry.node).length
  try {
    await ElMessageBox.confirm(`将移除「${entry.node.title}」及其 ${count} 条用例。保存前可撤销修改。`, '删除节点', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
    removeNode(node)
  } catch {
    // 用户取消。
  }
}
function updateProperty(key, value, node = activeNode.value) {
  if (!node) return
  const entry = nodeIndex.value.get(node.id)
  if (!entry || (entry.node[key] ?? null) === value) return
  change(() => {
    if (value === null) delete entry.node[key]
    else entry.node[key] = value
  })
}
async function attachImage(node, file) {
  try {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
    updateProperty('image', await fileToImageData(file), node)
  } catch (error) {
    ElMessage.error(error.message || '图片读取失败')
  }
}
function setStatus(nodes, status) {
  if (!Object.hasOwn(STATUS, status)) return
  const updates = nodes.filter((node) => {
    const entry = nodeIndex.value.get(node.id)
    return entry && !entry.node.children.length && (draft.value.results[node.id] || 'unexecuted') !== status
  })
  if (!updates.length) return
  change(() => {
    for (const node of updates) {
      if (status === 'unexecuted') delete draft.value.results[node.id]
      else draft.value.results[node.id] = status
    }
  })
  if (statuses.value.length) filterStale.value = true
  if (updates.length > 1) ElMessage.success(`已标记 ${updates.length} 条用例`)
}
function setSingleStatus(node, status) {
  if (node) setStatus([node], status)
}
function setSelectedStatus(status) {
  setStatus(selectedCases.value, status)
}

function flushFocusedEdit() {
  const element = document.activeElement
  if (workspace.value?.contains(element) && element.matches('textarea, .outline-editor, .mind-node-title-input input')) element.blur()
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer)
  if (isPlan.value || disposed || !dirty.value) return
  autosaveTimer = setTimeout(() => { void saveDraft(false) }, 800)
}
function saveDraft(flush = true) {
  if (flush) flushFocusedEdit()
  if (pendingSave) return pendingSave
  if (!dirty.value) return Promise.resolve(true)
  const id = record.value.id
  const checkpoint = snapshot()
  saving.value = true
  pendingSave = (async () => {
    try {
      await store.value.update(id, { root: checkpoint.root, ...(isPlan.value ? { results: checkpoint.results } : {}) })
      savedRevision.value = checkpoint.revision
      if (dirty.value) scheduleAutosave()
      return true
    } catch (error) {
      ElMessage.error(`保存失败。${error.message}`)
      return false
    } finally {
      saving.value = false
      pendingSave = null
    }
  })()
  return pendingSave
}
async function exportDraft() {
  flushFocusedEdit()
  try {
    await exportXmind(draft.value.root, record.value.name, isPlan.value ? draft.value.results : undefined)
  } catch (error) {
    ElMessage.error(error.message || '导出失败')
  }
}
async function handlePlanCommand(command) {
  if (command === 'sync') {
    const library = libraryStore.getById(record.value.libraryId)
    if (!library) return ElMessage.warning('来源用例库不存在')
    try {
      await ElMessageBox.confirm(`将用当前计划的用例结构覆盖「${library.name}」。执行结果只保存在计划中。`, '同步到来源用例库', {
        type: 'warning', confirmButtonText: '保存并同步', cancelButtonText: '取消',
      })
      flushFocusedEdit()
      const rootToSync = copyTree(draft.value.root)
      if (!(await saveDraft())) return
      await libraryStore.update(library.id, { root: rootToSync })
      ElMessage.success('已同步到来源用例库')
    } catch (error) {
      if (error instanceof Error) ElMessage.error(`同步失败。${error.message}`)
    }
    return
  }
  const cases = getLeaves(draft.value.root)
  try {
    await ElMessageBox.confirm(`将整份计划中的 ${cases.length} 条用例标记为「${STATUS[command].label}」，包括筛选隐藏的用例。`, '整份计划标记', {
      type: 'warning', confirmButtonText: '确认标记', cancelButtonText: '取消',
    })
    setStatus(cases, command)
  } catch {
    // 用户取消。
  }
}

async function canLeave() {
  flushFocusedEdit()
  if (pendingSave) await pendingSave
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('当前修改尚未保存。', '离开工作台', {
      type: 'warning', distinguishCancelAndClose: true, confirmButtonText: '保存并离开', cancelButtonText: '放弃修改',
    })
    return (await saveDraft()) && !dirty.value
  } catch (action) {
    return action === 'cancel'
  }
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
function beforeUnload(event) {
  if (!dirty.value && !editingId.value && !document.activeElement?.matches('.inspector textarea')) return
  event.preventDefault()
  event.returnValue = ''
}

function dialogOpen() {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((dialog) => dialog.getClientRects().length)
}

function onKeydown(event) {
  if (!draft.value || event.defaultPrevented || dialogOpen()) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (mod && key === 's') {
    event.preventDefault()
    void saveDraft()
    return
  }
  const target = event.target
  if (target?.closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable], [role="menu"], [role="listbox"]')) return
  if (target?.closest?.('[aria-expanded="true"][aria-haspopup]')) return
  if (mod) {
    if (key === 'z' || key === 'y') {
      event.preventDefault()
      if (key === 'y' || event.shiftKey) redo()
      else undo()
    } else if (activeNode.value && (key === 'c' || key === 'x')) {
      if (key === 'x' && activeNode.value.id === draft.value.root.id) return
      const node = activeNode.value
      event.preventDefault()
      copyNode(node)
      if (key === 'x') removeNode(node)
      ElMessage.info(key === 'x' ? '已剪切节点' : '已复制节点')
    }
    return
  }
  if (event.altKey) return
  if (key === 'escape') {
    clearSelection()
    return
  }
  const statusKey = ['passed', 'failed', 'blocked', 'skipped', 'unexecuted'][Number(key) - 1]
  if (isPlan.value && statusKey && selectedCases.value.length) {
    event.preventDefault()
    setSelectedStatus(statusKey)
    return
  }
  const node = activeNode.value
  if (!node) return
  const entry = visibleIndex.value.get(node.id)
  if (!entry) return
  const nodeSurface = target?.closest?.('[data-node-surface]')
  if ((key === 'tab' || key === 'enter') && nodeSurface && !event.shiftKey && !filtering.value) {
    if (target?.closest?.('input, button')) return
    event.preventDefault()
    const sibling = key === 'enter' && entry.parent
    addAndEdit(sibling ? entry.parent : node, sibling ? node : null)
  } else if (key === 'f2') {
    event.preventDefault()
    void startEdit(node)
  } else if (key === 'delete' || key === 'backspace') {
    if (!entry.parent) return
    event.preventDefault()
    void confirmRemove(node)
  } else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault()
    let next = null
    if (key === 'arrowleft') next = entry.parent
    if (key === 'arrowright') next = entry.node.children?.[0]
    if (key === 'arrowup' || key === 'arrowdown') {
      const siblings = view.value === 'outline' ? outlineRows.value.map((row) => row.node) : entry.parent?.children || []
      const index = siblings.findIndex((sibling) => sibling.id === node.id)
      if (index >= 0) next = siblings[index + (key === 'arrowup' ? -1 : 1)]
    }
    if (next) {
      selectOne(next.id)
      void focusNode(next.id)
    }
  }
}
function onPaste(event) {
  if (!draft.value || !workspace.value?.contains(event.target) || dialogOpen()) return
  if (event.target.closest?.('input, textarea, [contenteditable]')) return
  if (selection.value.size > 1) return
  const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))?.getAsFile()
  if (image && activeNode.value) {
    event.preventDefault()
    void attachImage(activeNode.value, image)
    return
  }
  if (image || filtering.value) return
  const node = peekClipboard()
  if (!node) return
  event.preventDefault()
  const parent = activeNode.value || draft.value.root
  insertChild(parent, node)
  selectOne(node.id)
  void focusNode(node.id)
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => {
  disposed = true
  clearTimeout(autosaveTimer)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>
