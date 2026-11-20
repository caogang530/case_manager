<template>
  <section class="index-page" :class="{ 'drop-active': dragging }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <header class="index-heading">
      <div>
        <h1>{{ label }}</h1>
        <p>{{ isPlan ? '跟踪测试进度与结果，按计划组织每一次执行。' : '整理与维护测试用例，复用于不同的测试计划。' }}</p>
      </div>
      <div class="heading-actions">
        <el-button v-if="!isPlan" :icon="Upload" :loading="importing" :disabled="!store.loaded" @click="fileInput?.click()">导入 XMind</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!store.loaded" @click="openCreate()">{{ isPlan ? '新建测试计划' : '新建用例库' }}</el-button>
        <input ref="fileInput" type="file" accept=".xmind,.zip" multiple hidden @change="pickFiles" />
      </div>
    </header>

    <div class="metric-grid" aria-label="工作空间概况">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <span class="metric-icon" :class="metric.tone"><el-icon><component :is="metric.icon" /></el-icon></span>
        <div><p>{{ metric.label }}</p><strong>{{ store.loaded ? metric.value : '—' }}</strong></div>
      </article>
    </div>

    <section class="resource-panel" :aria-label="`${label}列表`">
      <header class="resource-toolbar">
        <div class="toolbar-title"><h2>全部{{ label }}</h2><span v-if="store.loaded" class="count-pill">{{ visibleRows.length }}</span></div>
        <div class="list-tools">
          <el-input v-model="query" :prefix-icon="Search" placeholder="搜索名称" aria-label="搜索列表" clearable />
          <el-select v-model="sortOrder" aria-label="排序" class="list-sort">
            <el-option label="最近更新" value="updated" />
            <el-option label="按名称" value="name" />
            <el-option :label="isPlan ? '按完成度' : '按用例数'" value="size" />
          </el-select>
        </div>
      </header>

      <div v-if="store.loadError" class="empty-state" role="alert">
        <span class="empty-icon"><el-icon><Warning /></el-icon></span>
        <h3>{{ label }}加载失败</h3><p>请检查后端连接后重试。</p>
        <el-button :icon="Refresh" @click="store.load()">重新加载</el-button>
      </div>
      <div v-else-if="!store.loaded" class="list-skeleton" role="status" :aria-label="`正在加载${label}`"><i v-for="n in 5" :key="n" /></div>
      <div v-else-if="!visibleRows.length" class="empty-state">
        <span class="empty-icon"><el-icon><component :is="query.trim() ? Search : resourceIcon" /></el-icon></span>
        <h3>{{ query.trim() ? '没有匹配结果' : `还没有${label}` }}</h3>
        <p>{{ query.trim() ? '试试其他关键词。' : (isPlan ? '从已有用例库创建一份测试计划。' : '新建用例库，或拖入 .xmind 文件导入。') }}</p>
        <el-button v-if="query.trim()" @click="query = ''">清除搜索</el-button>
        <el-button v-else type="primary" :icon="Plus" @click="openCreate()">新建{{ label }}</el-button>
      </div>
      <div v-else class="resource-table-wrap">
        <table class="resource-table">
          <thead><tr><th scope="col">名称</th><th v-if="isPlan" scope="col">执行进度</th><th v-else scope="col">用例数</th><th scope="col" class="updated-col">最近更新</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.id">
              <td>
                <RouterLink class="resource-link" :to="`${basePath}/${row.id}`">
                  <span class="row-icon" :class="isPlan ? 'cyan' : 'violet'"><el-icon><component :is="resourceIcon" /></el-icon></span>
                  <span><strong>{{ row.name }}</strong><small v-if="isPlan">来自 {{ row.libraryName || '用例库' }}</small></span>
                </RouterLink>
              </td>
              <td v-if="isPlan" class="table-progress">
                <span class="progress-label"><strong>{{ row.stats.executed }} / {{ row.stats.total }}</strong><span>{{ row.stats.execRate }}%</span></span>
                <div class="progress-track"><span v-for="key in resultKeys" :key="key" :class="key" :style="{ width: `${row.stats.total ? row.stats[key] / row.stats.total * 100 : 0}%` }" /></div>
              </td>
              <td v-else><span class="table-number">{{ row.caseCount.toLocaleString() }} 条</span></td>
              <td class="updated-col"><time v-if="row.updatedAt" :datetime="new Date(row.updatedAt).toISOString()">{{ formatDate(row.updatedAt) }}</time><span v-else>—</span></td>
              <td class="row-actions">
                <el-dropdown trigger="click" placement="bottom-end" @command="(command) => onRowCommand(command, row)">
                  <button class="icon-btn" type="button" :aria-label="`${row.name}的操作`"><el-icon><MoreFilled /></el-icon></button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-if="!isPlan" command="createPlan" :icon="Plus">创建测试计划</el-dropdown-item>
                      <el-dropdown-item command="rename" :icon="EditPen">重命名</el-dropdown-item>
                      <el-dropdown-item command="export" :icon="Download">导出 XMind</el-dropdown-item>
                      <el-dropdown-item command="delete" :icon="Delete" divided class="danger-text">删除{{ label }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="store.loaded && visibleRows.length" class="resource-footer">
        <span>显示 {{ visibleRows.length }} / {{ rows.length }} 项</span>
      </footer>
    </section>

    <div v-if="dragging" class="drop-overlay" aria-hidden="true"><el-icon><Upload /></el-icon><strong>松开鼠标导入 XMind</strong></div>

    <el-dialog v-model="showCreate" :title="createPlan ? '新建测试计划' : '新建用例库'" width="min(480px, calc(100vw - 32px))" @opened="nameInput?.focus()">
      <el-form label-position="top" @submit.prevent="onCreate">
        <el-form-item :label="createPlan ? '计划名称' : '用例库名称'">
          <el-input ref="nameInput" v-model="newName" :placeholder="createPlan ? '例如：发版回归测试' : '例如：移动端核心功能'" maxlength="120" @keydown.enter.prevent="onCreate" />
        </el-form-item>
        <el-form-item v-if="createPlan" label="来源用例库">
          <el-select v-model="sourceId" placeholder="选择用例库" :loading="libraryStore.loading" style="width: 100%">
            <el-option v-for="lib in libraryStore.libraries" :key="lib.id" :label="lib.name" :value="lib.id" />
          </el-select>
        </el-form-item>
        <p v-if="createPlan" class="subtle form-note">计划从用例库创建快照，执行结果独立保存。</p>
        <p v-if="createPlan && libraryStore.loaded && !libraryStore.libraries.length" class="subtle form-note"><RouterLink to="/libraries">先创建或导入一个用例库</RouterLink></p>
        <el-button v-if="createPlan && libraryStore.loadError" @click="libraryStore.load()">重新加载用例库</el-button>
        <el-button v-if="createPlan && planStore.loadError" @click="planStore.load()">重新加载测试计划</el-button>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="createPlan ? (!sourceId || !planStore.loaded) : !newName.trim()" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Collection, Delete, Download, EditPen, Files, List, MoreFilled, Plus, Refresh, Search, Upload, Warning } from '@element-plus/icons-vue'
