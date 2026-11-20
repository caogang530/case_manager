import { id, includesModule, modulePath, outcome, parseMindMap, reference, status } from './model.js'
import { caseForm, dialogButtons, dialogFrame, field, frame, html, options, overview, pages, structure, workbench } from './screens.js'

const app = document.querySelector('#app')
const dialog = document.querySelector('#dialog')
const notice = document.querySelector('#notice')
const fileInput = document.querySelector('#file-input')
const preferences = {
  get(name) { try { return localStorage.getItem(`verdict:${name}`) } catch { return null } },
  set(name, value) { try { localStorage.setItem(`verdict:${name}`, value) } catch { /* optional */ } },
}
const view = {
  data: null, planId: preferences.get('plan'), suiteId: preferences.get('suite'), page: 'overview',
  mod: /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl', autoAdvance: preferences.get('advance') !== 'false',
  filter: 'all', module: 'all', priorityFilter: 'all', query: '', selected: new Set(), selectedId: null, shown: [],
  save: 'ready',
}
const history = []
const future = []
let changeNumber = 0
let savedNumber = 0
let saveTimer
let saveInFlight = false
let pendingFocus = null
let notificationTimer
let submitDialog
let searchResults = []
let searchIndex = 0
let anchorId = null
let noteEditStarted = false

async function api(path, options) {
  const response = await fetch(path, { signal: AbortSignal.timeout(45_000), ...options })
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}))
    throw Object.assign(new Error(problem.error || `请求失败 (${response.status})`), { status: response.status })
  }
  return response
}

function loadSelections() {
  view.plan = view.data.plans.find((item) => item.id === view.planId) || view.data.plans[0]
  view.suite = view.data.suites.find((item) => item.id === view.suiteId) || view.data.suites[0]
  view.planId = view.plan?.id
  view.suiteId = view.suite?.id
}

const currentCollection = () => view.page === 'library' ? view.suite : view.plan

function matchingCases() {
  const collection = currentCollection()
  const query = view.query.trim().toLocaleLowerCase()
  return (collection?.cases || []).filter((item) => {
    if (view.module === 'unassigned' ? item.moduleId !== null : !includesModule(collection, item.moduleId, view.module)) return false
    if (view.priorityFilter !== 'all' && item.priority !== view.priorityFilter) return false
    if (view.page === 'execution' && view.filter !== 'all') {
      const result = outcome(collection, item)
      if (view.filter === 'risk' ? !['failed', 'blocked'].includes(result) : result !== view.filter) return false
    }
    return !query || `${item.title} ${reference(item)} ${modulePath(collection, item.moduleId)}`.toLocaleLowerCase().includes(query)
  })
}

function render({ detailTop = false, tableTop = false } = {}) {
  if (!view.data) return
  loadSelections()
  view.shown = matchingCases()
  const shownIds = new Set(view.shown.map((item) => item.id))
  view.selected = new Set([...view.selected].filter((itemId) => shownIds.has(itemId)))
  if (!shownIds.has(view.selectedId)) view.selectedId = null
  const active = document.activeElement
  const focus = active?.id && app.contains(active) ? active.id : null
  const caret = focus && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null
  const tableScroll = tableTop ? 0 : app.querySelector('.table-shell')?.scrollTop || 0
  const detailScroll = detailTop ? 0 : app.querySelector('.detail-scroll')?.scrollTop || 0
  app.innerHTML = frame(view, view.page === 'overview' ? overview(view) : workbench(view))
  const table = app.querySelector('.table-shell')
  const details = app.querySelector('.detail-scroll')
  if (table) table.scrollTop = tableScroll
  if (details) details.scrollTop = detailScroll
  const all = document.querySelector('#select-all')
  if (all) all.indeterminate = view.selected.size > 0 && view.selected.size < view.shown.length
  if (focus) {
    const target = document.getElementById(focus)
    target?.focus({ preventScroll: true })
    if (caret && target) target.setSelectionRange(...caret)
  }
  if (pendingFocus) {
    const selector = pendingFocus
    pendingFocus = null
    app.querySelector(selector)?.focus({ preventScroll: true })
  }
}

