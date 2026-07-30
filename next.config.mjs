import nextPwa from 'next-pwa'

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // A STABLE filename, not a hashed custom worker. A cached sw.js referencing a
  // hash that the next deploy removed made importScripts 404, which failed the
  // install and left the user permanently on "Service Worker timeout" (D-074).
  importScripts: ['/push-sw.js'],
  disable: process.env.NODE_ENV === 'development',
  // THE reason push never activated (D-074). next-pwa walks `.next/` and puts
  // every file it finds into the Workbox precache manifest — including build
  // metadata that Next does NOT serve over HTTP. Precaching is atomic: one 404
  // rejects the install `waitUntil`, the worker goes redundant, and it retries
  // forever. So `/_next/app-build-manifest.json` returning 404 silently disabled
  // the entire service worker, and with it every push notification.
  //
  // These entries are build metadata, never fetched by the browser, and have no
  // business being precached. Verified with `ServiceWorker.workerErrorReported`:
  //   bad-precaching-response :: [{"url":".../app-build-manifest.json","status":404}]
  buildExcludes: [
    /app-build-manifest\.json$/,
    /build-manifest\.json$/,
    /react-loadable-manifest\.json$/,
    /middleware-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
    /\.map$/,
    /^.*dynamic-css-manifest\.json$/,
  ],
  runtimeCaching: [
    // Authenticated pages must refresh from the network so post-deploy fixes
    // like push registration are not trapped behind an old service worker cache.
    //
    // `/plan` is in this list deliberately and not by accident of the catch-all:
    // the family plan is the one screen whose entire purpose is to render when
    // the network is gone (doc 18 §2). NetworkFirst gives it the newest version
    // when there is a connection and the last good document when there is not.
    {
      urlPattern: /^https?.*\/(?:onboarding|family|inventory|scenario|checklist|circles|settings|login|signup|plan)$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'eos-pages',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    // Static assets (images, fonts)
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'eos-assets',
        expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // The family plan is deliberately NOT served from the generic API cache.
    //
    // It has its own copy on the device (IndexedDB, `saveFamilyPlan`), and that
    // copy carries the version and the moment it was synced — which the screen
    // shows. If the service worker answered this request from cache instead, the
    // page would receive a stale document indistinguishable from a live one and
    // would present it as current. That is exactly the failure doc 18 §6 exists
    // to prevent: an old plan shown as the current one sends the family to the
    // wrong place. NetworkOnly makes the failure honest, so the UI falls back to
    // the labelled local copy.
    {
      urlPattern: /\/api\/plans(?:\?|$|\/)/i,
      handler: 'NetworkOnly',
      method: 'GET',
    },
    // API → network-first with 10s timeout; fallback to cache
    {
      urlPattern: /\/api\/.*$/i,
      handler: 'NetworkFirst',
      method: 'GET',
      options: {
        cacheName: 'eos-api',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 2 },
      },
    },
    // Everything else
    {
      urlPattern: /.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'eos-default',
        networkTimeoutSeconds: 8,
      },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withPWA(nextConfig)
