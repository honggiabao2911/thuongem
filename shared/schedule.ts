import { z } from 'zod'
import { add, dayAt, local, plain, prediction, quiet, rule, zone } from './domain.ts'
import type { Data } from './domain.ts'

export const minute = 60_000
export const expiry = 90 * minute
export const generic = 'Bạn có một lời nhắc chăm sóc hôm nay 🌷'
const messages = [
  'Kỳ kinh của bạn dự kiến đến hôm nay.',
  'Ngày rụng trứng dự kiến đang đến gần. Đây chỉ là ước tính.',
  'Bạn có muốn dành một phút để ghi nhật ký hôm nay?',
  'Đến giờ dành một chút thời gian chăm sóc bản thân.',
  'Bạn có một mốc kỳ kinh dự kiến. Hãy mở ứng dụng để xem.',
]
export const safeMessage = z.string().refine(s => s === generic || messages.includes(s) ||
  /^Kỳ kinh của bạn dự kiến đến sau khoảng ([1-9]|[12][0-9]|30) ngày\.$/.test(s))
export const planSchema = z.object({
  zone, quiet: quiet.optional(),
  once: z.array(z.object({ id: z.string().regex(/^[\w:-]{1,110}$/), at: z.number().int().positive(), body: safeMessage })).max(40),
  rules: z.array(rule.extend({ body: safeMessage })).max(9),
})
export type Plan = z.infer<typeof planSchema>
export type Job = Plan['once'][number]

export function instant(day: string, time: string, zone: string, quiet?: Plan['quiet']) {
  if (quiet && quiet.from !== quiet.to) {
    const overnight = quiet.from > quiet.to
    const inside = overnight ? time >= quiet.from || time < quiet.to : time >= quiet.from && time < quiet.to
    if (inside) {
      if (overnight && time >= quiet.from) day = add(day, 1)
      time = quiet.to
    }
  }
  return plain(day).toPlainDateTime(time).toZonedDateTime(zone, { disambiguation: 'compatible' }).epochMilliseconds
}

export function makePlan(data: Data, now: number, includePaused = false): Plan {
  const s = data.settings
  const plan: Plan = { zone: s.zone, quiet: s.quiet, once: [], rules: [] }
  if (s.paused && !includePaused) return plan
  const today = dayAt(now, s.zone)
  const p = prediction(data)
  const body = (text: string) => s.detailed ? text : generic
  function once(id: string, day: string, time: string, text: string) {
    const at = instant(day, time, s.zone, s.quiet)
    if (at > now) plan.once.push({ id, at, body: body(text) })
  }
  const next = p.next
  const anchor = p.last?.start
  if (next && anchor && next >= today) {
    if (s.before.enabled) for (const offset of new Set(s.before.offsets)) {
      const day = add(next, -offset)
      const at = instant(day, s.before.time, s.zone, s.quiet)
      const remaining = Math.max(0, plain(dayAt(at, s.zone)).until(plain(next)).days)
      once('before:' + anchor + ':' + offset, day, s.before.time,
        remaining ? 'Kỳ kinh của bạn dự kiến đến sau khoảng ' + remaining + ' ngày.' : messages[0])
    }
    if (s.due.enabled) {
      const sendDay = dayAt(instant(next, s.due.time, s.zone, s.quiet), s.zone)
      once('due:' + anchor, next, s.due.time, sendDay === next ? messages[0] : messages[4])
    }
    if (s.ov.enabled && p.ov && p.ov >= today)
      for (const offset of new Set(s.ov.offsets)) once('ov:' + anchor + ':' + offset, add(p.ov, -offset), s.ov.time, messages[1])
  }
  if (s.journal.enabled && s.journal.days.length)
    plan.rules.push({ id: 'journal', time: s.journal.time, days: s.journal.days, body: body(messages[2]) })
  for (const care of s.care) if (care.enabled)
    plan.rules.push({ id: 'care-' + care.id, time: care.time, days: care.days, body: body(messages[3]) })
  return plan
}

export function occurrences(plan: Plan, from: number, to: number) {
  const jobs = [...plan.once]
  const first = add(dayAt(from, plan.zone), -1)
  const last = dayAt(to, plan.zone)
  for (let day = first; day <= last; day = add(day, 1)) {
    for (const rule of plan.rules) {
      if (rule.days.includes(plain(day).dayOfWeek))
        jobs.push({ id: rule.id + ':' + day, at: instant(day, rule.time, plan.zone, plan.quiet), body: rule.body })
    }
  }
  return jobs.filter(j => j.at >= from && j.at <= to).sort((a, b) => a.at - b.at)
}

export function iCalendar(jobs: Job[], now: number) {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Thuong Em//Cham soc//VI', 'CALSCALE:GREGORIAN',
    ...jobs.flatMap(j => ['BEGIN:VEVENT', 'UID:' + j.id + '-' + j.at + '@thuong-em.local',
      'DTSTAMP:' + stamp(now), 'DTSTART:' + stamp(j.at), 'SUMMARY:Lời nhắc chăm sóc',
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Lời nhắc chăm sóc', 'END:VALARM', 'END:VEVENT']),
    'END:VCALENDAR', ''].join('\r\n')
}
export const clock = (at: number, zone: string) => local(at, zone).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
