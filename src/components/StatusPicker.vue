<template>
  <span class="status-picker" :class="value" @click.stop @dblclick.stop>
    <i class="status-dot" aria-hidden="true" /><span>{{ STATUS[value].label }}</span><el-icon><ArrowDown /></el-icon>
    <select :value="value" :aria-label="`${title}的执行状态`" @change="$emit('change', $event.target.value)">
      <option v-for="(option, key) in STATUS" :key="key" :value="key">{{ option.label }}</option>
    </select>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { STATUS } from '../stores/plan'

const props = defineProps({ status: String, title: String })
defineEmits(['change'])
const value = computed(() => Object.hasOwn(STATUS, props.status) ? props.status : 'unexecuted')
</script>
