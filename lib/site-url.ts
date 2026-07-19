/**
 * Canonical app URL for redirects sent to Supabase and Stripe.
 *
 * Vercel/env values have historically been entered with quotes or trailing
 * whitespace. Normalize defensively before handing URLs to strict providers.
 */
export function normalizeSiteUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim()
    .replace(/\\[rn]/g, '')
    .replace(/\s+/g, '')
    .replace(/\/+$/, '')

  if (!cleaned) return null
  return /^https?:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`
}

export function getSiteUrl(): string {
  const vercelUrl = normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  if (vercelUrl) return vercelUrl

  const manualUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  if (manualUrl) return manualUrl

  return 'http://localhost:3000'
}
