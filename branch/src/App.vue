<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="heading-group">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>Branch</strong></div>
        <span class="header-line"></span>
        <div class="document-anchor" data-popup-anchor>
          <button class="document-button" type="button" :aria-expanded="popup === 'documents'" aria-label="切换用例库或测试计划" @click="togglePopup('documents')">
            <span class="document-title">{{ doc.name }}</span><span class="chevron" aria-hidden="true"></span>
          </button>
          <div v-if="popup === 'documents'" class="popup document-menu">
            <div class="menu-caption">用例库</div>
            <button v-for="item in libraries" :key="item.id" type="button" class="document-option" @click="switchDoc(item.id)"><span>{{ item.name }}</span><b v-if="item.id === doc.id">✓</b></button>
            <button type="button" class="document-option create-option" @click="showDialog('create')">＋ 新建用例库</button>
            <div class="menu-caption menu-separated">测试计划</div>
            <button v-for="item in plans" :key="item.id" type="button" class="document-option" @click="switchDoc(item.id)"><span>{{ item.name }}</span><b v-if="item.id === doc.id">✓</b></button>
          </div>
        </div>
        <span class="document-badge" :class="doc.mode">{{ isPlan ? '测试计划' : '用例库' }}</span>
      </div>
      <div class="head-actions">
        <span class="save-state" :class="saveState" role="status"><i></i>{{ saveState === 'saving' ? '保存中' : saveState === 'error' ? '保存失败' : '已保存在本机' }}</span>
        <button v-if="saveState === 'error'" class="quiet-button" type="button" @click="persist">重试</button>
        <button class="button secondary import-button" type="button" @click="importInput?.click()"><span aria-hidden="true">↑</span> 导入</button>
        <button class="button primary export-button" type="button" @click="exportDocument"><span aria-hidden="true">↓</span> 导出 XMind</button>
        <div class="more-anchor" data-popup-anchor>
          <button class="icon-button more-button" type="button" aria-label="文档操作" :aria-expanded="popup === 'more'" @click="togglePopup('more')">···</button>
          <div v-if="popup === 'more'" class="popup more-menu">
            <button v-if="!isPlan" type="button" @click="showDialog('plan')">从用例库创建测试计划</button>
            <button type="button" @click="showDialog('rename')">重命名文档</button>
            <button type="button" @click="showDialog('help')">键盘快捷键</button>
            <button type="button" class="danger-text" :disabled="workspace.docs.length <= 1" @click="showDialog('delete')">删除此文档</button>
          </div>
        </div>
      </div>
    </header>
    <input ref="importInput" type="file" accept=".xmind,.zip" multiple hidden @change="openImport">

    <div class="toolbar" aria-label="编辑和筛选工具">
      <div class="tool-group">
        <button class="button secondary add-button" type="button" :disabled="filtering" title="添加子节点 (Tab)" @click="addNode('child')">＋ <span>子节点</span></button>
        <button class="button secondary add-button" type="button" :disabled="filtering" title="添加同级节点 (Enter)" @click="addNode('sibling')">＋ <span>同级</span></button>
        <span class="toolbar-divider"></span>
        <button class="icon-button" type="button" aria-label="撤销" :disabled="!past.length" title="撤销" @click="undo">↶</button>
        <button class="icon-button" type="button" aria-label="重做" :disabled="!future.length" title="重做" @click="redo">↷</button>
      </div>
      <div class="tool-group filter-group">
        <label class="search-box"><i aria-hidden="true"></i><input ref="searchInput" v-model="query" type="search" aria-label="搜索节点" placeholder="搜索节点" @keydown="handleSearchKeys"><kbd v-if="!query">/</kbd></label>
        <div v-if="filtering" class="search-results-nav" aria-label="匹配结果"><span role="status">{{ matchIds.length ? `${matchIndex + 1}/${matchIds.length}` : '0 条' }}</span>
          <button type="button" class="icon-button" aria-label="上一条匹配" :disabled="!matchIds.length" @click="navigateMatch(-1)">↑</button>
          <button type="button" class="icon-button" aria-label="下一条匹配" :disabled="!matchIds.length" @click="navigateMatch(1)">↓</button></div>
        <div class="filter-anchor" data-popup-anchor>
          <button class="button secondary filter-button" type="button" :aria-expanded="popup === 'filter'" :class="{ filtered: activeFilterCount }" @click="togglePopup('filter')"><span class="filter-mark" aria-hidden="true"></span> 筛选<span v-if="activeFilterCount" class="filter-number">{{ activeFilterCount }}</span></button>
          <div v-if="popup === 'filter'" class="popup filter-menu">
            <section v-if="isPlan"><h3>执行状态</h3><div class="filter-choices"><button v-for="(item, key) in statuses" :key="key" type="button" :class="key" :aria-pressed="statusFilters.includes(key)" @click="toggleFilter(statusFilters, key)">{{ item.label }}</button></div></section>
            <section><h3>优先级</h3><div class="filter-choices"><button v-for="priority in ['P0', 'P1', 'P2', '无']" :key="priority" type="button" :aria-pressed="priorityFilters.includes(priority)" @click="toggleFilter(priorityFilters, priority)">{{ priority }}</button></div></section>
            <button class="quiet-button" type="button" @click="clearFilters">清除筛选</button>
          </div>
        </div>
        <button class="icon-button inspector-toggle" type="button" aria-label="显示节点属性" :aria-pressed="inspectorOpen" title="节点属性" @click="inspectorOpen = !inspectorOpen">▤</button>
      </div>
    </div>

    <main class="workspace" :class="{ 'with-inspector': inspectorOpen }" aria-label="Branch 工作区">
      <div class="canvas-pane">
        <MapCanvas ref="map" :key="doc.id" :layout="layout" :selection="selected" :collapsed="effectiveCollapsed" :matches="matchSet" :results="doc.results"
          :current-match="currentMatch" :editing="editing" :plan="isPlan" :filtering="filtering" :total="counts.total"
          @select="selectNode" @clear="clearSelection" @select-many="selectMany" @edit="startEdit" @rename="renameNode" @edit-end="endEdit"
          @fold="toggleFold" @node-status="openStatus" @move="moveNode" />
        <div class="canvas-caption"><span class="canvas-dot"></span>{{ filtering ? `${matchIds.length} 条匹配` : `${counts.total} 条用例` }}</div>
        <div v-if="filtering && !matchIds.length" class="map-empty"><strong>没有匹配节点</strong><button class="quiet-button" type="button" @click="clearFilters">清除筛选</button></div>
        <div v-if="selected.size > 1" class="selection-toolbar" data-popup-anchor><strong>已选 {{ selected.size }} 项</strong>
          <button v-if="isPlan && selectedCases.length" type="button" class="button primary" @click="openBatch">批量标记</button>
          <button class="icon-button" type="button" aria-label="取消选择" @click="clearSelection">×</button>
        </div>
      </div>
      <Inspector v-if="inspectorOpen" :node="activeNode" :plan="isPlan" :status="activeStatus" :path="activePath" :address="activeAddress" :selected-count="selected.size"
        :can-remove="!!activeNode && activeNode.id !== doc.root.id" @remove="requestRemove"
        @close="inspectorOpen = false" @update="updateProperty" @status="(key) => setStatus([activeNode?.id], key)" @image="attachImage" @preview="previewImage" />
    </main>

    <footer class="statusbar">
      <div class="footer-summary"><strong>{{ counts.total }} 用例</strong><span v-if="isPlan" class="footer-divider"></span>
        <div v-if="isPlan" class="status-list"><button v-for="key in ['passed', 'failed', 'blocked', 'unexecuted', 'skipped']" :key="key" type="button" :class="key" :aria-pressed="statusFilters.includes(key)" @click="toggleFilter(statusFilters, key)"><i></i>{{ statuses[key].label }} <b>{{ counts[key] }}</b></button></div>
      </div>
      <div class="footer-tips"><span>双击编辑</span><span>Shift 拖拽框选</span><button type="button" class="quiet-button" @click="showDialog('help')" aria-label="快捷键帮助">?</button></div>
    </footer>

    <Teleport to="body">
      <div v-if="statusMenu" class="popup status-menu" :style="{ left: `${statusMenu.x}px`, top: `${statusMenu.y}px` }" data-popup-anchor @keydown.esc.stop="statusMenu = null">
        <div class="menu-caption">{{ statusMenu.ids.length > 1 ? `标记 ${statusMenu.ids.length} 条用例` : '设置执行状态' }}</div>
        <button v-for="(item, key) in statuses" :key="key" type="button" @click="applyMenuStatus(key)"><span class="menu-status-icon" :class="key">{{ item.symbol }}</span>{{ item.label }}</button>
      </div>
      <dialog ref="dialog" class="dialog" @close="dialogMode = ''">
        <header><h2>{{ dialogTitle }}</h2><button class="icon-button" type="button" aria-label="关闭对话框" @click="dialog?.close()">×</button></header>
        <form v-if="['create', 'plan', 'rename'].includes(dialogMode)" @submit.prevent="saveDialog">
          <label for="document-name">名称</label><input id="document-name" v-model.trim="dialogName" required maxlength="120">
          <footer><button type="button" class="button secondary" @click="dialog?.close()">取消</button><button type="submit" class="button primary" :disabled="!dialogName">{{ dialogMode === 'rename' ? '保存' : '创建' }}</button></footer>
        </form>
        <div v-else-if="['delete', 'delete-nodes'].includes(dialogMode)" class="dialog-content"><p>{{ dialogMode === 'delete' ? `删除「${doc.name}」？` : `删除所选 ${removalIds.length} 个节点及其子节点？` }}</p>
          <footer><button type="button" class="button secondary" @click="dialog?.close()">取消</button><button type="button" class="button destructive" @click="confirmDelete">删除</button></footer></div>
        <dl v-else-if="dialogMode === 'help'" class="hotkeys"><div v-for="[label, keys] in shortcuts" :key="label"><dt>{{ label }}</dt><dd><kbd>{{ keys }}</kbd></dd></div></dl>
        <div v-else-if="dialogMode === 'image'" class="image-preview"><img :src="previewSrc" alt="节点附件"></div>
      </dialog>
      <div v-if="notice" class="toast" role="status"><span>{{ notice }}</span><button v-if="offerUndo" class="quiet-button" type="button" @click="undo">撤销</button><button class="icon-button" type="button" aria-label="关闭消息" @click="notice = ''">×</button></div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MapCanvas from './MapCanvas.vue'
