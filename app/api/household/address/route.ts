/**
 * POST /api/household/address — o endereço e quem mora nele (D-130).
 *
 * Uma chamada só, porque para o usuário é um gesto só: ele preencheu onde mora
 * e quem mora com ele, e apertou salvar. Quebrar isso em três requisições
 * criaria estados pela metade — endereço salvo e lista perdida, ou o contrário.
 *
 * O QUE ACONTECE COM CADA NOME, que é a decisão de desenho inteira:
 *
 *   tem celular  → vira CONVITE pendente. Não vira pessoa: a Daniela do dono já
 *                  tem conta, e cadastrá-la de novo criaria a duplicata que o
 *                  D-123 existiu para eliminar.
 *   não tem      → vira DEPENDENTE, com quem preencheu como cuidador. Para essa
 *                  pessoa não existe convite possível — ela não vai abrir o app.
 *
 * E o endereço NUNCA junta casas automaticamente. Dois vizinhos do mesmo prédio
 * escrevem o mesmo endereço; juntá-los somaria a despensa de estranhos na
 * autonomia da família. O endereço dispara a pergunta, e só.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { beginCoverageChange, endCoverageChange } from '@/lib/inventory-server'
import { formatAddress, isGeocodable, geocodeQuery, type Address } from '@/lib/address'
import { logError } from '@/lib/error-log'
import { enforceAiBudget } from '@/lib/rate-limit'
import { findSimilar, normalizeName, pairKeys, type NamedPerson } from '@/lib/household-names'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Um morador digitado no formulário.
 *
 * `usesApp` substitui `hasPhone` (HOUSEHOLD-FIX-001 §3.3): a pergunta "tem
 * celular?" fazia a pessoa procurar um campo de número que não existe. O
 * servidor aceita os dois nomes durante a transição, para cliente antigo.
 */
type Morador = { name: string; usesApp?: boolean; hasPhone?: boolean; confirmDistinct?: boolean }

/**
 * Quem já mora nesta casa, nos três tipos, para a regra de nome parecido.
 *
 * Contas: as que confirmaram morar junto (menos eu). Dependentes: os meus.
 * Convites: os meus ainda abertos. É a mesma lista que o formulário mostra.
 */
async function quemJaMora(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
): Promise<Array<NamedPerson & { status?: string }>> {
  const [convites, dependentes, minhas] = await Promise.all([
    admin.from('household_invites').select('id, name, status').eq('owner_id', userId).in('status', ['pending', 'sent']),
    admin.from('family_members').select('id, name').eq('profile_id', userId),
    admin.from('circle_members').select('circle_id').eq('user_id', userId).eq('household_status', 'confirmed').limit(1),
  ])

  const gente: Array<NamedPerson & { status?: string }> = []
  for (const c of (convites.data ?? []) as Array<{ id: string; name: string; status: string }>) {
    gente.push({ kind: 'invite', id: c.id, name: c.name, status: c.status })
  }
  for (const d of (dependentes.data ?? []) as Array<{ id: string; name: string }>) {
    gente.push({ kind: 'dependent', id: d.id, name: d.name })
  }

  const circulo = (minhas.data ?? [])[0]?.circle_id as string | undefined
  if (circulo) {
    const { data: casa } = await admin
      .from('circle_members')
      .select('user_id')
      .eq('circle_id', circulo)
      .eq('household_status', 'confirmed')
      .neq('user_id', userId)
    const ids = ((casa ?? []) as Array<{ user_id: string }>).map(m => m.user_id)
    if (ids.length) {
      const { data: perfis } = await admin.from('profiles').select('id, name').in('id', ids)
      for (const p of (perfis ?? []) as Array<{ id: string; name: string | null }>) {
        if (p.name) gente.push({ kind: 'account', id: p.id, name: p.name })
      }
    }
  }
  return gente
}

/**
 * Coordenada a partir do endereço, pelo Nominatim.
 *
 * Sem chave e sem fornecedor novo. Falhar aqui NÃO derruba o salvamento: o
 * endereço escrito já vale por si — ele é o que a pessoa lê e o que alguém
 * usa para chegar. A coordenada é o que o mapa desenha, e pode vir depois.
 */
