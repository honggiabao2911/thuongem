import * as webpush from 'web-push'
import type { Send } from './store.ts'

export function createSender(): Send {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw Error('Thiếu cấu hình VAPID.')
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return async (subscription, payload, ttl) => {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: ttl, timeout: 10_000, topic: payload.tag,
    })
  }
}
