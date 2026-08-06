import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api, readLegacy, clearLegacy } from './data'
import { createRoot, findNode, genId } from '../utils/tree'

function reportError(action, err) {
  console.error(action, err)
  ElMessage.error(`${action}失败:${err.message}(请确认后端服务已启动)`)
}

const MAX_HISTORY = 30

export const useLibraryStore = defineStore('library', {
  state: () => ({
    libraries: [],
    loaded: false,
    /** 撤销历史:{ [libId]: { undo: string[], redo: string[] } },快照为 root 的 JSON 字符串 */
    history: {},
  }),
  getters: {
    getById: (state) => (id) => state.libraries.find((l) => l.id === id),
  },
  actions: {
    /** 结构变更前打快照 */
    _snapshot(libId) {
      const lib = this.getById(libId)
      if (!lib) return
      if (!this.history[libId]) this.history[libId] = { undo: [], redo: [] }
      const h = this.history[libId]
      h.undo.push(JSON.stringify(lib.root))
      if (h.undo.length > MAX_HISTORY) h.undo.shift()
      h.redo = []
    },
    async undo(libId) {
      const lib = this.getById(libId)
      const h = this.history[libId]
      if (!lib || !h || h.undo.length === 0) return false
      h.redo.push(JSON.stringify(lib.root))
      lib.root = JSON.parse(h.undo.pop())
      await this.persistRoot(libId)
      return true
    },
    async redo(libId) {
      const lib = this.getById(libId)
      const h = this.history[libId]
      if (!lib || !h || h.redo.length === 0) return false
      h.undo.push(JSON.stringify(lib.root))
      lib.root = JSON.parse(h.redo.pop())
      await this.persistRoot(libId)
      return true
    },
    async load() {
      this.libraries = await api.getLibraries()
      this.loaded = true
      await this.migrateLegacy()
    },
    /** 一次性迁移:数据库为空且 localStorage 有旧数据时自动上传 */
    async migrateLegacy() {
      const legacy = readLegacy('libraries')
      if (this.libraries.length > 0 || legacy.length === 0) return
      let migrated = 0
      for (const lib of legacy) {
        try {
          const created = await api.createLibrary({
            id: lib.id,
            name: lib.name,
            root: lib.root,
          })
          this.libraries.push(created)
          migrated += 1
        } catch (err) {
          reportError(`迁移用例库「${lib.name}」`, err)
        }
      }
      if (migrated > 0) {
        clearLegacy('libraries')
        ElMessage.success(`已把浏览器本地存储的 ${migrated} 个用例库迁移到数据库`)
      }
    },

    async create(name, root = null) {
      const payload = {
        id: genId(),
        name,
        root: root || createRoot(name),
      }
      const created = await api.createLibrary(payload)
      this.libraries.unshift(created)
      return created
    },

    async rename(id, name) {
      const lib = this.getById(id)
      if (!lib) return
      lib.name = name
      lib.updatedAt = Date.now()
      try {
        await api.updateLibrary(id, { name })
      } catch (err) {
        reportError('重命名', err)
      }
    },

    async remove(id) {
      this.libraries = this.libraries.filter((l) => l.id !== id)
      try {
        await api.deleteLibrary(id)
      } catch (err) {
        reportError('删除', err)
      }
    },

    /** 树结构变更后整体持久化 root */
    async persistRoot(id) {
      const lib = this.getById(id)
      if (!lib) return
      lib.updatedAt = Date.now()
      try {
        await api.updateLibrary(id, { root: lib.root })
      } catch (err) {
        reportError('保存用例库', err)
      }
    },

    /** 整体替换用例库的用例树(从测试计划同步) */
    async replaceRoot(id, newRoot) {
      const lib = this.getById(id)
      if (!lib) return
      this._snapshot(id)
      lib.root = newRoot
      await this.persistRoot(id)
    },

    /** 粘贴子树到父节点下(subtree 需已是新 id 的副本) */
    async pasteNode(libId, parentId, subtree) {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, parentId)
      if (!found) return null
      this._snapshot(libId)
      if (!found.node.children) found.node.children = []
      found.node.children.push(subtree)
      await this.persistRoot(libId)
      return subtree
    },

    /** 树编辑操作 */
    async addChild(libId, parentId, title = '子主题') {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, parentId)
      if (!found) return null
      this._snapshot(libId)
      if (!found.node.children) found.node.children = []
      const node = { id: genId(), title, children: [] }
      found.node.children.push(node)
      await this.persistRoot(libId)
      return node
    },
    async addSibling(libId, nodeId, title = '子主题') {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, nodeId)
      if (!found || !found.parent) return null
      this._snapshot(libId)
      const node = { id: genId(), title, children: [] }
      const idx = found.parent.children.findIndex((c) => c.id === nodeId)
      found.parent.children.splice(idx + 1, 0, node)
      await this.persistRoot(libId)
      return node
    },
    async renameNode(libId, nodeId, title) {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, nodeId)
      if (!found) return
      this._snapshot(libId)
      found.node.title = title
      await this.persistRoot(libId)
    },
    /** 设置/清除节点优先级(P0~P2,null 清除) */
    async setPriority(libId, nodeId, priority) {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, nodeId)
      if (!found) return
      this._snapshot(libId)
      if (priority) found.node.priority = priority
      else delete found.node.priority
      await this.persistRoot(libId)
    },
    /** 通用节点属性更新(图标/颜色/备注等,value 为 null 表示删除该属性) */
    async updateNodeProps(libId, nodeId, patch) {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, nodeId)
      if (!found) return
      this._snapshot(libId)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined) delete found.node[k]
        else found.node[k] = v
      }
      await this.persistRoot(libId)
    },
    async removeNode(libId, nodeId) {
      const lib = this.getById(libId)
      const found = lib && findNode(lib.root, nodeId)
      if (!found || !found.parent) return
      this._snapshot(libId)
      found.parent.children = found.parent.children.filter((c) => c.id !== nodeId)
      await this.persistRoot(libId)
    },
  },
})
