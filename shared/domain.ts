import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return Number(value.slice(0, 4)) >= 1900 && Temporal.PlainDate.from(value).toString() === value }
  catch { return false }
})
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const zone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('vi', { timeZone: value }); return !/^[+-]/.test(value) }
  catch { return false }
})
export const weekday = z.number().int().min(1).max(7)
export const period = z.object({ start: date, end: date.optional() })
export const journal = z.object({
  date, flow: z.enum(['Không', 'Lấm tấm', 'Ít', 'Vừa', 'Nhiều']).optional(),
  pain: z.number().int().min(0).max(10).optional(), location: z.string().max(120).optional(),
  mood: z.string().max(120).optional(), energy: z.enum(['Thấp', 'Vừa', 'Cao']).optional(),
  sleep: z.number().min(0).max(24).optional(), symptoms: z.array(z.string().max(60)).max(20),
  note: z.string().max(3000).optional(), lh: z.enum(['Âm tính', 'Dương tính', 'Không rõ']).optional(),
  bbt: z.number().min(30).max(45).optional(),
})
export const rule = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,60}$/), time, days: z.array(weekday).min(1).max(7),
})
export const quiet = z.object({ from: time, to: time })
const reminder = z.object({ enabled: z.boolean(), time })
const lead = reminder.extend({ offsets: z.array(z.number().int().min(1).max(30)).max(15) })
export const settings = z.object({
  name: z.string().max(40), appName: z.string().min(1).max(40),
  cycle: z.number().int().min(1).max(365).optional(),
  duration: z.number().int().min(1).max(90).optional(), zone,
  theme: z.enum(['system', 'light', 'dark']), tips: z.boolean(),
  detailed: z.boolean(), paused: z.boolean(), quiet: quiet.optional(),
  before: lead, due: reminder, ov: lead,
  journal: reminder.extend({ days: z.array(weekday).max(7) }),
  care: z.array(rule.extend({ label: z.string().min(1).max(65), enabled: z.boolean() })).max(8),
})
export const backup = z.object({
  version: z.literal(1), setup: z.boolean(), settings,
  periods: z.array(period).max(3000), entries: z.array(journal).max(15000),
  ignored: date.optional(),
})
export type Data = z.infer<typeof backup>
export type Period = z.infer<typeof period>
export type Entry = z.infer<typeof journal>
export type Settings = z.infer<typeof settings>
export const vietnamZone = 'Asia/Ho_Chi_Minh'
export const zoneLabel = (value: string) => [vietnamZone, 'Asia/Saigon'].includes(value) ? 'Việt Nam (UTC+7)' : value
export const allDays = [1, 2, 3, 4, 5, 6, 7]
export function empty(): Data {
  return {
    version: 1, setup: false, periods: [], entries: [],
    settings: {
      name: '', appName: 'Thương Em', zone: vietnamZone,
      theme: 'system', tips: true, detailed: false, paused: false,
      before: { enabled: true, time: '20:30', offsets: [3, 1] }, due: { enabled: true, time: '08:00' },
      ov: { enabled: false, time: '20:30', offsets: [1] },
      journal: { enabled: false, time: '20:30', days: allDays }, care: [],
    },
  }
}
export const plain = Temporal.PlainDate.from
export const add = (day: string, days: number) => plain(day).add({ days }).toString()
export const diff = (from: string, to: string) => plain(from).until(plain(to)).days
export const local = (ms: number, zone: string) => Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone)
export const dayAt = (ms: number, zone: string) => local(ms, zone).toPlainDate().toString()
export const fmt = (day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) =>
  plain(day).toLocaleString('vi-VN', options)
export const sorted = (periods: Period[]) => [...periods].sort((a, b) => a.start.localeCompare(b.start))
export const onPeriod = (periods: Period[], day: string, today: string) =>
  periods.some(p => p.start <= day && (p.end ?? today) >= day)
export function validatePeriods(periods: Period[], today: string) {
  const list = sorted(periods)
  for (const [index, item] of list.entries()) {
    if (!period.safeParse(item).success) throw Error('Ngày kỳ kinh không hợp lệ.')
    if (item.start > today || (item.end && item.end > today)) throw Error('Ngày ghi nhận không được ở tương lai.')
    if (item.end && item.end < item.start) throw Error('Ngày kết thúc phải từ ngày bắt đầu trở đi.')
    if (index && (list[index - 1].end ?? today) >= item.start) throw Error('Các kỳ bị trùng. Hãy kết thúc kỳ đang diễn ra hoặc kiểm tra lại ngày.')
  }
  return list
}
export function median(values: number[]) {
  const order = [...values].sort((a, b) => a - b)
  const center = Math.floor(order.length / 2)
  return order.length % 2 ? order[center] : (order[center - 1] + order[center]) / 2
}
export function prediction(data: Data) {
  const list = sorted(data.periods)
  const last = list.at(-1)
  const lengths = list.slice(1).map((p, i) => diff(list[i].start, p.start))
  const recent = lengths.slice(-6)
  const spread = recent.length ? Math.max(...recent) - Math.min(...recent) : undefined
  const typical = recent.length ? median(recent) : undefined
  const initial = recent.length < 2
  const basis = initial ? data.settings.cycle : typical
  const next = last && basis ? add(last.start, Math.round(basis)) : undefined
  const days = list.flatMap(p => p.end ? [diff(p.start, p.end) + 1] : []).slice(-6)
  const duration = days.length ? Math.round(median(days)) : data.settings.duration
  const ov = next && last && recent.length >= 3 && spread! <= 7 && diff(last.start, next) >= 21
    ? add(next, -13) : undefined
  return { last, lengths, recent, typical, spread, initial, next, duration, ov,
    fertile: ov ? { start: add(next!, -21), end: add(next!, -9) } : undefined }
}
export function checkBackup(raw: unknown, now: number) {
  const parsed = backup.parse(raw)
  const today = dayAt(now, parsed.settings.zone)
  validatePeriods(parsed.periods, today)
  if (new Set(parsed.entries.map(e => e.date)).size !== parsed.entries.length || parsed.entries.some(e => e.date > today))
    throw Error('Nhật ký trùng ngày hoặc có ngày ở tương lai.')
  if (new Set(parsed.settings.care.map(r => r.id)).size !== parsed.settings.care.length)
    throw Error('Mã lời nhắc chăm sóc bị trùng.')
  return parsed
}
