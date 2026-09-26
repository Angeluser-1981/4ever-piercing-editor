const DATABASE_NAME = '4ever-private-archive'
const DATABASE_VERSION = 1
const STACK_STORE = 'stacks'

let databasePromise

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('当前浏览器不支持本地工程存档。'))
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.createObjectStore(STACK_STORE, { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地工程档案。'))
  })
  return databasePromise
}

async function withStore(mode, operation) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STACK_STORE, mode)
    const store = transaction.objectStore(STACK_STORE)
    let result
    try {
      result = operation(store)
    } catch (error) {
      reject(error)
      return
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error || new Error('本地工程档案写入失败。'))
    transaction.onabort = () => reject(transaction.error || new Error('本地工程档案操作已取消。'))
  })
}

export async function listStacks() {
  const database = await openDatabase()
  const transaction = database.transaction(STACK_STORE, 'readonly')
  const records = await requestResult(transaction.objectStore(STACK_STORE).getAll())
  return records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export async function getStack(id) {
  const database = await openDatabase()
  const transaction = database.transaction(STACK_STORE, 'readonly')
  return requestResult(transaction.objectStore(STACK_STORE).get(id))
}

export function putStack(record) {
  return withStore('readwrite', (store) => store.put(record))
}

export function deleteStack(id) {
  return withStore('readwrite', (store) => store.delete(id))
}

export async function renameStack(id, name) {
  const record = await getStack(id)
  if (!record) throw new Error('找不到这份搭配档案。')
  record.name = name.trim()
  record.updatedAt = new Date().toISOString()
  await putStack(record)
  return record
}

export async function nextStackName() {
  const records = await listStacks()
  const maximum = records.reduce((current, record) => {
    const match = /^STACK_(\d+)$/i.exec(record.name || '')
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `STACK_${String(maximum + 1).padStart(3, '0')}`
}

export function createStackId() {
  if (crypto.randomUUID) return `stack-${crypto.randomUUID()}`
  return `stack-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function sourceToBlob(source) {
  const response = await fetch(source)
  if (!response.ok) throw new Error('无法读取图片素材。')
  return response.blob()
}
