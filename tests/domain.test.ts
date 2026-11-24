import { test } from 'node:test'
import assert from 'node:assert/strict'
import { add, checkBackup, dayAt, diff, empty, median, onPeriod, prediction, validatePeriods } from '../shared/domain.ts'
import { iCalendar, instant, makePlan, occurrences } from '../shared/schedule.ts'

const vn = 'Asia/Ho_Chi_Minh'
const utc = (s: string) => Date.parse(s)
test('ngày lịch qua tháng, năm nhuận, giao năm và chênh lệch múi giờ', () => {
  assert.equal(add('2024-02-28', 1), '2024-02-29')
  assert.equal(add('2024-02-29', 1), '2024-03-01')
  assert.equal(add('2025-12-31', 1), '2026-01-01')
  assert.equal(diff('2024-02-28', '2024-03-01'), 2)
  assert.equal(dayAt(utc('2026-01-01T00:30:00Z'), 'America/New_York'), '2025-12-31')
})
test('không cho ngày sai, kỳ trùng, kỳ mở trước kỳ khác hoặc ngày tương lai', () => {
  const today = '2026-03-19'
  assert.throws(() => validatePeriods([{ start: '2026-02-29' }], today), /không hợp lệ/)
  assert.throws(() => validatePeriods([{ start: '2026-03-05', end: '2026-03-01' }], today), /Ngày kết thúc/)
  assert.throws(() => validatePeriods([{ start: '2026-03-20' }], today), /tương lai/)
  assert.throws(() => validatePeriods([{ start: '2026-03-01', end: '2026-03-04' }, { start: '2026-03-04' }], today), /trùng/)
  assert.throws(() => validatePeriods([{ start: '2026-03-01' }, { start: '2026-03-19' }], today), /trùng/)
  const list = validatePeriods([{ start: '2026-03-01', end: '2026-03-04' }, { start: '2026-03-19' }], today)
  assert.equal(onPeriod(list, today, today), true)
  assert.equal(onPeriod(list, '2026-03-18', today), false)
  assert.equal(onPeriod(list, '2026-03-20', today), false)
})
test('dữ liệu thiếu, dùng số ngày nhập và loại chu kỳ đang mở khỏi độ dài', () => {
  const d = empty()
  d.periods = [{ start: '2026-01-20' }]
  assert.equal(prediction(empty()).next, undefined)
  assert.equal(prediction(d).next, '2026-02-17')
  assert.equal(prediction(d).assumed, true)
  assert.deepEqual(prediction(d).ovWindow, { start: '2026-02-01', end: '2026-02-07' })
  assert.equal(makePlan(d, Date.parse('2026-01-21T00:00:00Z')).once.length, 0)
  d.settings.cycle = 31
  const p = prediction(d)
  assert.equal(p.next, '2026-02-20')
  assert.equal(p.initial, true)
  assert.equal(p.assumed, false)
  assert.equal(p.ov, undefined)
  assert.deepEqual(p.lengths, [])
})
test('trung vị tối đa sáu khoảng và cập nhật khi sửa ngày bắt đầu', () => {
  const d = empty()
  let start = '2025-01-01'
  for (const n of [40, 28, 28, 30, 29, 31, 27, 29]) {
    d.periods.push({ start, end: add(start, 4) })
    start = add(start, n)
  }
  assert.equal(median([20, 22]), 21)
  assert.deepEqual(prediction(d).recent, [28, 28, 30, 29, 31, 27])
  assert.equal(prediction(d).typical, 28.5)
  assert.equal(prediction(d).spread, 4)
  const before = prediction(d).next!
  const last = d.periods.at(-1)!
  last.start = add(last.start, 10)
  last.end = undefined
  const after = prediction(d)
  assert.notEqual(after.next, before)
  assert.equal(after.ov, undefined)
})
test('3 và 1 ngày trước ngày 20 lúc 20:30 tại Việt Nam', () => {
  const d = empty()
  d.settings.zone = vn
  d.settings.cycle = 31
  d.periods = [{ start: '2026-01-20', end: '2026-01-24' }]
  const now = utc('2026-02-16T00:00:00Z')
  const plan = makePlan(d, now)
  const jobs = occurrences(plan, now, now + 10 * 86_400_000)
  assert.deepEqual(jobs.map(j => new Date(j.at).toISOString()), [
    '2026-02-17T13:30:00.000Z', '2026-02-19T13:30:00.000Z', '2026-02-20T01:00:00.000Z',
  ])
  assert.match(iCalendar(jobs, now), /DTSTART:20260217T133000Z/)
  d.settings.zone = 'America/New_York'
  assert.equal(new Date(makePlan(d, now).once.find(j => j.id.endsWith(':3'))!.at).toISOString(), '2026-02-18T01:30:00.000Z')
})
test('giờ yên lặng qua nửa đêm, DST và lặp qua năm', () => {
  assert.equal(new Date(instant('2026-02-17', '23:00', vn, { from: '22:00', to: '07:00' })).toISOString(),
    '2026-02-18T00:00:00.000Z')
  assert.equal(new Date(instant('2026-03-08', '02:30', 'America/New_York')).toISOString(), '2026-03-08T07:30:00.000Z')
  assert.equal(new Date(instant('2026-11-01', '01:30', 'America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z')
  const d = empty()
  d.settings.zone = vn
  d.settings.journal = { enabled: true, days: [4], time: '23:00' }
  d.settings.quiet = { from: '22:00', to: '07:00' }
  const now = utc('2027-01-01T00:00:00Z')
  assert.equal(occurrences(makePlan(d, now), now, now)[0].id, 'journal:2026-12-31')
})
test('đổi lịch khi sửa lịch sử, hủy khi ghi kỳ mới và không nhắc trễ', () => {
  const d = empty()
  d.settings.zone = vn
  d.settings.cycle = 31
  d.periods = [{ start: '2026-01-20', end: '2026-01-24' }]
  const now = utc('2026-02-16T00:00:00Z')
  assert.equal(makePlan(d, now).once.length, 3)
  d.periods[0].start = '2026-01-21'
  assert.equal(makePlan(d, now).once.find(j => j.id.endsWith(':3'))?.at, utc('2026-02-18T13:30:00Z'))
  d.periods.push({ start: '2026-02-16' })
  assert.ok(makePlan(d, now).once.every(job => job.at > utc('2026-02-28T00:00:00Z')))
  assert.equal(makePlan(d, utc('2026-04-01T00:00:00Z')).once.length, 0)
})
test('kiểm tra bản sao lưu từ chối cấu trúc sai, ngày tương lai và nhật ký trùng', () => {
  const d = empty()
  const now = utc('2026-08-02T00:00:00Z')
  assert.equal(checkBackup(d, now).version, 1)
  assert.throws(() => checkBackup({ ...d, version: 2 }, now))
  d.entries = [{ date: '2026-08-01', symptoms: [] }, { date: '2026-08-01', symptoms: [] }]
  assert.throws(() => checkBackup(d, now), /trùng/)
  d.entries = [{ date: '2026-08-05', symptoms: [] }]
  assert.throws(() => checkBackup(d, now), /tương lai/)
})

test('một khoảng giữa hai kỳ cho phép ước tính ban đầu khi chưa nhập độ dài', () => {
  const data = empty()
  data.periods = [{ start: '2026-10-17', end: '2026-10-21' }, { start: '2026-11-16' }]
  const p = prediction(data)
  assert.equal(p.next, '2026-12-16')
  assert.equal(p.initial, true)
  assert.equal(p.ov, undefined)
})