import Inspector from './Inspector.vue'
import { casesIn, clone, countStatuses, demoWorkspace, duplicateTree, indexTree, makeNode, newId, projectTree, statuses } from './model.js'
import { mapLayout } from './layout.js'
import { readWorkspace, saveWorkspace } from './persistence.js'

const workspace = ref(demoWorkspace())
const doc = computed(() => workspace.value.docs.find(({ id }) => id === workspace.value.activeId) || workspace.value.docs[0])
const libraries = computed(() => workspace.value.docs.filter((item) => item.mode === 'library'))
const plans = computed(() => workspace.value.docs.filter((item) => item.mode === 'plan'))
const isPlan = computed(() => doc.value.mode === 'plan')
const counts = computed(() => countStatuses(doc.value))
const treeIndex = computed(() => indexTree(doc.value.root))
const map = ref(null)
const selected = ref(new Set(['demo-case-2']))
const collapsed = ref(new Set())
const editing = ref(null)
const inspectorOpen = ref(window.innerWidth >= 900)
const query = ref('')
const statusFilters = ref([])
const priorityFilters = ref([])
const matchIndex = ref(-1)
const past = ref([])
const future = ref([])
const popup = ref('')
const statusMenu = ref(null)
const notice = ref('')
const offerUndo = ref(false)
const saveState = ref('ready')
const dialog = ref(null)
const dialogMode = ref('')
const dialogName = ref('')
const removalIds = ref([])
const previewSrc = ref('')
const searchInput = ref(null)
const importInput = ref(null)
let clipboard = null
let anchor = 'demo-case-2'
let noticeTimer
let writeQueue = Promise.resolve()
let writeVersion = 0
let importing = false
let filterNavigation = 0

