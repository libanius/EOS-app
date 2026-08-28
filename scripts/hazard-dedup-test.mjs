/**
 * O log de entrega precisa ACEITAR escrita (D-222).
 *
 * Este teste existe porque a proteção mais alardeada da D-220 — "a mesma
 * transição nunca é entregue duas vezes" — passou quatro dias inerte em
 * produção sem que nada apitasse.
 *
 * A `20260824000000_hazard_alerting.sql` criou a trava assim:
 *
 *   CREATE UNIQUE INDEX uq_ndl_user_dedup
 *     ON notification_delivery_log (user_id, dedup_key) WHERE dedup_key IS NOT NULL;
 *
 * Índice **parcial**. O Postgres só o aceita como árbitro de `ON CONFLICT` se a
 * instrução repetir o predicado, e o `on_conflict` do PostgREST — que é o que o
 * supabase-js emite — não repete. Toda escrita voltava 42P10, e como
 * `lib/hazards/scan.ts` descartava o retorno do upsert, a varredura seguia
 * relatando `pushed: 1` contra uma tabela de 0 linhas.
 *
 * Isso não é perder o registro de uma supressão. É perder a supressão:
 * `notification_delivery_log` É o dedup (`seen`) e É o cooldown (`lastSentAt`).
 * Com ele mudo, o mesmo furacão pode acordar a família a cada passada.
 *
 * O que este teste prova, contra o banco REAL:
 *
 *   1. o upsert exato que o scan faz é aceito (o árbitro existe)
 *   2. repetir o mesmo (user_id, dedup_key) NÃO cria segunda linha
 *   3. a trava é por usuário — o mesmo dedup_key de outra pessoa entra
 *   4. `dedup_key IS NULL` continua aceitando várias linhas (NULLS DISTINCT)
 *   5. controle negativo: um árbitro inexistente ainda dá 42P10, provando que
 *      o teste 1 mede o índice e não a boa vontade do PostgREST
 *
 * ATENÇÃO: escreve e apaga linhas no Supabase de produção. Toda linha criada
 * usa o prefixo `__DEDUP_TEST__` e é removida ao final, inclusive em falha.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}

const PREFIX = '__DEDUP_TEST__'
const api = (p, o = {}) =>
  fetch(`${URL}/rest/v1${p}`, {
    ...o,
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      ...o.headers,
    },
  })

let pass = 0
let fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

async function cleanup() {
  const r = await api(`/notification_delivery_log?dedup_key=like.${PREFIX}*`, { method: 'DELETE' })
  const orphans = await (await api(`/notification_delivery_log?select=id&dedup_key=like.${PREFIX}*`)).json()
  console.log(`   [limpeza] HTTP ${r.status} · linhas de teste restantes: ${Array.isArray(orphans) ? orphans.length : '?'}`)
}
process.on('exit', () => {})

// O upsert idêntico ao de lib/hazards/scan.ts: mesmo on_conflict, mesma resolução.
const upsert = (rows) =>
  api('/notification_delivery_log?on_conflict=user_id,dedup_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })

const row = (userId, key, extra = {}) => ({
  user_id: userId,
  hazard_event_id: 'dedup-test',
  channel: 'push',
  status: 'sent',
  dedup_key: key,
  detail: 'regressao D-222',
  ...extra,
})

try {
  // Duas contas reais quaisquer: a tabela tem FK para auth.users, então não dá
  // para inventar um uuid. Ler quem existe é mais honesto que semear conta nova.
  const users = await (await api('/profiles?select=id&limit=2')).json()
  if (!Array.isArray(users) || users.length < 2) {
    console.error('Preciso de ao menos 2 perfis reais no banco para testar o escopo por usuário.')
    process.exit(1)
  }
  const [a, b] = users.map(u => u.id)
  const key = `${PREFIX}${Date.now()}`

  await cleanup()

  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    const r = await upsert([row(a, key)])
    const body = await r.text()
    r.status === 201
      ? ok('o upsert que o scan faz é ACEITO', `HTTP ${r.status}`)
      : no('o upsert que o scan faz foi recusado', `HTTP ${r.status} ${body.slice(0, 200)}`)
  }

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    await upsert([row(a, key, { detail: 'segunda tentativa' })])
    const rows = await (await api(`/notification_delivery_log?select=id,detail&dedup_key=eq.${key}&user_id=eq.${a}`)).json()
    rows.length === 1
      ? ok('repetir o mesmo (user_id, dedup_key) NÃO duplica', `${rows.length} linha`)
      : no('DUPLICOU — o dedup não está travando', `${rows.length} linhas`)
    rows.length === 1 && rows[0].detail === 'regressao D-222'
      ? ok('ignoreDuplicates preserva a primeira entrega, não a sobrescreve')
      : no('a segunda escrita alterou a linha original', JSON.stringify(rows[0] ?? {}))
  }

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    const r = await upsert([row(b, key)])
    const rows = await (await api(`/notification_delivery_log?select=id&dedup_key=eq.${key}`)).json()
    r.status === 201 && rows.length === 2
      ? ok('a trava é POR USUÁRIO — o mesmo alerta alcança outra pessoa', `${rows.length} linhas`)
      : no('o dedup vazou entre usuários', `HTTP ${r.status}, ${rows.length} linhas`)
  }

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    // O índice deixou de ser parcial; `NULLS DISTINCT` (padrão) é o que garante
    // que isso não passou a ser uma trava nova em cima de dedup_key nulo.
    const r1 = await upsert([row(a, null, { hazard_event_id: `${PREFIX}null1`, dedup_key: null })])
    const r2 = await upsert([row(a, null, { hazard_event_id: `${PREFIX}null2`, dedup_key: null })])
    const rows = await (await api(`/notification_delivery_log?select=id&hazard_event_id=like.${PREFIX}null*`)).json()
    r1.status === 201 && r2.status === 201 && rows.length === 2
      ? ok('dedup_key nulo continua aceitando N linhas (NULLS DISTINCT)', `${rows.length} linhas`)
      : no('o índice total passou a travar dedup_key nulo', `HTTP ${r1.status}/${r2.status}, ${rows.length} linhas`)
    await api(`/notification_delivery_log?hazard_event_id=like.${PREFIX}null*`, { method: 'DELETE' })
  }

  // ── 5 ─── controle negativo ───────────────────────────────────────────────
  {
    // Se ISTO passar, o teste 1 não prova nada: significaria que o PostgREST
    // aceita qualquer on_conflict e o 42P10 nunca aconteceria.
    const r = await api('/notification_delivery_log?on_conflict=user_id,channel', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([row(a, `${PREFIX}control`)]),
    })
    const body = await r.text()
    body.includes('42P10')
      ? ok('controle negativo: árbitro inexistente ainda dá 42P10', `HTTP ${r.status}`)
      : no('controle negativo FALHOU — o teste 1 não estaria medindo o índice', `HTTP ${r.status} ${body.slice(0, 160)}`)
  }
} finally {
  await cleanup()
}

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail > 0 ? 1 : 0)
