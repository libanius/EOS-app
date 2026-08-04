import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Papel e remoção de membros do círculo (D-077).
 *
 * ATENÇÃO AO PADRÃO AQUI. As duas operações escrevem na linha de OUTRA pessoa, e
 * a RLS de `circle_members` não autoriza isso ao cliente do usuário. Um UPDATE
 * bloqueado por RLS **não devolve erro**: ele afeta zero linhas e o Supabase
 * responde sucesso. A versão anterior então retornava `{ok:true}` enquanto o
 * papel continuava idêntico no banco — o dono trocava para Editor e "nada
 * acontecia", sem mensagem nenhuma.
 *
 * Duas travas para isso não voltar:
 *   1. a escrita usa o cliente service-role, DEPOIS de conferir na mão que quem
 *      chama é Admin do círculo — o mesmo padrão de /api/plans;
 *   2. a resposta confere quantas linhas mudaram. Zero linha é falha, e falha é
 *      dita. Sucesso silencioso sobre nada feito foi a causa do bug.
 */

type CircleRole = 'Admin' | 'Editor' | 'Viewer'
const VALID_ROLES: CircleRole[] = ['Admin', 'Editor', 'Viewer']
type FamilyAccessStatus = 'none' | 'requested' | 'approved' | 'denied'
const VALID_FAMILY_ACCESS: FamilyAccessStatus[] = ['none', 'requested', 'approved', 'denied']

interface Ctx { params: { id: string; userId: string } }

/** Confere que quem chama é Admin do círculo, lendo com service-role. */
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

/** PATCH /api/circles/:id/members/:userId — muda papel ou Família íntima (só Admin). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { role?: string; family_access_status?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const newRole = body.role as CircleRole | undefined
  const familyAccess = body.family_access_status as FamilyAccessStatus | undefined
  if (newRole !== undefined && !VALID_ROLES.includes(newRole)) {
    return NextResponse.json({ error: 'role must be Admin | Editor | Viewer' }, { status: 400 })
  }
  if (familyAccess !== undefined && !VALID_FAMILY_ACCESS.includes(familyAccess)) {
    return NextResponse.json({ error: 'family_access_status inválido.' }, { status: 400 })
  }
  if (newRole === undefined && familyAccess === undefined) {
    return NextResponse.json({ error: 'Informe role ou family_access_status.' }, { status: 400 })
  }

  const { admin, ok } = await assertAdmin(params.id, user.id)
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Só Admin pode mudar papéis.' }, { status: 403 })

  // Um círculo sem Admin não tem como ser administrado de volta pela interface.
  // Rebaixar o último Admin fica bloqueado, inclusive quando é a própria pessoa.
  if (newRole !== undefined && newRole !== 'Admin') {
    const [{ count }, target] = await Promise.all([
      admin
        .from('circle_members')
        .select('*', { count: 'exact', head: true })
        .eq('circle_id', params.id)
        .eq('role', 'Admin'),
      admin
        .from('circle_members')
        .select('role')
        .eq('circle_id', params.id)
        .eq('user_id', params.userId)
        .maybeSingle(),
    ])
    if (target.data?.role === 'Admin' && (count ?? 0) <= 1) {
      return NextResponse.json({ error: 'O círculo precisa de pelo menos um Admin.' }, { status: 400 })
    }
  }

  const patch: Record<string, unknown> = {}
  if (newRole !== undefined) patch.role = newRole
  if (familyAccess !== undefined) {
    patch.family_access_status = familyAccess
    patch.family_access_approved_at = familyAccess === 'approved' || familyAccess === 'denied' ? new Date().toISOString() : null
    patch.family_access_approved_by = familyAccess === 'approved' || familyAccess === 'denied' ? user.id : null
    if (familyAccess === 'none') patch.family_access_requested_at = null
  }

  const { data, error } = await admin
    .from('circle_members')
    .update(patch)
    .eq('circle_id', params.id)
    .eq('user_id', params.userId)
    .select('user_id, role, family_access_status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Membro não encontrado neste círculo.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, role: data[0].role, family_access_status: data[0].family_access_status })
}

/** DELETE /api/circles/:id/members/:userId — remove um membro (só Admin). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { admin, ok } = await assertAdmin(params.id, user.id)
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Só Admin pode remover membros.' }, { status: 403 })
  if (params.userId === user.id) {
    return NextResponse.json({ error: 'Para sair do círculo, use "Sair".' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('circle_members')
    .delete()
    .eq('circle_id', params.id)
    .eq('user_id', params.userId)
    .select('user_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Membro não encontrado neste círculo.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
