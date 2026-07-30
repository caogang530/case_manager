<template>
  <div
    class="page-card"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="page-toolbar">
      <h3 style="margin: 0">用例库</h3>
      <span class="spacer" />
      <el-button type="primary" @click="createDialogVisible = true">新建用例库</el-button>
      <el-button @click="triggerImport">导入 XMind</el-button>
      <input
        ref="fileInput"
        type="file"
        accept=".xmind,.zip,application/vnd.xmind.workbook,application/zip,application/x-zip-compressed"
        multiple
        style="display: none"
        @change="onImportFiles"
      />
    </div>

    <el-alert
      v-if="store.libraries.length === 0"
      type="info"
      :closable="false"
      show-icon
      title="点击「导入 XMind」选择 .xmind 文件,或直接把 .xmind 文件拖拽到本页面"
      style="margin-bottom: 12px"
    />

    <el-table :data="store.libraries" empty-text="还没有用例库,点击右上角新建或导入 XMind 文件">
      <el-table-column label="名称" min-width="220">
        <template #default="{ row }">
          <el-link type="primary" @click="$router.push(`/libraries/${row.id}`)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="用例数" width="100" align="center">
        <template #default="{ row }">{{ getLeaves(row.root).length }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="onRename(row)">重命名</el-button>
          <el-button size="small" @click="onExport(row)">导出</el-button>
          <el-popconfirm title="确定删除该用例库?" @confirm="store.remove(row.id)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialogVisible" title="新建用例库" width="420px">
      <el-input v-model="newName" placeholder="用例库名称" @keyup.enter="onCreate" />
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLibraryStore } from '../stores/library'
import { getLeaves } from '../utils/tree'
import { importXmind, exportXmind } from '../utils/xmind'

const store = useLibraryStore()
const createDialogVisible = ref(false)
const newName = ref('')
const fileInput = ref(null)
const dragOver = ref(false)

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return ElMessage.warning('请输入名称')
  await store.create(name)
  newName.value = ''
  createDialogVisible.value = false
  ElMessage.success('创建成功')
}

async function onRename(row) {
  const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
    inputValue: row.name,
    inputValidator: (v) => (v && v.trim() ? true : '名称不能为空'),
  })
  store.rename(row.id, value.trim())
}

async function onExport(row) {
  await exportXmind(row.root, row.name)
  ElMessage.success('已导出 .xmind 文件')
}

function triggerImport() {
  fileInput.value?.click()
}

async function importFiles(files) {
  for (const file of files) {
    try {
      const sheets = await importXmind(file)
      if (!sheets.length) {
        ElMessage.warning(`${file.name} 中没有可导入的内容`)
        continue
      }
      for (const sheet of sheets) {
        await store.create(sheet.title || file.name.replace(/\.xmind$/i, ''), sheet.root)
      }
      ElMessage.success(`已导入 ${file.name}(${sheets.length} 个画布)`)
    } catch (err) {
      console.error('导入失败', file.name, err)
      ElMessage.error(`导入 ${file.name} 失败:${err.message}`)
    }
  }
}

function onImportFiles(e) {
  importFiles(Array.from(e.target.files || []))
  e.target.value = ''
}

function onDrop(e) {
  dragOver.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (!files.length) return
  importFiles(files)
}
</script>