const activeNode = computed(() => selected.value.size === 1 ? treeIndex.value.get([...selected.value][0])?.node : null)
const selectedCases = computed(() => [...selected.value].filter((id) => treeIndex.value.get(id)?.node.kind === 'case'))
const activeStatus = computed(() => doc.value.results[activeNode.value?.id] || 'unexecuted')
const activePath = computed(() => {
  const names = []
  let entry = treeIndex.value.get(activeNode.value?.id)
  while (entry?.parent) {
    names.unshift(entry.parent.title)
    entry = treeIndex.value.get(entry.parent.id)
  }
  return names.join(' / ')
})
const activeAddress = computed(() => {
  if (activeNode.value?.kind !== 'case') return ''
  const number = casesIn(doc.value.root).findIndex(({ id }) => id === activeNode.value.id) + 1
  return `TC-${String(number).padStart(3, '0')}`
})
const activeFilterCount = computed(() => statusFilters.value.length + priorityFilters.value.length)
const filtering = computed(() => !!(query.value.trim() || activeFilterCount.value))
const matches = computed(() => {
  if (!filtering.value) return []
  const needle = query.value.trim().toLocaleLowerCase()
  const criteria = activeFilterCount.value
  const ids = []
  function visit(node, parentMatches) {
    const titleMatches = !!needle && (parentMatches || node.title.toLocaleLowerCase().includes(needle))
    const status = doc.value.results[node.id] || 'unexecuted'
    const isCase = node.kind === 'case'
    if ((isCase || !criteria) && (!needle || titleMatches) &&
      (!statusFilters.value.length || statusFilters.value.includes(status)) &&
      (!priorityFilters.value.length || priorityFilters.value.includes(node.priority || '无'))) ids.push(node.id)
    node.children.forEach((child) => visit(child, titleMatches))
  }
  visit(doc.value.root, false)
  return ids
})
const matchIds = computed(() => {
  if (activeFilterCount.value) return matches.value
  const needle = query.value.trim().toLocaleLowerCase()
  return needle ? matches.value.filter((id) => treeIndex.value.get(id)?.node.title.toLocaleLowerCase().includes(needle)) : []
})
const matchSet = computed(() => new Set(matchIds.value))
const currentMatch = computed(() => matchIds.value[matchIndex.value] || null)
const effectiveCollapsed = computed(() => filtering.value ? new Set() : collapsed.value)
const layout = computed(() => mapLayout(projectTree(doc.value.root, filtering.value ? new Set(matches.value) : null), effectiveCollapsed.value))
const dialogTitle = computed(() => ({ create: '新建用例库', plan: '新建测试计划', rename: '重命名文档', delete: '删除文档', 'delete-nodes': '删除节点', help: '键盘快捷键', image: '节点附件' })[dialogMode.value])
const shortcuts = [
  ['添加子节点 / 同级节点', 'Tab / Enter'], ['编辑名称', 'F2 / 双击'], ['多选 / 范围选择', '⌘ Ctrl / Shift + 点击'],
  ['框选用例', 'Shift + 拖空白'], ['搜索节点', '/'], ['上一个 / 下一个匹配', 'Shift + Enter / Enter'],
  ['撤销 / 重做', '⌘ Ctrl + Z / Shift Z'], ['复制 / 剪切 / 粘贴子树', '⌘ Ctrl + C / X / V'], ['删除选中节点', 'Delete'],
  ['用例状态', '1 通过 · 2 失败 · 3 阻塞 · 4 跳过 · 0 待执行'], ['平移 / 缩放', '拖空白 / ⌘ Ctrl + 滚轮'],
]

