import { includesModule, modulePath, outcome, percentage, reference, status, summarize } from './model.js'

export function html(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export const glyph = (symbol) => `<span class="glyph" aria-hidden="true">${symbol}</span>`
const safeImage = (value) => /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value || '') ? value : ''
const selectOption = (value, label, current) => `<option value="${html(value)}" ${value === current ? 'selected' : ''}>${html(label)}</option>`
const chip = (key) => `<span class="status-chip ${key}"><i></i>${status[key].label}</span>`
const priority = (key) => `<span class="priority ${key.toLowerCase()}">${html(key)}</span>`
export const pages = [['overview', '发布总览', '◫'], ['execution', '测试执行', '▷'], ['library', '用例库', '▤']]

export function frame(view, main) {
  const { page, save, data } = view
  const saveLabel = { ready: '已保存', saving: '保存中', error: '保存失败', conflict: '有版本冲突' }[save]
  return `<header class="topbar"><div class="top-inner">
    <a class="brand" href="#overview"><span class="mark" aria-hidden="true"><i></i></span><span>Verdict<span class="brand-period">.</span></span></a>
    <nav aria-label="主导航">${pages.map(([key, label, symbol]) => `<a href="#${key}" ${key === page ? 'aria-current="page"' : ''}>${glyph(symbol)}<span>${label}</span></a>`).join('')}</nav>
    <div class="top-tools"><span class="save-state ${save}" role="status"><i></i>${saveLabel}</span>
      ${save === 'error' ? '<button class="icon-button" data-action="retry" title="重试保存" aria-label="重试保存">↻</button>' : ''}
      ${save === 'conflict' ? '<button class="icon-button" data-action="reload" title="重新加载" aria-label="重新加载">↻</button>' : ''}
      <button class="command" data-action="command" aria-label="全局搜索">${glyph('⌕')}<span>快速搜索</span><kbd>${view.mod} K</kbd></button>
      <span class="avatar" title="本地工作区" aria-label="本地工作区">QA</span>
    </div>
  </div></header>
  <main class="page ${page}-page" id="main" tabindex="-1">${main}</main>
  <footer class="foot"><span>Verdict 工作台</span><span>${data.demo ? '含演示数据 · ' : ''}本地工作区</span><button class="quiet" data-action="help">键盘快捷键 <kbd>?</kbd></button></footer>`
}

const planPicker = (view) => `<div class="context-tools">
  <label class="select-wrap"><span class="sr-only">当前测试计划</span><select id="plan-picker">${view.data.plans.length ? view.data.plans.map((item) => selectOption(item.id, item.name, view.plan?.id)).join('') : '<option value="">暂无测试计划</option>'}</select></label>
  <button class="button outline" data-action="new-plan">${glyph('+')} 新建计划</button>
</div>`

