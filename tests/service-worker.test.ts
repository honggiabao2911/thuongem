import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { generic } from '../shared/schedule.ts'

test('service worker hiển thị push bằng showNotification và mở app khi bấm', async () => {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {}
  let shown: unknown, opened: unknown, promise: Promise<void> | undefined
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://app.example' },
      addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => { handlers[name] = callback },
      registration: { showNotification: async (title: string, { body, tag }: { body: string; tag: string }) => { shown = [title, body, tag] } },
      clients: { matchAll: async () => [], openWindow: async (url: string) => { opened = url } },
    },
  })
  const waitUntil = (p: Promise<void>) => { promise = p }
  handlers.push({ data: { json: () => ({ body: generic, tag: 'one' }) }, waitUntil })
  await promise
  assert.deepEqual(shown, ['Thương Em', generic, 'one'])
  let closed = false
  handlers.notificationclick({ notification: { close: () => { closed = true } }, waitUntil })
  await promise
  assert.equal(closed, true)
  assert.equal(opened, '/')
})
