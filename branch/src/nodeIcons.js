export const nodeIconGroups = [
  { label: '旗帜', icons: [
    { id: 'flag-red', label: '红旗', glyph: '⚑', color: '#d13e55', marker: 'flag-red' },
    { id: 'flag-orange', label: '橙旗', glyph: '⚑', color: '#b46913', marker: 'flag-orange' },
    { id: 'flag-green', label: '绿旗', glyph: '⚑', color: '#00865e', marker: 'flag-green' },
    { id: 'flag-blue', label: '蓝旗', glyph: '⚑', color: '#336dcc', marker: 'flag-blue' },
  ] },
  { label: '星标', icons: [
    { id: 'star-yellow', label: '金星', glyph: '★', color: '#a96500', marker: 'star-yellow' },
    { id: 'star-red', label: '红星', glyph: '★', color: '#d13e55', marker: 'star-red' },
    { id: 'star-blue', label: '蓝星', glyph: '★', color: '#336dcc', marker: 'star-blue' },
    { id: 'star-purple', label: '紫星', glyph: '★', color: '#7952bd', marker: 'star-purple' },
  ] },
  { label: '提示', icons: [
    { id: 'exclam', label: '注意', glyph: '!', color: '#9b5800', marker: 'symbol-exclam' },
    { id: 'question', label: '待确认', glyph: '?', color: '#7952bd', marker: 'symbol-question' },
    { id: 'info', label: '信息', glyph: 'ℹ', color: '#336dcc', marker: 'symbol-info' },
    { id: 'bug', label: '缺陷', glyph: '🐛' },
    { id: 'bulb', label: '想法', glyph: '💡' },
    { id: 'pin', label: '置顶提醒', glyph: '📌' },
  ] },
  { label: '箭头', icons: [
    { id: 'arrow-up', label: '向上', glyph: '↑', color: '#00865e' },
    { id: 'arrow-down', label: '向下', glyph: '↓', color: '#d13e55' },
    { id: 'arrow-right', label: '向右', glyph: '→', color: '#336dcc' },
    { id: 'arrow-left', label: '向左', glyph: '←', color: '#7952bd' },
  ] },
]

export const iconByMarker = new Map(nodeIconGroups.flatMap(({ icons }) =>
  icons.filter(({ marker }) => marker).map(({ marker, id }) => [marker, id])))

export function iconsFor(ids) {
  if (!Array.isArray(ids) || !ids.length) return []
  return nodeIconGroups.map(({ icons }) => icons.find(({ id }) => ids.includes(id))).filter(Boolean)
}