watch([query, statusFilters, priorityFilters], () => {
  matchIndex.value = -1
  clearSelection()
  const navigation = ++filterNavigation
  nextTick(() => {
    if (navigation !== filterNavigation) return
    if (matchIds.value.length) navigateMatch(1)
    else map.value?.fit()
  })
}, { deep: true })
watch(layout, ({ entries }) => {
  const visible = new Set(entries.map(({ node }) => node.id))
  const next = new Set([...selected.value].filter((id) => visible.has(id)))
  if (next.size !== selected.value.size) selected.value = next
  if (editing.value && !visible.has(editing.value)) editing.value = null
  if (matchIndex.value >= matchIds.value.length) matchIndex.value = matchIds.value.length - 1
})

function notify(message, undoable = false) {
  notice.value = message
  offerUndo.value = undoable
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, undoable ? 6000 : 3200)
}
function persist() {
  const version = ++writeVersion
  const snapshot = clone(workspace.value)
  saveState.value = 'saving'
  writeQueue = writeQueue.catch(() => {}).then(() => saveWorkspace(snapshot)).then(() => {
    if (version === writeVersion) saveState.value = 'ready'
  }).catch(() => {
    if (version === writeVersion) saveState.value = 'error'
  })
  return writeQueue
}
function checkpoint() { return { workspace: clone(workspace.value), selected: [...selected.value] } }
function edit(update, message) {
  past.value = [...past.value.slice(-24), checkpoint()]
  future.value = []
  update()
  void persist()
  if (message) notify(message, true)
}
function restore(from, to, message) {
  if (!from.value.length) return
  const previous = from.value.at(-1)
  const switched = previous.workspace.activeId !== workspace.value.activeId
  from.value = from.value.slice(0, -1)
  to.value = [...to.value, checkpoint()]
  if (switched) resetView()
  workspace.value = previous.workspace
  selected.value = new Set(previous.selected)
  editing.value = null
  void persist()
  notify(message)
}
function undo() { restore(past, future, '已撤销') }
function redo() { restore(future, past, '已重做') }