export function overview(view) {
  const { plan } = view
  if (!plan) return `<section class="page-head"><div><h1>发布总览</h1></div>${planPicker(view)}</section>${empty('创建第一份测试计划', '选择一个用例库，开始跟踪发布测试。', 'new-plan', '新建计划')}`
  const counts = summarize(plan)
  const ready = counts.total > 0 && !counts.risk && !counts.todo
  const risks = plan.cases.filter((item) => ['failed', 'blocked'].includes(outcome(plan, item)))
    .sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 4)
  const primary = counts.todo ? '继续执行' : counts.risk ? '复查风险' : '查看执行记录'
  const primaryFilter = counts.todo ? 'todo' : counts.risk ? 'risk' : 'all'
  const metrics = [
    ['passed', '通过', counts.passed, percentage(counts.passed, counts.total)],
    ['failed', '失败', counts.failed, percentage(counts.failed, counts.total)],
    ['blocked', '阻塞', counts.blocked, percentage(counts.blocked, counts.total)],
    ['todo', '待执行', counts.todo, percentage(counts.todo, counts.total)],
    ['skipped', '跳过', counts.skipped, percentage(counts.skipped, counts.total)],
  ]
  const rootModules = plan.modules.filter((group) => group.parentId === null)
  const groups = [...rootModules.map((group) => [group.id, group.title, plan.cases.filter((item) => includesModule(plan, item.moduleId, group.id))])]
  const unassigned = plan.cases.filter((item) => item.moduleId === null)
  if (unassigned.length) groups.push(['unassigned', '未归类', unassigned])
  return `<section class="page-head"><div><div class="page-label"><i></i>发布工作区</div><h1>发布总览</h1></div>${planPicker(view)}</section>
  <section class="release-hero" aria-label="当前发布状态">
    <div class="hero-copy">
      <div class="hero-kicker"><span class="live-dot"></span>${html(plan.environment || '测试环境')} <span class="hero-divider"></span> 当前计划</div>
      <h2>${html(plan.name)}</h2>
      <p>${ready ? '用例已全部执行，当前没有失败或阻塞。' : counts.critical ? `还有 ${counts.critical} 条 P0 风险需要复核。` : counts.todo ? `还有 ${counts.todo} 条用例待执行。` : '执行已完成，请复核剩余风险。'}</p>
      <div class="hero-actions"><button class="button lime" data-action="execute" data-filter="${primaryFilter}" data-open-first="true">${primary} ${glyph('↗')}</button>
        ${primaryFilter === 'todo' && counts.risk ? `<button class="hero-link" data-action="execute" data-filter="risk">查看风险 ${glyph('→')}</button>` : ''}</div>
    </div>
    <div class="hero-viz" role="img" aria-label="执行进度 ${counts.progress}%，已处理 ${counts.completed} 条，共 ${counts.total} 条"><div class="orbit orbit-1"></div><div class="orbit orbit-2"></div><div class="orbit orbit-3"></div>
      <div class="viz-grid"></div><span class="viz-point point-a"></span><span class="viz-point point-b"></span><span class="viz-point point-c"></span>
      <div class="meter" style="--progress:${counts.progress}%"><div class="meter-inner"><strong>${counts.progress}<sup>%</sup></strong><span>执行进度</span></div></div>
      <span class="viz-caption">${counts.completed} / ${counts.total} 已处理</span>
    </div>
  </section>
  <div class="metric-row" aria-label="测试状态概览">${metrics.map(([key, title, count, share]) => `<button class="metric ${key}" data-action="execute" data-filter="${key}"><span class="metric-icon">${status[key].icon}</span><span class="metric-title">${title}</span><span class="metric-number">${count}</span><span class="metric-share">${share}%</span></button>`).join('')}</div>
  <div class="overview-grid">
    <section class="panel"><div class="panel-head"><div><h2>风险待办</h2><p>优先复核失败与阻塞用例</p></div><button class="quiet" data-action="execute" data-filter="risk">查看全部 ${glyph('→')}</button></div>
    <div class="risk-list">${risks.length ? risks.map((item) => `<button class="risk-row" data-action="open-risk" data-id="${html(item.id)}"><span class="risk-icon ${outcome(plan, item)}">${status[outcome(plan, item)].icon}</span>
      <span class="risk-copy"><strong>${html(item.title)}</strong><small>${reference(item)} <span>·</span> ${html(modulePath(plan, item.moduleId))}</small></span>${priority(item.priority)}${chip(outcome(plan, item))}<span class="row-arrow" aria-hidden="true">↗</span></button>`).join('') : '<p class="inline-empty">当前没有失败或阻塞用例。</p>'}</div></section>
    <section class="panel module-panel"><div class="panel-head"><div><h2>模块进度</h2><p>已处理 / 用例总数</p></div><span class="panel-glyph" aria-hidden="true">▥</span></div>
    <div class="module-list">${groups.length ? groups.map(([groupId, title, items]) => {
      const done = items.filter((item) => outcome(plan, item) !== 'todo').length
      return `<button class="module-row" data-action="module-progress" data-module="${html(groupId)}"><span class="module-line"><strong>${html(title)}</strong><span>${done}<i> / </i>${items.length}</span></span><span class="progress-track"><i style="--width:${percentage(done, items.length)}%"></i></span></button>`
    }).join('') : '<p class="inline-empty">当前计划还没有用例。</p>'}</div></section>
  </div>`
}

