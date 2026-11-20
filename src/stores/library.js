import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api, readLegacy, clearLegacy } from './data'
import { createRoot, genId } from '../utils/tree'

function reportError(action, err) {
  console.error(action, err)
  ElMessage.error(`${action}失败:${err.message}(请确认后端服务已启动)`)
}

export const useLibraryStore = defineStore('library', {
  state: () => ({
    libraries: [],
    loaded: false,
    loading: false,
    loadError: false,
  }),
  getters: {
    getById: (state) => (id) => state.libraries.find((l) => l.id === id),
  },
  actions: {
    async load() {
      if (this.loaded || this.loading) return
      this.loading = true
      this.loadError = false
      try {
        this.libraries = await api.getLibraries()
        await this.migrateLegacy()
        this.loaded = true
      } catch (error) {
        console.error('加载用例库失败', error)
        this.loadError = true
      } finally {
        this.loading = false
      }
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

    async detail(id) {
      const library = this.getById(id)
      return library?.root ? library : api.getLibrary(id)
    },

    async rename(id, name) {
      const lib = this.getById(id)
      if (!lib) return
      Object.assign(lib, await api.updateLibrary(id, { name }))
    },

    async remove(id) {
      await api.deleteLibrary(id)
      this.libraries = this.libraries.filter((l) => l.id !== id)
    },

    async update(id, { root }) {
      const library = this.getById(id)
      if (!library) throw new Error('用例库不存在')
      Object.assign(library, await api.updateLibrary(id, { root }))
    },
  },
})
