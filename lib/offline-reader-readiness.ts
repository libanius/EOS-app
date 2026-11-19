const readerAssets = ['/offline.html', '/knowledge.js', '/knowledge-ui.js']

/** A stored pack alone cannot reopen a page in airplane mode. */
export async function offlineReaderReady(): Promise<boolean> {
  if (!navigator.serviceWorker?.controller || !globalThis.caches) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.active) return false
    const names = await caches.keys()
    // Read from Workbox's precache, the same cache used by the dashboard fallback.
    const name = names.find(key => key.startsWith('workbox-precache-') && key.endsWith(registration.scope))
    if (!name) return false
    const cache = await caches.open(name)
    const files = await Promise.all(readerAssets.map(path => cache.match(path, { ignoreSearch: true })))
    return files.every(response => response?.ok)
  } catch { return false }
}
