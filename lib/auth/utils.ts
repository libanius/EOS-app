/**
 * Returns the canonical site URL for use in Supabase redirectTo params.
 * Priority: NEXT_PUBLIC_SITE_URL → VERCEL_URL → localhost
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}
