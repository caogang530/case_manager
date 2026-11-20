export const status = {
  todo: { label: '待执行', short: '待执行', icon: '○', key: '0' },
  passed: { label: '通过', short: '通过', icon: '✓', key: '1' },
  failed: { label: '失败', short: '失败', icon: '×', key: '2' },
  blocked: { label: '阻塞', short: '阻塞', icon: '!', key: '3' },
  skipped: { label: '跳过', short: '跳过', icon: '–', key: '4' },
}

export const id = () => crypto.randomUUID()
export const outcome = (plan, item) => plan?.results?.[item.id]?.status || 'todo'
export const reference = (item) => `TC-${String(item.number).padStart(3, '0')}`
export const percentage = (count, total) => total ? Math.round(count * 100 / total) : 0

export function summarize(plan) {
  const counts = { todo: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, total: 0, critical: 0 }
  for (const item of plan?.cases || []) {
    const key = outcome(plan, item)
    counts.total += 1
    counts[Object.hasOwn(status, key) ? key : 'todo'] += 1
    if ((key === 'failed' || key === 'blocked') && item.priority === 'P0') counts.critical += 1
  }
  counts.completed = counts.total - counts.todo
  counts.progress = percentage(counts.completed, counts.total)
  counts.risk = counts.failed + counts.blocked
  return counts
}

export function modulePath(collection, id) {
  const parts = []
  const visited = new Set()
  let current = id
  while (current && !visited.has(current)) {
    visited.add(current)
    const group = collection?.modules.find((item) => item.id === current)
    if (!group) break
    parts.unshift(group.title)
    current = group.parentId
  }
  return parts.join(' / ') || '未归类'
}

export function includesModule(collection, current, parent) {
  if (parent === 'all') return true
  const seen = new Set()
  while (current && !seen.has(current)) {
    if (current === parent) return true
    seen.add(current)
    current = collection.modules.find((item) => item.id === current)?.parentId
  }
  return false
}

const sanitize = (input, fallback = '') => typeof input === 'string' && input.trim() ? input.trim() : fallback

export function parseMindMap(document) {
  const roots = document.format === 'xml' ? parseXml(document.content) : JSON.parse(document.content)
  if (!Array.isArray(roots) || !roots.length) throw new Error('文件中没有可导入的用例库')
  const result = []
  for (const sheet of roots) {
    if (!sheet.rootTopic) continue
    const suite = { id: id(), name: sanitize(sheet.title, sanitize(sheet.rootTopic.title, '导入用例库')), modules: [], cases: [] }
    function branch(node, parent, depth) {
      if (!node || depth > 100 || suite.modules.length + suite.cases.length >= 15000) throw new Error('导图层级或节点数超过限制')
      const attached = node.children?.attached || []
      const title = sanitize(node.title, '未命名')
      if (attached.length || node.verdict?.module) {
        const group = { id: id(), title, parentId: parent }
        suite.modules.push(group)
        for (const child of attached) branch(child, group.id, depth + 1)
        return
      }
      const marker = (node.markers || []).find((item) => /^priority-[1-3]$/.test(item.markerId))?.markerId
      const imagePath = node.image?.src?.replace(/^xap:/, '')
      suite.cases.push({ id: id(), number: suite.cases.length + 1, title, moduleId: parent,
        priority: marker ? `P${Number(marker.at(-1)) - 1}` : 'P2', steps: sanitize(node.verdict?.steps), expected: sanitize(node.verdict?.expected),
        note: sanitize(node.verdict?.note, node.verdict ? '' : sanitize(node.notes?.plain?.content)), image: document.images[imagePath] || null })
    }
    const children = sheet.rootTopic.children?.attached || []
    if (children.length) for (const child of children) branch(child, null, 0)
    else if (!sheet.rootTopic.verdict?.root) branch(sheet.rootTopic, null, 0)
    result.push(suite)
  }
  if (!result.length) throw new Error('文件中没有可导入的工作表')
  return result
}

function parseXml(source) {
  const xml = new DOMParser().parseFromString(source, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('XMind XML 内容无效')
  const byTag = (element, tag) => [...element.children].find((node) => node.localName === tag)
  function topic(element, depth) {
    if (depth > 100) throw new Error('导图层级超过限制')
    const title = byTag(element, 'title')?.textContent
    const topics = byTag(element, 'children')?.children || []
    const items = [...topics].filter((node) => node.localName === 'topics' && node.getAttribute('type') !== 'detached').flatMap((node) => [...node.children])
    return {
      title, children: { attached: items.filter((node) => node.localName === 'topic').map((node) => topic(node, depth + 1)) },
      notes: { plain: { content: byTag(byTag(element, 'notes') || element, 'plain')?.textContent } },
      markers: [...(byTag(element, 'marker-refs')?.children || [])].map((node) => ({ markerId: node.getAttribute('marker-id') || '' })),
      image: { src: byTag(element, 'img')?.getAttribute('xhtml:src') || byTag(element, 'img')?.getAttribute('src') },
    }
  }
  return [...xml.getElementsByTagNameNS('*', 'sheet')].flatMap((sheet) => {
    const root = byTag(sheet, 'topic')
    return root ? [{ title: byTag(sheet, 'title')?.textContent, rootTopic: topic(root, 0) }] : []
  })
}
