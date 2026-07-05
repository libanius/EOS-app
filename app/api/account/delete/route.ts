import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ─── POST /api/account/delete ─────────────────────────────────────────────────
// Deletes the authenticated user's own account and ALL associated data.
// Irreversible. The client should sign out and redirect to /auth/login after.

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[POST /api/account/delete] Missing SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })
  }

  const uid = user.id
  const admin = createServiceClient(url, key)

  try {
    // Dependency order: action_plans → scenarios → domain rows → circles → profile → auth user.
    const { data: scenarios } = await admin.from('scenarios').select('id').eq('profile_id', uid)
    const scenarioIds = (scenarios ?? []).map((s) => s.id)
    if (scenarioIds.length) {
      await admin.from('action_plans').delete().in('scenario_id', scenarioIds)
    }
    await admin.from('scenarios').delete().eq('profile_id', uid)
    await admin.from('checklists').delete().eq('profile_id', uid)
    await admin.from('resource_inventory').delete().eq('profile_id', uid)
    await admin.from('family_members').delete().eq('profile_id', uid)

    // Circles this user leads: remove their members/plans, then the circle.
    const { data: ownedCircles } = await admin.from('circles').select('id').eq('leader_id', uid)
    for (const c of ownedCircles ?? []) {
      await admin.from('circle_action_plans').delete().eq('circle_id', c.id)
      await admin.from('circle_members').delete().eq('circle_id', c.id)
      await admin.from('circles').delete().eq('id', c.id)
    }
    await admin.from('circle_members').delete().eq('user_id', uid)
    await admin.from('push_subscriptions').delete().eq('user_id', uid)
    // Unlink this user from anyone else's family member cards.
    await admin.from('family_members').update({ linked_user_id: null }).eq('linked_user_id', uid)

    await admin.from('profiles').delete().eq('id', uid)

    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
      console.error('[POST /api/account/delete] deleteUser', delErr.message)
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir a conta.'
    console.error('[POST /api/account/delete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Clear the session cookie on the caller side too.
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
