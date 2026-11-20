<template>
  <main class="manager" :aria-label="label">
    <div class="manager-content">
      <header class="manager-heading">
        <div class="manager-heading-title"><slot name="navigation" /><h1>{{ label }}</h1></div>
        <div class="manager-actions">
          <button v-if="mode === 'library'" class="button secondary" type="button" @click="$emit('import')">↑ 导入 XMind</button>
          <button v-if="canCreate" class="button primary" type="button" @click="$emit('create')">＋ 新建{{ label }}</button>
          <a v-else class="button secondary" href="#/libraries">前往用例库</a>
        </div>
      </header>

      <section class="manager-metrics" :aria-label="`${label}概况`">
        <div><span>{{ label }}数量</span><strong>{{ rows.length }}</strong></div>
        <div><span>用例总数</span><strong>{{ totals.cases }}</strong></div>
        <div v-if="mode === 'plan'"><span>整体执行率</span><strong>{{ percent(totals.executed, totals.cases) }}%</strong></div>
      </section>

      <section class="manager-panel" :aria-label="`${label}列表`">
        <header class="manager-panel-header">
          <h2>全部{{ label }} <span>{{ visibleRows.length }}</span></h2>
          <div class="manager-actions">
            <label class="search-box"><i aria-hidden="true"></i><input v-model="query" type="search" :aria-label="`搜索${label}`" placeholder="搜索名称"></label>
            <select v-model="sortBy" class="manager-sort" aria-label="排序方式">
              <option value="recent">最近更新</option>
              <option value="name">按名称</option>
              <option value="count">按用例数</option>
            </select>
          </div>
        </header>

        <div v-if="visibleRows.length" class="manager-table-wrap">
          <table class="manager-table">
            <thead><tr><th scope="col">名称</th><th v-if="mode === 'plan'" class="source-column" scope="col">来源用例库</th><th scope="col">{{ mode === 'plan' ? '执行进度' : '用例数' }}</th><th class="updated-column" scope="col">最近更新</th><th scope="col">操作</th></tr></thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.id">
                <td><a class="manager-document" :href="`${moduleHref}/${encodeURIComponent(row.id)}`"><span class="document-icon" aria-hidden="true">{{ mode === 'plan' ? '✓' : '▤' }}</span><span>{{ row.name }}</span></a></td>
                <td v-if="mode === 'plan'" class="source-column">{{ row.source }}</td>
                <td v-if="mode === 'plan'" class="manager-progress">
                  <span><strong>{{ row.executed }}/{{ row.count }}</strong><span>{{ percent(row.executed, row.count) }}%</span></span>
                  <progress :value="row.executed" :max="row.count || 1" :aria-label="`${row.name}的执行进度`"></progress>
                </td>
                <td v-else>{{ row.count }} 条</td>
                <td class="updated-column" :title="row.updatedAt ? dateTime.format(row.updatedAt) : ''">{{ row.updatedAt ? date.format(row.updatedAt) : '—' }}</td>
                <td><div class="manager-row-actions">
                  <button v-if="mode === 'library'" type="button" class="quiet-button plan-action" @click="$emit('plan', row.id)">创建计划</button>
                  <button type="button" class="quiet-button" @click="$emit('rename', row.id)">重命名</button>
                  <button type="button" class="quiet-button" @click="$emit('export', row.id)">导出</button>
                  <button type="button" class="quiet-button danger-text" @click="$emit('delete', row.id)">删除</button>
                </div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="manager-empty">
          <strong>{{ query.trim() ? '未找到匹配的文档' : `暂无${label}` }}</strong>
          <p v-if="!query.trim() && mode === 'plan' && !canCreate">创建测试计划需要先建立用例库。</p>
          <button v-if="query.trim()" type="button" class="quiet-button" @click="query = ''">清除搜索</button>
        </div>
        <p v-if="searchActive && visibleRows.length" class="manager-search-total" role="status">显示 {{ visibleRows.length }} / {{ rows.length }} 项</p>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { countStatuses } from './model.js'

const props = defineProps({ mode: String, documents: Array, libraries: Array })
defineEmits(['import', 'create', 'plan', 'rename', 'export', 'delete'])
const query = ref('')
const sortBy = ref('recent')
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' })
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const canCreate = computed(() => props.mode === 'library' || props.libraries.length > 0)
const label = computed(() => props.mode === 'plan' ? '测试计划' : '用例库')
const moduleHref = computed(() => props.mode === 'plan' ? '#/plans' : '#/libraries')
const searchActive = computed(() => !!query.value.trim())
const rows = computed(() => {
  const sources = new Map(props.libraries.map((item) => [item.id, item.name]))
  return props.documents.map((doc) => {
    const count = countStatuses(doc)
    return {
      id: doc.id,
      name: doc.name,
      count: count.total,
      executed: count.total - count.unexecuted,
      updatedAt: Number(doc.updatedAt) || 0,
      source: doc.sourceId ? sources.get(doc.sourceId) || '用例库已删除' : '—',
    }
  })
})
const totals = computed(() => rows.value.reduce((total, row) => ({
  cases: total.cases + row.count,
  executed: total.executed + row.executed,
}), { cases: 0, executed: 0 }))
const visibleRows = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const result = rows.value.filter((row) => row.name.toLocaleLowerCase().includes(keyword))
  if (sortBy.value === 'name') return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  if (sortBy.value === 'count') return result.sort((a, b) => b.count - a.count)
  return result.sort((a, b) => b.updatedAt - a.updatedAt)
})
const percent = (value, total) => total ? Math.round(100 * value / total) : 0
</script>
