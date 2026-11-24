const CACHE = "thuong-em-cb9192929de2d193"
const BASE = "/thuongem/"
const FILES = ["/thuongem/","/thuongem/apple-touch-icon.png","/thuongem/assets/index-B49Aug85.css","/thuongem/assets/index-BuiCt3zW.js","/thuongem/assets/noto-sans-latin-wght-normal-BYSzYMf3.woff2","/thuongem/assets/noto-sans-vietnamese-wght-normal-DLTJy58D.woff2","/thuongem/icon-192.png","/thuongem/icon-512.png","/thuongem/icon-mask.png","/thuongem/index.html","/thuongem/manifest.webmanifest","/thuongem/noto-sans-license.txt"]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)))
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if ((key.startsWith('thuong-em-') || key.startsWith('thuongem-pages-')) && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (CACHE === 'thuong-em-dev' || event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(BASE) || url.pathname.startsWith(BASE + 'api/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(BASE)).then(hit => hit || fetch(event.request)))
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)))
  }
})
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch {}
  event.waitUntil(self.registration.showNotification('Thương Em', {
    body: typeof payload.body === 'string' ? payload.body : 'Bạn có một lời nhắc chăm sóc hôm nay 🌷',
    icon: BASE + 'icon-192.png', tag: payload.tag || 'thuong-em',
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) await existing.focus()
    else await self.clients.openWindow(BASE)
  })())
})
