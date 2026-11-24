import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createECDH, randomBytes } from 'node:crypto'
import * as webpush from 'web-push'
import { app } from '../server/api.ts'
import { digest, openStore } from '../server/store.ts'
import type { Send } from '../server/store.ts'
import { generic, minute, expiry } from '../shared/schedule.ts'
import type { Plan } from '../shared/schedule.ts'

const base = Date.parse('2026-08-02T00:00:00Z')
const pair = createECDH('prime256v1')
pair.generateKeys()
const subscription = {
  endpoint: 'https://web.push.apple.com/example',
  keys: { p256dh: pair.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
}
const plan = (at: number, id = 'before:sample'): Plan => ({ zone: 'Asia/Ho_Chi_Minh', once: [{ at, id, body: generic }], rules: [] })
test('SQLite giữ lịch qua lần mở lại, chống trùng khi hai worker chạy đồng thời', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'thuong-em-test-'))
  const path = join(dir, 'data.sqlite')
  try {
    const first = openStore(path)
    first.register('id', subscription, base)
    first.update('id', plan(base + minute), base, 1)
    first.db.close()
    const a = openStore(path), b = openStore(path)
    let calls = 0
    const send: Send = async () => { calls++ }
    await Promise.all([a.tick(send, () => base + minute), b.tick(send, () => base + minute)])
    assert.equal(calls, 1)
    await a.tick(send, () => base + 2 * minute)
    assert.equal(calls, 1)
    a.db.close()
    b.db.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('retry có giới hạn, loại bản hết hạn, không gửi muộn quá 90 phút', async () => {
  const store = openStore(':memory:')
  let now = base + minute, calls = 0
  store.register('id', subscription, base)
  store.update('id', plan(now), base, 1)
  const fail: Send = async () => { calls++; throw { statusCode: 503 } }
  await store.tick(fail, () => now)
  await store.tick(fail, () => now + minute)
  assert.equal(calls, 1)
  now += 5 * minute
  await store.tick(fail, () => now)
  now += 10 * minute
  await store.tick(fail, () => now)
  await store.tick(fail, () => now + 20 * minute)
  assert.equal(calls, 3)
  store.update('id', plan(now + minute, 'another'), now, 2)
  await store.tick(async () => { calls++ }, () => now + minute + expiry)
  assert.equal(calls, 3)
  await store.tick(async () => { throw { statusCode: 410 } }, () => now + minute)
  assert.equal(store.get('id'), undefined)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get()?.n, 0)
  store.db.close()
})
test('thay lịch, tạm dừng và xóa không gửi các mốc cũ; lỗi mạng mơ hồ không lặp', async () => {
  const store = openStore(':memory:')
  store.register('id', subscription, base)
  store.update('id', plan(base + minute), base, 1)
  store.update('id', plan(base + 3 * minute), base, 2)
  assert.equal(store.update('id', plan(base + minute), base, 1).changes, 0)
  let calls = 0
  const send: Send = async () => { calls++; throw Error('đường truyền mất sau khi gửi') }
  await store.tick(send, () => base + minute)
  assert.equal(calls, 0)
  await store.tick(send, () => base + 3 * minute)
  await store.tick(send, () => base + 10 * minute)
  assert.equal(calls, 1)
  store.update('id', plan(base + 14 * minute, 'future'), base + 12 * minute, 3)
  store.update('id', { zone: 'UTC', once: [], rules: [] }, base + 13 * minute, 4)
  await store.tick(send, () => base + 14 * minute)
  assert.equal(calls, 1)
  store.remove('id')
  assert.equal(store.get('id'), undefined)
  store.db.close()
})
test('API xác thực, nhận lịch, gửi thử và xóa toàn bộ đăng ký', async t => {
  const store = openStore(':memory:')
  const code = 'integration-test-code-at-least-24'
  const token = 'a'.repeat(64), other = 'b'.repeat(64)
  const origin = 'https://thuong.example'
  let tests = 0
  const server = app(store, {
    origin, code, publicKey: 'public-key', now: () => base,
    sender: async (_subscription, payload) => { assert.equal(payload.body, generic); tests++ },
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.close(); store.db.close() })
  const address = server.address()
  assert(address && typeof address !== 'string')
  const url = 'http://127.0.0.1:' + address.port + '/api/'
  const call = (path: string, method: string, data?: object, key = token) => fetch(url + path, {
    method, headers: { Origin: origin, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  assert.equal((await fetch(url + 'config')).status, 200)
  assert.equal((await call('install', 'PUT', { code: 'sai', subscription })).status, 403)
  assert.equal((await call('install', 'PUT', { code, subscription: { ...subscription, endpoint: 'http://127.0.0.1/' } })).status, 400)
  assert.equal((await call('install', 'PUT', { code, subscription })).status, 200)
  assert.equal((await call('install', 'PUT', { code, subscription }, other)).status, 409)
  const upcoming = plan(base + minute)
  assert.equal((await call('plan', 'PUT', { revision: 1, plan: upcoming }, other)).status, 404)
  assert.equal((await call('plan', 'PUT', { revision: 1, plan: upcoming })).status, 200)
  assert.equal((await call('plan', 'PUT', { revision: 1, plan: upcoming })).status, 409)
  assert.equal((await call('test', 'POST')).status, 200)
  assert.equal((await call('test', 'POST')).status, 429)
  assert.equal(tests, 1)
  assert.equal((await call('install', 'DELETE', undefined, other)).status, 200)
  assert.ok(store.get(digest(token)))
  assert.equal((await call('install', 'DELETE')).status, 200)
  assert.equal(store.get(digest(token)), undefined)
})
test('web-push tạo tải mã hóa AES128GCM và chữ ký VAPID', () => {
  const keys = webpush.generateVAPIDKeys()
  const wire = webpush.generateRequestDetails(subscription, JSON.stringify({ body: generic }), {
    TTL: 300, vapidDetails: { ...keys, subject: 'mailto:hello@example.com' },
  })
  assert.equal(wire.headers['Content-Encoding'], 'aes128gcm')
  assert.match(String(wire.headers.Authorization), /vapid /)
  assert.ok(Buffer.isBuffer(wire.body))
  assert.equal(wire.body!.includes(generic), false)
})