async function geocodificar(a: Address): Promise<{ lat: number; lng: number } | null> {
  if (!isGeocodable(a)) return null
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', geocodeQuery(a))
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EOS-app/1.0 (emergency preparedness)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as Array<{ lat: string; lon: string }>
    const primeiro = j[0]
    if (!primeiro) return null
    const lat = Number(primeiro.lat)
    const lng = Number(primeiro.lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // O geocodificador é um serviço público e gratuito; um teto evita que uma
  // tela em laço o transforme em abuso em nome do EOS.
  const estourou = await enforceAiBudget(`addr:${auth.user.id}`, { perMinute: 6, perDay: 60 })
  if (estourou) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: { address?: Partial<Address>; residents?: Morador[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const a: Address = {
    country: (body.address?.country ?? '').trim().toUpperCase().slice(0, 2),
    line1: (body.address?.line1 ?? '').trim().slice(0, 200),
    unit: (body.address?.unit ?? '').trim().slice(0, 60),
    city: (body.address?.city ?? '').trim().slice(0, 120),
    region: (body.address?.region ?? '').trim().slice(0, 60),
    postal: (body.address?.postal ?? '').trim().slice(0, 24),
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  try {
    const ponto = await geocodificar(a)

    const patch: Record<string, unknown> = {
      address_country: a.country || null,
      address_line1: a.line1 || null,
      address_unit: a.unit || null,
      address_city: a.city || null,
      address_region: a.region || null,
      address_postal: a.postal || null,
      // `location` continua sendo a forma legível, para quem já lê dali.
      location: formatAddress(a) || null,
    }
    if (ponto) {
      patch.location_lat = ponto.lat
      patch.location_lng = ponto.lng
    }

    const { error: erroPerfil } = await admin.from('profiles').update(patch).eq('id', auth.user.id)
    if (erroPerfil) throw erroPerfil

    const moradores = (body.residents ?? [])
      .filter(m => typeof m?.name === 'string' && m.name.trim())
      .map(m => ({
        name: m.name.trim().slice(0, 120),
        // `usesApp` manda; `hasPhone` é o nome antigo, de cliente que ainda não atualizou.
        usesApp: typeof m.usesApp === 'boolean' ? m.usesApp : Boolean(m.hasPhone),
        confirmDistinct: m.confirmDistinct === true,
      }))
      .slice(0, 20)

    /*
     * Nome parecido com quem já mora aqui não entra sem pergunta
     * (HOUSEHOLD-FIX-001 §4.1, regra 5).
     *
     * O formulário já pergunta antes; isto é a defesa para cliente antigo e
     * para a tela que não conseguiu carregar a lista (E14, E16). O endereço é
     * salvo de qualquer jeito — só o morador parecido volta em `skipped`.
     */
    const jaMoram = await quemJaMora(admin, auth.user.id)
    const skipped: Array<{ name: string; matches: NamedPerson[] }> = []
    const pares: Array<{ owner_id: string; a_key: string; b_key: string }> = []
    let dependentesCriados = 0
    let convitesGuardados = 0
    const coverageSnap = await beginCoverageChange(auth.user.id) // INVENTORY-001 E23

    for (const m of moradores) {
      const parecidos = findSimilar(m.name, jaMoram)
      if (parecidos.length && !m.confirmDistinct) {
        skipped.push({ name: m.name, matches: parecidos.map(({ kind, id, name }) => ({ kind, id, name })) })
        continue
      }

      /*
       * Quem não usa o app vira dependente na hora.
       *
       * `linked_user_id` fica nulo por definição — é gente sem conta — e o
       * cuidador é quem preencheu. É o modelo que o dono desenhou no D-123:
       * "na ficha da cuidadora ela conta ela + 1".
       */
      let novo: NamedPerson | null = null
      if (!m.usesApp) {
        const { data, error } = await admin
          .from('family_members')
          .insert({
            profile_id: auth.user.id,
            name: m.name,
            age: null,
            medical_conditions: [],
            medications: [],
            medical_notes: null,
            mobility_impaired: false,
            is_infant: false,
            relationship: null,
            care_notes: null,
          })
          .select('id')
          .single()
        if (!error && data) {
          dependentesCriados += 1
          novo = { kind: 'dependent', id: String(data.id), name: m.name }
        }
      } else {
        /*
         * Quem usa o app espera um círculo.
         *
         * O convite não pode sair agora: criar círculo é do plano Família, e a
         * pessoa pode dizer "agora não". Os nomes ficam guardados e saem com
         * um toque quando o círculo existir.
         */
        const { data, error } = await admin
          .from('household_invites')
          .insert({ owner_id: auth.user.id, name: m.name, status: 'pending' })
          .select('id')
          .single()
        if (!error && data) {
          convitesGuardados += 1
          novo = { kind: 'invite', id: String(data.id), name: m.name }
        } else if (error?.code === '23505') {
          /*
           * Nome IDÊNTICO a um convite pendente, mesmo com "É outra pessoa"
           * (E19). O índice único do banco não deixa dois convites com a mesma
           * grafia — e é ele que impede o "Desfazer" de duplicar (E6). A tela
           * pede um detalhe que diferencie ("Maria (mãe)").
           */
          skipped.push({
            name: m.name,
            matches: findSimilar(m.name, jaMoram)
              .filter(p => normalizeName(p.name) === normalizeName(m.name))
              .map(({ kind, id, name }) => ({ kind, id, name })),
          })
        } else if (error) {
          throw error
        }
      }

      if (novo) {
        // "É outra pessoa" fica lembrado: o alerta de duplicata não volta a
        // perguntar sobre este par (§3.6, §4.3).
        if (m.confirmDistinct) {
          for (const p of parecidos) {
            const [a_key, b_key] = pairKeys(novo, p)
            pares.push({ owner_id: auth.user.id, a_key, b_key })
          }
        }
        jaMoram.push(novo)
      }
    }

    if (pares.length) {
      // Falhar aqui só faz o alerta perguntar de novo — não vale derrubar o salvamento.
      await admin.from('household_distinct_pairs').upsert(pares, { ignoreDuplicates: true }).then(() => {}, () => {})
    }

    if (dependentesCriados) await endCoverageChange(auth.user.id, coverageSnap) // INVENTORY-001 E23

    return NextResponse.json({
      ok: true,
      formatted: formatAddress(a),
      located: Boolean(ponto),
      dependents: dependentesCriados,
      pendingInvites: convitesGuardados,
      skipped,
    })
  } catch (e) {
    const erro = e as { code?: string }
    // A migration pode não ter sido aplicada ainda. Dizer isso é melhor que um
    // 500 mudo, que faria a pessoa achar que o endereço dela é que era inválido.
    if (erro.code === 'PGRST205' || erro.code === '42P01' || erro.code === '42703') {
      return NextResponse.json({ error: 'migration_pending' }, { status: 503 })
    }
    await logError('api/household/address', e, { userId: auth.user.id })
    return NextResponse.json({ error: 'Não foi possível salvar o endereço.' }, { status: 500 })
  }
}

/**
 * Os convites ainda abertos: pendentes E enviados (HOUSEHOLD-FIX-001 §4.2).
 *
 * Antes só voltavam os `pending`. Um convite marcado como enviado sumia da tela
 * antes de a pessoa entrar, e quem convidou não tinha mais como reenviar nem
 * remover (C7). `pending` continua na resposta para cliente antigo.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ pending: [], invites: [] })

  const { data, error } = await admin
    .from('household_invites')
    .select('id, name, status, sent_at, created_at')
    .eq('owner_id', auth.user.id)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ pending: [], invites: [], migrationPending: true })
  const invites = (data ?? []) as Array<{ id: string; name: string; status: 'pending' | 'sent'; sent_at: string | null; created_at: string }>
  return NextResponse.json({
    invites,
    pending: invites.filter(i => i.status === 'pending').map(({ id, name, created_at }) => ({ id, name, created_at })),
  })
}

/**
 * PATCH — mexer num convite (D-130, HOUSEHOLD-FIX-001 §4.2).
 *
 *   status 'sent'      a pessoa marcou que mandou o link — ato dela, não do app
 *   status 'dismissed' "Remover"
 *   status 'pending'   "Desfazer" depois de remover
 *   name               "Corrigir nome"
 *
 * Restaurar ou renomear pode colidir com o índice único de nomes pendentes:
 * vira 409 `name_taken`, e a tela diz isso em vez de duplicar (E6).
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let body: { id?: string; status?: 'pending' | 'sent' | 'dismissed'; name?: string; restore?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const statusValido = body.status === undefined || ['pending', 'sent', 'dismissed'].includes(body.status)
  const nome = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : undefined
  if (!body.id || !statusValido || (body.status === undefined && nome === undefined) || nome === '') {
    return NextResponse.json({ error: 'id e (status ou name) são obrigatórios' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.status) {
    patch.status = body.status
    // `restore` = "Desfazer": volta ao estado anterior sem reescrever a data
    // em que o link foi mandado.
    if (body.status === 'sent' && !body.restore) patch.sent_at = new Date().toISOString()
  }
  if (nome !== undefined) patch.name = nome

  const { data, error } = await admin
    .from('household_invites')
    .update(patch)
    // O `owner_id` no filtro é a autorização: ninguém mexe na lista de outra pessoa.
    .eq('id', body.id)
    .eq('owner_id', auth.user.id)
    .select('id, name, status, sent_at')

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'name_taken' }, { status: 409 })
    await logError('api/household/address:patch', error, { userId: auth.user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Zero linhas significa que o id não é dela — um UPDATE bloqueado por filtro
  // devolve sucesso vazio, e já foi assim que um bug passou meses escondido.
  if (!data?.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true, invite: data[0] })
}
