// Custom service worker push handler (merged by next-pwa into generated SW)
/* eslint-disable @typescript-eslint/no-explicit-any */

self.addEventListener('push', (event: any) => {
  if (!event.data) return
  let data: any
  try { data = event.data.json() } catch { data = { title: 'EOS Alert', body: event.data.text() } }
  const sw = self as any
  event.waitUntil(
    sw.registration.showNotification(data.title ?? 'EOS', {
      body: data.body ?? '', icon: data.icon ?? '/icon-192.png',
      badge: data.badge ?? '/icon-192.png', data: data.data,
    })
  )
})

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  const sw = self as any
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list: any[]) => {
      const existing = list.find((c: any) => c.url.includes(url))
      if (existing) return existing.focus()
      return sw.clients.openWindow(url)
    })
  )
})
