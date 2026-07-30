import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { api, readLegacy, clearLegacy } from './data'
import { cloneTreeWithNewIds, computeStats, genId } from '../utils/tree'

export const STATUS = {
  unexecuted: { label: '未执行', icon: '·', type: 'info' },
  passed: { label: '通过', icon: '✓', type: 'success' },
  failed: { label: '失败', icon: '✗', type: 'danger' },
  blocked: { label: '阻塞', icon: '!', type: 'warning' },
}

/** 点击徽章时的状态循环顺序 */
export const STATUS_CYCLE = ['unexecuted', 'passed', 'failed', 'blocked']

function reportError(action, err) {
  console.error(action, err)
  ElMessage.error(`${action}失败:${err.message}(请确认后端服务已启动)`)
}

export const usePlanStore = defineStore('plan', {
  state: () => ({
    plans: [],
    loaded: false,
  }),
  getters: {
    getById: (state) => (id) => state.plans.find((p) => p.id === id),
    statsOf: (state) => (id) => {
      const plan = state.plans.find((p) => p.id === id)
      return plan ? computeStats(plan.root, plan.results) : null
    },
  },
  actions: {
    async load() {
      this.plans = await api.getPlans()
      this.loaded = true
      await this.migrateLegacy()
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

    async rename(id, name) {
      const plan = this.getById(id)
      if (!plan) return
      plan.name = name
      plan.updatedAt = Date.now()
      try {
        await api.updatePlan(id, { name })
      } catch (err) {
        reportError('重命名', err)
      }
    },

    async remove(id) {
      this.plans = this.plans.filter((p) => p.id !== id)
      try {
        await api.deletePlan(id)
      } catch (err) {
        reportError('删除', err)
      }
    },

    /** 保存草稿:整体替换计划的树和结果 */
    async update(id, { root, results }) {
      const plan = this.getById(id)
      if (!plan) return
      plan.root = root
      plan.results = results
      plan.updatedAt = Date.now()
      await api.updatePlan(id, { root, results })
    },
  },
})
