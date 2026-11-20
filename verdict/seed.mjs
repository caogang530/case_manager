const examples = [
  ['Account', '账号与认证', [
    ['验证码过期后仍可提交', 'P0', 'failed', '申请验证码并等待 5 分钟，重新提交旧验证码。', '旧验证码被拒绝，并提供重新发送入口。'],
    ['邮箱密码登录', 'P0', 'passed', '使用已验证的邮箱和正确密码登录。', '登录成功并进入首页。'],
    ['登录后恢复原访问页面', 'P1', 'passed'], ['密码重置链接可用', 'P1', 'passed'],
    ['多设备会话退出', 'P2', 'passed'], ['Apple ID 登录授权', 'P2', 'skipped'],
  ]],
  ['Checkout', '支付与结算', [
    ['重复点击支付按钮只生成一笔订单', 'P0', 'blocked', '在确认订单页面连续点击支付按钮两次。', '只创建一笔订单，也只发起一次扣款。'],
    ['优惠券与会员折扣叠加', 'P1', 'failed', '以会员账号创建订单并使用 20 元优惠券。', '金额按规则计算，明细与最终付款一致。'],
    ['支付失败后返回可重新尝试', 'P0', 'passed'], ['退款原路返回', 'P1', 'passed'],
    ['收银台展示税费明细', 'P1', 'passed'], ['无库存商品禁止下单', 'P2', 'todo'],
  ]],
  ['Discovery', '发现与搜索', [
    ['关键词搜索返回相关商品', 'P0', 'passed'], ['筛选条件可组合使用', 'P1', 'passed'],
    ['历史搜索可逐条清除', 'P2', 'passed'], ['无结果时显示建议', 'P1', 'passed'],
    ['弱网下保留搜索输入', 'P1', 'todo'], ['列表滑动恢复位置', 'P2', 'passed'],
  ]],
  ['Settings', '设置与权限', [
    ['通知权限弹窗仅出现一次', 'P1', 'passed'], ['已授权通知可正常触达', 'P1', 'passed'],
    ['同步偏好设置到新设备', 'P1', 'passed'], ['个人资料修改验证', 'P2', 'todo'],
    ['注销账号前提示数据影响', 'P0', 'todo'], ['无障碍字号设为最大', 'P2', 'todo'],
  ]],
]

export function createDemo() {
  const modules = []
  const cases = []
  const results = {}
  for (const [moduleIndex, [, title, items]] of examples.entries()) {
    const moduleId = `module-${moduleIndex + 1}`
    modules.push({ id: moduleId, title, parentId: null })
    for (const [caseIndex, [name, priority, status, steps, expected]] of items.entries()) {
      const id = `case-${moduleIndex * 6 + caseIndex + 1}`
      cases.push({ id, number: moduleIndex * 6 + caseIndex + 1, moduleId, title: name, priority,
        steps: steps || `在「${title}」场景中验证${name}。`, expected: expected || '功能符合预期，界面提示与实际结果一致。', note: '', image: null })
      if (status !== 'todo') results[id] = {
        status,
        note: status === 'blocked' ? '支付沙箱暂不可用，等待恢复后重试。' : status === 'failed' ? '实际行为与预期不一致，需复核。' : '',
        updatedAt: new Date(Date.now() - ((moduleIndex + caseIndex) % 5) * 86400000).toISOString(),
      }
    }
  }
  const suite = { id: 'mobile-suite', name: '移动端核心用例库', modules, cases }
  const plan = { id: 'release-280', name: '移动端 2.8.0', environment: '预发布环境', sourceId: suite.id,
    createdAt: new Date().toISOString(), modules: structuredClone(modules), cases: structuredClone(cases), results }
  return { version: 1, revision: 0, demo: true, suites: [suite], plans: [plan] }
}