function saveLabel(state) {
  if (view.save === state) return
  view.save = state
  const badge = app.querySelector('.save-state')
  if (!badge || state === 'error' || state === 'conflict' || app.querySelector('[data-action="retry"], [data-action="reload"]')) {
    render()
    return
  }
  badge.className = `save-state ${state}`
  badge.innerHTML = `<i></i>${state === 'ready' ? '已保存' : '保存中'}`
}

function scheduleSave() {
  clearTimeout(saveTimer)
  if (view.save === 'conflict') return
  saveLabel('saving')
  saveTimer = setTimeout(() => { void save() }, 260)
}

async function save() {
  if (saveInFlight || savedNumber === changeNumber || view.save === 'conflict') return
  const generation = changeNumber
  saveInFlight = true
  saveLabel('saving')
  try {
    const response = await api('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(view.data) })
    const { revision } = await response.json()
    view.data.revision = revision
    savedNumber = generation
    if (savedNumber === changeNumber) saveLabel('ready')
    else scheduleSave()
  } catch (error) {
    saveLabel(error.status === 409 ? 'conflict' : 'error')
    toast(error.message)
  } finally {
    saveInFlight = false
  }
}

function edit(update, announce, options = {}) {
  if (options.undo !== false) {
    history.push(checkpoint())
    if (history.length > 20) history.shift()
    future.length = 0
  }
  update()
  changeNumber += 1
  if (options.render !== false) render(options)
  scheduleSave()
  if (announce) toast(announce, options.undo !== false)
}

function checkpoint() {
  return { snapshot: structuredClone(view.data), selectedId: view.selectedId, filter: view.filter, collectionId: currentCollection()?.id }
}

function restore(from, to, label) {
  const step = from.pop()
  if (!step) return
  to.push(checkpoint())
  view.data = { ...step.snapshot, revision: view.data.revision }
  if (step.collectionId === currentCollection()?.id) {
    view.selectedId = step.selectedId
    view.filter = step.filter
  }
  changeNumber += 1
  render()
  scheduleSave()
  toast(label)
}
const undo = () => restore(history, future, '已撤销上一步')
const redo = () => restore(future, history, '已重做上一步')

function toast(text, canUndo = false) {
  clearTimeout(notificationTimer)
  notice.innerHTML = `<span>${html(text)}</span>${canUndo ? '<button data-action="undo">撤销</button>' : ''}<button class="toast-close" data-action="dismiss" aria-label="关闭提示">×</button>`
  notice.classList.add('visible')
  notificationTimer = setTimeout(() => notice.classList.remove('visible'), canUndo ? 6500 : 4000)
}

function resetFilters() {
  view.module = 'all'
  view.filter = 'all'
  view.priorityFilter = 'all'
  view.query = ''
  view.selected = new Set()
  anchorId = null
}

function go(page, params = {}) {
  resetFilters()
  Object.assign(view, { page, selectedId: null }, params)
  const hash = `#${page}`
  if (location.hash !== hash) window.history.pushState(null, '', hash)
  render({ tableTop: true, detailTop: true })
  window.scrollTo(0, 0)
}

function fromLocation() {
  const page = pages.some(([key]) => `#${key}` === location.hash) ? location.hash.slice(1) : 'overview'
  go(page)
}
window.addEventListener('hashchange', fromLocation)

function openCase(itemId, focus = false) {
  if (!view.shown.some((item) => item.id === itemId)) return
  view.selectedId = itemId
  if (focus) pendingFocus = '.detail'
  render({ detailTop: true })
  const table = app.querySelector('.table-shell')
  const row = table?.querySelector(`[data-case-row="${CSS.escape(itemId)}"]`)
  if (row) {
    const area = table.getBoundingClientRect()
    const bounds = row.getBoundingClientRect()
    if (bounds.top < area.top + 34) table.scrollTop += bounds.top - area.top - 34
    if (bounds.bottom > area.bottom) table.scrollTop += bounds.bottom - area.bottom
  }
}

function nextCase(step) {
  const index = view.shown.findIndex((item) => item.id === view.selectedId)
  const next = view.shown[index + step]
  if (next) openCase(next.id)
}

function markCases(ids, key, advance = false) {
  if (!view.plan || !Object.hasOwn(status, key)) return
  const keys = [...new Set(ids)].filter((itemId) => view.plan.cases.some((item) => item.id === itemId))
  const changed = keys.filter((itemId) => (view.plan.results[itemId]?.status || 'todo') !== key)
  if (!changed.length) return
  const current = view.shown.findIndex((item) => item.id === view.selectedId)
  const forward = view.shown[current + 1]?.id
  const previous = view.shown[current - 1]?.id
  edit(() => {
    const time = new Date().toISOString()
    for (const itemId of changed) view.plan.results[itemId] = { ...view.plan.results[itemId], status: key, updatedAt: time }
    const willRemain = matchingCases().some((item) => item.id === view.selectedId)
    if ((advance && view.autoAdvance && forward) || !willRemain) view.selectedId = forward || previous || null
    if (!advance) view.selected = new Set()
  }, `${changed.length} 条用例已标记为${status[key].label}`, { detailTop: advance })
  if (view.selectedId) openCase(view.selectedId)
}

function showDialog(title, content, footer, submit) {
  submitDialog = submit
  dialog.innerHTML = dialogFrame(title, content, footer)
  dialog.setAttribute('aria-labelledby', 'dialog-title')
  if (!dialog.open) dialog.showModal()
  const first = dialog.querySelector('[autofocus], input:not([type="hidden"]), select, textarea')
  first?.focus()
  return dialog
}

function closeDialog() {
  dialog.close()
  submitDialog = null
}

dialog.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!submitDialog) return
  const callback = submitDialog
  if (event.target.dataset.submitting) return
  event.target.dataset.submitting = 'true'
  try {
    event.target.querySelector('.form-error')?.remove()
    await callback(new FormData(event.target), event.target)
  } catch (error) {
    const message = document.createElement('p')
    message.className = 'form-error'
    message.setAttribute('role', 'alert')
    message.textContent = error.message
    event.target.append(message)
  } finally {
    delete event.target.dataset.submitting
  }
})

