import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { z } from 'zod'
import { digest, openStore } from './store.ts'
import type { Send } from './store.ts'
import { generic, planSchema, minute } from '../shared/schedule.ts'

const subscriptionSchema = z.object({
  endpoint: z.string().max(1500).url().refine(value => {
    const url = new URL(value)
    const hosts = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com',
      'updates-autopush.stage.mozaws.net', 'wns2-by3p.notify.windows.com']
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (hosts.includes(url.hostname) || url.hostname.endsWith('.push.apple.com')) && url.pathname.length > 1
  }),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
})
const registration = z.object({ code: z.string().max(128), subscription: subscriptionSchema })
const update = z.object({ revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), plan: planSchema })
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Yêu cầu JSON.')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 32_768) throw new HttpError(413, 'Dữ liệu quá lớn.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) }
  catch { throw new HttpError(400, 'JSON không hợp lệ.') }
}
export function app(store: ReturnType<typeof openStore>, config: {
  origin: string; publicKey?: string; code?: string; sender?: Send; root?: string; now?: () => number
}) {
  const root = resolve(config.root ?? 'dist')
  const now = config.now ?? Date.now
  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'")
    try {
      const path = new URL(req.url ?? '/', config.origin).pathname
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Phương thức không hợp lệ.')
        const file = resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)))
        if (!file.startsWith(root + '/') || !(await stat(file).catch(() => null))?.isFile())
          throw new HttpError(404, 'Không tìm thấy.')
        res.writeHead(200, {
          'Content-Type': (types[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8',
          'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        })
        res.end(req.method === 'HEAD' ? undefined : await readFile(file))
        return
      }
      if (req.headers.origin && req.headers.origin !== config.origin) throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.')
      const method = req.method
      if (path === '/api/config' && method === 'GET') {
        json(res, 200, { publicKey: config.sender && config.code ? config.publicKey : null })
        return
      }
      const key = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1]
      if (!key) throw new HttpError(401, 'Thiếu khóa của thiết bị.')
      const token = digest(key)
      const row = store.get(token)
      if (path === '/api/install' && method === 'DELETE') { store.remove(token); json(res, 200, { deleted: true }); return }
      if (!config.sender || !config.code) throw new HttpError(503, 'Máy chủ chưa cấu hình Web Push.')
      if (path === '/api/install' && method === 'PUT') {
        const data = registration.parse(await body(req))
        if (!row && digest(data.code) !== digest(config.code)) throw new HttpError(403, 'Mã kích hoạt không đúng.')
        try {
          if (!store.register(token, data.subscription, now()).changes) throw Error()
        } catch { throw new HttpError(409, 'Đăng ký này thuộc một thiết bị khác. Hãy xóa đăng ký trình duyệt và thử lại.') }
        json(res, 200, { registered: true, revision: row?.revision ?? 0 })
        return
      }
      if (!row) throw new HttpError(404, 'Đăng ký đã hết hạn hoặc bị xóa.')
      if (path === '/api/plan' && method === 'PUT') {
        const input = update.parse(await body(req))
        const current = now()
        const unique = (ids: string[]) => new Set(ids).size === ids.length
        if (!unique(input.plan.once.map(j => j.id)) || !unique(input.plan.rules.map(j => j.id)) ||
          input.plan.once.some(job => job.at > current + 367 * 24 * 60 * minute))
          throw new HttpError(400, 'Các thời điểm nhắc không hợp lệ.')
        input.plan.once = input.plan.once.filter(job => job.at > current)
        if (!store.update(token, input.plan, current, input.revision).changes)
          throw new HttpError(409, 'Lịch này đã có phiên bản mới hơn.')
        json(res, 200, { syncedAt: current, accepted: input.plan.once.length, recurring: input.plan.rules.length })
      } else if (path === '/api/test' && method === 'POST') {
        if (!store.claimTest(token, now())) throw new HttpError(429, 'Vui lòng đợi một phút trước khi thử lại.')
        try {
          await config.sender(JSON.parse(row.subscription), { body: generic, tag: 'thuong-em-test' }, 300)
        } catch (error) {
          const code = (error as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) {
            store.remove(token)
            throw new HttpError(410, 'Đăng ký push đã hết hạn. Hãy bật thông báo lại.')
          }
          throw new HttpError(502, 'Dịch vụ push chưa chấp nhận thông báo thử.')
        }
        json(res, 200, { accepted: true })
      } else throw new HttpError(404, 'Không tìm thấy.')
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      if (error instanceof HttpError) json(res, error.status, { error: error.message })
      else if (error instanceof z.ZodError) json(res, 400, { error: 'Dữ liệu gửi lên không hợp lệ.' })
      else {
        console.error('Yêu cầu không hoàn tất.')
        json(res, 500, { error: 'Máy chủ gặp lỗi. Hãy thử lại.' })
      }
    }
  })
}
