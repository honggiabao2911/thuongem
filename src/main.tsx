import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowRight, Bell, BookHeart, CalendarDays, ChartNoAxesColumnIncreasing, ChevronLeft,
  ChevronRight, CircleHelp, Droplet, Flower2, Heart, HeartPulse, House, LockKeyhole, Plus, Smile, Settings2, Sparkles, WifiOff } from 'lucide-react'
import { add, dayAt, diff, fmt, onPeriod, plain, prediction, sorted, validatePeriods } from '../shared/domain.ts'
import type { Data, Period } from '../shared/domain.ts'
import { EntryForm, Field, Modal, PeriodForm, ProfileFields, profile, str } from './forms.tsx'
import { estimateNote, Information, SettingsPage } from './settings.tsx'
import { CheckIn } from './checkin.tsx'
import { LockScreen, PrivacySettings, usePrivacy } from './privacy.tsx'
import type { Privacy } from './privacy.tsx'
import type { Controller } from './useDevice.ts'
import { HealthGuide } from './health.tsx'
import { useDevice } from './useDevice.ts'
import './style.css'

const tabs = [
  { name: 'Hôm nay', icon: House }, { name: 'Lịch', icon: CalendarDays },
  { name: 'Nhật ký', icon: BookHeart }, { name: 'Thống kê', icon: ChartNoAxesColumnIncreasing }, { name: 'Cài đặt', icon: Settings2 },
] as const
type Tab = typeof tabs[number]['name']
type Editor = { type: 'day' | 'period' | 'journal' | 'checkin'; day: string; old?: Period; ending?: boolean } | { type: 'info' | 'health' }

function Setup({ data, save }: { data: Data; save: (data: Data) => Promise<void> }) {
  const [history, setHistory] = useState<number[]>([])
  const [error, setError] = useState('')
  const today = dayAt(Date.now(), data.settings.zone)
  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const settings = profile(form, data.settings)
      const limit = dayAt(Date.now(), settings.zone)
      const periods = history.flatMap(id => {
        const start = str(form, 'start-' + id)
        return start ? [{ start, end: str(form, 'end-' + id) }] : []
      })
      const start = str(form, 'start')
      const end = str(form, 'end')
      if (end && !start) throw Error('Hãy nhập ngày bắt đầu kỳ gần nhất.')
      await save({ ...data, settings, setup: true, periods: validatePeriods([
        ...periods, ...(start ? [{ start, end: end || undefined }] : []),
      ], limit) })
    } catch (e) { setError((e as Error).message) }
  }
  return <section className="card setup stack">
    <div className="setup-intro"><div className="setup-flower" aria-hidden="true"><Flower2 strokeWidth={1} /></div><div className="brand-icon big"><Flower2 /></div>
      <h1>Chào mừng đến với Thương Em</h1>
      <p className="muted">Một nơi riêng tư để ghi lại chu kỳ và chăm sóc bản thân theo nhịp của bạn.</p></div>
    <form onSubmit={finish} className="stack">
      <ProfileFields value={data.settings} setup />
      <div className="two">
        <Field label="Bắt đầu kỳ gần nhất"><input name="start" type="date" /></Field>
        <Field label="Kết thúc kỳ gần nhất"><input name="end" type="date" /></Field>
      </div>
      <p className="small muted">Có thể để trống ngày bắt đầu nếu chưa biết. Nếu đã nhập ngày bắt đầu, để trống ngày kết thúc nghĩa là kỳ vẫn đang diễn ra.</p>
      {history.map((id, i) => <fieldset key={id} className="rule"><legend>Kỳ trước đó {i + 1}</legend>
        <div className="two"><Field label="Ngày bắt đầu"><input type="date" required name={'start-' + id} max={today} /></Field>
          <Field label="Ngày kết thúc"><input type="date" required name={'end-' + id} max={today} /></Field></div>
        <button type="button" onClick={() => setHistory(history.filter(value => value !== id))}>Bỏ kỳ này</button>
      </fieldset>)}
      <button type="button" onClick={() => setHistory([...history, (history.at(-1) ?? 0) + 1])}><Plus size={17} /> Thêm kỳ trước đây</button>
      <p className="small muted">Chu kỳ tính từ ngày bắt đầu kỳ này đến ngày bắt đầu kỳ kế tiếp. Lịch sử giúp cải thiện ước tính và các ngày dự kiến có thể thay đổi.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button className="primary">Lưu và bắt đầu <ArrowRight size={17} /></button>
        <button type="button" onClick={() => void save({ ...data, setup: true }).catch(() => setError('Không lưu được dữ liệu.'))}>Tôi chưa biết · Bỏ qua</button></div>
    </form>
  </section>
}