function createPlan() {
  if (!view.data.suites.length) {
    showDialog('新建测试计划', '<p class="subtle">先创建或导入一份用例库，测试计划会从它创建独立快照。</p>', '<button class="button dark" data-action="new-suite">新建用例库</button>')
    return
  }
  showDialog('新建测试计划', `<form id="dialog-form">${field('发布名称', 'name', '', 'placeholder="例如：移动端 2.9.0" required maxlength="100" autofocus')}
    <label class="field"><span>来源用例库</span><select name="source">${options(view.data.suites.map((suite) => [suite.id, `${suite.name} · ${suite.cases.length} 条`]), view.suiteId)}</select></label>
    ${field('测试环境', 'environment', '预发布环境', 'maxlength="80"')}</form>`, dialogButtons('创建计划'), (data) => {
    const suite = view.data.suites.find((item) => item.id === data.get('source'))
    const name = String(data.get('name')).trim()
    if (!name || !suite) throw new Error('请填写发布名称并选择用例库')
    const plan = { id: id(), name, environment: String(data.get('environment')).trim(), sourceId: suite.id, createdAt: new Date().toISOString(), modules: structuredClone(suite.modules), cases: structuredClone(suite.cases), results: {} }
    closeDialog()
    edit(() => { view.data.plans.unshift(plan); view.planId = plan.id }, '已创建测试计划')
    preferences.set('plan', plan.id)
    go('execution')
  })
}

function createSuite() {
  showDialog('新建用例库', `<form id="dialog-form">${field('用例库名称', 'name', '', 'required maxlength="100" autofocus')}</form>`, dialogButtons('创建用例库'), (data) => {
    const name = String(data.get('name')).trim()
    if (!name) throw new Error('请输入用例库名称')
    const suite = { id: id(), name, modules: [], cases: [] }
    closeDialog()
    edit(() => { view.data.suites.unshift(suite); view.suiteId = suite.id }, '已创建用例库')
    preferences.set('suite', suite.id)
    go('library')
  })
}

