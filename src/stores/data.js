/** 后端 API 客户端。数据统一存 SQLite,由 FastAPI 提供服务。 */

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.status
    try {
      detail = (await res.json()).detail || res.status
    } catch {
      /* ignore */
    }
    throw new Error(`${options.method || 'GET'} ${path} 失败:${detail}`)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  getLibraries: () => request('/api/libraries'),
  createLibrary: (lib) => request('/api/libraries', { method: 'POST', body: JSON.stringify(lib) }),
  updateLibrary: (id, patch) =>
    request(`/api/libraries/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteLibrary: (id) => request(`/api/libraries/${id}`, { method: 'DELETE' }),

  getPlans: () => request('/api/plans'),
  createPlan: (plan) => request('/api/plans', { method: 'POST', body: JSON.stringify(plan) }),
  updatePlan: (id, patch) =>
    request(`/api/plans/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deletePlan: (id) => request(`/api/plans/${id}`, { method: 'DELETE' }),
}

/** 读取旧版 localStorage 数据(一次性迁移用) */
export function readLegacy(key) {
  try {
    return JSON.parse(localStorage.getItem(`xcm:${key}`) || '[]')
  } catch {
    return []
  }
}

export function clearLegacy(key) {
  localStorage.removeItem(`xcm:${key}`)
}
