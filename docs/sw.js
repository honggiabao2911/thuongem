const CACHE = 'thuongem-pages-5cf2517f61d9bf0d'
const FILES = ["/thuongem/", "/thuongem/apple-touch-icon.png", "/thuongem/assets/index-B2U4OKVy.js", "/thuongem/assets/index-DnV8xayj.css", "/thuongem/icon-192.png", "/thuongem/icon-512.png", "/thuongem/icon-mask.png", "/thuongem/index.html", "/thuongem/manifest.webmanifest"]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)))
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('thuong-em-') && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (CACHE === 'thuong-em-dev' || event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/thuongem/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/thuongem/')).then(hit => hit || fetch(event.request)))
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)))
  }
})
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch {}
  event.waitUntil(self.registration.showNotification('Thương Em', {
    body: typeof payload.body === 'string' ? payload.body : 'Bạn có một lời nhắc chăm sóc hôm nay 🌷',
    icon: '/thuongem/icon-192.png', tag: payload.tag || 'thuong-em',
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) await existing.focus()
    else await self.clients.openWindow('/thuongem/')
  })())
})
