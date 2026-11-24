import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Flower2, LockKeyhole } from 'lucide-react'
import { Field } from './forms.tsx'

const key = 'thuong-em:screen-lock:v1'
const cooldownKey = key + ':cooldown'
const format = /^\d{6}$/
type Lock = { salt: string; hash: string }
const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')
async function digest(pin: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000,
    salt: Uint8Array.from(salt.match(/../g)!, part => parseInt(part, 16)),
  }, material, 256)
  return hex(new Uint8Array(bits))
}
function readLock(): Lock | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    return typeof value?.salt === 'string' && /^[a-f0-9]{32}$/.test(value.salt) &&
      typeof value.hash === 'string' && /^[a-f0-9]{64}$/.test(value.hash) ? value : null
  } catch { return null }
}
export function usePrivacy() {
  const [config, setConfig] = useState(readLock)
  const [locked, setLocked] = useState(Boolean(config))
  useEffect(() => {
    const background = () => { if (document.hidden && config) setLocked(true) }
    const leave = () => { if (config) setLocked(true) }
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return
      const next = readLock()
      setConfig(next)
      setLocked(Boolean(next))
    }
    document.addEventListener('visibilitychange', background)
    window.addEventListener('pagehide', leave)
    window.addEventListener('storage', changed)
    return () => {
      document.removeEventListener('visibilitychange', background)
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('storage', changed)
    }
  }, [config])
  async function unlock(pin: string) {
    const current = readLock()
    if (!current) { setConfig(null); setLocked(false); return }
    if (Number(localStorage.getItem(cooldownKey)) > Date.now()) throw Error('Hãy đợi 5 giây sau lần nhập sai rồi thử lại.')
    if (!format.test(pin) || await digest(pin, current.salt) !== current.hash) {
      localStorage.setItem(cooldownKey, String(Date.now() + 5000))
      throw Error('Mã PIN chưa đúng. Bạn có thể thử lại sau 5 giây.')
    }
    if (JSON.stringify(readLock()) !== JSON.stringify(current)) throw Error('Mã PIN đã thay đổi. Hãy thử lại.')
    localStorage.removeItem(cooldownKey)
    if (document.hidden) return
    setConfig(current)
    setLocked(false)
  }
  async function update(pin: string, current: string) {
    const previous = readLock()
    if (previous && (!format.test(current) || await digest(current, previous.salt) !== previous.hash)) throw Error('Mã PIN hiện tại chưa đúng.')
    if (pin && !format.test(pin)) throw Error('Chọn mã PIN gồm 6 chữ số.')
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
    const next = pin ? { salt, hash: await digest(pin, salt) } : null
    if (JSON.stringify(readLock()) !== JSON.stringify(previous)) throw Error('Khóa vừa thay đổi ở cửa sổ khác. Hãy thử lại.')
    if (next) localStorage.setItem(key, JSON.stringify(next))
    else localStorage.removeItem(key)
    localStorage.removeItem(cooldownKey)
    setConfig(next)
    setLocked(Boolean(next && document.hidden))
  }
  return { enabled: Boolean(config), locked: Boolean(config && locked), lock: () => setLocked(true), unlock, update }
}
export type Privacy = ReturnType<typeof usePrivacy>
function PinField({ label, name }: { label: string; name: string }) {
  return <Field label={label}><input type="password" name={name} inputMode="numeric" autoComplete="off" minLength={6} maxLength={6}
    pattern="[0-9]{6}" required /></Field>
}
export function LockScreen({ privacy }: { privacy: Privacy }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const pin = String(new FormData(form).get('pin'))
    setBusy(true)
    setError('')
    try { await privacy.unlock(pin) }
    catch (e) { setError((e as Error).message); form.reset() }
    finally { setBusy(false) }
  }
  return <main className="shell lock-shell"><section className="card stack lock-card">
    <div className="brand-icon big"><Flower2 /></div>
    <h1>Thương Em đã khóa</h1>
    <p className="muted">Nhập mã PIN để mở nhật ký trên thiết bị này.</p>
    <form className="stack" onSubmit={submit}>
      <PinField label="Mã PIN" name="pin" />
      {error && <p role="alert" className="notice error">{error}</p>}
      <button className="primary" disabled={busy}><LockKeyhole size={18} /> Mở khóa</button>
    </form>
  </section></main>
}
export function PrivacySettings({ privacy }: { privacy: Privacy }) {
  const [mode, setMode] = useState<'set' | 'remove'>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const pin = String(f.get('new') ?? '')
    if (mode === 'set' && pin !== f.get('repeat')) { setError('Hai mã PIN mới chưa trùng nhau.'); return }
    setBusy(true)
    setError('')
    try { await privacy.update(pin, String(f.get('current') ?? '')); setMode(undefined) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="card stack">
    <div className="section-title"><LockKeyhole size={21} /><h2>Khóa màn hình</h2></div>
    <p className="muted">Mã PIN che nhật ký khi mở lại hoặc chuyển khỏi app. Dữ liệu và bản sao lưu chưa được mã hóa. Mã PIN chỉ lưu trên thiết bị này và không có chức năng khôi phục.</p>
    <div className="actions">
      {privacy.enabled && <button type="button" className="primary" onClick={privacy.lock}>Khóa ngay</button>}
      <button type="button" onClick={() => { setError(''); setMode('set') }}>{privacy.enabled ? 'Đổi mã PIN' : 'Đặt mã PIN'}</button>
      {privacy.enabled && <button type="button" onClick={() => { setError(''); setMode('remove') }}>Tắt khóa PIN</button>}
    </div>
    {mode && <form key={mode} onSubmit={submit} className="stack">
      {privacy.enabled && <PinField label="Mã PIN hiện tại" name="current" />}
      {mode === 'set' && <><PinField label="Mã PIN mới (6 số)" name="new" /><PinField label="Nhập lại mã PIN mới" name="repeat" /></>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button className="primary" disabled={busy}>{mode === 'remove' ? 'Xác nhận tắt khóa' : 'Lưu mã PIN'}</button>
        <button type="button" disabled={busy} onClick={() => setMode(undefined)}>Hủy</button></div>
    </form>}
  </section>
}
