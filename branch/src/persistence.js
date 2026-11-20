function connect() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('branch-workspace', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readWorkspace() {
  const db = await connect()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get('workspace')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function saveWorkspace(workspace) {
  const db = await connect()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('state', 'readwrite')
      transaction.objectStore('state').put(workspace, 'workspace')
      transaction.oncomplete = resolve
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