export function empty(title, note, action, label) {
  return `<div class="empty"><span class="empty-icon" aria-hidden="true">◫</span><h2>${html(title)}</h2><p>${html(note)}</p>${action ? `<button class="button dark" data-action="${action}">${html(label)}</button>` : ''}</div>`
}

function moduleOptions(collection, selected, allLabel = '所有模块') {
  return `${selectOption('all', allLabel, selected)}${collection.modules.map((module) => selectOption(module.id, modulePath(collection, module.id), selected)).join('')}${selectOption('unassigned', '未归类', selected)}`
}

export function workbench(view) {
  const library = view.page === 'library'
  const collection = library ? view.suite : view.plan
  const { shown, selectedId, query, filter, module, priorityFilter, selected } = view
  const sourceList = library ? `<div class="context-tools"><label class="select-wrap"><span class="sr-only">当前用例库</span><select id="suite-picker">${view.data.suites.length ? view.data.suites.map((item) => selectOption(item.id, item.name, collection?.id)).join('') : '<option>暂无用例库</option>'}</select></label><button class="button outline" data-action="import">${glyph('↑')} 导入 XMind</button><button class="button dark" data-action="new-suite">${glyph('+')} 新建用例库</button></div>` : planPicker(view)
  if (!collection) return `<section class="page-head"><div><h1>${library ? '用例库' : '测试执行'}</h1></div>${sourceList}</section>${empty(library ? '还没有用例库' : '还没有测试计划', library ? '创建用例库，或从 XMind 导入用例。' : '从用例库创建测试计划。', library ? 'new-suite' : 'new-plan', library ? '新建用例库' : '新建计划')}`
  const counts = summarize(library ? null : collection)
  const item = shown.find((candidate) => candidate.id === selectedId)
  const countLabel = selected.size ? `已选 ${selected.size} 条` : `${shown.length} 条用例`
  const tabs = [['all', '全部', counts.total], ['todo', '待执行', counts.todo], ['risk', '风险', counts.risk], ['passed', '通过', counts.passed], ['skipped', '跳过', counts.skipped]]
  if (filter === 'failed' || filter === 'blocked') tabs.splice(3, 0, [filter, status[filter].label, counts[filter]])
  const todoComplete = !library && filter === 'todo' && !counts.todo && counts.total > 0
  return `<section class="page-head work-head"><div><div class="page-label"><i></i>${library ? '用例管理' : '发布工作区'}</div><h1>${library ? '用例库' : '测试执行'}</h1></div>${sourceList}</section>
  <div class="bench-title"><div><h2>${html(collection.name)}</h2><span>${library ? `${collection.modules.length} 个模块` : `${counts.completed} / ${counts.total} 已处理`}</span></div><div class="bench-actions">
    ${library ? '<button class="quiet" data-action="structure">模块树</button><button class="quiet" data-action="new-module">＋ 模块</button><button class="button dark small" data-action="new-case">＋ 用例</button>' : ''}
    <button class="icon-button subtle-button" data-action="manage" aria-label="${library ? '用例库选项' : '计划选项'}" title="管理">···</button></div></div>
  <section class="bench ${item ? 'with-detail' : ''}">
    <div class="queue">
      ${library ? `<div class="module-tabs" aria-label="按模块筛选"><button data-action="choose-module" data-module="all" aria-pressed="${module === 'all'}">全部用例</button>${collection.modules.filter((group) => !group.parentId).map((group) => `<button data-action="choose-module" data-module="${html(group.id)}" aria-pressed="${module === group.id}">${html(group.title)}</button>`).join('')}</div>` : `<div class="queue-tabs" aria-label="按状态筛选">${tabs.map(([key, label, count]) => `<button data-action="filter" data-filter="${key}" aria-pressed="${filter === key}">${label}<span>${count}</span></button>`).join('')}</div>`}
      <div class="queue-tools">
        <label class="search-field">${glyph('⌕')}<input id="case-query" type="search" placeholder="搜索用例、编号或模块" aria-label="搜索用例" value="${html(query)}"></label>
        <label class="select-wrap compact"><span class="sr-only">筛选模块</span><select id="module-filter">${moduleOptions(collection, module)}</select></label>
        <label class="select-wrap compact"><span class="sr-only">筛选优先级</span><select id="priority-filter">${[['all', '优先级'], ['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']].map(([key, label]) => selectOption(key, label, priorityFilter)).join('')}</select></label>
      </div>
      <div class="queue-meta"><span role="status">${countLabel}</span><div>${!library && selected.size ? '<button class="quiet" data-action="batch">批量更新状态</button><button class="quiet muted" data-action="clear-selection">清空选择</button>' : query || filter !== 'all' || module !== 'all' || priorityFilter !== 'all' ? '<button class="quiet" data-action="clear-filters">清除筛选</button>' : ''}</div></div>
      ${shown.length ? `<div class="table-shell"><table class="case-table"><thead><tr>${!library ? `<th scope="col" class="check-cell"><input type="checkbox" id="select-all" aria-label="选择全部 ${shown.length} 条筛选结果" ${shown.every((row) => selected.has(row.id)) ? 'checked' : ''}></th>` : ''}<th scope="col">用例</th><th scope="col" class="priority-cell">优先级</th>${library ? '' : '<th scope="col" class="status-cell">状态</th>'}</tr></thead>
      <tbody>${shown.map((row) => `<tr class="${selectedId === row.id ? 'current-row' : ''}" data-case-row="${html(row.id)}">
        ${!library ? `<td class="check-cell"><input type="checkbox" data-case-check="${html(row.id)}" aria-label="选择 ${html(row.title)}" ${selected.has(row.id) ? 'checked' : ''}></td>` : ''}
        <td><button class="case-link" data-action="open-case" data-id="${html(row.id)}" ${selectedId === row.id ? 'aria-current="true"' : ''}><strong>${html(row.title)}</strong><small>${reference(row)} <span>·</span> ${html(modulePath(collection, row.moduleId))}</small></button></td>
        <td class="priority-cell">${priority(row.priority)}</td>${!library ? `<td class="status-cell">${chip(outcome(collection, row))}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : todoComplete ? empty('待执行队列已清空', '所有用例都已记录结果。', 'overview', '返回发布总览') : empty('没有匹配用例', '试试其他关键词或调整筛选条件。', 'clear-filters', '清除筛选')}
    </div>
    ${item ? detail(view, collection, item, library) : ''}
  </section>`
}

function detail(view, collection, item, library) {
  const result = collection.results?.[item.id]
  const position = view.shown.findIndex((row) => row.id === item.id)
  const selected = outcome(collection, item)
  const assetUrl = safeImage(item.image)
  return `<aside class="detail" aria-label="用例详情" tabindex="-1"><div class="detail-header"><span class="case-code">${reference(item)}</span><div class="detail-controls"><span class="case-position">${position + 1} / ${view.shown.length}</span>
  <button class="icon-button" data-action="previous" aria-label="上一条用例" ${position === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" data-action="next" aria-label="下一条用例" ${position === view.shown.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-button close-detail" data-action="close-detail" aria-label="关闭用例详情">×</button></div></div>
  <div class="detail-scroll"><div class="detail-title"><p>${html(modulePath(collection, item.moduleId))} ${priority(item.priority)}</p><h2>${html(item.title)}</h2></div>
  ${library ? `<div class="detail-edit"><button class="button outline small" data-action="edit-case" data-id="${html(item.id)}">编辑用例</button><button class="icon-button" data-action="duplicate" data-id="${html(item.id)}" aria-label="复制用例" title="复制用例">▣</button><button class="icon-button" data-action="delete-case" data-id="${html(item.id)}" aria-label="删除用例" title="删除用例">×</button></div>` : ''}
  <section class="case-section"><h3>测试步骤</h3><p>${html(item.steps || '暂无步骤')}</p></section>
  <section class="case-section expected"><h3>预期结果</h3><p>${html(item.expected || '暂无预期结果')}</p></section>
  ${item.note ? `<section class="case-section"><h3>用例备注</h3><p>${html(item.note)}</p></section>` : ''}
  ${assetUrl ? `<section class="case-section"><h3>附件</h3><button class="attachment" data-action="view-image" data-id="${html(item.id)}"><img src="${assetUrl}" alt="查看用例附件"></button></section>` : ''}
  ${library ? '' : `<section class="case-section execution-note"><label for="execution-note">执行备注</label><textarea id="execution-note" placeholder="记录实际结果、环境或复现信息…">${html(result?.note)}</textarea></section>`}
  </div>${library ? '' : `<div class="result-dock"><div class="result-head"><strong>记录结果</strong><span>${chip(selected)}</span></div><div class="result-actions">${['passed', 'failed', 'blocked', 'skipped'].map((key) => `<button class="result-button ${key}" data-action="result" data-status="${key}" aria-pressed="${selected === key}"><strong>${status[key].icon}</strong>${status[key].short}<kbd>${status[key].key}</kbd></button>`).join('')}</div><div class="dock-footer"><label><input type="checkbox" id="auto-advance" ${view.autoAdvance ? 'checked' : ''}> 标记后自动下一条</label><button class="quiet muted" data-action="result" data-status="todo" ${selected === 'todo' ? 'disabled' : ''}>重置</button></div></div>`}</aside>`
}

export function dialogFrame(title, content, footer = '') {
  return `<div class="dialog-head"><h2 id="dialog-title">${html(title)}</h2><button class="icon-button" data-action="dialog-close" aria-label="关闭对话框">×</button></div><div class="dialog-body">${content}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`
}

export const dialogButtons = (label = '保存', danger = false) => `<button class="button outline" type="button" data-action="dialog-close">取消</button><button class="button ${danger ? 'danger' : 'dark'}" type="submit" form="dialog-form">${html(label)}</button>`
export const field = (label, name, value, extra = '') => `<label class="field"><span>${html(label)}</span><input name="${name}" value="${html(value)}" ${extra}></label>`
const textarea = (label, name, value, placeholder = '') => `<label class="field"><span>${html(label)}</span><textarea name="${name}" placeholder="${html(placeholder)}">${html(value)}</textarea></label>`
export const options = (values, selected) => values.map(([value, label]) => selectOption(value, label, selected)).join('')

export function caseForm(collection, item, selectedModule) {
  const image = safeImage(item?.image)
  return `<form id="dialog-form">
    ${field('用例名称', 'title', item?.title, 'required maxlength="160" autofocus')}
    <div class="form-row"><label class="field"><span>所属模块</span><select name="moduleId">${options([['', '未归类'], ...collection.modules.map((group) => [group.id, modulePath(collection, group.id)])], item ? (item.moduleId || '') : selectedModule)}</select></label>
    <label class="field"><span>优先级</span><select name="priority">${options([['P0', 'P0 · 关键'], ['P1', 'P1 · 重要'], ['P2', 'P2 · 常规']], item?.priority || 'P2')}</select></label></div>
    ${textarea('测试步骤', 'steps', item?.steps, '如何复现或验证？')}${textarea('预期结果', 'expected', item?.expected, '预期看到什么？')}${textarea('用例备注', 'note', item?.note)}
    <label class="field file-field"><span>${image ? '替换附件' : '添加附件'}</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label>
    ${image ? '<label class="check-label"><input type="checkbox" name="removeImage"> 移除现有附件</label>' : ''}
  </form>`
}

export function structure(collection) {
  function lane(parent, depth = 0) {
    const groups = collection.modules.filter((item) => item.parentId === parent)
    const cases = collection.cases.filter((item) => item.moduleId === parent)
    const branches = groups.map((group) => `<li><details ${depth < 1 ? 'open' : ''}><summary><strong>${html(group.title)}</strong><small>${collection.cases.filter((item) => includesModule(collection, item.moduleId, group.id)).length} 条</small></summary>${lane(group.id, depth + 1)}</details></li>`)
    const leaves = cases.map((item) => `<li><button class="tree-case" data-action="tree-case" data-id="${html(item.id)}">${priority(item.priority)} ${html(item.title)}</button></li>`)
    return branches.length || leaves.length ? `<ul class="coverage-tree">${branches.join('')}${leaves.join('')}</ul>` : '<p class="subtle">暂无子模块或用例</p>'
  }
  return lane(null)
}
