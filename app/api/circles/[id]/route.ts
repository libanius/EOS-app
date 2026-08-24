import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Renomear e excluir um círculo (D-077).
 *
 * Estas rotas simplesmente não existiam: a tela oferecia o círculo como algo que
 * a pessoa criou e não dava nenhuma forma de corrigir o nome ou desfazer a
 * criação. `PATCH` e `DELETE` respondiam 404.
 *
 * Excluir é destrutivo e em cascata — leva junto membros, o plano de voo da
 * família, os treinos compartilhados e os convites. Por isso o DELETE **exige o
 * nome do círculo no corpo** como confirmação. Não é burocracia: é a diferença
 * entre um toque errado e perder o plano que a família combinou. Quem exclui
 * também recebe de volta o que foi apagado, para poder dizer o que perdeu.
 */

interface Ctx { params: { id: string } }

async function assertAdmin(circleId: string, userId: string) {
  const admin = createAdminClient()
  if (!admin) return { admin: null, ok: false as const }
  const { data } = await admin
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle()
  return { admin, ok: data?.role === 'Admin' }
}

/** PATCH /api/circles/:id — renomeia o círculo (só Admin). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 })

  const { admin, ok } = await assertAdmin(params.id, user.id)
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Só Admin pode renomear o círculo.' }, { status: 403 })

  const { data, error } = await admin
    .from('circles')
    .update({ name: name.slice(0, 60) })
    .eq('id', params.id)
    .select('id, name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Círculo não encontrado.' }, { status: 404 })
  return NextResponse.json({ ok: true, name: data[0].name })
}

/**
 * DELETE /api/circles/:id — exclui o círculo (só Admin).
 *
 * Corpo: `{ confirmName: string }` — precisa bater com o nome do círculo.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { confirmName?: string }
  try { body = await req.json() } catch { body = {} }

  const { admin, ok } = await assertAdmin(params.id, user.id)
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Só Admin pode excluir o círculo.' }, { status: 403 })

  const { data: circle } = await admin
    .from('circles')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!circle) return NextResponse.json({ error: 'Círculo não encontrado.' }, { status: 404 })

  if (body.confirmName?.trim() !== circle.name) {
    return NextResponse.json(
      { error: 'Para excluir, escreva o nome exato do círculo.', expected: circle.name },
      { status: 400 },
    )
  }

  // O que vai junto. Conta ANTES de apagar, para a resposta poder dizer o que
  // foi perdido em vez de um "ok" que não informa nada.
  const [{ count: members }, { count: plans }] = await Promise.all([
    admin.from('circle_members').select('*', { count: 'exact', head: true }).eq('circle_id', params.id),
    admin.from('family_plans').select('*', { count: 'exact', head: true }).eq('circle_id', params.id),
  ])

  const { error } = await admin.from('circles').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    deleted: { name: circle.name, members: members ?? 0, plans: plans ?? 0 },
  })
}
