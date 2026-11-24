import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { app } from './api.ts'
import { createSender } from './push.ts'
import { openStore } from './store.ts'

process.umask(0o077)
const path = process.env.DB_PATH || './data/thuong-em.sqlite'
mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
const db = openStore(path)
const publicKey = process.env.VAPID_PUBLIC_KEY
const code = process.env.ACTIVATION_CODE
const valid = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT && code && code.length >= 24)

if (process.argv[2] === 'tick') {
  if (!valid) throw Error('Hãy cấu hình VAPID và ACTIVATION_CODE dài ít nhất 24 ký tự.')
  try { await db.tick(createSender()) }
  finally { db.db.close() }
} else {
  const port = Number(process.env.PORT || '8787')
  const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:5173'
  app(db, { origin, publicKey, code, sender: valid ? createSender() : undefined })
    .listen(port, process.env.HOST || '127.0.0.1', () => console.log('Thương Em đang chạy tại cổng ' + port))
}
