/**
 * EOS — Sentry (client)
 *
 * Configured only when NEXT_PUBLIC_SENTRY_DSN is set, so developer preview
 * and self-hosters don't get forced into paid telemetry.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  })
}
