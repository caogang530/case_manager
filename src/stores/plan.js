import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api, readLegacy, clearLegacy } from './data'
import { cloneTreeWithNewIds, genId } from '../utils/tree'

export const STATUS = {
  unexecuted: { label: '未执行', icon: '·', type: 'info' },
  passed: { label: '通过', icon: '✓', type: 'success' },
  failed: { label: '失败', icon: '✗', type: 'danger' },
  blocked: { label: '阻塞', icon: '!', type: 'warning' },
  skipped: { label: '跳过', icon: '−', type: 'info' },
}

function reportError(action, err) {
  console.error(action, err)
  ElMessage.error(`${action}失败:${err.message}(请确认后端服务已启动)`)
}

export const usePlanStore = defineStore('plan', {
  state: () => ({
    plans: [],
    loaded: false,
    loading: false,
    loadError: false,
  }),
  getters: {
    getById: (state) => (id) => state.plans.find((p) => p.id === id),
  },
  actions: {
    async load() {
      if (this.loading || this.loaded) return
      this.loading = true
      this.loadError = false
      try {
        this.plans = await api.getPlans()
        await this.migrateLegacy()
        this.loaded = true
      } catch (err) {
        console.error('加载测试计划失败', err)
        this.loadError = true
      } finally {
        this.loading = false
      }
    },
    /** 一次性迁移:数据库为空且 localStorage 有旧数据时自动上传 */
    async migrateLegacy() {
      const legacy = readLegacy('plans')
      if (this.plans.length > 0 || legacy.length === 0) return
      let migrated = 0
      for (const plan of legacy) {
        try {
          const created = await api.createPlan({
            id: plan.id,
            name: plan.name,
            libraryId: plan.libraryId,
            libraryName: plan.libraryName,
            root: plan.root,
            results: plan.results || {},
          })
          this.plans.push(created)
          migrated += 1
        } catch (err) {
          reportError(`迁移测试计划「${plan.name}」`, err)
        }
      }
      if (migrated > 0) {
        clearLegacy('plans')
        ElMessage.success(`已把浏览器本地存储的 ${migrated} 个测试计划迁移到数据库`)
      }
    },

    /** 从用例库快照创建测试计划 */
    async createFromLibrary(name, library) {
      const payload = {
        id: genId(),
        name,
        libraryId: library.id,
        libraryName: library.name,
        root: cloneTreeWithNewIds(library.root),
        results: {},
      }
      const created = await api.createPlan(payload)
      this.plans.unshift(created)
      return created
    },

    async detail(id) {
      const plan = this.getById(id)
      return plan?.root ? plan : api.getPlan(id)
    },

    async rename(id, name) {
      const plan = this.getById(id)
      if (!plan) return
      Object.assign(plan, await api.updatePlan(id, { name }))
    },

    async remove(id) {
      await api.deletePlan(id)
      this.plans = this.plans.filter((p) => p.id !== id)
    },

    /** 保存草稿:整体替换计划的树和结果 */
    async update(id, { root, results }) {
      const plan = this.getById(id)
      if (!plan) throw new Error('测试计划不存在')
      Object.assign(plan, await api.updatePlan(id, { root, results }))
    },
  },
})
