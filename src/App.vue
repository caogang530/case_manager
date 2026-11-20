<template>
  <el-container class="app-shell">
    <el-header class="app-header">
      <div class="brand" @click="$router.push('/libraries')">
        <span class="brand-icon">🧠</span>
        <span class="brand-title">XMind 用例管理平台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        mode="horizontal"
        :ellipsis="false"
        router
        class="nav-menu"
      >
        <el-menu-item index="/libraries">用例库</el-menu-item>
        <el-menu-item index="/plans">测试计划</el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useLibraryStore } from './stores/library'
import { usePlanStore } from './stores/plan'

const route = useRoute()
const activeMenu = computed(() => (route.path.startsWith('/plans') ? '/plans' : '/libraries'))

const libraryStore = useLibraryStore()
const planStore = usePlanStore()

onMounted(async () => {
  void planStore.load()
  try {
    await libraryStore.load()
  } catch (err) {
    console.error('加载数据失败', err)
    ElMessage.error('无法连接后端服务,请先启动:source .venv/bin/activate && python server/main.py')
  }
})
</script>
