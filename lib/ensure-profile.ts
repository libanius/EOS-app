import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Guarantees the authenticated user has a `profiles` row.
 *
 * A user who signs up but never completes onboarding (e.g. logs in with a
 * password straight to /scenario) has no profiles row. Any route that selects
 * `profiles.single()` or inserts a row with a `profile_id`/`leader_id` foreign
 * key then fails ("Cannot coerce the result to a single JSON object" /
 * "violates foreign key constraint"). Call this right after `getUser()` in those
 * routes so the row always exists.
 *
 * `ignoreDuplicates` → `ON CONFLICT DO NOTHING`, so an existing profile is never
 * overwritten. RLS allows the user to insert their own row (id = auth.uid()).
 */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const name = (
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Usuário'
  ).trim()

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, name: name || 'Usuário' }, { onConflict: 'id', ignoreDuplicates: true })

  if (error) {
    console.error('[ensureProfile]', error.message)
  }
}
