/**
 * Returns the canonical site URL for use in Supabase redirectTo params.
 *
 * Priority:
 *  1. VERCEL_PROJECT_PRODUCTION_URL — Vercel sets this automatically to the
 *     stable production domain (e.g. eos-app-fawn.vercel.app). Never changes.
 *  2. NEXT_PUBLIC_SITE_URL — manual override (must include https://)
 *  3. localhost fallback for local dev
 */
export function getSiteUrl(): string {
  // Vercel's stable production URL — always correct, no manual config needed
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  // Manual override — validate it starts with http to catch typos
  const manual = process.env.NEXT_PUBLIC_SITE_URL
  if (manual && manual.startsWith('http')) {
    return manual
  }
  return 'http://localhost:3000'
}