function moduleDialog(existing) {
  const collection = currentCollection()
  if (!collection) return
  const allowed = collection.modules.filter((group) => !existing || !includesModule(collection, group.id, existing.id))
  showDialog(existing ? '编辑模块' : '新建模块', `<form id="dialog-form">${field('模块名称', 'title', existing?.title, 'required maxlength="100" autofocus')}
    <label class="field"><span>父模块</span><select name="parent">${options([['', '顶层'], ...allowed.map((group) => [group.id, modulePath(collection, group.id)])], existing ? (existing.parentId || '') : view.module)}</select></label></form>`, dialogButtons(existing ? '保存模块' : '创建模块'), (data) => {
    const title = String(data.get('title')).trim()
    if (!title) throw new Error('请输入模块名称')
    const parentId = data.get('parent') || null
    closeDialog()
    edit(() => {
      if (existing) Object.assign(existing, { title, parentId })
      else collection.modules.push({ id: id(), title, parentId })
    }, existing ? '模块已更新' : '模块已创建')
  })
}

function caseDialog(existing) {
  const collection = view.suite
  if (!collection) return
  showDialog(existing ? '编辑用例' : '新建用例', caseForm(collection, existing, view.module), dialogButtons(existing ? '保存用例' : '创建用例'), async (data) => {
    const title = String(data.get('title')).trim()
    if (!title) throw new Error('请输入用例名称')
    const file = data.get('image')
    let image = data.has('removeImage') ? null : (existing?.image || null)
    if (file?.size) {
      if (file.size > 4 * 1024 * 1024 || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('请选择 4 MB 以内的 PNG、JPG、WebP 或 GIF')
      image = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('无法读取图片'))
        reader.readAsDataURL(file)
      })
    }
    const patch = { title, image, moduleId: data.get('moduleId') || null, priority: data.get('priority'), steps: String(data.get('steps')).trim(), expected: String(data.get('expected')).trim(), note: String(data.get('note')).trim() }
    closeDialog()
    edit(() => {
      if (existing) Object.assign(existing, patch)
      else {
        const item = { ...patch, id: id(), number: nextNumber(collection) }
        collection.cases.push(item)
        resetFilters()
        view.selectedId = item.id
      }
    }, existing ? '用例已更新' : '用例已创建')
    if (view.selectedId) openCase(view.selectedId)
  })
}

function nextNumber(collection) {
  return collection.cases.reduce((max, item) => Math.max(max, item.number), 0) + 1
}

function confirm(title, text, label, callback) {
  showDialog(title, `<form id="dialog-form"><p>${html(text)}</p></form>`, dialogButtons(label, true), () => {
    closeDialog()
    callback()
  })
}

function batch() {
  if (!view.selected.size) return
  const selection = [...view.selected]
  showDialog(`更新 ${selection.length} 条用例`, `<form id="dialog-form"><label class="field"><span>执行状态</span><select name="status">${options(Object.entries(status).map(([key, data]) => [key, data.label]), 'passed')}</select></label></form>`, dialogButtons('应用状态'), (data) => {
    closeDialog()
    markCases(selection, data.get('status'))
  })
}

function manage() {
  const collection = currentCollection()
  const library = view.page === 'library'
  if (!collection) return
  showDialog(library ? '管理用例库' : '管理测试计划', `<div class="manage-actions"><button data-action="rename" class="button outline">重命名</button><button data-action="export" class="button outline">导出 XMind</button>${library ? '<button data-action="structure" class="button outline">查看模块树</button>' : ''}<button data-action="delete-collection" class="button danger">删除</button></div>
  ${library && collection.modules.length ? `<div class="manage-modules"><h3>模块</h3>${collection.modules.map((group) => `<div><span>${html(modulePath(collection, group.id))}</span><button class="quiet" data-action="edit-module" data-id="${html(group.id)}">编辑</button><button class="quiet muted" data-action="delete-module" data-id="${html(group.id)}">移除</button></div>`).join('')}</div>` : ''}`)
}

async function exportCollection(collection) {
  if (!collection) return
  try {
    const response = await api('/api/xmind/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collection) })
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `${collection.name.replace(/[\\/:*?"<>|]/g, '_')}.xmind`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    toast('已导出 XMind')
  } catch (error) {
    toast(error.message)
  }
}

let importing = false
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || importing) return
  importing = true
  toast('正在读取 XMind…')
  try {
    const response = await api('/api/xmind/read', { method: 'POST', body: file })
    const suites = parseMindMap(await response.json())
    edit(() => { view.data.suites.unshift(...suites); view.suiteId = suites[0].id }, `已导入 ${suites.length} 个用例库`)
    preferences.set('suite', suites[0].id)
    go('library')
  } catch (error) {
    toast(error.message)
  } finally {
    importing = false
  }
})

