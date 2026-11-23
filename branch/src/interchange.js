import JSZip from 'jszip'
import { makeNode, newId, palette, statuses } from './model.js'
import { iconByMarker, iconsFor } from './nodeIcons.js'

const mime = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif', bmp: 'bmp', svg: 'svg+xml' }
const resultMarkers = { passed: 'task-done', failed: 'symbol-wrong', blocked: 'symbol-pause', skipped: 'symbol-minus' }
const byMarker = Object.fromEntries(Object.entries(resultMarkers).map(([key, marker]) => [marker, key]))
const childOf = (element, name) => [...(element?.children || [])].find((child) => child.localName === name)

function xmlSheets(source) {
  const xml = new DOMParser().parseFromString(source, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('XMind 工作表格式错误')
  function topic(element, depth = 0) {
    if (depth > 100) throw new Error('导图层级超过 100 层')
    const image = childOf(element, 'image') || childOf(element, 'img')
    return {
      title: childOf(element, 'title')?.textContent,
      notes: { plain: { content: childOf(childOf(element, 'notes'), 'plain')?.textContent } },
      image: { src: image?.getAttribute('xlink:href') || image?.getAttribute('xhtml:src') || image?.getAttribute('src') },
      markers: [...(childOf(element, 'marker-refs')?.children || [])].map((child) => ({ markerId: child.getAttribute('marker-id') })),
      children: { attached: [...(childOf(element, 'children')?.children || [])].flatMap((topics) =>
        [...topics.children].filter((item) => item.localName === 'topic').map((child) => topic(child, depth + 1))) },
    }
  }
  return [...xml.getElementsByTagNameNS('*', 'sheet')].filter((sheet) => childOf(sheet, 'topic')).map((sheet) => ({
    title: childOf(sheet, 'title')?.textContent, rootTopic: topic(childOf(sheet, 'topic')),
  }))
}

export async function importMaps(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const json = zip.file('content.json')
  const xml = zip.file('content.xml')
  const sheets = json ? JSON.parse((await json.async('string')).replace(/^\uFEFF/, '')) : xml ? xmlSheets(await xml.async('string')) : []
  if (!Array.isArray(sheets) || !sheets.length) throw new Error('没有可导入的 XMind 工作表')
  const docs = []
  for (const sheet of sheets) {
    if (!sheet.rootTopic) continue
    const results = {}
    const text = (value) => typeof value === 'string' ? value : ''
    async function convert(topic, depth) {
      if (depth > 100) throw new Error('导图层级超过 100 层')
      const children = [...(topic.children?.attached || []), ...(topic.children?.detached || [])]
      const extra = topic.branch || {}
      const node = makeNode(text(topic.title).trim() || '未命名', depth === 0 || extra.kind === 'module' || children.length && extra.kind !== 'case' ? 'module' : 'case')
      node.steps = text(extra.steps)
      node.expected = text(extra.expected)
      node.note = text(extra.note ?? topic.xcmExtra?.note ?? topic.notes?.plain?.content)
      if (palette.includes(extra.color)) node.color = extra.color
      if (statuses[extra.status] && node.kind === 'case' && extra.status !== 'unexecuted') results[node.id] = extra.status
      const markerIcons = []
      for (const { markerId } of topic.markers || []) {
        if (/^priority-[1-3]$/.test(markerId)) node.priority = `P${Number(markerId.at(-1)) - 1}`
        if (byMarker[markerId] && node.kind === 'case') results[node.id] ||= byMarker[markerId]
        if (iconByMarker.has(markerId)) markerIcons.push(iconByMarker.get(markerId))
      }
      const icons = iconsFor(Array.isArray(extra.icons) ? extra.icons : markerIcons)
      if (icons.length) node.icons = icons.map(({ id }) => id)
      const path = text(topic.image?.src).replace(/^xap:/, '')
      const type = mime[path.split('.').at(-1)?.toLowerCase()]
      const entry = type && path.startsWith('resources/') && zip.file(path)
      if (entry) node.image = `data:image/${type};base64,${await entry.async('base64')}`
      for (const child of children) node.children.push(await convert(child, depth + 1))
      return node
    }
    const root = await convert(sheet.rootTopic, 0)
    docs.push({ id: newId(), name: text(sheet.title).trim() || root.title, mode: sheet.branchMode === 'plan' || Object.keys(results).length ? 'plan' : 'library', root, results })
  }
  if (!docs.length) throw new Error('没有可导入的 XMind 工作表')
  return docs
}

export async function exportMap(doc) {
  const zip = new JSZip()
  function topic(node) {
    const result = { id: node.id, title: node.title,
      branch: { kind: node.kind, steps: node.steps, expected: node.expected, note: node.note, color: node.color } }
    const execution = doc.results?.[node.id]
    const markers = []
    if (/^P[0-2]$/.test(node.priority)) markers.push(`priority-${Number(node.priority[1]) + 1}`)
    if (resultMarkers[execution]) markers.push(resultMarkers[execution])
    const icons = iconsFor(node.icons)
    if (icons.length) result.branch.icons = icons.map(({ id }) => id)
    for (const { marker } of icons) {
      if (marker) markers.push(marker)
    }
    if (markers.length) result.markers = markers.map((markerId) => ({ markerId }))
    const notes = [node.steps, node.expected, node.note].filter(Boolean).join('\n\n')
    if (notes) result.notes = { plain: { content: notes } }
    const image = /^data:image\/(png|jpeg|gif|webp|bmp|svg\+xml);base64,(.+)$/.exec(node.image || '')
    if (image) {
      const path = `resources/${node.id}.${image[1] === 'svg+xml' ? 'svg' : image[1]}`
      zip.file(path, image[2], { base64: true })
      result.image = { src: `xap:${path}` }
    }
    if (node.children.length) result.children = { attached: node.children.map(topic) }
    return result
  }
  const id = newId()
  zip.file('content.json', JSON.stringify([{ id, class: 'sheet', title: doc.name, branchMode: doc.mode, rootTopic: topic(doc.root) }]))
  zip.file('metadata.json', JSON.stringify({ activeSheetId: id, creator: { name: 'Branch' } }))
  zip.file('manifest.json', JSON.stringify({ 'file-entries': Object.fromEntries(Object.keys(zip.files).filter((path) => !zip.files[path].dir).map((path) => [path, {}])) }))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.xmind.workbook' })
}
