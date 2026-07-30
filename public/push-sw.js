/**
 * EOS push handlers — STABLE filename, committed to the repo (D-074).
 *
 * This used to live in `worker/index.ts`, which next-pwa compiled to a HASHED
 * file (`worker-<hash>.js`) and referenced from the generated `sw.js`. That
 * combination is a trap: browsers cache `sw.js`, so after a deploy an old cached
 * `sw.js` still asked for the previous hash, `importScripts` 404'd, the install
 * failed, and the registration was discarded — surfacing to the user as a
 * permanent "Service Worker timeout" with no way out.
 *
 * A fixed filename cannot go stale. Keep it that way: do NOT let this be hashed,
 * and do NOT add it to .gitignore.
 */

self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'EOS', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'EOS', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      // Senders put `url` at the top level; reading only `data.data` made every
      // notification click land on '/'.
      data: data.data || (data.url ? { url: data.url } : undefined),
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    }),
  )
})
