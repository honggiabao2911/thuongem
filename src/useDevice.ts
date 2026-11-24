import { useEffect, useRef, useState } from 'react'
import { empty, prediction } from '../shared/domain.ts'
import type { Data } from '../shared/domain.ts'
import { ConcurrentWrite, read, write } from './storage.ts'
import type { Saved } from './storage.ts'
import { ApiError, preparePlan, randomToken, request, subscribe, supported } from './push.ts'

function signature(data: Data) {
  const { before, due, ov, journal, care, zone, quiet, detailed, paused } = data.settings
  const { next, last, ov: estimate, assumed } = prediction(data)
  return JSON.stringify([before, due, ov, journal, care, zone, quiet, detailed, paused, next, last?.start, estimate, assumed])
}
export function useDevice() {
  const [saved, setSaved] = useState<Saved>()
  const [failed, setFailed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [issue, setIssue] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [publicKey, setKey] = useState<string | null>()
  const [worker, setWorker] = useState<ServiceWorkerRegistration>()
  const [version, refresh] = useState(0)
  const current = useRef<Saved | undefined>(undefined)
  const writes = useRef(Promise.resolve())
  const operations = useRef(Promise.resolve())
  const acting = useRef(false)

  useEffect(() => {
    read().then(value => {
      current.current = value ?? { data: empty() }
      setSaved(current.current)
    }).catch(() => setFailed(true))
    const update = () => { setOnline(navigator.onLine); refresh(v => v + 1) }
    const visible = () => { if (document.visibilityState === 'visible') update() }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    document.addEventListener('visibilitychange', visible)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(() => navigator.serviceWorker.ready)
        .then(setWorker).catch(() => setIssue('Không khởi tạo được service worker. Hãy kiểm tra HTTPS rồi tải lại.'))
    }
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.BASE_URL !== '/') { setKey(null); return }
    if (!online) return
    request<{ publicKey: string | null }>('config').then(v => setKey(v.publicKey)).catch(() => setKey(undefined))
  }, [online, version])

  function commit(change: (value: Saved) => Saved) {
    const result = writes.current.then(async () => {
      const previous = current.current!
      const sequence = previous.sequence ?? 0
      const next = { ...change(previous), sequence: sequence + 1 }
      try { await write(next, sequence) }
      catch (error) {
        if (error instanceof ConcurrentWrite) {
          current.current = error.latest
          setSaved(error.latest)
        }
        throw error
      }
      current.current = next
      setSaved(next)
    })
    writes.current = result.catch(error => setIssue(error instanceof ConcurrentWrite ? error.message :
      'Không lưu được trên thiết bị. Hãy kiểm tra dung lượng và thử lại.'))
    return result
  }
  function save(data: Data | ((data: Data) => Data)) {
    return commit(value => ({ ...value, data: typeof data === 'function' ? data(value.data) : data }))
  }
  function enqueue(work: () => Promise<void>) {
    const result = operations.current.then(work)
    operations.current = result.catch(error => setIssue(error instanceof Error ? error.message : 'Có lỗi. Hãy thử lại.'))
    return operations.current
  }
  async function sync(force = false) {
    await writes.current
    const snapshot = current.current
    const device = snapshot?.device
    if (!device?.registered || !snapshot || !navigator.onLine) return
    const signed = signature(snapshot.data)
    if (!force && device.signature === signed) return
    let revision = 0
    await commit(value => {
      revision = value.device!.revision + 1
      return { ...value, device: { ...value.device!, revision } }
    })
    try {
      const plan = await preparePlan(snapshot.data, device)
      const result = await request<{ syncedAt: number }>('plan', 'PUT', device.token, { revision, plan })
      await commit(value => ({ ...value, device: { ...value.device!, signature: signed, syncedAt: result.syncedAt } }))
      setIssue('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        await commit(value => ({ ...value, device: { ...device, registered: false, signature: undefined } }))
      throw error
    }
  }
  const pending = Boolean(saved?.device?.registered && saved.device.signature !== signature(saved.data))
  useEffect(() => {
    if (pending && online) void enqueue(() => sync())
  }, [saved?.data, pending, online, version])

  function action(task: () => Promise<void>) {
    if (acting.current) return
    acting.current = true
    setBusy(true)
    setIssue('')
    setStatus('')
    void enqueue(task).finally(() => { acting.current = false; setBusy(false) })
  }
  function enable(code: string) {
    if (!worker || !publicKey || !supported() || acting.current) return
    if (Notification.permission === 'denied') { setIssue('Quyền thông báo đã bị từ chối. Hãy kiểm tra cài đặt thông báo.'); return }
    // Permission and subscription must start in response to the click, before server or IndexedDB I/O.
    const subscription = subscribe(worker, publicKey).then(value => ({ value }), error => {
      refresh(v => v + 1)
      return { error: Notification.permission === 'denied' ? Error('Bạn chưa cấp quyền thông báo.') : error }
    })
    action(async () => {
      const result = await subscription
      if ('error' in result) throw result.error
      await writes.current
      const device = current.current!.device ?? { token: randomToken(), revision: 0, registered: false }
      await commit(value => ({ ...value, device }))
      const response = await request<{ revision: number }>('install', 'PUT', device.token, { code, subscription: result.value.toJSON() })
      await commit(value => ({ ...value, device: { ...device, revision: Math.max(device.revision, response.revision), registered: true } }))
      await sync(true)
      setStatus('Đã đăng ký thiết bị và đồng bộ lịch với máy chủ.')
    })
  }
  function test() {
    action(async () => {
      const device = current.current?.device
      if (!device?.registered) return
      try { await request('test', 'POST', device.token) }
      catch (error) {
        if (error instanceof ApiError && [404, 410].includes(error.status))
          await commit(value => ({ ...value, device: { ...device, registered: false, signature: undefined } }))
        throw error
      }
      setStatus('Dịch vụ push đã nhận yêu cầu thử. Hãy kiểm tra xem thông báo có xuất hiện trên thiết bị không.')
    })
  }
  function remove(clear = false) {
    action(async () => {
      await writes.current
      const device = current.current?.device
      if (device) {
        if (!navigator.onLine) throw Error('Cần kết nối mạng để xóa lịch trên máy chủ trước. Dữ liệu vẫn còn để bạn có thể thử lại.')
        await request('install', 'DELETE', device.token)
      }
      await commit(value => ({ data: clear ? empty() : value.data }))
      const existing = await worker?.pushManager?.getSubscription()
      if (existing) await existing.unsubscribe().catch(() => false)
      setStatus(clear ? 'Đã xóa dữ liệu.' : 'Đã xóa đăng ký và lịch nhắc trên máy chủ.')
    })
  }
  return { saved, failed, save, online, issue, status, busy, publicKey, worker, pending,
    enable, test, remove, retry: () => action(() => sync(true)) }
}
export type Controller = ReturnType<typeof useDevice>