function searchCommand() {
  searchIndex = 0
  showDialog('快速搜索', '<label class="search-field command-field">⌕ <input id="command-query" autocomplete="off" placeholder="搜索计划、用例库或用例" aria-label="关键词" autofocus></label><div id="command-results" class="command-results"></div>', '<span class="subtle">↑ ↓ 移动　Enter 打开　Esc 关闭</span>')
  updateSearch('')
}

function updateSearch(query, reset = true) {
  if (reset) searchIndex = 0
  const term = query.trim().toLocaleLowerCase()
  const plans = view.data.plans.map((plan) => ({ name: plan.name, label: '测试计划', page: 'execution', planId: plan.id }))
  const suites = view.data.suites.map((suite) => ({ name: suite.name, label: '用例库', page: 'library', suiteId: suite.id }))
  const cases = term ? (view.plan?.cases || []).map((item) => ({ name: item.title, label: reference(item), page: 'execution', selectedId: item.id })) : []
  searchResults = [...plans, ...suites, ...cases].filter((item) => `${item.name} ${item.label}`.toLocaleLowerCase().includes(term)).slice(0, 10)
  document.querySelector('#command-results').innerHTML = searchResults.length ? searchResults.map((item, index) => `<button class="command-result ${index === searchIndex ? 'active' : ''}" data-action="command-select" data-index="${index}"><strong>${html(item.name)}</strong><span>${html(item.label)}</span></button>`).join('') : '<p class="subtle">没有匹配的结果</p>'
}

function openSearchResult(index) {
  const result = searchResults[index]
  if (!result) return
  const { page, planId, suiteId, selectedId } = result
  closeDialog()
  if (planId) { view.planId = planId; preferences.set('plan', planId) }
  if (suiteId) { view.suiteId = suiteId; preferences.set('suite', suiteId) }
  go(page, selectedId ? { selectedId } : {})
  if (selectedId) openCase(selectedId, true)
}

