import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { expiry, minute, occurrences } from '../shared/schedule.ts'
import type { Job, Plan } from '../shared/schedule.ts'
import type { PushSubscription } from 'web-push'

type Installation = { token: string; subscription: string; plan: string | null; changed: number; revision: number }
type Delivery = { state: string; retry: number; attempts: number }

export const digest = (token: string) => createHash('sha256').update(token).digest('hex')
export type Send = (s: PushSubscription, body: { body: string; tag: string }, ttl: number) => Promise<void>
export function openStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA busy_timeout = 8000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS installs (
      token TEXT PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, subscription TEXT NOT NULL,
      plan TEXT, changed INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0, tested INTEGER
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      token TEXT REFERENCES installs(token) ON DELETE CASCADE, id TEXT, at INTEGER NOT NULL,
      state TEXT NOT NULL, retry INTEGER NOT NULL, attempts INTEGER NOT NULL,
      PRIMARY KEY (token,id)
    );
  `)
  const get = (token: string) => db.prepare('SELECT * FROM installs WHERE token=?').get(token) as Installation | undefined
  const remove = (token: string) => db.prepare('DELETE FROM installs WHERE token=?').run(token)
  function register(token: string, subscription: PushSubscription, now: number) {
    return db.prepare(`INSERT INTO installs(token,endpoint,subscription,changed) VALUES (?,?,?,?)
      ON CONFLICT(token) DO UPDATE SET endpoint=excluded.endpoint, subscription=excluded.subscription
      WHERE installs.endpoint=excluded.endpoint`).run(token, subscription.endpoint, JSON.stringify(subscription), now)
  }
  function update(token: string, plan: Plan, now: number, revision: number) {
    // Incrementing the client sequence before each request prevents stale retries replacing newer data.
    return db.prepare('UPDATE installs SET plan=?,changed=?,revision=? WHERE token=? AND revision<?')
      .run(JSON.stringify(plan), now, revision, token, revision)
  }
  const claimTest = (token: string, now: number) => db.prepare(
    'UPDATE installs SET tested=? WHERE token=? AND (tested IS NULL OR tested<=?)')
    .run(now, token, now - minute).changes > 0
  async function deliver(row: Installation, job: Job, now: number, send: Send) {
    const previous = db.prepare('SELECT * FROM deliveries WHERE token=? AND id=?')
      .get(row.token, job.id) as Delivery | undefined
    if (previous && (previous.state !== 'retry' || previous.retry > now || previous.attempts >= 3)) return
    // Claim before contacting the provider. A crash or ambiguous network failure never replays a claim.
    const claimed = db.prepare(`INSERT INTO deliveries(token,id,at,state,retry,attempts)
      SELECT ?,?,?,'claimed',0,1 FROM installs WHERE token=? AND revision=?
      ON CONFLICT(token,id) DO UPDATE SET at=excluded.at, state='claimed', retry=0, attempts=deliveries.attempts+1
      WHERE deliveries.state='retry' AND deliveries.retry<=? AND deliveries.attempts<3`)
      .run(row.token, job.id, job.at, row.token, row.revision, now)
    if (!claimed.changes) return
    const attempts = (previous?.attempts ?? 0) + 1
    const finish = (state: string, retry = 0) => db.prepare('UPDATE deliveries SET state=?,retry=? WHERE token=? AND id=?')
      .run(state, retry, row.token, job.id)
    try {
      await send(JSON.parse(row.subscription), { body: job.body, tag: digest(job.id).slice(0, 24) },
        Math.max(0, Math.floor((job.at + expiry - now) / 1000)))
      finish('sent')
    } catch (error) {
      const code = (error as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) { remove(row.token); return }
      const retry = now + attempts * 5 * minute
      if ((code === 429 || code === 503) && attempts < 3 && retry < job.at + expiry) finish('retry', retry)
      else finish('failed')
    }
  }
  async function tick(send: Send, clock = Date.now) {
    const rows = db.prepare('SELECT * FROM installs WHERE plan IS NOT NULL').all() as Installation[]
    for (const row of rows) {
      const now = clock()
      const windowStart = Math.max(row.changed, now - expiry)
      for (const job of occurrences(JSON.parse(row.plan!), windowStart, now)) {
        const fresh = clock()
        if (job.at + expiry > fresh) await deliver(row, job, fresh, send)
      }
    }
    // Keep cycle reminder fingerprints even after changing the plan. Recurrences older than a year cannot replay.
    db.prepare("DELETE FROM deliveries WHERE at<? AND (id LIKE 'journal:%' OR id LIKE 'care-%')").run(clock() - 366 * 24 * 60 * minute)
  }
  return { db, get, register, update, remove, claimTest, tick }
}
