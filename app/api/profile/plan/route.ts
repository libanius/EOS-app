import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { reconcileGiftPlan } from '@/lib/plan'
import type { Plan } from '@/lib/feature-gates'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  await ensureProfile(supabase, user)

  // Lazily expire gift plans (D-061) — persists the downgrade so every server
  // route that reads profiles.plan sees the correct value afterwards.
  const admin = createAdminClient()
  if (admin) {
    const plan = await reconcileGiftPlan(admin, user.id)
    return NextResponse.json({ plan })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: (data?.plan ?? 'free') as Plan })
}
