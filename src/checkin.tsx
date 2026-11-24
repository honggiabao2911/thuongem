import { useState } from 'react'
import { Activity, BatteryLow, Check, CloudRain, Droplet, Flame, Frown, Heart, Meh, Moon, Smile, Sparkles, Thermometer, Waves, Wind, Zap } from 'lucide-react'
import type { Entry } from '../shared/domain.ts'
import { journal } from '../shared/domain.ts'

export const symptomOptions = [
  ['Co thắt bụng', Activity], ['Đầy bụng', Wind], ['Đau đầu', Zap], ['Đau lưng', Flame],
  ['Căng ngực', Heart], ['Mệt mỏi', BatteryLow], ['Buồn nôn', Waves], ['Khó ngủ', Moon],
  ['Da nổi mụn', Sparkles], ['Táo bón', Activity], ['Tiêu chảy', Waves], ['Tiết dịch', Droplet],
  ['Sốt', Thermometer], ['Chóng mặt', Wind], ['Ớn lạnh', Moon], ['Đau họng', Activity],
] as const
const flowOptions = ['Không', 'Lấm tấm', 'Ít', 'Vừa', 'Nhiều'] as const
const moods = [['Vui vẻ', Smile], ['Bình thường', Meh], ['Bồn chồn', Zap], ['Buồn', CloudRain], ['Cáu gắt', Frown], ['Thư thái', Heart]] as const

export function CheckIn({ day, old, save }: { day: string; old?: Entry; save: (entry: Entry) => Promise<void> }) {
  const [index, setIndex] = useState(0)
  const [mood, setMood] = useState(old?.mood ?? '')
  const [symptoms, setSymptoms] = useState(old?.symptoms ?? [])
  const [pain, setPain] = useState<number | undefined>(old?.pain)
  const [flow, setFlow] = useState(old?.flow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const steps = ['Cảm xúc', 'Triệu chứng', 'Mức đau', 'Ra máu']
  async function finish() {
    setBusy(true)
    setError('')
    try {
      if (old || mood || symptoms.length || pain !== undefined || flow) await save(journal.parse({ ...old, date: day, mood: mood || undefined, symptoms, pain, flow }))
    } catch { setError('Không lưu được nhật ký. Hãy thử lại.') }
    finally { setBusy(false) }
  }
  function skip() {
    if (index === 0) setMood(old?.mood ?? '')
    if (index === 1) setSymptoms(old?.symptoms ?? [])
    if (index === 2) setPain(old?.pain)
    setIndex(index + 1)
  }
  return <div className="stack">
    <ol className="checkin-progress">{steps.map((step, i) => <li key={step} aria-current={i === index ? 'step' : undefined}>{step}</li>)}</ol>
    {index === 0 && <><h3>Bạn đã cảm thấy thế nào?</h3><div className="symptom-grid">
      {moods.map(([label, Icon]) => <button className="symptom-tile" key={label} aria-pressed={mood === label}
        onClick={() => setMood(mood === label ? '' : label)}><Icon size={23} />{label}</button>)}
    </div></>}
    {index === 1 && <><h3>Bạn muốn ghi lại dấu hiệu nào?</h3><div className="symptom-grid">
      {symptomOptions.map(([label, Icon]) => <button className="symptom-tile" key={label} aria-pressed={symptoms.includes(label)}
        onClick={() => setSymptoms(old => old.includes(label) ? old.filter(x => x !== label) :
          old.length < 20 ? [...old, label] : old)}><Icon size={22} />{label}</button>)}
    </div></>}
    {index === 2 && <><h3>Bạn thấy đau ở mức nào?</h3>
      <p className="small muted">0 là không đau, 10 là mức đau mạnh nhất bạn cảm nhận.</p>
      <div className="pain-grid">{Array.from({ length: 11 }, (_, n) => <button key={n} aria-label={n + ' trên 10'}
        aria-pressed={pain === n} onClick={() => setPain(pain === n ? undefined : n)}>{n}</button>)}</div></>}
    {index === 3 && <><h3>Bạn có ra máu không?</h3>
      <p className="small muted">Nhật ký ra máu lấm tấm được ghi riêng với kỳ kinh.</p>
      <div className="symptom-grid">{flowOptions.map(label => <button className="symptom-tile" key={label}
        aria-pressed={flow === label} onClick={() => setFlow(flow === label ? undefined : label)}><Droplet size={21} />{label}</button>)}</div></>}
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="actions checkin-actions">
      {index > 0 && <button disabled={busy} onClick={() => setIndex(index - 1)}>Quay lại</button>}
      {index < 3 && <button onClick={skip}>Bỏ qua</button>}
      {index < 3 ? <button className="primary" onClick={() => setIndex(index + 1)}>Tiếp tục</button> :
        <button className="primary" disabled={busy || (!old && !mood && !symptoms.length && pain === undefined && !flow)}
          onClick={() => void finish()}><Check size={17} /> Lưu cảm nhận</button>}
    </div>
  </div>
}