function resetView() {
  clearFilters()
  clearSelection()
  collapsed.value = new Set()
  editing.value = null
  popup.value = ''
  statusMenu.value = null
}
function switchDoc(id) {
  if (id === doc.value.id) { popup.value = ''; return }
  resetView()
  past.value = []
  future.value = []
  workspace.value.activeId = id
  void persist()
}
function togglePopup(key) { popup.value = popup.value === key ? '' : key; statusMenu.value = null }
function clearFilters() {
  query.value = ''
  statusFilters.value = []
  priorityFilters.value = []
}
function toggleFilter(filters, key) {
  const index = filters.indexOf(key)
  if (index >= 0) filters.splice(index, 1)
  else filters.push(key)
}
function navigateMatch(direction) {
  const count = matchIds.value.length
  if (!count) return
  const start = matchIndex.value >= 0 ? matchIndex.value : direction < 0 ? 0 : -1
  matchIndex.value = (start + direction + count) % count
  const id = matchIds.value[matchIndex.value]
  if (id) { selectOne(id); map.value?.focusNode(id, true) }
}
function handleSearchKeys(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    navigateMatch(event.shiftKey ? -1 : 1)
  } else if (event.key === 'Escape') query.value = ''
}
function clearSelection() { selected.value = new Set(); anchor = null }
function selectOne(id) { selected.value = new Set([id]); anchor = id }
function selectMany(ids) { selected.value = new Set(ids); anchor = ids[0] || null }
function selectNode(id, event) {
  statusMenu.value = null
  if (event.shiftKey && anchor) {
    const visible = layout.value.entries.map(({ node }) => node.id)
    const start = visible.indexOf(anchor)
    const end = visible.indexOf(id)
    if (start >= 0 && end >= 0) {
      selected.value = new Set(visible.slice(Math.min(start, end), Math.max(start, end) + 1).filter((key) => treeIndex.value.get(key)?.node.kind === 'case'))
      if (selected.value.size) { map.value?.focus(); return }
    }
  }
  if (event.metaKey || event.ctrlKey) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    anchor = id
  } else selectOne(id)
  map.value?.focus()
}
function toggleFold(id) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
function startEdit(id) {
  if (!treeIndex.value.has(id)) return
  selectOne(id)
  editing.value = id
}
function endEdit(id, returnFocus) {
  if (editing.value !== id) return
  editing.value = null
  if (returnFocus) map.value?.focus()
}
function renameNode(id, title) {
  const entry = treeIndex.value.get(id)
  if (entry && entry.node.title !== title) edit(() => { entry.node.title = title })
}
function defaultKind(parent) { return parent === doc.value.root ? 'module' : 'case' }
function addNode(direction) {
  if (filtering.value) return
  const active = activeNode.value || doc.value.root
  const entry = treeIndex.value.get(active.id)
  const sibling = direction === 'sibling' && !!entry.parent
  const parent = sibling ? entry.parent : active
  const kind = sibling ? active.kind : defaultKind(parent)
  const child = makeNode(kind === 'module' ? '新模块' : '新用例', kind)
  edit(() => {
    const index = sibling ? parent.children.indexOf(active) + 1 : parent.children.length
    parent.children.splice(index, 0, child)
    collapsed.value.delete(parent.id)
    startEdit(child.id)
  })
  nextTick(() => map.value?.focusNode(child.id))
}
function moveNode(id, parentId) {
  const entry = treeIndex.value.get(id)
  const target = treeIndex.value.get(parentId)
  if (filtering.value || !entry?.parent || !target || target.node.kind === 'case' || entry.parent.id === parentId) return
  let current = target
  while (current) {
    if (current.node.id === id) { notify('不能移动到自己的子节点'); return }
    current = treeIndex.value.get(current.parent?.id)
  }
  edit(() => {
    entry.parent.children.splice(entry.parent.children.indexOf(entry.node), 1)
    target.node.children.push(entry.node)
    collapsed.value.delete(parentId)
    selectOne(id)
  }, '节点已移动')
  nextTick(() => map.value?.focusNode(id))
}
function openStatus(id, bounds) { positionMenu([id], bounds) }
function openBatch(event) { positionMenu(selectedCases.value, event.currentTarget.getBoundingClientRect()) }
function positionMenu(ids, bounds) {
  if (!ids.length) return
  popup.value = ''
  statusMenu.value = { ids, x: Math.max(10, Math.min(bounds.left, window.innerWidth - 177)), y: bounds.bottom + 237 > window.innerHeight ? Math.max(10, bounds.top - 225) : bounds.bottom + 6 }
  nextTick(() => document.querySelector('.status-menu button')?.focus({ preventScroll: true }))
}
function applyMenuStatus(key) {
  if (!statusMenu.value) return
  setStatus(statusMenu.value.ids, key)
  statusMenu.value = null
  map.value?.focus()
}
function setStatus(ids, key) {
  if (!isPlan.value || !statuses[key]) return
  const changed = ids.filter((id) => treeIndex.value.get(id)?.node.kind === 'case' && (doc.value.results[id] || 'unexecuted') !== key)
  if (!changed.length) return
  edit(() => {
    for (const id of changed) {
      if (key === 'unexecuted') delete doc.value.results[id]
      else doc.value.results[id] = key
    }
  }, `${changed.length} 条用例已标记为${statuses[key].label}`)
}
function updateProperty(key, value) {
  const node = activeNode.value
  if (node && node[key] !== value) edit(() => { node[key] = value })
}
async function attachImage(id, file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) { notify('请选择 5 MB 以内的 PNG、JPG、WebP 或 GIF'); return }
  const source = doc.value.id
  const reader = new FileReader()
  reader.onload = () => {
    if (source !== doc.value.id) return
    const node = treeIndex.value.get(id)?.node
    if (node) edit(() => { node.image = reader.result }, '图片已添加')
  }
  reader.onerror = () => notify('图片读取失败')
  reader.readAsDataURL(file)
}