const phaseLabels = [
  { type: 'actual', symbol: '●', name: 'Hành kinh đã ghi' },
  { type: 'expected', symbol: '○', name: 'Kỳ kinh dự kiến' },
  { type: 'ov', symbol: '✧', name: 'Rụng trứng dự kiến' },
  { type: 'fertile', symbol: '≈', name: 'Có khả năng thụ thai (ước tính)' },
  { type: 'entry', symbol: '▣', name: 'Có nhật ký' },
  { type: 'spotting', symbol: '◇', name: 'Ra máu lấm tấm' },
  { type: 'symptoms', symbol: '✚', name: 'Có triệu chứng' },
  { type: 'mood', symbol: '♡', name: 'Có cảm xúc' },
] as const
function markers(data: Data, day: string, today: string, p: ReturnType<typeof prediction>) {
  const valid = p.next && p.next >= today
  const entry = data.entries.find(item => item.date === day)
  const flags = [
    onPeriod(data.periods, day, today), Boolean(valid && p.next && day >= p.next && day <= add(p.next, (p.duration ?? 1) - 1)),
    Boolean(valid && p.ov === day), Boolean(valid && p.fertile && day >= p.fertile.start && day <= p.fertile.end),
    Boolean(entry), entry?.flow === 'Lấm tấm', Boolean(entry?.symptoms.length || entry?.pain), Boolean(entry?.mood),
  ]
  return phaseLabels.filter((_, index) => flags[index])
}
const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
function DayButton({ day, today, marks, outside, select }: {
  day: string; today: string; marks: ReturnType<typeof markers>; outside?: boolean; select: (day: string) => void
}) {
  const phase = marks.find(mark => ['actual', 'expected', 'ov', 'fertile'].includes(mark.type))
  const signals = marks.filter(mark => ['entry', 'spotting', 'symptoms', 'mood'].includes(mark.type))
  const description = [fmt(day, { day: 'numeric', month: 'numeric', year: 'numeric' }),
    ...(day === today ? ['Hôm nay'] : []), ...marks.map(mark => mark.name)].join(', ')
  return <button className={['calendar-day', outside ? 'outside' : '', day === today ? 'current-day' : '', phase?.type ?? ''].join(' ')}
    onClick={() => select(day)} aria-label={description} aria-current={day === today ? 'date' : undefined}>
    <span className="day-number" aria-hidden="true">{plain(day).day}{phase && <small>{phase.symbol}</small>}</span>
    <span className="day-marks" aria-hidden="true">{signals.map(mark => <span key={mark.type} className={mark.type}>{mark.symbol}</span>)}</span>
  </button>
}
function WeekStrip({ data, today, select }: { data: Data; today: string; select: (day: string) => void }) {
  const start = add(today, 1 - plain(today).dayOfWeek)
  const p = prediction(data)
  return <section className="card week-card" aria-label="Tuần này">
    <div className="week-grid">
      {weekdays.map((label, index) => {
        const day = add(start, index)
        return <div key={day}><span className="weekday">{label}</span>
          <DayButton day={day} today={today} marks={markers(data, day, today, p)} select={select} /></div>
      })}
    </div>
  </section>
}
function Calendar({ data, today, select }: { data: Data; today: string; select: (day: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7) + '-01')
  const first = plain(month)
  const days = Array.from({ length: 42 }, (_, i) => add(month, i - first.dayOfWeek + 1))
  const p = prediction(data)
  return <section className="card stack">
    <div className="month-header"><button className="icon-btn" aria-label="Tháng trước" onClick={() => setMonth(first.subtract({ months: 1 }).toString())}><ChevronLeft /></button>
      <div className="month-title"><h2>{fmt(month, { month: 'long', year: 'numeric' })}</h2>
      {month !== today.slice(0, 7) + '-01' && <button onClick={() => setMonth(today.slice(0, 7) + '-01')}>Về tháng này</button>}</div>
      <button className="icon-btn" aria-label="Tháng sau" onClick={() => setMonth(first.add({ months: 1 }).toString())}><ChevronRight /></button></div>
    <div className="calendar">
      {weekdays.map(day => <div className="weekday" key={day}>{day}</div>)}
      {days.map(day => <DayButton key={day} day={day} today={today} marks={markers(data, day, today, p)}
        outside={day.slice(0, 7) !== month.slice(0, 7)} select={select} />)}
    </div>
    <div className="legend">{phaseLabels.map(m => <span key={m.type}><b className={m.type}>{m.symbol}</b> {m.name}</span>)}</div>
    <p className="muted small">{estimateNote}</p>
  </section>
}
function DayRecord({ entry }: { entry?: Data['entries'][number] }) {
  if (!entry) return null
  const rows = [
    ['Tâm trạng', entry.mood], ['Triệu chứng', entry.symptoms.join(', ')], ['Lượng máu', entry.flow],
    ['Mức đau', entry.pain !== undefined ? entry.pain + '/10' : undefined], ['Ghi chú', entry.note],
  ].filter(([, value]) => value)
  if (!rows.length) return null
  return <dl className="day-record">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
}
function PeriodList({ data, open }: { data: Data; open: (period: Period) => void }) {
  const periods = sorted(data.periods).reverse()
  return <section className="card stack"><div className="section-title"><Droplet size={20} /><h2>Lịch sử kỳ kinh</h2></div>
    {periods.length ? <ul className="records">{periods.map(p => <li key={p.start}><button className="record" onClick={() => open(p)}>
      <span><strong>{fmt(p.start, { day: 'numeric', month: 'long', year: 'numeric' })}</strong><br />
      <span className="small muted">{p.end ? 'Đến ' + fmt(p.end) + ' · ' + (diff(p.start, p.end) + 1) + ' ngày' : 'Đang diễn ra'}</span></span><ChevronRight size={19} />
    </button></li>)}</ul> : <p className="muted">Chưa có kỳ kinh nào. Hãy thêm ngày bắt đầu để tạo lịch sử.</p>}
  </section>
}
function Stats({ data, open }: { data: Data; open: (period: Period) => void }) {
  const p = prediction(data)
  const lengths = p.lengths.slice(-6)
  const list = sorted(data.periods)
  return <div className="stack">
    <section className="card stack"><div className="section-title"><ChartNoAxesColumnIncreasing size={21} /><h2>Độ dài chu kỳ</h2></div>
      {lengths.length ? <>
        <div className="two metrics"><div><span>Trung vị</span><strong>{p.typical} ngày</strong></div><div><span>Chênh lệch dài–ngắn</span><strong>{lengths.length > 1 ? p.spread + ' ngày' : '—'}</strong></div></div>
        <div className="bars">{lengths.map((length, i) => {
          const day = list[list.length - lengths.length - 1 + i].start
          return <div className="bar-row" key={day}><span>{fmt(day, { day: 'numeric', month: 'numeric' })}</span>
            <span className="bar-track" aria-hidden="true"><span style={{ width: length / Math.max(...lengths) * 100 + '%' }} /></span><strong>{length} ngày</strong></div>
        })}</div>
        <p className="small muted">Hiển thị tối đa 6 chu kỳ hoàn chỉnh gần nhất. {lengths.length < 2 ? 'Cần thêm dữ liệu để thấy mức biến động.' : 'Biến động mô tả lịch sử ghi nhận của bạn.'}</p>
      </> : <p className="muted">Ghi ít nhất hai ngày bắt đầu kỳ kinh để có độ dài chu kỳ đầu tiên.</p>}
    </section>
    {p.lengths.some(x => x < 21 || x > 35) || list.some(x => x.end && diff(x.start, x.end) >= 7) ?
      <p className="notice">Một số khoảng cách giữa hai kỳ nằm ngoài 21–35 ngày hoặc kỳ ghi nhận kéo dài hơn 7 ngày. Bạn có thể kiểm tra lại ngày nhập trong lịch sử.</p> : null}
    {p.lengths.length > lengths.length && <section className="card stack"><h2>Tất cả chu kỳ hoàn chỉnh</h2>
      <ul className="schedule-list">{p.lengths.map((length, i) => <li key={list[i].start}><time>{fmt(list[i].start, { day:'numeric', month:'numeric', year:'numeric' })}</time><strong>{length} ngày</strong></li>)}</ul>
    </section>}
    <PeriodList data={data} open={open} />
  </div>
}
function Today({ data, today, begin, end, diary, checkin, selectDay, info, health, settings, ignore }: {
  data: Data; today: string; begin: () => void; end?: () => void; diary: () => void; checkin: () => void; selectDay: (day: string) => void; info: () => void; health: () => void; settings: () => void; ignore: () => void
}) {
  const p = prediction(data)
  const active = onPeriod(data.periods, today, today)
  const left = p.next ? diff(today, p.next) : undefined
  const dateText = left === undefined ? 'Chưa đủ dữ liệu' : left < 0 ? (data.ignored === p.next ? 'Đã bỏ qua dự kiến' : 'Đã qua ngày dự kiến ' + -left + ' ngày') : left === 0 ? 'Dự kiến hôm nay' : left + ' ngày nữa'
  const cycleDay = p.last ? diff(p.last.start, today) + 1 : undefined
  const fraction = cycleDay && p.next && p.last ? Math.min(cycleDay / diff(p.last.start, p.next), 1) : 0
  const nearOv = p.ov && Math.abs(diff(today, p.ov)) <= 2 && p.next! >= today
  const periodStatus = active ? (p.last?.end === today ? 'Đã ghi kết thúc kỳ hôm nay' : 'Đang hành kinh · đã ghi nhận') :
    p.last ? 'Không ghi nhận đang hành kinh' : 'Chưa ghi nhận kỳ kinh'
  const care = active ? 'Nghỉ khi bạn cần. Nếu thấy dễ chịu, thử chườm ấm hoặc đi bộ nhẹ.' :
    left !== undefined && left >= 0 && left <= 4 ? 'Bạn có thể chuẩn bị sẵn sản phẩm kinh nguyệt và những món đồ giúp mình thoải mái.' :
    nearOv ? 'Ngày rụng trứng chỉ là ước tính. Nếu muốn, bạn có thể ghi lại dấu hiệu cơ thể trong nhật ký.' :
    'Dành một chút thời gian nghỉ ngơi, uống nước hoặc ghi lại cảm nhận hôm nay nếu bạn muốn.'
  const todayEntry = data.entries.find(entry => entry.date === today)
  return <div className="today-grid">
    <WeekStrip data={data} today={today} select={selectDay} />
    <section className="card hero">
      <div className="hero-top"><span className="hero-label"><Droplet size={15} /> Nhịp chu kỳ</span><button className="icon-btn subtle" aria-label="Cách tính dự đoán" onClick={info}><CircleHelp size={19} /></button></div>
      <div className="hero-content">
        <div className="cycle-ring" style={{ '--portion': fraction * 100 + '%' } as React.CSSProperties}>
          <div className="ring-face"><Flower2 size={19} /><strong>{cycleDay ?? '—'}</strong><span>{cycleDay ? 'Ngày chu kỳ' : 'Chưa ghi kỳ'}</span></div>
        </div>
        <div className="hero-copy">
          <p className="muted small">{periodStatus}</p>
          <h2>{dateText}</h2>
          <p>{p.next && !(left! < 0 && data.ignored === p.next) ? 'Kỳ tiếp theo dự kiến · ' + fmt(p.next) : 'Bạn có thể bổ sung lịch sử bất cứ lúc nào.'}</p>
          {p.next && p.initial && <span className="small muted">Ước tính ban đầu — chưa đủ lịch sử</span>}
        </div>
      </div>
      <div className="actions hero-actions">
        {end && <button className="primary" onClick={end}><Droplet size={17} /> Kết thúc kỳ kinh</button>}
        <button className={end ? '' : 'primary'} onClick={begin}><Plus size={17} /> Bắt đầu kỳ kinh</button>
        {left !== undefined && left < 0 && data.ignored !== p.next && <button onClick={ignore}>Bỏ qua dự kiến này</button>}
      </div>
    </section>
    <section className="card checkin-card">
      <div className="tile-icon rose"><Smile size={22} /></div>
      <div><h2>Hôm nay bạn cảm thấy thế nào?</h2>
        <p>{todayEntry?.mood || todayEntry?.symptoms.length ?
          [todayEntry.mood, ...todayEntry.symptoms.slice(0, 3)].filter(Boolean).join(' · ') :
          'Chọn cảm xúc, triệu chứng và mức đau của bạn.'}</p></div>
      <button className="primary" onClick={checkin}>{todayEntry ? 'Cập nhật cảm nhận' : 'Ghi cảm nhận'}</button>
    </section>
    <section className="card compact-card"><div className="tile-icon lavender"><Sparkles size={20} /></div><div><h2>Rụng trứng dự kiến</h2>
      <p>{p.ov && p.next! >= today ? fmt(p.ov) + ' · ước tính theo lịch' : 'Chưa đủ dữ liệu ổn định để hiện ngày cụ thể.'}</p></div></section>
    {data.settings.tips && <section className="card compact-card care"><div className="tile-icon rose"><Heart size={20} /></div><div><h2>Hôm nay nên làm gì</h2><p>{care}</p></div></section>}
    <button className="card compact-card shortcut" onClick={diary}><div className="tile-icon cream"><BookHeart size={20} /></div>
      <span><strong>Ghi nhật ký</strong><span>Ghi triệu chứng hoặc cảm nhận hôm nay.</span></span><ArrowDownRight size={21} /></button>
    <button className="card compact-card shortcut" onClick={settings}><div className="tile-icon lavender"><Bell size={20} /></div>
      <span><strong>Lịch nhắc của bạn</strong><span>Tùy chọn ngày và giờ nhắc chăm sóc.</span></span><ArrowDownRight size={21} /></button>
    <button className="card compact-card shortcut health-shortcut" onClick={health}>
      <div className="tile-icon rose"><HeartPulse size={20} /></div>
      <span><strong>Chăm sóc sức khỏe</strong><span>Cách giảm khó chịu và khi nào nên đi khám.</span></span><ArrowDownRight size={21} />
    </button>
    <p className="small muted footnote">{estimateNote}</p>
  </div>
}
function Journal({ data, today, edit }: { data: Data; today: string; edit: (day: string) => void }) {
  const [day, setDay] = useState(today)
  const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date))
  return <section className="card stack">
    <div className="actions"><Field label="Chọn ngày"><input type="date" value={day} max={today} onChange={e => setDay(e.target.value)} /></Field>
      <button className="primary" disabled={!day || day > today} onClick={() => edit(day)}><Plus size={17} /> Ghi nhật ký</button></div>
    {entries.length ? <ul className="records">{entries.map(e => <li key={e.date}><button className="record" onClick={() => edit(e.date)}>
      <span><strong>{fmt(e.date, { day: 'numeric', month: 'long', year: 'numeric' })}</strong><br />
        <span className="small muted">{[e.flow && 'Lượng máu: ' + e.flow.toLowerCase(), e.pain !== undefined && 'Đau ' + e.pain + '/10',
          e.mood, ...e.symptoms].filter(Boolean).join(' · ') || 'Đã ghi nhật ký'}</span></span><ChevronRight size={19} />
    </button></li>)}</ul> : <p className="muted">Chưa có nhật ký. Bạn có thể bắt đầu từ một cảm nhận ngắn, hoặc chỉ chọn mục muốn ghi.</p>}
  </section>
}

