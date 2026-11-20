import { onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { findNode } from '../utils/tree'
import { copyNode, hasClipboard, peekClipboard } from '../utils/clipboard'

/**
 * xmind 风格快捷键编辑。
 *
 * 基础编辑:
 * - Tab:选中节点添加子节点(未选中时加到根节点),并进入标题编辑
 * - Enter:添加兄弟节点(根节点/未选中时等同 Tab)
 * - F2:编辑选中节点标题
 * - Delete / Backspace:删除选中节点(走调用方的确认逻辑)
 * - ← → ↑ ↓:在父/子/兄弟节点间移动选中
 * - Escape:取消选中
 *
 * 剪贴板与历史:
 * - ⌘/Ctrl+C:复制选中子树
 * - ⌘/Ctrl+X:剪切选中子树(无确认,可撤销)
 * - ⌘/Ctrl+V:粘贴为选中节点的子节点(未选中时粘贴到根节点)
 * - ⌘/Ctrl+Z:撤销;⌘/Ctrl+Shift+Z 或 Ctrl+Y:重做
 *
 * 输入框/文本域聚焦中、有弹窗打开时自动忽略。
 *
 * @param getRoot    () => 树根节点
 * @param selectedId ref<string|null>
 * @param editingId  ref<string|null>
 * @param addChild   async (parentNode) => 新建节点
 * @param addSibling async (parentNode, node) => 新建节点
 * @param removeNode (node) => void            删除(可带确认)
 * @param insertSubtree async (parentNode, subtree) => 插入后的节点
 * @param deleteDirect  async (node) => void   无确认删除(剪切用)
 * @param pasteImage    async (node, file) => void  粘贴外部图片到节点
 * @param undo / redo   async () => boolean    返回是否有可撤销/重做的操作
 */
export function useNodeShortcuts({
  getRoot,
  getNavigationRoot = getRoot,
  isMultiSelecting = () => false,
  selectedId,
  editingId,
  addChild,
  addSibling,
  removeNode,
  insertSubtree,
  deleteDirect,
  pasteImage,
  undo,
  redo,
}) {
  function isTyping() {
    const el = document.activeElement
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  }

  function dialogOpen() {
    return !!document.querySelector('.el-overlay')
  }

  function toast(message, type = 'info') {
    ElMessage({ message, type, duration: 1000 })
  }

  async function createAndEdit(created) {
    if (!created) return
    selectedId.value = created.id
    editingId.value = created.id
  }

  async function onKeydown(e) {
    if (e.defaultPrevented || dialogOpen() || isTyping()) return
    if (e.target?.closest?.('[role="menu"], [aria-haspopup="menu"][aria-expanded="true"]')) return
    if (['Enter', 'Tab', ' '].includes(e.key) && e.target?.closest?.('button, a[href], [role="button"]')) return
    const root = getRoot()
    if (!root) return
    const sel = selectedId.value ? findNode(root, selectedId.value) : null
    const mod = e.ctrlKey || e.metaKey

  /* ---------- ⌘/Ctrl 组合键:复制/剪切/撤销/重做(粘贴在 paste 事件中处理) ---------- */
    if (mod) {
      const k = e.key.toLowerCase()
      if (k === 'c' && sel) {
        e.preventDefault()
        copyNode(sel.node)
        toast(`已复制「${sel.node.title}」`)
      } else if (k === 'x' && sel && sel.parent) {
        e.preventDefault()
        copyNode(sel.node)
        await deleteDirect?.(sel.node)
        selectedId.value = null
        toast(`已剪切「${sel.node.title}」`)
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        const ok = await undo?.()
        toast(ok ? '已撤销' : '没有可撤销的操作')
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        const ok = await redo?.()
        toast(ok ? '已重做' : '没有可重做的操作')
      }
      return
    }

    if (e.altKey) return
    if (e.key === 'Escape') {
      selectedId.value = null
      return
    }
    const navigationRoot = getNavigationRoot()
    if (isMultiSelecting() || !navigationRoot) return

    /* ---------- 基础编辑键 ---------- */
    switch (e.key) {
      case 'Tab': {
        e.preventDefault()
        await createAndEdit(await addChild(sel ? sel.node : root))
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (sel && sel.parent) {
          await createAndEdit(await addSibling(sel.parent, sel.node))
        } else {
          await createAndEdit(await addChild(sel ? sel.node : root))
        }
        break
      }
      case 'F2': {
        if (sel) {
          e.preventDefault()
          editingId.value = sel.node.id
        }
        break
      }
      case 'Delete':
      case 'Backspace': {
        if (sel && sel.parent) {
          e.preventDefault()
          removeNode(sel.node)
        }
        break
      }
      case 'ArrowRight': {
        const visible = sel && findNode(navigationRoot, sel.node.id)
        if (visible?.node.children?.length) {
          e.preventDefault()
          selectedId.value = visible.node.children[0].id
        }
        break
      }
      case 'ArrowLeft': {
        if (sel?.parent) {
          e.preventDefault()
          selectedId.value = sel.parent.id
        }
        break
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const visible = sel && findNode(navigationRoot, sel.node.id)
        if (visible?.parent) {
          e.preventDefault()
          const siblings = visible.parent.children
          const idx = siblings.findIndex((c) => c.id === sel.node.id)
          const next = e.key === 'ArrowUp' ? idx - 1 : idx + 1
          if (next >= 0 && next < siblings.length) {
            selectedId.value = siblings[next].id
          }
        }
        break
      }
    }
  }

  /**
   * 统一处理粘贴(xmind 风格):
   * - 系统剪贴板含图片 → 插入为选中节点的图片
   * - 否则 → 粘贴内部剪贴板的子树
   */
  async function onPaste(e) {
    if (dialogOpen() || isTyping() || isMultiSelecting() || !getNavigationRoot()) return
    const root = getRoot()
    if (!root) return
    const sel = selectedId.value ? findNode(root, selectedId.value) : null

    const items = Array.from(e.clipboardData?.items || [])
    const imageItem = items.find((i) => i.type.startsWith('image/'))
    if (imageItem) {
      if (!sel) return toast('请先选中要插入图片的节点', 'warning')
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (file) await pasteImage?.(sel.node, file)
      return
    }

    // 内部子树粘贴
    if (!hasClipboard()) return
    e.preventDefault()
    const subtree = peekClipboard()
    const parent = sel ? sel.node : root
    const created = await insertSubtree?.(parent, subtree)
    if (created) {
      selectedId.value = created.id
      toast(`已粘贴到「${parent.title}」下`)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('paste', onPaste)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('paste', onPaste)
  })
}
