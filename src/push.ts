import { makePlan } from '../shared/schedule.ts'
import type { Data } from '../shared/domain.ts'
import type { Device } from './storage.ts'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('')
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map(n => n.toString(16).padStart(2, '0')).join('')
export async function request<T>(path: string, method = 'GET', token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch('/api/' + path, { method, headers, body: JSON.stringify(body), cache: 'no-store' })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, payload.error || 'Không kết nối được máy chủ.')
  return payload
}
function keyBytes(publicKey: string) {
  return Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.length % 4) % 4)), ch => ch.charCodeAt(0))
}
export function subscribe(registration: ServiceWorkerRegistration, publicKey: string) {
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
}
export async function preparePlan(data: Data, device: Device) {
  // Generate stable opaque identifiers without sending cycle dates in the identifiers.
  const plan = makePlan(data, Date.now())
  for (const job of plan.once) job.id = await hash(device.token + ':' + job.id)
  return plan
}
