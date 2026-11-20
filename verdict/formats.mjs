import { inflateRawSync } from 'node:zlib'

const limit = 48 * 1024 * 1024
const signatures = { end: 0x06054b50, central: 0x02014b50, local: 0x04034b50 }
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function unzip(input) {
  const entries = new Map()
  let footer = -1
  for (let offset = input.length - 22; offset >= Math.max(0, input.length - 65557); offset -= 1) {
    if (input.readUInt32LE(offset) === signatures.end && offset + 22 + input.readUInt16LE(offset + 20) === input.length) {
      footer = offset
      break
    }
  }
  if (footer < 0) throw new Error('文件不是有效的 XMind 压缩包')
  const count = input.readUInt16LE(footer + 10)
  let offset = input.readUInt32LE(footer + 16)
  let totalSize = 0
  if (count > 1500) throw new Error('文件包含过多条目')
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > footer || input.readUInt32LE(offset) !== signatures.central) throw new Error('文件目录已损坏')
    const flag = input.readUInt16LE(offset + 8)
    const method = input.readUInt16LE(offset + 10)
    const checksum = input.readUInt32LE(offset + 16)
    const compressed = input.readUInt32LE(offset + 20)
    const size = input.readUInt32LE(offset + 24)
    const nameLength = input.readUInt16LE(offset + 28)
    const local = input.readUInt32LE(offset + 42)
    const name = input.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + input.readUInt16LE(offset + 30) + input.readUInt16LE(offset + 32)
    if (!/^(?:content\.(json|xml)|resources\/.+)$/i.test(name) || name.endsWith('/')) continue
    totalSize += size
    if (totalSize > limit || flag & 1 || local + 30 > footer || input.readUInt32LE(local) !== signatures.local) throw new Error('XMind 文件过大或已加密')
    const start = local + 30 + input.readUInt16LE(local + 26) + input.readUInt16LE(local + 28)
    if (start + compressed > footer) throw new Error('文件内容已损坏')
    const raw = input.subarray(start, start + compressed)
    const content = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }) : null
    if (!content || content.length !== size || crc32(content) !== checksum) throw new Error('无法校验 XMind 文件内容')
    entries.set(name, content)
  }
  return entries
}

export function zip(entries) {
  const local = []
  const central = []
  let offset = 0
  let centralLength = 0
  for (const [path, content] of entries) {
    const name = Buffer.from(path)
    const data = Buffer.from(content)
    const checksum = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(signatures.local)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x800, 6)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(signatures.central)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    header.copy(entry, 8, 6, 10)
    header.copy(entry, 16, 14, 28)
    entry.writeUInt32LE(offset, 42)
    local.push(header, name, data)
    central.push(entry, name)
    offset += header.length + name.length + data.length
    centralLength += entry.length + name.length
  }
  const footer = Buffer.alloc(22)
  footer.writeUInt32LE(signatures.end)
  footer.writeUInt16LE(entries.size, 8)
  footer.writeUInt16LE(entries.size, 10)
  footer.writeUInt32LE(centralLength, 12)
  footer.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, ...central, footer])
}

const imageTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

export function readMindMap(file) {
  const entries = unzip(file)
  const content = entries.get('content.json') || entries.get('content.xml')
  if (!content) throw new Error('没有找到 XMind 工作表')
  const images = {}
  for (const [path, data] of entries) {
    const type = imageTypes[path.split('.').at(-1)?.toLowerCase()]
    if (path.startsWith('resources/') && type) images[path] = `data:${type};base64,${data.toString('base64')}`
  }
  return { format: entries.has('content.json') ? 'json' : 'xml', content: content.toString('utf8').replace(/^\uFEFF/, ''), images }
}

export function writeMindMap(suite) {
  const entries = new Map()
  const markers = { passed: 'task-done', failed: 'symbol-wrong', blocked: 'symbol-pause', skipped: 'symbol-minus' }
  function children(parentId) {
    const groups = suite.modules.filter((item) => item.parentId === parentId).map((item) => ({
      id: item.id, title: item.title, verdict: { module: true }, children: { attached: children(item.id) },
    }))
    const cases = suite.cases.filter((item) => item.moduleId === parentId).map((item) => {
      const topic = { id: item.id, title: item.title,
        notes: { plain: { content: [item.steps, item.expected, item.note].filter(Boolean).join('\n\n') } },
        verdict: { steps: item.steps, expected: item.expected, note: item.note }, markers: [] }
      if (item.priority) topic.markers.push({ markerId: `priority-${Number(item.priority[1]) + 1}` })
      const status = markers[suite.results?.[item.id]?.status]
      if (status) topic.markers.push({ markerId: status })
      const image = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(item.image || '')
      if (image) {
        const path = `resources/${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${image[1]}`
        entries.set(path, Buffer.from(image[2], 'base64'))
        topic.image = { src: `xap:${path}` }
      }
      return topic
    })
    return [...groups, ...cases]
  }
  entries.set('content.json', JSON.stringify([{ id: 'sheet-verdict', class: 'sheet', title: suite.name,
    rootTopic: { id: 'root-verdict', title: suite.name, verdict: { root: true }, children: { attached: children(null) } } }]))
  entries.set('metadata.json', JSON.stringify({ creator: { name: 'Verdict' }, activeSheetId: 'sheet-verdict' }))
  entries.set('manifest.json', JSON.stringify({ 'file-entries': Object.fromEntries([...entries.keys(), 'manifest.json'].map((key) => [key, {}])) }))
  return zip(entries)
}
