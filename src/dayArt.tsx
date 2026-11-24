import { add, diff, onPeriod } from '../shared/domain.ts'
import type { Data, prediction } from '../shared/domain.ts'

export function dayArt(data: Data, day: string, today: string, forecast: ReturnType<typeof prediction>) {
  if (onPeriod(data.periods, day, today)) return { kind: 'warm', label: 'Ngày hành kinh' }
  if (forecast.ov === day && forecast.next! >= today) return { kind: 'flower', label: 'Mốc rụng trứng ước tính' }
  if (forecast.next && forecast.next >= today && day === add(forecast.next, -3)) return { kind: 'pouch', label: 'Gần kỳ kinh dự kiến' }
  if (forecast.next && forecast.next >= today && diff(forecast.next, day) >= 0 && diff(forecast.next, day) < (forecast.duration ?? 1)) {
    return { kind: 'pouch', label: 'Ngày hành kinh dự kiến' }
  }
  if (data.entries.some(entry => entry.date === day) || day === today) return { kind: 'cup', label: 'Chăm sóc bản thân' }
}
export function DaySticker({ kind }: { kind: string }) {
  return <span className={'day-sticker sticker-' + kind} aria-hidden="true" />
}
