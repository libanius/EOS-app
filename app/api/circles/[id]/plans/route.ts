import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  /*
   * Duas consultas em vez de um `join` embutido (D-124).
   *
   * `select('… profiles(name)')` devolvia **500 em toda abertura da tela de
   * Círculos**: o PostgREST recusa com PGRST200 porque não existe chave
   * estrangeira declarada entre `circle_action_plans` e `profiles`. O bloco de
   * planos nunca carregou, e ninguém soube — o erro morria no console.
   *
   * O nome do autor é enfeite; o plano é o dado. Por isso a falta do nome não
   * derruba a resposta: quem não puder ser identificado vira "—".
   */
  const { data, error } = await supabase.from('circle_action_plans')
    .select('id, title, body, created_by, updated_at, created_at')
    .eq('circle_id', params.id)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const linhas = data ?? []
  const autores = Array.from(new Set(linhas.map(p => p.created_by).filter(Boolean)))
  const nomePorId = new Map<string, string>()
  if (autores.length) {
    const { data: perfis } = await supabase.from('profiles').select('id, name').in('id', autores)
    for (const perfil of perfis ?? []) nomePorId.set(perfil.id, perfil.name ?? '—')
  }

  const plans = linhas.map(p => ({
    ...p,
    author: nomePorId.get(p.created_by) ?? '—',
    is_mine: p.created_by === user.id,
  }))
  return NextResponse.json({ plans })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin or Editor role required' }, { status: 403 })
  }

  let body: { title?: string; body?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!body.body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data, error } = await supabase.from('circle_action_plans').insert({
    circle_id: params.id,
    created_by: user.id,
    title: body.title.trim().slice(0, 100),
    body: body.body.trim().slice(0, 5000),
  }).select('id, title, body, created_by, updated_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data }, { status: 201 })
}
