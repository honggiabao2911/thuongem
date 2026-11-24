import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { X, Save, Trash2, CirclePlus } from 'lucide-react'
import { journal, settings, validatePeriods, vietnamZone } from '../shared/domain.ts'
import type { Data, Entry, Period, Settings } from '../shared/domain.ts'
import { symptomOptions } from './checkin.tsx'

export const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
export const num = (form: FormData, key: string) => str(form, key) === '' ? undefined : Number(str(form, key))
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return <dialog ref={node => { if (node && !node.open) node.showModal() }}
    onCancel={event => { event.preventDefault(); close() }} aria-labelledby="modal-title">
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-btn" aria-label="Đóng" onClick={close}><X /></button></div>
    {children}
  </dialog>
}
const symptomIcons = new Map<string, (typeof symptomOptions)[number][1]>(symptomOptions)
function choices(items: string[]) {
  return <><option value="">Chưa ghi</option>{items.map(x => <option key={x}>{x}</option>)}</>
}
export function EntryForm({ day, old, save, remove }: { day: string; old?: Entry; save: (value: Entry) => Promise<void>; remove: () => void }) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    try {
      await save(journal.parse({
        date: day, symptoms: f.getAll('symptom'), flow: str(f, 'flow') || undefined, pain: num(f, 'pain'),
        location: str(f, 'location'), mood: str(f, 'mood'), energy: str(f, 'energy') || undefined,
        sleep: num(f, 'sleep'), note: str(f, 'note'), lh: str(f, 'lh') || undefined, bbt: num(f, 'bbt'), temperature: num(f, 'temperature'),
      }))
    } catch { setError('Không lưu được. Hãy kiểm tra dữ liệu và thử lại.') }
  }
  return <form className="stack" onSubmit={submit}>
    <p className="muted small">Các mục đều tùy chọn. Ra máu lấm tấm được ghi riêng trong nhật ký.</p>
    <div className="two">
      <Field label="Lượng máu"><select name="flow" defaultValue={old?.flow}>{choices(['Không', 'Lấm tấm', 'Ít', 'Vừa', 'Nhiều'])}</select></Field>
      <Field label="Mức đau (0–10)"><input name="pain" type="number" min="0" max="10" defaultValue={old?.pain} /></Field>
    </div>
    <Field label="Vị trí đau"><input name="location" maxLength={120} defaultValue={old?.location} placeholder="Ví dụ bụng dưới" /></Field>
    <div className="two">
      <Field label="Tâm trạng"><input name="mood" maxLength={120} defaultValue={old?.mood} /></Field>
      <Field label="Mức năng lượng"><select name="energy" defaultValue={old?.energy}>{choices(['Thấp', 'Vừa', 'Cao'])}</select></Field>
    </div>
    <div className="two">
      <Field label="Giấc ngủ (giờ)"><input name="sleep" type="number" min="0" max="24" step=".1" defaultValue={old?.sleep} /></Field>
      <Field label="Thân nhiệt khi thấy mệt (°C)"><input name="temperature" type="number" min="30" max="45" step=".1" defaultValue={old?.temperature === undefined ? undefined : Math.round(old.temperature * 10) / 10} /></Field>
    </div>
    <fieldset><legend>Triệu chứng</legend><div className="symptom-grid">{[...new Set([...symptomIcons.keys(), ...(old?.symptoms ?? [])])].map(x => {
      const Icon = symptomIcons.get(x) ?? CirclePlus
      return <label className="symptom-tile" key={x}><input name="symptom" type="checkbox" value={x}
        defaultChecked={old?.symptoms.includes(x)} /><Icon size={22} aria-hidden="true" />{x}</label>
    })}</div></fieldset>
    <Field label="Ghi chú"><textarea name="note" rows={3} maxLength={3000} defaultValue={old?.note} /></Field>
    <details><summary>Que thử LH và nhiệt độ cơ bản</summary><div className="two">
      <Field label="Kết quả LH"><select name="lh" defaultValue={old?.lh}>{choices(['Âm tính', 'Dương tính', 'Không rõ'])}</select></Field>
      <Field label="Nhiệt độ (°C)"><input name="bbt" type="number" min="30" max="45" step=".01" defaultValue={old?.bbt} /></Field>
    </div><p className="muted small">Một kết quả LH hoặc một lần đo nhiệt độ chưa đủ để xác nhận rụng trứng.</p></details>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="actions"><button className="primary"><Save size={17} /> Lưu nhật ký</button>{old && <button type="button" className="danger" onClick={remove}><Trash2 size={17} /> Xóa</button>}</div>
  </form>
}
export function PeriodForm({ day, old, today, data, ending, save, remove }: {
  day: string; old?: Period; today: string; data: Data; ending?: boolean; save: (periods: Period[]) => Promise<void>; remove: () => void
}) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    try {
      const next = { start: str(f, 'start'), end: str(f, 'end') || undefined }
      await save(validatePeriods([...data.periods.filter(p => p.start !== old?.start), next], today))
    } catch (e) { setError((e as Error).message || 'Không lưu được kỳ kinh.') }
  }
  return <form className="stack" onSubmit={submit}>
    <Field label="Ngày bắt đầu"><input name="start" type="date" required max={today} defaultValue={old?.start ?? day} /></Field>
    <Field label="Ngày kết thúc (có thể để trống)"><input name="end" type="date" max={today} defaultValue={ending ? today : old?.end} /></Field>
    <p className="small muted">Để trống ngày kết thúc nếu kỳ đang diễn ra. Với các kỳ cũ, hãy ghi ngày kết thúc để có thể thêm các kỳ tiếp theo.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="actions"><button className="primary"><Save size={17} /> Lưu kỳ kinh</button>{old && <button type="button" className="danger" onClick={remove}><Trash2 size={17} /> Xóa kỳ</button>}</div>
  </form>
}
export function profile(f: FormData, old: Settings) {
  const result = settings.safeParse({ ...old, name: str(f, 'name'), appName: str(f, 'appName') || old.appName,
    zone: str(f, 'zone'), cycle: num(f, 'cycle'), duration: num(f, 'duration'),
    theme: str(f, 'theme') || old.theme, tips: f.has('tips') })
  if (!result.success) throw Error('Hãy kiểm tra múi giờ IANA, độ dài chu kỳ và số ngày hành kinh.')
  return result.data
}
export function ProfileFields({ value, setup }: { value: Settings; setup?: boolean }) {
  const [chosenZone, setChosenZone] = useState(value.zone)
  const isVietnam = chosenZone === vietnamZone || chosenZone === 'Asia/Saigon'
  return <>
    {!setup && <Field label="Tên hiển thị của ứng dụng"><input name="appName" maxLength={40} required defaultValue={value.appName} /></Field>}
    <Field label="Tên hoặc biệt danh (tùy chọn)"><input name="name" maxLength={40} autoComplete="off" defaultValue={value.name} placeholder="Tên bạn muốn được gọi" /></Field>
    <div className="two">
      <Field label="Độ dài chu kỳ (ngày)"><input name="cycle" type="number" min="1" max="365" placeholder="Chưa biết" defaultValue={value.cycle} /></Field>
      <Field label="Số ngày hành kinh"><input name="duration" type="number" min="1" max="90" placeholder="Chưa biết" defaultValue={value.duration} /></Field>
    </div>
    <Field label="Múi giờ">
      <select aria-label="Múi giờ" value={isVietnam ? 'vn' : 'other'} onChange={event => setChosenZone(event.target.value === 'vn' ? vietnamZone : '')}>
        <option value="vn">Việt Nam (UTC+7)</option><option value="other">Múi giờ khác</option>
      </select>
    </Field>
    {isVietnam ? <input type="hidden" name="zone" value={vietnamZone} /> :
      <Field label="Nhập tên múi giờ (IANA)"><input name="zone" required maxLength={80} value={chosenZone}
        list="zones" autoCapitalize="none" autoCorrect="off" onChange={event => setChosenZone(event.target.value)} /></Field>}
    <datalist id="zones">{['Asia/Bangkok', 'Asia/Tokyo', 'Europe/Paris', 'America/New_York', 'UTC'].map(z => <option key={z} value={z} />)}</datalist>
    {!setup && <><Field label="Giao diện"><select name="theme" defaultValue={value.theme}><option value="system">Theo hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></Field>
      <label className="check"><input type="checkbox" name="tips" defaultChecked={value.tips} /> Hiện gợi ý chăm sóc</label></>}
    {setup && <input type="hidden" name="tips" value="on" />}
  </>
}
