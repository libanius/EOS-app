import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Plan } from '@/lib/feature-gates'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: (data?.plan ?? 'free') as Plan })
}
