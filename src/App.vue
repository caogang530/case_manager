<template>
  <div class="app-shell">
    <aside class="app-rail" aria-label="主导航">
      <RouterLink class="brand" to="/libraries" aria-label="Casework 首页">
        <span class="brand-symbol"><el-icon><Connection /></el-icon></span>
        <span class="brand-label"><strong>Casework</strong><small>测试用例工作台</small></span>
      </RouterLink>
      <div class="rail-divider" />
      <p class="rail-caption">工作空间</p>
      <nav class="rail-nav">
        <RouterLink v-for="item in sections" :key="item.path" :to="item.path" class="rail-link"
          :class="{ active: current.path === item.path }" :title="item.label">
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="rail-footer">
        <button class="rail-link" type="button" title="快捷键" @click="showHelp = true">
          <el-icon><QuestionFilled /></el-icon><span>快捷键</span>
        </button>
        <div class="rail-divider" />
        <div class="workspace-identity" title="测试工作空间">
          <span class="workspace-avatar">QA</span>
          <span class="brand-label"><strong>测试工作空间</strong><small>用例与执行</small></span>
        </div>
      </div>
    </aside>

    <main class="app-main" :class="{ 'app-main-editor': route.params.id }">
      <header class="app-topbar">
        <nav class="breadcrumbs" aria-label="当前位置">
          <el-icon><component :is="current.icon" /></el-icon>
          <RouterLink v-if="record" :to="current.path">{{ current.label }}</RouterLink>
          <span v-else>{{ current.label }}</span>
          <template v-if="record">
            <el-icon class="breadcrumb-arrow"><ArrowRight /></el-icon>
            <strong :title="record.name">{{ record.name }}</strong>
          </template>
        </nav>
        <button class="global-search" type="button" aria-label="搜索用例库或计划" @click="openSearch">
          <el-icon><Search /></el-icon><span>快速查找</span><kbd>{{ modKey }} K</kbd>
        </button>
      </header>
      <RouterView :key="route.path" />
    </main>
  </div>

  <el-dialog v-model="showSearch" class="search-dialog" width="min(540px, calc(100vw - 32px))" title="快速查找" @opened="searchInput?.focus()">
    <input ref="searchInput" v-model="query" class="search-field" placeholder="输入用例库或测试计划名称…"
      aria-label="搜索名称" @keydown.down.prevent="moveSearch(1)" @keydown.up.prevent="moveSearch(-1)"
      @keydown.enter.prevent="openResult(searchResults[searchIndex])" />
    <ul v-if="searchResults.length" class="search-results">
      <li v-for="(hit, index) in searchResults" :key="hit.path">
        <button type="button" :class="{ current: searchIndex === index }" @mouseenter="searchIndex = index" @click="openResult(hit)">
          <el-icon><component :is="hit.icon" /></el-icon><span>{{ hit.name }}</span><small>{{ hit.label }}</small>
        </button>
      </li>
    </ul>
    <p v-else class="subtle search-empty">{{ query ? '没有匹配结果' : '暂无用例库或测试计划' }}</p>
  </el-dialog>

  <el-dialog v-model="showHelp" title="工作台快捷键" width="min(460px, calc(100vw - 32px))">
    <dl class="shortcut-list">
      <div v-for="[keys, label] in shortcuts" :key="keys"><dt>{{ label }}</dt><dd><kbd>{{ keys }}</kbd></dd></div>
    </dl>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Collection, Connection, List, QuestionFilled, Search } from '@element-plus/icons-vue'
import { useLibraryStore } from './stores/library'
import { usePlanStore } from './stores/plan'

const route = useRoute()
const router = useRouter()
const libraryStore = useLibraryStore()
const planStore = usePlanStore()
const sections = [
  { path: '/libraries', label: '用例库', icon: Collection },
  { path: '/plans', label: '测试计划', icon: List },
]
const current = computed(() => route.path.startsWith('/plans') ? sections[1] : sections[0])
const record = computed(() => (current.value.path === '/plans' ? planStore : libraryStore).getById(route.params.id))
const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
const showSearch = ref(false)
const showHelp = ref(false)
const searchInput = ref(null)
const query = ref('')
const searchIndex = ref(0)
const shortcuts = [
  [`${modKey} K`, '快速查找'], [`${modKey} S`, '保存修改'], [`${modKey} Z`, '撤销'],
  [`${modKey} Shift Z`, '重做'], [`${modKey} C / X / V`, '复制、剪切、粘贴节点或图片'],
  ['F2', '编辑标题'], ['Tab / Enter', '在节点上添加子节点 / 同级节点'],
  ['↑ ↓ ← →', '在节点间导航'], ['1–5', '标记通过、失败、阻塞、跳过、未执行'],
]
const searchResults = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return [...libraryStore.libraries.map((item) => ({ ...sections[0], item })),
    ...planStore.plans.map((item) => ({ ...sections[1], item }))]
    .filter(({ item }) => item.name.toLocaleLowerCase().includes(term))
    .sort((a, b) => (b.item.updatedAt || 0) - (a.item.updatedAt || 0))
    .slice(0, 12)
    .map(({ path, item, label, icon }) => ({ path: `${path}/${item.id}`, name: item.name, label, icon }))
})
watch(query, () => { searchIndex.value = 0 })
function openSearch() {
  query.value = ''
  searchIndex.value = 0
  showSearch.value = true
}
async function moveSearch(delta) {
  const count = searchResults.value.length
  if (!count) return
  searchIndex.value = (searchIndex.value + delta + count) % count
  await nextTick()
  document.querySelector('.search-results .current')?.scrollIntoView({ block: 'nearest' })
}
function openResult(result) {
  if (!result) return
  showSearch.value = false
  router.push(result.path)
}
function onKeydown(event) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
  event.preventDefault()
  const modalOpen = [...document.querySelectorAll('[aria-modal="true"]')].some((dialog) => dialog.getClientRects().length)
  if (showHelp.value || (!showSearch.value && modalOpen)) return
  if (showSearch.value) showSearch.value = false
  else openSearch()
}
onMounted(() => {
  void libraryStore.load()
  void planStore.load()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
