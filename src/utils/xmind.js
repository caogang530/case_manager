import JSZip from 'jszip'
import { genId } from './tree'
import { ICON_BY_KEY, MARKER_TO_ICON } from './nodeProps'

/**
 * 标准 .xmind 文件导入导出。
 * .xmind 是一个 zip,核心内容为 content.json(XMind Zen/2020+)
 * 或 content.xml(XMind 8),这里两种都能解析,导出使用 content.json。
 */

/** 状态 → XMind marker 映射,导出计划时把执行结果写进 marker */
const STATUS_TO_MARKER = {
  passed: 'task-done',
  failed: 'symbol-wrong',
  blocked: 'symbol-pause',
}

/** 优先级 → XMind priority marker 映射 */
const PRIORITY_TO_MARKER = {
  P0: 'priority-1',
  P1: 'priority-2',
  P2: 'priority-3',
}
const MARKER_TO_PRIORITY = Object.fromEntries(
  Object.entries(PRIORITY_TO_MARKER).map(([p, m]) => [m, p])
)

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
}

/** 从 zip 中读取 xap:resources/xxx 引用的图片,转为 dataURL */
async function imageFromZip(zip, src) {
  if (!src) return null
  const path = src.replace(/^xap:/, '')
  const entry = zip.file(path)
  if (!entry) return null
  const ext = (path.split('.').pop() || 'png').toLowerCase()
  const base64 = await entry.async('base64')
  return `data:${MIME_BY_EXT[ext] || 'image/png'};base64,${base64}`
}

async function topicFromJson(topic, zip) {
  const node = { id: genId(), title: topic.title || '未命名', children: [] }
  if (topic.image?.src) {
    const dataUrl = await imageFromZip(zip, topic.image.src)
    if (dataUrl) {
      node.image = { src: dataUrl, width: topic.image.width, height: topic.image.height }
    }
  }
  // 平台自定义扩展(完整保真):优先于从 XMind 原生字段推导
  const extra = topic.xcmExtra || {}
  if (extra.icon) node.icon = extra.icon
  if (extra.note) node.note = extra.note
  if (extra.color) node.color = extra.color
  // 从 marker 还原优先级和图标
  for (const m of topic.markers || []) {
    const p = MARKER_TO_PRIORITY[m.markerId]
    if (p && !node.priority) node.priority = p
    const ic = MARKER_TO_ICON[m.markerId]
    if (ic && !node.icon) node.icon = ic
  }
  // 备注
  if (!node.note && topic.notes?.plain?.content) {
    node.note = topic.notes.plain.content
  }
  // 节点背景色(XMind topic style)
  if (!node.color) {
    const fill = topic.style?.properties?.['svg:fill']
    if (fill && fill !== 'none') node.color = fill
  }
  const attached = topic.children?.attached || []
  for (const child of attached) {
    node.children.push(await topicFromJson(child, zip))
  }
  return node
}

async function topicFromXmlElement(el, zip) {
  const titleEl = Array.from(el.children).find((c) => c.localName === 'title')
  const node = {
    id: genId(),
    title: titleEl ? titleEl.textContent : '未命名',
    children: [],
  }
  // XMind 8 的节点图片:<image xlink:href="xap:resources/..."/>
  const imageEl = Array.from(el.children).find((c) => c.localName === 'image')
  if (imageEl) {
    const src =
      imageEl.getAttribute('xlink:href') ||
      imageEl.getAttribute('src') ||
      imageEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    const dataUrl = await imageFromZip(zip, src)
    if (dataUrl) node.image = { src: dataUrl }
  }
  // XMind 8 的 marker:<marker-refs><marker-ref marker-id="priority-1"/></marker-refs>
  const markerRefsEl = Array.from(el.children).find((c) => c.localName === 'marker-refs')
  if (markerRefsEl) {
    for (const refEl of Array.from(markerRefsEl.children)) {
      const markerId = refEl.getAttribute('marker-id')
      const p = MARKER_TO_PRIORITY[markerId]
      if (p && !node.priority) node.priority = p
      const ic = MARKER_TO_ICON[markerId]
      if (ic && !node.icon) node.icon = ic
    }
  }
  // XMind 8 的备注:<notes><plain>文本</plain></notes>
  const notesEl = Array.from(el.children).find((c) => c.localName === 'notes')
  if (notesEl) {
    const plainEl = Array.from(notesEl.children).find((c) => c.localName === 'plain')
    const text = plainEl ? plainEl.textContent : notesEl.textContent
    if (text?.trim()) node.note = text.trim()
  }
  const childrenEl = Array.from(el.children).find((c) => c.localName === 'children')
  if (childrenEl) {
    const topicsEls = Array.from(childrenEl.children).filter((c) => c.localName === 'topics')
    for (const topicsEl of topicsEls) {
      for (const topicEl of Array.from(topicsEl.children).filter((c) => c.localName === 'topic')) {
        node.children.push(await topicFromXmlElement(topicEl, zip))
      }
    }
  }
  return node
}

