/**
 * POST /api/circles/[id]/household — quem mora nesta casa (D-123).
 *
 * Três ações, e a diferença entre elas é QUEM pode fazer:
 *
 *   pedir     — qualquer membro do círculo pede a outro: "você mora comigo?"
 *   confirmar — SÓ A PRÓPRIA PESSOA, na conta dela
 *   sair      — SÓ A PRÓPRIA PESSOA
 *
 * A regra do meio é a razão desta rota existir. Morar junto faz o inventário
 * somar e a autonomia mudar; se eu pudesse marcar sozinho, marcaria o vizinho e
 * passaria a contar a água dele. É o mesmo desenho que o EOS já usa para a ficha
 * médica: um lado pede, o outro concede.
 *
 * NÃO CONFUNDIR COM `family_access_status`. Morar junto é logística — entra na
 * conta de água, no checklist e no plano. Ver a ficha médica é outro
 * consentimento, dado separadamente, e esta rota não encosta nele.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/error-log'

export const dynamic = 'force-dynamic'

type Acao = 'pedir' | 'confirmar' | 'sair'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let body: { action?: Acao; userId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const acao = body.action
  const alvo = body.userId ?? auth.user.id
  const circleId = params.id

  if (acao !== 'pedir' && acao !== 'confirmar' && acao !== 'sair') {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  // Quem age precisa estar no círculo. Sem isto, qualquer conta poderia mexer na
  // composição da casa de estranhos.
  const { data: euNoCirculo } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!euNoCirculo) return NextResponse.json({ error: 'Você não está neste círculo' }, { status: 403 })

  /*
   * O consentimento, em uma linha.
   *
   * Confirmar e sair mexem no vínculo da PRÓPRIA pessoa com a casa. Ninguém faz
   * isso por ninguém — nem o dono do círculo.
   */
  if ((acao === 'confirmar' || acao === 'sair') && alvo !== auth.user.id) {
    return NextResponse.json(
      { error: 'Só a própria pessoa confirma ou desfaz que mora nesta casa.' },
      { status: 403 },
    )
  }

  const agora = new Date().toISOString()
  const patch =
    acao === 'pedir'
      ? { household_status: 'requested', household_requested_by: auth.user.id, household_requested_at: agora }
      : acao === 'confirmar'
        ? { household_status: 'confirmed', household_confirmed_at: agora }
        : { household_status: 'none', household_requested_by: null, household_requested_at: null, household_confirmed_at: null }

  const { data, error } = await admin
    .from('circle_members')
    .update(patch)
    .eq('circle_id', circleId)
    .eq('user_id', alvo)
    .select('user_id, household_status')

  if (error) {
    /*
     * 23505 = o índice único que garante UMA casa por pessoa.
     *
     * Devolvido como uma frase, não como erro cru: a pessoa precisa saber que
     * já mora em outra casa e que sair de lá é o caminho — não que "algo deu
     * errado".
     */
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Esta pessoa já confirmou morar em outra casa. Ela precisa sair da outra antes.' },
        { status: 409 },
      )
    }
    await logError('api/circles/household', error, { userId: auth.user.id, context: { acao } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Uma linha afetada é o esperado. Zero significa que o alvo não está neste
  // círculo — e um UPDATE que não acha ninguém devolve sucesso no PostgREST,
  // que foi como um bug de papéis passou meses despercebido (D-077).
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Essa pessoa não está neste círculo' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, status: data[0].household_status })
}
