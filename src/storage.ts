import type { Data } from '../shared/domain.ts'

export type Device = { token: string; registered: boolean; revision: number; signature?: string; syncedAt?: number }
export type Saved = { data: Data; device?: Device; sequence?: number }
export class ConcurrentWrite extends Error {
  latest: Saved
  constructor(latest: Saved) {
    super('Dữ liệu đã thay đổi trong một cửa sổ khác. Hãy kiểm tra và lưu lại.')
    this.latest = latest
  }
}
let opened: Promise<IDBDatabase> | undefined
function db() {
  return opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('thuong-em', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('device')
    request.onerror = () => { opened = undefined; reject(request.error) }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opened = undefined }
      resolve(request.result)
    }
  })
}
export async function read(): Promise<Saved | undefined> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const request = database.transaction('device').objectStore('device').get('state')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function write(value: Saved, sequence: number) {
  const database = await db()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('device', 'readwrite')
    const store = transaction.objectStore('device')
    const lookup = store.get('state')
    let conflict: ConcurrentWrite | undefined
    lookup.onsuccess = () => {
      const latest = lookup.result as Saved | undefined
      if (latest && (latest.sequence ?? 0) !== sequence) {
        conflict = new ConcurrentWrite(latest)
        transaction.abort()
        return
      }
      store.put(value, 'state')
    }
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(conflict ?? transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
