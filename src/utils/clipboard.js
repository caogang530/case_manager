import { cloneTree, cloneTreeWithNewIds } from './tree'

/** 应用内节点剪贴板(模块级单例,跨页面共享:用例库复制 → 计划粘贴) */
let buffer = null

export function copyNode(node) {
  buffer = cloneTree(node)
}

export function hasClipboard() {
  return !!buffer
}

/** 取出剪贴板内容(重新生成 id 的副本,可重复粘贴) */
export function peekClipboard() {
  return buffer ? cloneTreeWithNewIds(buffer) : null
}