import { useLibraryStore } from '../stores/library'
import { usePlanStore } from '../stores/plan'
import { computeStats, getLeaves } from '../utils/tree'
import { exportXmind, importXmind } from '../utils/xmind'

const props = defineProps({ mode: { type: String, required: true } })
const router = useRouter()
const libraryStore = useLibraryStore()
const planStore = usePlanStore()
const isPlan = computed(() => props.mode === 'plan')
const store = computed(() => isPlan.value ? planStore : libraryStore)
const label = computed(() => isPlan.value ? '测试计划' : '用例库')
const basePath = computed(() => isPlan.value ? '/plans' : '/libraries')
const resourceIcon = computed(() => isPlan.value ? List : Collection)
const resultKeys = ['passed', 'failed', 'blocked', 'skipped']
const query = ref('')
const sortOrder = ref('updated')
const rows = computed(() => isPlan.value
  ? planStore.plans.map((item) => ({ ...item, stats: item.root ? computeStats(item.root, item.results) : item.stats }))
  : libraryStore.libraries.map((item) => ({ ...item, caseCount: item.root ? getLeaves(item.root).length : item.caseCount })))
const visibleRows = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  const matches = rows.value.filter((item) => `${item.name} ${item.libraryName || ''}`.toLocaleLowerCase().includes(term))
  if (sortOrder.value === 'name') return matches.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  if (sortOrder.value === 'size') return matches.sort((a, b) => isPlan.value ? b.stats.execRate - a.stats.execRate : b.caseCount - a.caseCount)
  return matches.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})
