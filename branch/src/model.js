export const statuses = {
  unexecuted: { label: '待执行', symbol: '○' },
  passed: { label: '通过', symbol: '✓' },
  failed: { label: '失败', symbol: '×' },
  blocked: { label: '阻塞', symbol: '!' },
  skipped: { label: '跳过', symbol: '–' },
}

export const palette = ['iris', 'ocean', 'peach', 'mint', 'rose', 'gold']
export const newId = () => crypto.randomUUID()
export const clone = (value) => JSON.parse(JSON.stringify(value))

export function makeNode(title, kind = 'case') {
  return { id: newId(), title, kind, priority: '', steps: '', expected: '', note: '', image: null, children: [] }
}

export function indexTree(root) {
  const result = new Map()
  function visit(node, parent = null, depth = 0) {
    result.set(node.id, { node, parent, depth })
    node.children.forEach((child) => visit(child, node, depth + 1))
  }
  if (root) visit(root)
  return result
}

export function casesIn(root) {
  return [...indexTree(root).values()].map(({ node }) => node).filter((node) => node.kind === 'case')
}

export function countStatuses(doc) {
  const counts = { total: 0, unexecuted: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }
  for (const node of casesIn(doc?.root)) {
    counts.total += 1
    counts[doc.results?.[node.id] || 'unexecuted'] += 1
  }
  return counts
}

export function duplicateTree(node) {
  return { ...clone({ ...node, children: [] }), id: newId(), children: node.children.map(duplicateTree) }
}

/** Prune non-matching branches, retaining the actual node objects and their ancestry. */
export function projectTree(root, matches = null) {
  const visit = (node, ordinal = 0) => {
    const children = node.children.map(visit).filter(Boolean)
    return !matches || matches.has(node.id) || children.length || node === root ? { node, children, ordinal } : null
  }
  return visit(root)
}

const demoGroups = [
  ['账号与登录', [
    ['邮箱密码登录', 'P0', 'passed'], ['验证码过期后禁止登录', 'P0', 'failed'], ['登录后恢复原页面', 'P1', 'passed'],
  ]],
  ['搜索与发现', [
    ['关键词搜索返回相关内容', 'P1', 'passed'], ['组合筛选保留选项', 'P1', 'unexecuted'], ['无结果时展示搜索建议', 'P2', 'skipped'],
  ]],
  ['购物车与支付', [
    ['优惠券与会员折扣叠加', 'P1', 'passed'], ['重复点击只生成一笔订单', 'P0', 'blocked'], ['支付失败后可重试', 'P0', 'passed'],
  ]],
  ['设置与权限', [
    ['首次打开时请求通知权限', 'P1', 'passed'], ['拒绝权限后仍可浏览', 'P2', 'unexecuted'], ['注销前展示影响范围', 'P0', 'passed'],
  ]],
]

export function demoWorkspace() {
  const root = { ...makeNode('移动端回归', 'module'), id: 'demo-root' }
  const results = {}
  let number = 0
  root.children = demoGroups.map(([name, entries], groupIndex) => ({
    ...makeNode(name, 'module'), id: `demo-group-${groupIndex}`, color: palette[groupIndex],
    children: entries.map(([title, priority, status]) => {
      const id = `demo-case-${++number}`
      results[id] = status
      return { ...makeNode(title), id, priority }
    }),
  }))
  const selected = root.children[0].children[1]
  selected.steps = '1. 输入手机号并获取验证码。\n2. 等待验证码过期后，输入原验证码并提交。'
  selected.expected = '拒绝本次登录，提示验证码已过期，并允许重新发送。'
  selected.note = '重点检查弱网下的错误提示。'
  const library = { id: 'demo-library', name: '移动端回归用例库', mode: 'library', root, results: {} }
  const plan = { id: 'demo-plan', name: '移动端 2.8 回归', mode: 'plan', sourceId: library.id, root: clone(root), results }
  return { activeId: plan.id, docs: [library, plan] }
}
