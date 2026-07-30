<template>
  <div class="page-card">
    <div class="page-toolbar">
      <h3 style="margin: 0">测试计划</h3>
      <span class="spacer" />
      <el-button type="primary" @click="openCreate">新建测试计划</el-button>
    </div>

    <el-table :data="plansWithStats" empty-text="还没有测试计划,点击右上角从用例库创建">
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">
          <el-link type="primary" @click="$router.push(`/plans/${row.id}`)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="来源用例库" prop="libraryName" min-width="140" />
      <el-table-column label="通过率" min-width="220">
        <template #default="{ row }">
          <div style="display: flex; align-items: center; gap: 8px">
            <el-progress
              :percentage="row.stats.passRate"
              :stroke-width="10"
              style="flex: 1"
              :color="passColor(row.stats.passRate)"
            />
            <span style="font-size: 12px; color: #909399; white-space: nowrap">
              {{ row.stats.passed }}/{{ row.stats.total }}
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="失败/阻塞/未执行" width="150" align="center">
        <template #default="{ row }">
          <span style="color: #f56c6c">{{ row.stats.failed }}</span> /
          <span style="color: #e6a23c">{{ row.stats.blocked }}</span> /
          <span style="color: #909399">{{ row.stats.unexecuted }}</span>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="onRename(row)">重命名</el-button>
          <el-popconfirm title="确定删除该测试计划?" @confirm="store.remove(row.id)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialogVisible" title="从用例库新建测试计划" width="460px">
      <el-form label-width="90px">
        <el-form-item label="计划名称">
          <el-input v-model="newPlanName" placeholder="例如:V1.2.0 回归测试" />
        </el-form-item>
        <el-form-item label="用例库">
          <el-select v-model="selectedLibraryId" placeholder="选择一个用例库" style="width: 100%">
            <el-option
              v-for="lib in libraryStore.libraries"
              :key="lib.id"
              :label="`${lib.name}(${getLeaves(lib.root).length} 条用例)`"
              :value="lib.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="libraryStore.libraries.length === 0"
        type="warning"
        :closable="false"
        title="还没有用例库,请先在「用例库」页面新建或导入"
      />
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedLibraryId" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePlanStore } from '../stores/plan'
import { useLibraryStore } from '../stores/library'
import { getLeaves } from '../utils/tree'

const store = usePlanStore()
const libraryStore = useLibraryStore()
const router = useRouter()

const createDialogVisible = ref(false)
const newPlanName = ref('')
const selectedLibraryId = ref('')

const plansWithStats = computed(() =>
  store.plans.map((p) => ({ ...p, stats: store.statsOf(p.id) }))
)

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function passColor(rate) {
  if (rate >= 70) return '#67c23a'
  if (rate >= 40) return '#e6a23c'
  return '#f56c6c'
}

function openCreate() {
  newPlanName.value = ''
  selectedLibraryId.value = libraryStore.libraries[0]?.id || ''
  createDialogVisible.value = true
}

async function onCreate() {
  const library = libraryStore.getById(selectedLibraryId.value)
  if (!library) return ElMessage.warning('请选择用例库')
  const name = newPlanName.value.trim() || `${library.name} - 测试计划`
  const plan = await store.createFromLibrary(name, library)
  createDialogVisible.value = false
  ElMessage.success('已创建测试计划(用例已快照复制,与用例库互不影响)')
  router.push(`/plans/${plan.id}`)
}

async function onRename(row) {
  const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
    inputValue: row.name,
    inputValidator: (v) => (v && v.trim() ? true : '名称不能为空'),
  })
  store.rename(row.id, value.trim())
}
</script>