const metrics = computed(() => {
  const total = rows.value.reduce((sum, row) => sum + (row.stats?.total ?? row.caseCount), 0)
  const executed = isPlan.value ? rows.value.reduce((sum, row) => sum + row.stats.executed, 0) : 0
  return [
    { label: `全部${label.value}`, value: rows.value.length, tone: 'violet', icon: resourceIcon.value },
    { label: '用例总数', value: total.toLocaleString(), tone: 'cyan', icon: Files },
    isPlan.value
      ? { label: '整体执行率', value: `${total ? Math.round(executed / total * 100) : 0}%`, tone: 'mint', icon: CircleCheck }
      : { label: '关联测试计划', value: planStore.loaded ? planStore.plans.filter((plan) => libraryStore.getById(plan.libraryId)).length : '—', tone: 'mint', icon: List },
  ]
})

const showCreate = ref(false)
const createPlan = ref(false)
const creating = ref(false)
const newName = ref('')
const nameInput = ref(null)
const sourceId = ref('')
const fileInput = ref(null)
const importing = ref(false)
const dragging = ref(false)
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (timestamp) => dateFormatter.format(timestamp)

function openCreate(source) {
  createPlan.value = isPlan.value || !!source
  sourceId.value = source?.id ?? libraryStore.libraries[0]?.id ?? ''
  newName.value = source ? `${source.name} · 测试计划` : ''
  showCreate.value = true
}

async function onCreate() {
  if (creating.value) return
  const source = libraryStore.getById(sourceId.value)
  const name = newName.value.trim()
  if (createPlan.value ? (!source || !planStore.loaded) : !name) return
  creating.value = true
  try {
    const created = createPlan.value
      ? await planStore.createFromLibrary(name || `${source.name} · 测试计划`, await libraryStore.detail(source.id))
      : await libraryStore.create(name)
    showCreate.value = false
    await router.push(`${createPlan.value ? '/plans' : '/libraries'}/${created.id}`)
  } catch (error) {
    ElMessage.error(error.message || '创建失败，请重试')
  } finally {
    creating.value = false
  }
}

async function onRowCommand(command, row) {
  try {
    if (command === 'createPlan') openCreate(row)
    if (command === 'rename') {
      const { value } = await ElMessageBox.prompt('输入新的名称', `重命名${label.value}`, {
        inputValue: row.name,
        inputValidator: (value) => (value?.trim() ? true : '名称不能为空'),
      })
      await store.value.rename(row.id, value.trim())
      ElMessage.success('名称已更新')
    }
    if (command === 'export') {
      const item = await store.value.detail(row.id)
      await exportXmind(item.root, item.name, item.results)
    }
    if (command === 'delete') {
      await ElMessageBox.confirm(`确定删除「${row.name}」？此操作无法撤销。`, `删除${label.value}`, {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
      })
      await store.value.remove(row.id)
      ElMessage.success('已删除')
    }
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  }
}

function pickFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  void importFiles(files)
}
function onDragOver(event) {
  if (isPlan.value || !libraryStore.loaded || !event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragging.value = true
}
function onDragLeave(event) {
  if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) dragging.value = false
}
function onDrop(event) {
  if (!dragging.value) return
  event.preventDefault()
  dragging.value = false
  void importFiles(Array.from(event.dataTransfer?.files || []))
}
async function importFiles(files) {
  if (importing.value || !files.length) return
  importing.value = true
  let count = 0
  try {
    for (const file of files) {
      try {
        const sheets = await importXmind(file)
        if (!sheets.length) throw new Error('文件中没有可导入的工作表')
        for (const sheet of sheets) {
          await libraryStore.create(sheet.title, sheet.root)
          count += 1
        }
      } catch (error) {
        ElMessage.error(`${file.name}：${error.message}`)
      }
    }
    if (count) ElMessage.success(`已导入 ${count} 个用例库`)
  } finally {
    importing.value = false
  }
}
</script>
