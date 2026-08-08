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
import { formatAddress, isGeocodable, geocodeQuery, type Address } from '@/lib/address'
import { logError } from '@/lib/error-log'
import { enforceAiBudget } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Morador = { name: string; hasPhone: boolean }

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
      .map(m => ({ name: m.name.trim().slice(0, 120), hasPhone: Boolean(m.hasPhone) }))
      .slice(0, 20)

    const comCelular = moradores.filter(m => m.hasPhone)
    const semCelular = moradores.filter(m => !m.hasPhone)

    /*
     * Quem não tem celular vira dependente na hora.
     *
     * `linked_user_id` fica nulo por definição — é gente sem conta — e o
     * cuidador é quem preencheu. É o modelo que o dono desenhou no D-123:
     * "na ficha da cuidadora ela conta ela + 1".
     */
    let dependentesCriados = 0
    for (const m of semCelular) {
      const { data: jaExiste } = await admin
        .from('family_members')
        .select('id')
        .eq('profile_id', auth.user.id)
        .ilike('name', m.name)
        .maybeSingle()
      if (jaExiste) continue
      const { error } = await admin.from('family_members').insert({
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
      if (!error) dependentesCriados += 1
    }

    /*
     * Quem tem celular espera um círculo.
     *
     * O convite não pode sair agora: criar círculo é do plano Família, e a
     * pessoa pode dizer "agora não". Se os nomes sumissem aí, ela teria
     * digitado à toa — e teria que digitar tudo de novo depois. Eles ficam
     * guardados e saem com um toque quando o círculo existir.
     */
    let convitesGuardados = 0
    for (const m of comCelular) {
      const { error } = await admin
        .from('household_invites')
        .insert({ owner_id: auth.user.id, name: m.name, status: 'pending' })
      // 23505 = o mesmo nome já está pendente. Voltar à ficha e salvar de novo
      // não pode duplicar a lista.
      if (!error) convitesGuardados += 1
      else if (error.code !== '23505') throw error
    }

    return NextResponse.json({
      ok: true,
      formatted: formatAddress(a),
      located: Boolean(ponto),
      dependents: dependentesCriados,
      pendingInvites: convitesGuardados,
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

/** Os convites que ainda esperam um círculo. */
export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ pending: [] })

  const { data, error } = await admin
    .from('household_invites')
    .select('id, name, created_at')
    .eq('owner_id', auth.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ pending: [], migrationPending: true })
  return NextResponse.json({ pending: data ?? [] })
}

/**
 * PATCH — a pessoa marca que já mandou o link (D-130).
 *
 * É ato dela, não do app. O convite deste produto é um link compartilhado por
 * onde ela quiser — WhatsApp, mensagem, à mão. O servidor não tem como saber
 * que saiu, e marcar sozinho como enviado faria a tela afirmar que alguém foi
 * convidado quando ninguém recebeu nada.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let body: { id?: string; status?: 'sent' | 'dismissed' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.id || (body.status !== 'sent' && body.status !== 'dismissed')) {
    return NextResponse.json({ error: 'id e status são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('household_invites')
    .update({ status: body.status, sent_at: body.status === 'sent' ? new Date().toISOString() : null })
    // O `owner_id` no filtro é a autorização: ninguém mexe na lista de outra pessoa.
    .eq('id', body.id)
    .eq('owner_id', auth.user.id)
    .select('id')

  if (error) {
    await logError('api/household/address:patch', error, { userId: auth.user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Zero linhas significa que o id não é dela — um UPDATE bloqueado por filtro
  // devolve sucesso vazio, e já foi assim que um bug passou meses escondido.
  if (!data?.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
