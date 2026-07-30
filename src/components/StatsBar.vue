<template>
  <div class="stats-bar">
    <div class="stat-item">
      <span>通过率</span>
      <span class="pass-rate">{{ stats.passRate }}%</span>
    </div>
    <div class="stats-progress">
      <el-progress
        :percentage="stats.passRate"
        :stroke-width="14"
        :color="progressColors"
        :show-text="false"
      />
    </div>
    <div class="stat-item">
      <span class="stat-dot total" />总数 <span class="stat-value">{{ stats.total }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-dot passed" />通过 <span class="stat-value">{{ stats.passed }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-dot failed" />失败 <span class="stat-value">{{ stats.failed }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-dot blocked" />阻塞 <span class="stat-value">{{ stats.blocked }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-dot unexecuted" />未执行 <span class="stat-value">{{ stats.unexecuted }}</span>
    </div>
    <div class="stat-item">
      <span>执行率</span> <span class="stat-value">{{ stats.execRate }}%</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  stats: { type: Object, required: true },
})

const progressColors = [
  { color: '#f56c6c', percentage: 40 },
  { color: '#e6a23c', percentage: 70 },
  { color: '#67c23a', percentage: 100 },
]
</script>