/**
 * 导入 .xmind 文件,返回 [{ title, root }] (每个 sheet 一项)
 */
export async function importXmind(file) {
  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('文件不是有效的 .xmind(zip)格式')
  }

  const contentJsonFile = zip.file('content.json')
  if (contentJsonFile) {
    const text = (await contentJsonFile.async('string')).replace(/^﻿/, '')
    const sheets = JSON.parse(text)
    const result = []
    for (const sheet of sheets) {
      result.push({
        title: sheet.title || sheet.rootTopic?.title || '导入的脑图',
        root: await topicFromJson(sheet.rootTopic, zip),
      })
    }
    return result
  }

  const contentXmlFile = zip.file('content.xml')
  if (contentXmlFile) {
    const xml = await contentXmlFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const sheets = Array.from(doc.getElementsByTagName('sheet'))
    const result = []
    for (const sheet of sheets) {
      const sheetTitle = Array.from(sheet.children).find((c) => c.localName === 'title')
      const rootTopic = Array.from(sheet.children).find((c) => c.localName === 'topic')
      const root = await topicFromXmlElement(rootTopic, zip)
      result.push({ title: sheetTitle ? sheetTitle.textContent : root.title, root })
    }
    return result
  }

  throw new Error('无法识别的 .xmind 文件:未找到 content.json 或 content.xml')
}

function topicToJson(node, results, imageResources) {
  const topic = { id: node.id, title: node.title }
  const markers = []
  const statusMarker = STATUS_TO_MARKER[results?.[node.id]]
  if (statusMarker) markers.push({ markerId: statusMarker })
  const priorityMarker = PRIORITY_TO_MARKER[node.priority]
  if (priorityMarker) markers.push({ markerId: priorityMarker })
  const iconMarker = node.icon ? ICON_BY_KEY[node.icon]?.marker : null
  if (iconMarker) markers.push({ markerId: iconMarker })
  if (markers.length) topic.markers = markers
  // 备注(XMind notes)
  if (node.note) {
    topic.notes = { plain: { content: node.note } }
  }
  // 节点背景色(XMind topic style)
  if (node.color) {
    topic.style = { properties: { 'svg:fill': node.color } }
  }
  // 平台自定义扩展,保证 平台 → xmind → 平台 往返无损
  const extra = {}
  if (node.icon) extra.icon = node.icon
  if (node.note) extra.note = node.note
  if (node.color) extra.color = node.color
  if (Object.keys(extra).length) topic.xcmExtra = extra
  const imagePath = imageResources?.get(node.id)
  if (imagePath) {
    topic.image = { src: `xap:${imagePath}` }
    if (node.image.width) topic.image.width = node.image.width
    if (node.image.height) topic.image.height = node.image.height
  }
  if (node.children && node.children.length > 0) {
    topic.children = { attached: node.children.map((c) => topicToJson(c, results, imageResources)) }
  }
  return topic
}

/** 把树里的 dataURL 图片写入 zip 的 resources/,返回 nodeId → 资源路径 的映射 */
function writeImageResources(zip, root) {
  const imageResources = new Map()
  const walk = (node) => {
    if (node.image?.src?.startsWith('data:')) {
      const match = node.image.src.match(/^data:image\/(\w+);base64,(.+)$/)
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        const path = `resources/${node.id}.${ext}`
        zip.file(path, match[2], { base64: true })
        imageResources.set(node.id, path)
      }
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  return imageResources
}

/**
 * 导出为标准 .xmind 文件并触发浏览器下载。
 * @param root 树根节点
 * @param fileName 文件名(不带扩展名)
 * @param results 可选,计划的执行结果,会以 marker 形式写入
 */
export async function exportXmind(root, fileName, results = null) {
  const zip = new JSZip()
  const imageResources = writeImageResources(zip, root)

  const content = [
    {
      id: genId(),
      title: fileName,
      rootTopic: topicToJson(root, results, imageResources),
    },
  ]
  zip.file('content.json', JSON.stringify(content, null, 2))
  zip.file(
    'metadata.json',
    JSON.stringify({ creator: { name: 'XMind Case Manager', version: '0.1.0' } }, null, 2)
  )
  const fileEntries = { 'content.json': {}, 'metadata.json': {} }
  for (const path of imageResources.values()) {
    fileEntries[path] = {}
  }
  zip.file('manifest.json', JSON.stringify({ 'file-entries': fileEntries }, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.xmind.workbook',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.xmind`
  a.click()
  URL.revokeObjectURL(url)
}
