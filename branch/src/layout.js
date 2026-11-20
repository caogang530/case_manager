import { palette } from './model.js'

const ROW = 49
const GROUP_GAP = 18
const COLUMN_GAP = 84
const HEIGHT = { root: 73, module: 42, case: 35 }

export function mapLayout(tree, collapsed = new Set()) {
  const entries = []
  const edges = []
  function measure(item, depth) {
    const visible = depth && collapsed.has(item.node.id) ? [] : item.children
    const children = visible.map((child) => measure(child, depth + 1))
    const spacing = depth === 0 ? GROUP_GAP : 0
    const span = children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, children.length - 1) * spacing
    return { ...item, children, span: Math.max(depth === 0 ? HEIGHT.root : ROW, span), spacing }
  }
  const measured = measure(tree, 0)
  function place(item, x, top, depth, branch, parent = null) {
    const kind = depth === 0 ? 'root' : item.node.kind
    const width = kind === 'root' ? 158 : kind === 'module' ? 144 : 237
    const height = HEIGHT[kind]
    const color = item.node.color || (depth > 1 ? parent.color : palette[branch % palette.length])
    const entry = { node: item.node, parent, x, y: top + (item.span - height) / 2, width, height, depth, color, kind }
    entries.push(entry)
    if (parent) edges.push({ from: parent, to: entry })
    let cursor = top
    item.children.forEach((child) => {
      place(child, x + width + COLUMN_GAP, cursor, depth + 1, depth ? branch : child.ordinal, entry)
      cursor += child.span + item.spacing
    })
  }
  place(measured, 0, 0, 0, 0)
  return { entries, edges, width: Math.max(...entries.map((entry) => entry.x + entry.width)), height: measured.span }
}
