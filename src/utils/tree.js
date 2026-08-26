let idCounter = 0

/** 生成唯一节点 id */
export function genId() {
  idCounter += 1
  return `n_${idCounter.toString(36)}_${Math.floor(performance.now() * 1000).toString(36)}`
}

/** 深拷贝一棵树,并为每个节点重新生成 id(快照用) */
export function cloneTreeWithNewIds(node) {
  const copy = {
    id: genId(),
    title: node.title,
    children: (node.children || []).map(cloneTreeWithNewIds),
  }
  if (node.image) copy.image = { ...node.image }
  if (node.priority) copy.priority = node.priority
  if (node.icon) copy.icon = node.icon
  if (node.note) copy.note = node.note
  if (node.color) copy.color = node.color
  return copy
}

/** 深拷贝,保留原 id */
export function cloneTree(node) {
  return JSON.parse(JSON.stringify(node))
}

/** 遍历整棵树 */
export function walkTree(node, fn, parent = null) {
  fn(node, parent)
  ;(node.children || []).forEach((c) => walkTree(c, fn, node))
}

/** 收集所有叶子节点(最右侧节点 = 一条 case) */
export function getLeaves(root) {
  const leaves = []
  walkTree(root, (n) => {
    if (!n.children || n.children.length === 0) leaves.push(n)
  })
  return leaves
}

/**
 * 统计树的 case 执行情况
 * results: { [nodeId]: 'passed' | 'failed' | 'blocked' | 'skipped' | 'unexecuted' }
 */
export function computeStats(root, results = {}) {
  const stats = { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, unexecuted: 0 }
  for (const leaf of getLeaves(root)) {
    const s = results[leaf.id] || 'unexecuted'
    stats.total += 1
    if (stats[s] !== undefined) stats[s] += 1
    else stats.unexecuted += 1
  }
  stats.executed = stats.passed + stats.failed + stats.blocked + stats.skipped
  stats.passRate = stats.total === 0 ? 0 : Math.round((stats.passed / stats.total) * 1000) / 10
  stats.execRate = stats.total === 0 ? 0 : Math.round((stats.executed / stats.total) * 1000) / 10
  return stats
}

/** 计算单个子树的统计(用于父节点进度展示) */
export function computeNodeStats(node, results = {}) {
  const leaves = []
  walkTree(node, (n) => {
    if (!n.children || n.children.length === 0) leaves.push(n)
  })
  const total = leaves.length
  const passed = leaves.filter((l) => results[l.id] === 'passed').length
  return { total, passed }
}

/** 在树中查找节点及其父节点 */
export function findNode(root, id, parent = null) {
  if (root.id === id) return { node: root, parent }
  for (const c of root.children || []) {
    const found = findNode(c, id, root)
    if (found) return found
  }
  return null
}

/** 新建一个空白根节点 */
export function createRoot(title = '中心主题') {
  return { id: genId(), title, children: [] }
}

/**
 * 按叶子节点谓词裁剪树:叶子不匹配则移除,父节点没有任何保留的后代则一并移除。
 * 返回裁剪后的新树(节点引用原对象),完全不匹配时返回 null。
 * leafPred(leaf, ancestors) → boolean
 */
export function filterTree(root, leafPred, ancestors = []) {
  const kids = root.children || []
  if (kids.length === 0) {
    return leafPred(root, ancestors) ? root : null
  }
  const filteredChildren = kids
    .map((c) => filterTree(c, leafPred, [...ancestors, root]))
    .filter(Boolean)
  if (filteredChildren.length === 0) return null
  return { ...root, children: filteredChildren }
}

/**
 * 构造用例过滤谓词。
 * keyword: 命中用例标题或任意祖先标题即保留
 * priorities: 如 ['P0','P1'],空数组 = 不过滤
 * statuses: 如 ['passed','failed'],空数组 = 不过滤(需要 results 映射)
 */
export function caseFilter({ keyword = '', priorities = [], statuses = [] } = {}, results = {}) {
  const kw = keyword.trim().toLowerCase()
  return (leaf, ancestors) => {
    if (priorities.length && !priorities.includes(leaf.priority)) return false
    if (statuses.length && !statuses.includes(results[leaf.id] || 'unexecuted')) return false
    if (kw) {
      const chain = [...ancestors.map((a) => a.title || ''), leaf.title || '']
        .join('\n')
        .toLowerCase()
      if (!chain.includes(kw)) return false
    }
    return true
  }
}