function App() {
  const privacy = usePrivacy()
  const controller = useDevice()
  if (privacy.locked) return <LockScreen privacy={privacy} />
  return <Workspace controller={controller} privacy={privacy} />
}

function Workspace({ controller, privacy }: { controller: Controller; privacy: Privacy }) {
  const data = controller.saved?.data
  const [tab, setTab] = useState<Tab>('Hôm nay')
  const [editor, setEditor] = useState<Editor>()
  const [todayTick, setTodayTick] = useState(Date.now())
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    const update = () => setTodayTick(Date.now())
    const timer = window.setInterval(update, 15_000)
    window.addEventListener('focus', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  useEffect(() => {
    const theme = data?.settings.theme ?? 'system'
    const system = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
        theme === 'dark' || (theme === 'system' && system.matches) ? '#211923' : '#fff3f8')
    }
    apply()
    system.addEventListener('change', apply)
    return () => system.removeEventListener('change', apply)
  }, [data?.settings.theme])
  useEffect(() => {
    document.title = data?.settings.appName ?? 'Thương Em'
    if (data && !data.setup) { setTab('Hôm nay'); setEditor(undefined) }
  }, [data])
  function navigate(next: Tab) { setTab(next); window.scrollTo(0, 0) }
  function notifyError() { setActionError('Không lưu được thay đổi. Hãy thử lại.') }
  if (controller.failed) return <main className="shell"><p className="notice error" role="alert">Không mở được dữ liệu trên thiết bị. Hãy bật quyền lưu trữ trang và thử lại.</p><button onClick={() => location.reload()}>Tải lại</button></main>
  if (!data) return <main className="shell"><p role="status">Đang mở nhật ký…</p></main>
  const today = dayAt(todayTick, data.settings.zone)
  const openPeriod = (p: Period) => setEditor({ type: 'period', old: p, day: p.start })
  const openJournal = (day: string) => setEditor({ type: 'journal', day })
  const openCheckIn = (day: string) => setEditor({ type: 'checkin', day })
  const active = data.periods.find(p => !p.end)
  const p = prediction(data)
  const close = () => setEditor(undefined)
  const editTitle = editor?.type === 'health' ? 'Chăm sóc sức khỏe' : editor?.type === 'info' ? 'Thông tin' : editor?.type === 'period' ?
    (editor.ending ? 'Kết thúc kỳ kinh' : editor.old ? 'Sửa kỳ kinh' : 'Ghi kỳ kinh') :
    editor?.type === 'checkin' ? 'Cảm nhận · ' + fmt(editor.day) : editor?.type === 'journal' ? 'Nhật ký · ' + fmt(editor.day) : editor?.type === 'day' ? fmt(editor.day, { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const descriptions: Record<Exclude<Tab, 'Hôm nay'>, string> = {
    Lịch: 'Xem các ngày đã ghi nhận và các mốc dự kiến.',
    'Nhật ký': 'Ghi lại những điều bạn muốn theo dõi.',
    'Thống kê': 'Xem lại nhịp chu kỳ từ dữ liệu của bạn.',
    'Cài đặt': 'Quản lý lời nhắc, giao diện và dữ liệu của bạn.',
  }
  return <>
    <header className="topbar"><div className="top-inner">
      <button className="brand" onClick={() => navigate('Hôm nay')}><span className="brand-icon"><Flower2 size={21} /></span><span>{data.settings.appName}</span></button>
      <div className="top-tools">{privacy.enabled && <button className="icon-btn subtle" aria-label="Khóa nhanh" onClick={privacy.lock}><LockKeyhole size={20} /></button>}
      <button className="top-action" onClick={() => data.setup ? navigate('Cài đặt') : setEditor({ type: 'info' })}>
        {data.setup ? <><Bell size={19} /><span>Lời nhắc</span></> : <><CircleHelp size={19} /><span>Thông tin</span></>}</button></div>
    </div></header>
    <main className={'shell' + (!data.setup ? ' setup-shell' : '')}>
      {!controller.online && <div className="notice offline" role="status"><WifiOff size={17} /> Đang offline. Dữ liệu vẫn lưu trên máy.{controller.pending ? ' Lịch nhắc chưa đồng bộ.' : ''}</div>}
      {actionError && <p role="alert" className="notice error">{actionError} <button onClick={() => setActionError('')}>Đóng</button></p>}
      {!data.setup ? <Setup data={data} save={controller.save} /> : <>
        <div className="page-heading">
          {tab === 'Hôm nay' ? <><p className="date-line"><CalendarDays size={17} />{fmt(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1>{data.settings.name ? 'Chào ' + data.settings.name : 'Hôm nay'}</h1><p>Một chút thời gian để lắng nghe cơ thể.</p></> :
            <><h1>{tab}</h1><p>{descriptions[tab]}</p></>}
        </div>
        {tab === 'Hôm nay' && <Today data={data} today={today} begin={() => setEditor({ type: 'period', day: today })}
          end={active ? () => setEditor({ type: 'period', day: today, old: active, ending: true }) : undefined}
          diary={() => openJournal(today)} checkin={() => openCheckIn(today)} selectDay={day => setEditor({ type: 'day', day })} info={() => setEditor({ type: 'info' })} health={() => setEditor({ type: 'health' })} settings={() => navigate('Cài đặt')}
          ignore={() => void controller.save(old => ({ ...old, ignored: p.next })).catch(notifyError)} />}
        {tab === 'Lịch' && <div className="stack"><Calendar data={data} today={today} select={day => setEditor({ type: 'day', day })} />
          <PeriodList data={data} open={openPeriod} /></div>}
        {tab === 'Nhật ký' && <Journal data={data} today={today} edit={openJournal} />}
        {tab === 'Thống kê' && <Stats data={data} open={openPeriod} />}
        {tab === 'Cài đặt' && <div className="stack"><PrivacySettings privacy={privacy} /><SettingsPage data={data} controller={controller} /></div>}
        <div className="privacy-footer"><LockKeyhole size={14} /> Nhật ký lưu trên thiết bị</div>
      </>}
    </main>
    {data.setup && <nav className="bottom-nav" aria-label="Điều hướng chính"><div className="nav-inner">{tabs.map(({ name, icon: Icon }) =>
      <button key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><span className="nav-icon"><Icon size={20} /></span>{name}</button>
    )}</div></nav>}
    {editor && <Modal title={editTitle} close={close}>
      {editor.type === 'info' && <Information />}
      {editor.type === 'health' && <HealthGuide />}
      {editor.type === 'period' && <PeriodForm key={'period-' + editor.day} day={editor.day} old={editor.old} today={today} data={data} ending={editor.ending}
        save={async periods => { await controller.save(old => ({ ...old, periods, ignored: undefined })); close() }}
        remove={() => {
          if (!confirm('Xóa kỳ kinh này khỏi lịch sử?')) return
          void controller.save(old => ({ ...old, periods: old.periods.filter(p => p.start !== editor.old?.start), ignored: undefined }))
            .then(close).catch(notifyError)
        }} />}
      {editor.type === 'journal' && <EntryForm key={'entry-' + editor.day} day={editor.day} old={data.entries.find(e => e.date === editor.day)}
        save={async entry => { await controller.save(old => ({ ...old, entries: [...old.entries.filter(e => e.date !== entry.date), entry] })); close() }}
        remove={() => {
          if (!confirm('Xóa nhật ký ngày này?')) return
          void controller.save(old => ({ ...old, entries: old.entries.filter(e => e.date !== editor.day) })).then(close).catch(notifyError)
        }} />}
      {editor.type === 'checkin' && <CheckIn key={editor.day} day={editor.day} old={data.entries.find(e => e.date === editor.day)}
        save={async entry => { await controller.save(old => ({ ...old, entries: [...old.entries.filter(e => e.date !== entry.date), entry] })); close() }} />}
      {editor.type === 'day' && <div className="stack">
        <p>{markers(data, editor.day, today, p).map(m => m.symbol + ' ' + m.name).join(' · ') || 'Chưa có dữ liệu cho ngày này.'}</p>
        <DayRecord entry={data.entries.find(e => e.date === editor.day)} />
        {editor.day <= today ? <div className="actions">
          <button onClick={() => openCheckIn(editor.day)}><Smile size={17} /> Ghi cảm nhận</button>
          <button className="primary" onClick={() => setEditor({
            type: 'period', day: editor.day, old: data.periods.find(p => p.start <= editor.day && (p.end ?? today) >= editor.day),
          })}><Droplet size={17} /> {onPeriod(data.periods, editor.day, today) ? 'Sửa kỳ kinh' : 'Thêm kỳ kinh'}</button>
          <button onClick={() => openJournal(editor.day)}><BookHeart size={17} /> {data.entries.some(e => e.date === editor.day) ? 'Sửa nhật ký' : 'Ghi nhật ký'}</button>
        </div> : <p className="muted small">Bạn có thể ghi dữ liệu khi ngày này đến.</p>}
      </div>}
    </Modal>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
