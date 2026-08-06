/** 节点附加属性定义:图标、颜色。备注为纯文本无需定义。 */

/** 可选图标;marker 为该图标对应的 XMind markerId(导出让 XMind 也能显示,null 表示无对应) */
export const NODE_ICONS = [
  { key: 'star', emoji: '⭐', marker: 'star-red' },
  { key: 'flag', emoji: '🚩', marker: 'flag-red' },
  { key: 'question', emoji: '❓', marker: 'symbol-question' },
  { key: 'exclam', emoji: '❗', marker: 'symbol-exclam' },
  { key: 'info', emoji: 'ℹ️', marker: 'symbol-info' },
  { key: 'bulb', emoji: '💡', marker: null },
  { key: 'fire', emoji: '🔥', marker: null },
  { key: 'pin', emoji: '📌', marker: null },
  { key: 'bug', emoji: '🐛', marker: null },
  { key: 'clock', emoji: '⏰', marker: null },
  { key: 'heart', emoji: '❤️', marker: null },
  { key: 'like', emoji: '👍', marker: null },
]

export const ICON_BY_KEY = Object.fromEntries(NODE_ICONS.map((i) => [i.key, i]))

/** 从 XMind marker 反推图标(导入用,含同族颜色变体) */
export const MARKER_TO_ICON = {
  'star-red': 'star',
  'star-orange': 'star',
  'star-yellow': 'star',
  'star-green': 'star',
  'star-blue': 'star',
  'star-purple': 'star',
  'flag-red': 'flag',
  'flag-orange': 'flag',
  'flag-yellow': 'flag',
  'flag-green': 'flag',
  'flag-blue': 'flag',
  'flag-purple': 'flag',
  'symbol-question': 'question',
  'symbol-exclam': 'exclam',
  'symbol-info': 'info',
}

/** 可选节点背景色 */
export const NODE_COLORS = [
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#dbeafe',
  '#f3e8ff',
  '#fce7f3',
  '#e5e7eb',
]