const actions = {
  overview() { go('overview') },
  execute(button) {
    go('execution', { filter: button.dataset.filter })
    if (button.dataset.openFirst && view.shown.length) openCase(view.shown[0].id, true)
  },
  'module-progress'(button) { go('execution', { module: button.dataset.module }) },
  'open-risk'(button) { go('execution', { filter: 'risk', selectedId: button.dataset.id }); openCase(button.dataset.id, true) },
  'choose-module'(button) { view.module = button.dataset.module; render({ tableTop: true }) },
  filter(button) { view.filter = button.dataset.filter; render({ tableTop: true }) },
  'clear-filters'() { resetFilters(); render({ tableTop: true }); document.querySelector('#case-query')?.focus() },
  'clear-selection'() { view.selected.clear(); anchorId = null; render() },
  'open-case'(button) { openCase(button.dataset.id, true) },
  'close-detail'() {
    if (view.selectedId) pendingFocus = `[data-action="open-case"][data-id="${CSS.escape(view.selectedId)}"]`
    view.selectedId = null
    render()
  },
  previous() { nextCase(-1) },
  next() { nextCase(1) },
  result(button) { markCases([view.selectedId], button.dataset.status, true) },
  batch,
  'new-plan': createPlan,
  'new-suite': createSuite,
  'new-module'() { moduleDialog() },
  'edit-module'(button) { moduleDialog(view.suite.modules.find((item) => item.id === button.dataset.id)) },
  'delete-module'(button) {
    const suite = view.suite
    const group = suite.modules.find((item) => item.id === button.dataset.id)
    if (!group) return
    confirm('移除模块', `将移除「${group.title}」，其中的用例和子模块会移到上一层。`, '移除模块', () => edit(() => {
      for (const item of suite.modules) if (item.parentId === group.id) item.parentId = group.parentId
      for (const item of suite.cases) if (item.moduleId === group.id) item.moduleId = group.parentId
      suite.modules = suite.modules.filter((item) => item.id !== group.id)
      if (view.module === group.id) view.module = 'all'
    }, '模块已移除'))
  },
  'new-case'() { caseDialog() },
  'edit-case'(button) { caseDialog(view.suite.cases.find((item) => item.id === button.dataset.id)) },
  duplicate(button) {
    const suite = view.suite
    const item = suite.cases.find((candidate) => candidate.id === button.dataset.id)
    if (!item) return
    edit(() => {
      const copy = { ...item, id: id(), number: nextNumber(suite), title: `${item.title}（副本）` }
      suite.cases.push(copy)
      resetFilters()
      view.selectedId = copy.id
    }, '已复制用例')
    openCase(view.selectedId)
  },
  'delete-case'(button) {
    const suite = view.suite
    const item = suite.cases.find((candidate) => candidate.id === button.dataset.id)
    if (!item) return
    confirm('删除用例', `确定删除「${item.title}」？`, '删除用例', () => edit(() => { suite.cases = suite.cases.filter((candidate) => candidate.id !== item.id) }, '用例已删除'))
  },
  manage,
  rename() {
    const collection = currentCollection()
    showDialog('重命名', `<form id="dialog-form">${field('名称', 'name', collection.name, 'required maxlength="100" autofocus')}</form>`, dialogButtons(), (data) => {
      const name = String(data.get('name')).trim()
      if (!name) throw new Error('请输入名称')
      closeDialog()
      edit(() => { collection.name = name }, '名称已更新')
    })
  },
  'delete-collection'() {
    const collection = currentCollection()
    const key = view.page === 'library' ? 'suites' : 'plans'
    confirm('删除当前项目', `确定删除「${collection.name}」及其内容？`, '删除', () => edit(() => {
      view.data[key] = view.data[key].filter((item) => item.id !== collection.id)
      resetFilters()
    }, '已删除'))
  },
  import() { fileInput.click() },
  export() { closeDialog(); void exportCollection(currentCollection()) },
  structure() { showDialog('模块覆盖', structure(currentCollection())) },
  'tree-case'(button) { const itemId = button.dataset.id; closeDialog(); resetFilters(); openCaseAfterReset(itemId) },
  'view-image'(button) {
    const item = currentCollection().cases.find((candidate) => candidate.id === button.dataset.id)
    if (item && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(item.image || '')) {
      showDialog('用例附件', `<img class="preview-image" src="${item.image}" alt="${html(item.title)}的附件">`)
    }
  },
  command: searchCommand,
  'command-select'(button) { openSearchResult(Number(button.dataset.index)) },
  'dialog-close': closeDialog,
  help() {
    showDialog('键盘快捷键', `<dl class="hotkeys">${[[`${view.mod} K`, '快速搜索'], ['/', '搜索当前用例'], ['J / K', '下一条 / 上一条用例'], ['1 / 2 / 3 / 4', '通过 / 失败 / 阻塞 / 跳过'], ['0', '重置为待执行'], [`${view.mod} Z`, '撤销上一步'], [`${view.mod} Shift Z`, '重做上一步'], ['Esc', '关闭详情或弹窗']].map(([key, description]) => `<div><dt>${description}</dt><dd><kbd>${key}</kbd></dd></div>`).join('')}</dl>`)
  },
  retry() { void save() },
  reload() { confirm('重新加载工作台', '重新加载会丢弃此页面尚未保存的修改。', '重新加载', () => { savedNumber = changeNumber; location.reload() }) },
  undo,
  dismiss() { notice.classList.remove('visible') },
}

function openCaseAfterReset(itemId) {
  render({ tableTop: true })
  openCase(itemId, true)
}

let shiftChange = false

document.addEventListener('click', (event) => {
  if (event.target.matches('[data-case-check]')) shiftChange = event.shiftKey
  const link = event.target.closest('a[href^="#"]')
  if (link && pages.some(([key]) => link.hash === `#${key}`) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault()
    go(link.hash.slice(1))
    document.querySelector('#main')?.focus({ preventScroll: true })
    return
  }
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog()
  }
  const button = event.target.closest('[data-action]')
  if (!button || button.disabled || !view.data && button.dataset.action !== 'boot-retry') return
  const callback = actions[button.dataset.action]
  if (callback) callback(button)
})

