import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Bell, CalendarClock, Download, Info, LockKeyhole, Plus, Save, Send, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react'
import { allDays, checkBackup, zoneLabel, settings as schema } from '../shared/domain.ts'
import type { Data, Settings } from '../shared/domain.ts'
import { clock, iCalendar, makePlan, occurrences } from '../shared/schedule.ts'
import { supported } from './push.ts'
import { Field, Modal, ProfileFields, profile, str } from './forms.tsx'
import type { Controller } from './useDevice.ts'

export const estimateNote = 'Các ngày hiển thị là ước tính dựa trên dữ liệu bạn ghi nhận. Không dùng ứng dụng để tránh thai hoặc chẩn đoán bệnh.'
export const recurrenceDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
let lastDownload: string | undefined
function download(content: string, name: string, type: string) {
  if (lastDownload) URL.revokeObjectURL(lastDownload)
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  lastDownload = url
}
function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="card stack"><div className="section-title">{icon}<h2>{title}</h2></div>{children}</section>
}
export function Information() {
  return <Panel title="Cách tính và nguồn tham khảo" icon={<Info size={21} />}>
    <p>{estimateNote}</p>
    <p>Độ dài chu kỳ được tính giữa hai ngày bắt đầu liên tiếp. Ứng dụng dùng trung vị của tối đa 6 khoảng gần nhất khi có ít nhất 2 khoảng hoàn chỉnh. Khi còn thiếu, ứng dụng dùng độ dài bạn đã nhập, nếu có. Mức biến động là chênh lệch giữa chu kỳ dài nhất và ngắn nhất trong nhóm gần đây.</p>
    <p>NHS mô tả rụng trứng thường xảy ra khoảng 10–16 ngày trước kỳ tiếp theo. Ứng dụng chọn mốc giữa là 13 ngày trước kỳ dự kiến và tô khoảng rộng từ 21 đến 9 ngày trước kỳ dự kiến, tính thêm 5 ngày trước và 1 ngày sau khoảng rụng trứng ước tính. Ứng dụng chỉ hiển thị khi có ít nhất 3 chu kỳ hoàn chỉnh, chênh lệch tối đa 7 ngày và độ dài ước tính từ 21 ngày. Đây là ngưỡng hiển thị của ứng dụng. <a href="https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/" target="_blank" rel="noreferrer">NHS về chu kỳ và rụng trứng</a> · <a href="https://www.mayoclinic.org/healthy-lifestyle/getting-pregnant/in-depth/how-to-get-pregnant/art-20047611" target="_blank" rel="noreferrer">Mayo Clinic về thời khoảng có khả năng thụ thai</a></p>
    <p>Đi cấp cứu nếu đau vùng chậu dữ dội hoặc tăng nhanh, hoặc đau vùng chậu kèm chảy máu âm đạo nhiều, choáng hay ngất. <a href="https://www.nhs.uk/symptoms/pelvic-pain/" target="_blank" rel="noreferrer">NHS về dấu hiệu cấp cứu</a></p>
    <p>Liên hệ cơ sở y tế sớm nếu đau vùng chậu hoặc đau kỳ kinh dữ dội, nặng hơn thường lệ và chưa giảm dù đã thử giảm đau. Nên đặt lịch khám nếu thường xuyên phải thay băng hoặc tampon mỗi 1–2 giờ, kỳ ra máu kéo dài hơn 7 ngày, ra máu giữa các kỳ hoặc triệu chứng cản trở sinh hoạt. <a href="https://www.nhs.uk/symptoms/period-pain/" target="_blank" rel="noreferrer">NHS về đau kỳ kinh</a> · <a href="https://www.nhs.uk/conditions/heavy-periods/" target="_blank" rel="noreferrer">NHS về kỳ kinh ra nhiều</a></p>
  </Panel>
}
function Days({ value, update }: { value: number[]; update: (value: number[]) => void }) {
  return <div className="chips" aria-label="Các ngày lặp">{allDays.map(day => <label className="chip" key={day}>
    <input type="checkbox" checked={value.includes(day)}
      onChange={e => update(e.target.checked ? [...value, day].sort() : value.filter(v => v !== day))} />{recurrenceDays[day - 1]}
  </label>)}</div>
}
const labels = { before: 'Sắp tới kỳ kinh', due: 'Đến ngày kỳ kinh dự kiến', ov: 'Sắp tới rụng trứng dự kiến', journal: 'Nhắc ghi nhật ký' } as const
function ReminderForm({ value, save }: { value: Settings; save: (value: Settings) => Promise<void> }) {
  const [draft, setDraft] = useState(value)
  const [custom, setCustom] = useState({ before: '', ov: '' })
  const [feedback, setFeedback] = useState('')
  function patch<K extends keyof Settings>(key: K, next: Settings[K]) {
    setDraft(old => ({ ...old, [key]: next }))
    setFeedback('')
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const current = schema.parse(draft)
      if (current.quiet?.from === current.quiet?.to && current.quiet) throw Error('Giờ yên lặng cần có hai mốc khác nhau.')
      if (current.journal.enabled && !current.journal.days.length) throw Error('Hãy chọn ngày nhắc nhật ký.')
      if ((current.before.enabled && !current.before.offsets.length) || (current.ov.enabled && !current.ov.offsets.length))
        throw Error('Hãy chọn ít nhất một mốc nhắc trước.')
      await save(current)
      setFeedback('Đã lưu tùy chỉnh trên thiết bị.')
    } catch (e) { setFeedback(e instanceof Error && e.name !== 'ZodError' ? e.message : 'Hãy kiểm tra tên, giờ và ngày lặp của lời nhắc.') }
  }
  return <form className="stack" onSubmit={submit}>
    <label className="check"><input type="checkbox" checked={draft.paused} onChange={e => patch('paused', e.target.checked)} /> Tạm dừng toàn bộ nhắc tự động</label>
    {(Object.keys(labels) as (keyof typeof labels)[]).map(key => {
      const config = draft[key]
      const offsetKey = key === 'before' || key === 'ov' ? key : undefined
      const updateOffsets = (offset: number) => {
        if (!offsetKey || !Number.isInteger(offset) || offset < 1 || offset > 30) return
        const current = draft[offsetKey]
        const offsets = current.offsets.includes(offset) ? current.offsets.filter(n => n !== offset) :
          [...current.offsets, offset].sort((a, b) => a - b)
        if (offsets.length > 15) { setFeedback('Bạn có thể chọn tối đa 15 mốc cho mỗi loại.'); return }
        patch(offsetKey, { ...current, offsets })
      }
      return <fieldset className="rule" key={key}><legend>{labels[key]}</legend>
        <div className="two compact"><label className="check"><input type="checkbox" checked={config.enabled} onChange={e => patch(key, { ...config, enabled: e.target.checked })} /> Bật lời nhắc</label>
          <Field label="Giờ gửi"><input type="time" required value={config.time} onChange={e => patch(key, { ...config, time: e.target.value })} /></Field></div>
        {offsetKey && <>
          <div className="chips">{[...new Set([1, 2, 3, 5, 7, ...draft[offsetKey].offsets])].sort((a, b) => a - b).map(n =>
            <label className="chip" key={n}><input type="checkbox" checked={draft[offsetKey].offsets.includes(n)} onChange={() => updateOffsets(n)} />Trước {n} ngày</label>)}</div>
          <div className="actions"><Field label="Mốc riêng (1–30 ngày)"><input type="number" min="1" max="30" value={custom[offsetKey]} onChange={e => setCustom({ ...custom, [offsetKey]: e.target.value })} /></Field>
            <button type="button" disabled={!custom[offsetKey]} onClick={() => {
              const n = Number(custom[offsetKey])
              if (!Number.isInteger(n) || n < 1 || n > 30) { setFeedback('Mốc riêng phải từ 1 đến 30 ngày.'); return }
              if (!draft[offsetKey].offsets.includes(n)) updateOffsets(n)
              setCustom({ ...custom, [offsetKey]: '' })
            }}><Plus size={16} /> Thêm mốc</button></div>
        </>}
        {key === 'journal' && <Days value={draft.journal.days} update={days => patch('journal', { ...draft.journal, days })} />}
      </fieldset>
    })}
    <fieldset className="rule"><legend>Lời nhắc chăm sóc riêng</legend>
      {draft.care.map(item => {
        const change = (next: Partial<typeof item>) => patch('care', draft.care.map(r => r.id === item.id ? { ...r, ...next } : r))
        return <div className="care-rule stack" key={item.id}>
          <Field label="Tên lời nhắc (chỉ trên máy)"><input required maxLength={65} value={item.label} onChange={e => change({ label: e.target.value })} /></Field>
          <div className="two"><label className="check"><input type="checkbox" checked={item.enabled} onChange={e => change({ enabled: e.target.checked })} /> Bật lời nhắc</label>
            <Field label="Giờ gửi"><input type="time" required value={item.time} onChange={e => change({ time: e.target.value })} /></Field></div>
          <Days value={item.days} update={days => change({ days })} />
          <button type="button" className="danger" onClick={() => patch('care', draft.care.filter(r => r.id !== item.id))}><Trash2 size={16} /> Bỏ lời nhắc</button>
        </div>
      })}
      <button type="button" disabled={draft.care.length >= 8} onClick={() => patch('care', [...draft.care, {
        id: crypto.randomUUID(), label: '', time: '20:30', enabled: true, days: allDays,
      }])}><Plus size={16} /> Thêm lời nhắc chăm sóc</button>
    </fieldset>
    <fieldset className="rule"><legend>Giờ yên lặng</legend>
      <label className="check"><input type="checkbox" checked={Boolean(draft.quiet)} onChange={e => patch('quiet', e.target.checked ? { from: '22:00', to: '07:00' } : undefined)} /> Bật giờ yên lặng</label>
      {draft.quiet && <div className="two"><Field label="Từ"><input type="time" required value={draft.quiet.from} onChange={e => patch('quiet', { ...draft.quiet!, from: e.target.value })} /></Field>
        <Field label="Đến"><input type="time" required value={draft.quiet.to} onChange={e => patch('quiet', { ...draft.quiet!, to: e.target.value })} /></Field></div>}
      <p className="muted small">Lời nhắc trong khoảng yên lặng sẽ dời tới giờ kết thúc. Ví dụ, 23:00 trong khoảng 22:00–07:00 sẽ dời sang 07:00 hôm sau.</p>
    </fieldset>
    <label className="check"><input type="checkbox" checked={draft.detailed} onChange={e => patch('detailed', e.target.checked)} /> Cho phép nội dung chi tiết trên màn hình khóa</label>
    <p className="muted small">Mặc định hiện “Bạn có một lời nhắc chăm sóc hôm nay 🌷”. Nội dung chi tiết có thể tiết lộ kỳ kinh hoặc ngày rụng trứng dự kiến với người nhìn màn hình.</p>
    {feedback && <p role="status" className="notice">{feedback}</p>}
    <button className="primary"><Save size={17} /> Lưu tùy chỉnh lời nhắc</button>
  </form>
}
function PushPanel({ data, controller }: { data: Data; controller: Controller }) {
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const device = controller.saved?.device
  const now = Date.now()
  const preview = occurrences(makePlan(data, now, true), now + 1, now + 366 * 86_400_000)
  const rows = preview.slice(0, 10)
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  const available = supported() && (!isAppleMobile || installed)
  const denied = available && Notification.permission === 'denied'
  const registered = device?.registered
  const state = denied ? 'Quyền bị từ chối' : !available ? 'Chưa hỗ trợ trong chế độ này' : registered ?
    (data.settings.paused ? 'Đang tạm dừng' : 'Đã bật') : controller.issue ? 'Đăng ký gặp lỗi' : 'Chưa bật'
  function jobLabel(id: string) {
    if (id.startsWith('care-')) return data.settings.care.find(c => id.startsWith('care-' + c.id + ':'))?.label ?? 'Chăm sóc'
    return labels[id.split(':')[0] as keyof typeof labels] ?? 'Chăm sóc'
  }
  return <>
    <Panel title="Thông báo tự động" icon={<Bell size={21} />}>
      <div className="notice"><strong>{state}</strong>
        {controller.pending ? <div>Lịch nhắc chưa đồng bộ với máy chủ.</div> :
          device?.syncedAt && registered ? <div>Máy chủ đã nhận lịch lúc {clock(device.syncedAt, data.settings.zone)}.</div> : null}
      </div>
      <p><Smartphone size={17} className="inline-icon" /> Trên iPhone dùng iOS 16.4 trở lên. Trong Safari, mở menu Chia sẻ, chọn Thêm vào MH chính, bật Mở dưới dạng ứng dụng web nếu có, rồi mở app từ biểu tượng trên màn hình chính.</p>
      {!registered && <p className="muted">Để gửi nhắc khi app đóng, máy chủ cần đăng ký push, thời điểm gửi, múi giờ và quy tắc lặp. Thời điểm nhắc vẫn là dữ liệu nhạy cảm. Nhật ký, tên lời nhắc riêng và lịch sử kỳ kinh được giữ trên thiết bị.</p>}
      {!registered && available && !denied && <div className="stack">
        {controller.publicKey === undefined && <p className="small muted">Chờ kết nối để kiểm tra cấu hình Web Push.</p>}
        {controller.publicKey === null && <p className="notice">Máy chủ chưa cấu hình Web Push. Bạn vẫn có thể xuất tệp lịch bên dưới.</p>}
        {controller.publicKey && <>
          <Field label="Mã kích hoạt từ người triển khai"><input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Tôi đồng ý gửi dữ liệu tối thiểu để nhận lời nhắc.</label>
          <button className="primary" disabled={!code || !consent || !controller.worker || !controller.online || controller.busy}
            onClick={() => controller.enable(code)}><Bell size={17} /> Bật thông báo</button>
        </>}
      </div>}
      {denied && <p className="muted">Kiểm tra quyền trong Cài đặt → Thông báo, hoặc dùng tệp lịch .ics.</p>}
      {registered && <div className="actions">
        <button disabled={controller.busy || !controller.online || denied} onClick={controller.test}><Send size={16} /> Gửi thông báo thử</button>
        {controller.pending && <button disabled={controller.busy || !controller.online} onClick={controller.retry}>Đồng bộ lại</button>}
      </div>}
      {device && <button className="danger" disabled={controller.busy}
        onClick={() => { if (confirm('Xóa đăng ký và toàn bộ lịch nhắc trên máy chủ?')) controller.remove() }}><Trash2 size={16} /> Xóa đăng ký và tắt push</button>}
      {controller.issue && <p className="notice error" role="alert">{controller.issue}</p>}
      {controller.status && <p className="notice" role="status">{controller.status}</p>}
      <p className="small muted">Giờ nhận có thể thay đổi theo mạng, quyền thông báo, Focus và cài đặt iPhone.</p>
    </Panel>
    <Panel title="Tùy chỉnh lịch nhắc" icon={<CalendarClock size={21} />}>
      <p className="muted">Múi giờ hiện tại <strong>{zoneLabel(data.settings.zone)}</strong>. Đổi múi giờ bên dưới để tính lại các mốc theo cùng giờ địa phương đã chọn.</p>
      <ReminderForm key={JSON.stringify([data.settings.before, data.settings.due, data.settings.ov, data.settings.journal,
        data.settings.quiet, data.settings.paused, data.settings.detailed, data.settings.care])} value={data.settings}
        save={s => controller.save(old => ({ ...old, settings: { ...old.settings, before: s.before, due: s.due, ov: s.ov,
          journal: s.journal, quiet: s.quiet, paused: s.paused, detailed: s.detailed, care: s.care } }))} />
    </Panel>
    <Panel title="Lời nhắc sắp tới" icon={<CalendarClock size={21} />}>
      <p className="muted small">{data.settings.paused ? 'Đang tạm dừng. Đây là bản xem trước theo tùy chỉnh đã lưu.' :
        'Tối đa 10 lần nhắc theo tùy chỉnh trên thiết bị. Mốc đã gửi sẽ không lặp lại khi đổi giờ.'}</p>
      {rows.length ? <ul className="schedule-list">{rows.map(row => <li key={row.id}>
        <strong>{jobLabel(row.id)}</strong><time dateTime={new Date(row.at).toISOString()}>{clock(row.at, data.settings.zone)}</time>
      </li>)}</ul> : <p className="muted">Chưa có lời nhắc sắp tới. Hãy thêm dữ liệu chu kỳ hoặc bật lời nhắc lặp.</p>}
      <button disabled={!preview.length} onClick={() => download(iCalendar(preview.filter(j => j.at <= now + 60 * 86_400_000 || !/^(journal|care-)/.test(j.id)), now), 'Thuong-Em-loi-nhac.ics', 'text/calendar;charset=utf-8')}><Download size={17} /> Xuất lịch .ics</button>
      <p className="small muted">Tệp lịch chứa các mốc chu kỳ dự kiến và tối đa 60 ngày nhắc lặp. Lịch đã nhập vào ứng dụng Lịch sẽ không tự cập nhật. Hãy xóa lịch cũ nếu muốn nhập lại.</p>
    </Panel>
  </>
}
export function SettingsPage({ controller, data }: { controller: Controller; data: Data }) {
  const [profileStatus, setProfileStatus] = useState('')
  const [imported, setImported] = useState<Data>()
  const [backupStatus, setBackupStatus] = useState('')
  async function updateProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      const next = profile(new FormData(e.currentTarget), data.settings)
      checkBackup({ ...data, settings: next }, Date.now())
      await controller.save(old => ({ ...old, settings: { ...old.settings, name: next.name, appName: next.appName,
        zone: next.zone, cycle: next.cycle, duration: next.duration, theme: next.theme, tips: next.tips } }))
      setProfileStatus('Đã lưu cài đặt.')
    } catch (error) { setProfileStatus((error as Error).message) }
  }
  async function restore(mode: 'merge' | 'replace') {
    if (!imported || !confirm(mode === 'replace' ? 'Thay thế toàn bộ dữ liệu theo dõi trên thiết bị?' : 'Hợp nhất dữ liệu từ bản sao lưu?')) return
    try {
      const by = <T,>(list: T[], key: (v: T) => string) => [...new Map(list.map(x => [key(x), x])).values()]
      const next = mode === 'replace' ? { ...imported, setup: true } : {
        ...data, periods: by([...imported.periods, ...data.periods], v => v.start),
        entries: by([...imported.entries, ...data.entries], v => v.date),
      }
      await controller.save(checkBackup(next, Date.now()))
      setImported(undefined); setBackupStatus('Đã nhập dữ liệu.')
    } catch { setBackupStatus('Không nhập được. Hãy kiểm tra kỳ trùng, ngày tương lai hoặc múi giờ.') }
  }
  return <div className="stack page-stack">
    <PushPanel data={data} controller={controller} />
    <Panel title="Cá nhân hóa" icon={<ShieldCheck size={21} />}>
      <form className="stack" onSubmit={updateProfile} key={JSON.stringify([data.settings.name, data.settings.appName,
        data.settings.zone, data.settings.cycle, data.settings.duration, data.settings.theme, data.settings.tips])}>
        <ProfileFields value={data.settings} />
        <button className="primary"><Save size={17} /> Lưu cài đặt</button>
      </form>
      {profileStatus && <p role="status" className="notice">{profileStatus}</p>}
    </Panel>
    <Panel title="Dữ liệu và riêng tư" icon={<LockKeyhole size={21} />}>
      <p>Dữ liệu theo dõi nằm trên thiết bị. Khi xóa dữ liệu web hoặc đổi máy, bạn có thể mất nhật ký. Hãy sao lưu định kỳ và cất tệp JSON ở nơi riêng tư.</p>
      <div className="actions"><button onClick={() => download(JSON.stringify(data, null, 2), 'Thuong-Em-sao-luu.json', 'application/json')}><Download size={17} /> Xuất JSON</button>
        <label className="button upload"><Upload size={17} /> Nhập JSON<input aria-label="Chọn bản sao lưu JSON" type="file" accept=".json,application/json" onChange={async e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBackupStatus('')
          try {
            if (file.size > 6_000_000) throw Error()
            setImported(checkBackup(JSON.parse(await file.text()), Date.now()))
          } catch { setBackupStatus('Bản sao lưu không hợp lệ hoặc vượt quá 6 MB.') }
        }} /></label>
        <button className="danger" disabled={controller.busy} onClick={() => {
          if (confirm('Xóa toàn bộ kỳ kinh, nhật ký, cài đặt và đăng ký nhắc? Thao tác này không thể hoàn tác.')) controller.remove(true)
        }}><Trash2 size={17} /> Xóa toàn bộ dữ liệu</button>
      </div>
      {backupStatus && <p role="status" className="notice">{backupStatus}</p>}
      {imported && <Modal title="Xem trước bản sao lưu" close={() => setImported(undefined)}>
        <div className="stack"><p>Phiên bản {imported.version} · {imported.periods.length} kỳ kinh · {imported.entries.length} ngày nhật ký</p>
          <p>Múi giờ {zoneLabel(imported.settings.zone)}. Hợp nhất giữ bản đang có nếu trùng ngày và giữ cài đặt hiện tại. Thay thế dùng toàn bộ nội dung tệp, kể cả cài đặt.</p>
          {backupStatus && <p role="alert">{backupStatus}</p>}
          <div className="actions"><button className="primary" onClick={() => void restore('merge')}>Hợp nhất</button>
            <button className="danger" onClick={() => void restore('replace')}>Thay thế</button></div>
        </div>
      </Modal>}
    </Panel>
    <Information />
  </div>
}
