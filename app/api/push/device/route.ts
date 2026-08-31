/**
 * Registro do aparelho nativo (MOB-T03 · D-228).
 *
 * O par de `POST /api/push/subscribe`, para o outro transporte. Aqui não há
 * chave de cifragem para guardar: o token da APNs/FCM é opaco, e o segredo mora
 * com a Apple e o Google. Por isso a tabela é outra, e por isso esta rota é
 * mais curta.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Corpo = { token?: unknown; platform?: unknown; appVersion?: unknown }

/**
 * O token não é validado quanto ao formato, de propósito.
 *
 * APNs entrega hexadecimal de 64 caracteres; o FCM entrega uma string bem mais
 * longa e sem formato garantido, que o Google já mudou antes. Uma expressão
 * regular aqui viraria uma rejeição silenciosa de aparelhos legítimos no dia em
 * que o formato mudasse — e quem descobriria seria uma família que não recebeu
 * o alerta. O limite de tamanho basta como sanidade.
 */
const MAX_TOKEN = 4096

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Corpo
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const platform = body.platform
  if (!token || token.length > MAX_TOKEN) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }
  if (platform !== 'ios' && platform !== 'android') {
    return NextResponse.json({ error: 'platform must be ios or android' }, { status: 400 })
  }

  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 32) : null

  /*
   * Conflito por `token`, não por `(user_id, token)`.
   *
   * O mesmo aparelho pode trocar de dono — alguém sai da conta e outra pessoa
   * entra no mesmo telefone. O token continua igual e o `user_id` muda, então o
   * upsert REATRIBUI a linha. Se o árbitro incluísse `user_id`, restariam duas
   * linhas e a conta antiga seguiria recebendo os alertas da nova, no aparelho
   * de outra pessoa.
   */
  const { error } = await supabase.from('push_devices').upsert(
    {
      user_id: user.id,
      token,
      platform,
      app_version: appVersion,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  )

  if (error) {
    /*
     * `42P01` — a migração ainda não foi aplicada no banco. Isso é estado de
     * implantação, não erro do cliente: a tela precisa poder dizer "ainda não
     * disponível" em vez de "algo deu errado".
     */
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'push_devices_missing' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  // `.eq('user_id')` é o que impede alguém de apagar o aparelho de outra pessoa
  // sabendo o token. A RLS já barraria; a redundância aqui é barata.
  const { error } = await supabase
    .from('push_devices')
    .delete()
    .eq('user_id', user.id)
    .eq('token', token)

  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