document.addEventListener('change', (event) => {
  const target = event.target
  if (target.id === 'plan-picker' || target.id === 'suite-picker') {
    const key = target.id === 'plan-picker' ? 'plan' : 'suite'
    view[`${key}Id`] = target.value
    preferences.set(key, target.value)
    go(view.page)
    document.getElementById(target.id)?.focus({ preventScroll: true })
  } else if (target.id === 'module-filter' || target.id === 'priority-filter') {
    view[target.id === 'module-filter' ? 'module' : 'priorityFilter'] = target.value
    render({ tableTop: true })
  } else if (target.id === 'auto-advance') {
    view.autoAdvance = target.checked
    preferences.set('advance', target.checked)
  } else if (target.id === 'select-all') {
    view.selected = new Set(target.checked ? view.shown.map((item) => item.id) : [])
    render()
  } else if (target.matches('[data-case-check]')) {
    const itemId = target.dataset.caseCheck
    const previous = view.shown.findIndex((item) => item.id === anchorId)
    const index = view.shown.findIndex((item) => item.id === itemId)
    const range = shiftChange && previous >= 0 ? view.shown.slice(Math.min(previous, index), Math.max(previous, index) + 1).map((item) => item.id) : [itemId]
    for (const key of range) {
      if (target.checked) view.selected.add(key)
      else view.selected.delete(key)
    }
    shiftChange = false
    anchorId = itemId
    pendingFocus = `[data-case-check="${CSS.escape(itemId)}"]`
    render()
  }
})

document.addEventListener('input', (event) => {
  const target = event.target
  if (target.id === 'case-query') {
    view.query = target.value
    if (!event.isComposing) render({ tableTop: true })
  } else if (target.id === 'command-query') {
    updateSearch(target.value)
  } else if (target.id === 'execution-note' && view.plan) {
    const itemId = view.selectedId
    const note = target.value
    edit(() => { view.plan.results[itemId] = { status: 'todo', ...view.plan.results[itemId], note } }, null, { undo: !noteEditStarted, render: false })
    noteEditStarted = true
  }
})

document.addEventListener('focusin', (event) => {
  if (event.target.id === 'execution-note') noteEditStarted = false
})

document.addEventListener('compositionend', (event) => {
  if (event.target.id === 'case-query') render({ tableTop: true })
})

document.addEventListener('keydown', (event) => {
  if (event.isComposing || !view.data) return
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()
  if (dialog.open) {
    const search = document.querySelector('#command-query')
    if (search && (key === 'arrowup' || key === 'arrowdown')) {
      event.preventDefault()
      if (searchResults.length) searchIndex = (searchIndex + (key === 'arrowup' ? -1 : 1) + searchResults.length) % searchResults.length
      updateSearch(search.value, false)
    } else if (search && key === 'enter' && event.target === search) {
      event.preventDefault()
      openSearchResult(searchIndex)
    }
    return
  }
  if (mod && key === 'k') {
    event.preventDefault()
    searchCommand()
    return
  }
  if (event.target.closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable]')) return
  if (mod && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if (!mod && !event.altKey) {
    if (key === '?') actions.help()
    if (key === '/' && view.page !== 'overview') {
      event.preventDefault()
      document.querySelector('#case-query')?.focus()
    }
    if (key === 'escape' && view.selectedId) actions['close-detail']()
    if (view.page === 'overview') return
    if (key === 'j' || key === 'k') {
      event.preventDefault()
      nextCase(key === 'j' ? 1 : -1)
    }
    const result = Object.keys(status).find((statusKey) => status[statusKey].key === key)
    if (result && view.page === 'execution' && (view.selected.size || view.selectedId)) {
      event.preventDefault()
      if (view.selected.size) markCases([...view.selected], result)
      else markCases([view.selectedId], result, true)
    }
  }
})

window.addEventListener('beforeunload', (event) => {
  if (changeNumber !== savedNumber) event.preventDefault()
})

actions['boot-retry'] = boot
async function boot() {
  try {
    view.data = await (await api('/api/workspace')).json()
    fromLocation()
  } catch (error) {
    app.innerHTML = `<main class="boot" id="main"><strong>工作台载入失败</strong><span>${html(error.message)}</span><button class="button dark" data-action="boot-retry">重试</button></main>`
  }
}
void boot()
