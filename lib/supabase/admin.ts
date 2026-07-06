import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client (bypasses RLS). Use ONLY in server routes and
 * only after authorizing the caller in application code — never expose it to the
 * client. Returns null if the key is missing so callers can degrade gracefully.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
