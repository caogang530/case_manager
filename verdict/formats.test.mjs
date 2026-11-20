import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readMindMap, unzip, writeMindMap, zip } from './formats.mjs'
import { parseMindMap, summarize } from './public/model.js'
import { createDemo } from './seed.mjs'

test('XMind round-trip preserves nested modules, priority, steps, notes and images', () => {
  const suite = createDemo().suites[0]
  const nested = { id: 'nested', title: '嵌套模块', parentId: suite.modules[0].id }
  const empty = { id: 'empty', title: '空模块', parentId: nested.id }
  const first = suite.cases[0]
  first.moduleId = nested.id
  first.note = '复核验证码有效期'
  first.image = 'data:image/png;base64,YWJj'
  suite.modules.push(nested, empty)
  const [imported] = parseMindMap(readMindMap(writeMindMap(suite)))
  const importedCase = imported.cases.find((item) => item.title === first.title)
  const importedGroup = imported.modules.find((item) => item.title === '嵌套模块')
  assert.equal(imported.name, suite.name)
  assert.equal(imported.cases.length, suite.cases.length)
  assert.equal(importedCase.moduleId, importedGroup.id)
  assert.equal(imported.modules.find((item) => item.title === '空模块').parentId, importedGroup.id)
  assert.equal(importedCase.priority, first.priority)
  assert.equal(importedCase.steps, first.steps)
  assert.equal(importedCase.expected, first.expected)
  assert.equal(importedCase.note, first.note)
  assert.equal(importedCase.image, first.image)
})

test('XMind export includes the run results as recognizable marker IDs', () => {
  const plan = createDemo().plans[0]
  const contents = JSON.parse(readMindMap(writeMindMap(plan)).content)
  const item = contents[0].rootTopic.children.attached[0].children.attached[0]
  assert.deepEqual(item.markers.map((marker) => marker.markerId), ['priority-1', 'symbol-wrong'])
  assert.equal(summarize(plan).completed, 19)
  assert.equal(summarize(plan).critical, 2)
})

test('ZIP parser rejects invalid archives and altered payloads', () => {
  assert.throws(() => unzip(Buffer.from('arbitrary content')), /压缩包/)
  const archive = zip(new Map([['content.json', '[]']]))
  archive[30 + 'content.json'.length] ^= 0x01
  assert.throws(() => unzip(archive), /校验/)
})