function showDialog(mode) {
  popup.value = ''
  statusMenu.value = null
  dialogMode.value = mode
  dialogName.value = mode === 'rename' ? doc.value.name : mode === 'plan' ? `${doc.value.name} · 回归计划` : ''
  nextTick(() => {
    dialog.value?.showModal()
    const field = dialog.value?.querySelector('input')
    field?.focus()
    field?.select()
  })
}
function saveDialog() {
  const mode = dialogMode.value
  const name = dialogName.value.trim()
  if (!name) return
  if (mode === 'rename') edit(() => { doc.value.name = name }, '名称已更新')
  else {
    const source = doc.value
    const created = { id: newId(), name, root: mode === 'plan' ? clone(source.root) : makeNode(name, 'module'), mode: mode === 'plan' ? 'plan' : 'library', results: {} }
    if (mode === 'plan') created.sourceId = source.id
    edit(() => {
      resetView()
      workspace.value.docs.unshift(created)
      workspace.value.activeId = created.id
      selectOne(created.root.id)
    }, mode === 'plan' ? '测试计划已创建' : '用例库已创建')
  }
  dialog.value?.close()
}
function deleteNodes(ids) {
  const roots = new Set(ids.filter((id) => treeIndex.value.get(id)?.parent))
  if (!roots.size) return
  edit(() => {
    function prune(node) {
      node.children = node.children.filter((child) => {
        if (!roots.has(child.id)) { prune(child); return true }
        for (const removed of indexTree(child).keys()) delete doc.value.results[removed]
        return false
      })
    }
    prune(doc.value.root)
    clearSelection()
  }, '节点已删除')
}
function requestRemove() {
  removalIds.value = [...selected.value].filter((id) => id !== doc.value.root.id)
  if (removalIds.value.length) showDialog('delete-nodes')
}
function confirmDelete() {
  if (dialogMode.value === 'delete-nodes') deleteNodes(removalIds.value)
  else if (workspace.value.docs.length > 1) {
    const id = doc.value.id
    edit(() => {
      resetView()
      workspace.value.docs = workspace.value.docs.filter((item) => item.id !== id)
      workspace.value.activeId = workspace.value.docs[0].id
    }, '文档已删除')
  }
  dialog.value?.close()
}
function previewImage(src) { previewSrc.value = src; showDialog('image') }
async function openImport(event) {
  const files = [...event.target.files]
  event.target.value = ''
  if (!files.length || importing) return
  importing = true
  try {
    const { importMaps } = await import('./interchange.js')
    const documents = []
    const problems = []
    for (const file of files) {
      try { documents.push(...await importMaps(file)) } catch (error) { problems.push(`${file.name}：${error.message}`) }
    }
    if (documents.length) edit(() => {
      resetView()
      workspace.value.docs.unshift(...documents)
      workspace.value.activeId = documents[0].id
    }, `已导入 ${documents.length} 张导图${problems.length ? `，${problems.length} 个文件失败` : ''}`)
    else notify(problems[0] || '导入失败')
  } catch (error) { notify(error.message || '导入失败') }
  finally { importing = false }
}
async function exportDocument() {
  try {
    const { exportMap } = await import('./interchange.js')
    const snapshot = clone(doc.value)
    const url = URL.createObjectURL(await exportMap(snapshot))
    const link = document.createElement('a')
    link.href = url
    link.download = `${snapshot.name.replace(/[\\/:*?"<>|]/g, '_')}.xmind`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('已导出 XMind')
  } catch (error) { notify(error.message || '导出失败') }
}
function navigateNode(key) {
  const entries = layout.value.entries
  const id = activeNode.value?.id
  const item = entries.find((entry) => entry.node.id === id)
  if (!item) { selectOne(entries[0].node.id); map.value?.focusNode(entries[0].node.id); return }
  let next
  if (key === 'ArrowLeft') next = item.parent
  if (key === 'ArrowRight') {
    if (collapsed.value.has(id) && !filtering.value) { toggleFold(id); return }
    next = entries.find((entry) => entry.parent === item)
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const column = entries.filter((entry) => entry.depth === item.depth).sort((a, b) => a.y - b.y)
    next = column[column.indexOf(item) + (key === 'ArrowUp' ? -1 : 1)]
  }
  if (next) { selectOne(next.node.id); map.value?.focusNode(next.node.id) }
}
function handleKeys(event) {
  if (event.isComposing || dialog.value?.open) return
  const key = event.key
  const mod = event.metaKey || event.ctrlKey
  const typing = event.target.closest?.('input, textarea, select, [contenteditable]')
  const onCanvas = !!event.target.closest?.('.map-surface') && !event.target.closest?.('button, .minimap')
  if (key === 'Escape' && (popup.value || statusMenu.value)) { popup.value = ''; statusMenu.value = null; return }
  if ((key === '/' && !mod && !typing || mod && key.toLowerCase() === 'f')) { event.preventDefault(); searchInput.value?.focus(); return }
  if (typing || statusMenu.value || popup.value) return
  if (mod && key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
  if (!onCanvas || event.altKey) return
  if (mod && ['c', 'x'].includes(key.toLowerCase()) && activeNode.value) {
    if (key.toLowerCase() === 'x' && (filtering.value || activeNode.value === doc.value.root)) return
    event.preventDefault()
    clipboard = clone(activeNode.value)
    if (key.toLowerCase() === 'x') deleteNodes([activeNode.value.id])
    else notify('已复制子树')
    return
  }
  if (mod) return
  if (['Tab', 'Enter'].includes(key) && !event.shiftKey && selected.value.size && !filtering.value && !event.defaultPrevented) {
    event.preventDefault()
    addNode(key === 'Tab' ? 'child' : 'sibling')
  } else if (key === 'F2' && activeNode.value) {
    event.preventDefault()
    startEdit(activeNode.value.id)
  } else if (key.startsWith('Arrow')) {
    event.preventDefault()
    navigateNode(key)
  } else if (key === 'Delete' || key === 'Backspace') {
    event.preventDefault()
    requestRemove()
  } else if (key === 'Escape') clearSelection()
  else if (isPlan.value && selectedCases.value.length && ['0', '1', '2', '3', '4'].includes(key)) {
    event.preventDefault()
    setStatus(selectedCases.value, ['unexecuted', 'passed', 'failed', 'blocked', 'skipped'][Number(key)])
  }
}
function handlePaste(event) {
  if (!event.target.closest?.('.map-surface') || event.target.closest?.('input, textarea') || dialog.value?.open) return
  const image = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith('image/'))
  if (image && activeNode.value) { event.preventDefault(); void attachImage(activeNode.value.id, image); return }
  if (!clipboard || filtering.value) return
  event.preventDefault()
  const parent = activeNode.value || doc.value.root
  const child = duplicateTree(clipboard)
  edit(() => { parent.children.push(child); collapsed.value.delete(parent.id); selectOne(child.id) }, '已粘贴子树')
  nextTick(() => map.value?.focusNode(child.id))
}
function closePopupOnOutside(event) {
  if (!event.target.closest('[data-popup-anchor], .node-status')) {
    popup.value = ''
    statusMenu.value = null
  }
}
onMounted(async () => {
  window.addEventListener('keydown', handleKeys)
  window.addEventListener('paste', handlePaste)
  window.addEventListener('pointerdown', closePopupOnOutside)
  try {
    const saved = await readWorkspace()
    if (!writeVersion && saved?.docs?.length) {
      workspace.value = saved
      if (doc.value.id !== 'demo-plan') clearSelection()
    }
  } catch { saveState.value = 'error' }
})
onBeforeUnmount(() => {
  clearTimeout(noticeTimer)
  window.removeEventListener('keydown', handleKeys)
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('pointerdown', closePopupOnOutside)
})
</script>
