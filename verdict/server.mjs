import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemo } from './seed.mjs'
import { readMindMap, writeMindMap } from './formats.mjs'

const publicDir = fileURLToPath(new URL('./public/', import.meta.url))
const dataFile = process.env.VERDICT_DATA ? resolve(process.env.VERDICT_DATA) : fileURLToPath(new URL('./data/workspace.json', import.meta.url))
const types = { '/': 'text/html; charset=utf-8', '/styles.css': 'text/css; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8',
  '/model.js': 'text/javascript; charset=utf-8', '/screens.js': 'text/javascript; charset=utf-8' }
const maxBody = 84 * 1024 * 1024
let workspace
let writes = Promise.resolve()

async function persist(next) {
  await mkdir(dirname(dataFile), { recursive: true })
  const temp = `${dataFile}.next`
  await writeFile(temp, JSON.stringify(next), { mode: 0o600 })
  await rename(temp, dataFile)
  workspace = next
}

try {
  workspace = JSON.parse(await readFile(dataFile, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await persist(createDemo())
}

function respond(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readBody(req, limit = maxBody) {
  if (Number(req.headers['content-length']) > limit) throw Object.assign(new Error('文件超过大小限制'), { status: 413 })
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('文件超过大小限制'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const statuses = ['todo', 'passed', 'failed', 'blocked', 'skipped']
function validateCollection(collection, plan = false) {
  if (!collection || typeof collection.id !== 'string' || typeof collection.name !== 'string' || !collection.name.trim() ||
    !Array.isArray(collection.modules) || !Array.isArray(collection.cases)) return false
  const modules = new Map()
  for (const module of collection.modules) {
    if (!module || typeof module.id !== 'string' || typeof module.title !== 'string' || modules.has(module.id)) return false
    modules.set(module.id, module)
  }
  for (const module of modules.values()) {
    const visited = new Set([module.id])
    let parent = module.parentId
    while (parent !== null) {
      if (visited.has(parent) || !modules.has(parent)) return false
      visited.add(parent)
      parent = modules.get(parent).parentId
    }
  }
  const ids = new Set()
  for (const item of collection.cases) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() ||
      !Number.isInteger(item.number) || item.number < 1 || !['P0', 'P1', 'P2'].includes(item.priority) ||
      (item.moduleId !== null && !modules.has(item.moduleId))) return false
    ids.add(item.id)
  }
  if (!plan) return true
  if (!collection.results || typeof collection.results !== 'object' || Array.isArray(collection.results)) return false
  return Object.entries(collection.results).every(([id, result]) => ids.has(id) && result && statuses.includes(result.status))
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'")
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    const method = req.method
    if (method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      return respond(res, 403, { error: '请从工作台页面发起请求' })
    }
    if (path === '/api/workspace' && method === 'GET') return respond(res, 200, workspace)
    if (path === '/api/workspace' && method === 'PUT') {
      let next
      try { next = JSON.parse((await readBody(req)).toString('utf8')) } catch (error) {
        if (error.status) throw error
        return respond(res, 400, { error: '无效的工作台数据' })
      }
      if (!next || next.version !== 1 || !Array.isArray(next.suites) || !Array.isArray(next.plans) ||
        !next.suites.every((item) => validateCollection(item)) || !next.plans.every((item) => validateCollection(item, true))) {
        return respond(res, 400, { error: '工作台数据不完整' })
      }
      const operation = writes.then(async () => {
        if (next.revision !== workspace.revision) return false
        await persist({ ...next, revision: next.revision + 1 })
        return true
      })
      writes = operation.catch(() => {})
      if (!(await operation)) return respond(res, 409, { error: '工作台已在其他页面更新，请重新加载后继续' })
      return respond(res, 200, { revision: next.revision + 1 })
    }
    if (path === '/api/xmind/read' && method === 'POST') {
      const input = await readBody(req, 48 * 1024 * 1024)
      try { return respond(res, 200, readMindMap(input)) } catch (error) { return respond(res, 422, { error: error.message }) }
    }
    if (path === '/api/xmind/write' && method === 'POST') {
      const input = JSON.parse((await readBody(req)).toString('utf8'))
      if (!validateCollection(input, !!input?.results)) return respond(res, 400, { error: '无法导出不完整的用例' })
      res.writeHead(200, { 'Content-Type': 'application/vnd.xmind.workbook', 'Cache-Control': 'no-store' })
      return res.end(writeMindMap(input))
    }
    if (method === 'GET' && Object.hasOwn(types, path)) {
      const content = await readFile(join(publicDir, path === '/' ? 'index.html' : path.slice(1)))
      res.writeHead(200, { 'Content-Type': types[path], 'Cache-Control': 'no-cache' })
      return res.end(content)
    }
    return respond(res, 404, { error: '没有找到此页面' })
  } catch (error) {
    console.error(error)
    if (!res.headersSent) respond(res, error.status || 500, { error: error.status ? error.message : '保存或读取工作台时出现问题' })
    else res.end()
  }
})

const port = Number(process.env.VERDICT_PORT || '8787')
server.listen(port, '127.0.0.1', () => console.log(`Verdict · http://127.0.0.1:${server.address().port}`))
