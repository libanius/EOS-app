import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  let body: { linked_user_id: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  const { data, error } = await supabase.from('family_members')
    .update({ linked_user_id: body.linked_user_id })
    .eq('id', params.id).eq('profile_id', user.id)
    .select('id, name, linked_user_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}
