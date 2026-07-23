import nextPwa from 'next-pwa'

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Authenticated pages must refresh from the network so post-deploy fixes
    // like push registration are not trapped behind an old service worker cache.
    {
      urlPattern: /^https?.*\/(?:onboarding|family|inventory|scenario|checklist|circles|settings|login|signup)$/i,
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
