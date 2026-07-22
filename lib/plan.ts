import type { SupabaseClient } from '@supabase/supabase-js'
import type { Plan } from '@/lib/feature-gates'

/**
 * Resolve a user's effective plan, lazily downgrading an EXPIRED gift plan to
 * `free` in the DB (D-060). Stripe-driven plans (plan_status 'active', etc.) are
 * never touched here — those are reconciled by the Stripe webhook. `admin` must
 * be a service-role client (gift_codes / plan writes bypass RLS).
 *
 * Called wherever the plan is read (e.g. /api/profile/plan), so an expired gift
 * is corrected on the user's next authenticated visit and then propagates to
 * every server route that reads profiles.plan.
 */
export async function reconcileGiftPlan(admin: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await admin
    .from('profiles')
    .select('plan, plan_status, plan_current_period_end')
    .eq('id', userId)
    .single()

  const plan = (data?.plan ?? 'free') as Plan
  if (data?.plan_status === 'gift' && plan !== 'free') {
    const end = data.plan_current_period_end ? new Date(data.plan_current_period_end).getTime() : 0
    if (!end || end < Date.now()) {
      await admin.from('profiles').update({ plan: 'free', plan_status: 'gift_expired' }).eq('id', userId)
      return 'free'
    }
  }
  return plan
}
