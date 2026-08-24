/**
 * Agrupamento automático de defeitos (D-121).
 *
 * O agrupamento é a única coisa que o Sentry fazia e o `error_log` não. Este
 * teste prova que ela funciona **contra o banco de verdade** — a lógica pura já
 * está coberta por `lib/__tests__/error-fingerprint.test.ts`, com 11 casos
 * metade juntando e metade separando.
 *
 * O que só dá para provar aqui:
 *
 *   1. várias ocorrências do mesmo defeito viram UM grupo em /api/errors
 *   2. defeitos distintos NÃO se fundem              ← controle negativo
 *   3. o filtro `context->>fp` funciona no PostgREST (era suposição minha)
 *   4. defeito NOVO acorda o dono
 *   5. o MESMO defeito repetido não acorda de novo   ← o ponto do agrupamento
 *   6. /api/errors recusa quem não tem o segredo     ← controle negativo
 *
 * O item 5 é a razão de existir do D-121: sem ele, um defeito em laço mandaria
 * um aviso a cada quinze minutos até a pessoa desligar a notificação — e
 * desligar o aviso é como se perde a visibilidade que ele existia para dar.
 *
 * ATENÇÃO: escreve no Supabase de produção e apaga o que criou.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
config({ path: '.env.local' })

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SEGREDO = process.env.CRON_SECRET
const PORT = Number(process.env.PORT || 3028)
const B = `http://localhost:${PORT}`
const MARCA = `GRUPO-${Date.now()}`

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/api/health`).then(r => r.ok).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

/**
 * Envia UMA ocorrência e confere que ela entrou.
 *
 * O primeiro esboço deste teste mandava 20 seguidas e contava 10 — a rota tem
 * teto de 10 por minuto por IP (D-119), e ele estava funcionando. O teste é que
 * contava errado, em silêncio. Agora um envio barrado interrompe o teste em vez
 * de virar um número menor sem explicação.
 */
let barrados = 0
const enviar = async (message, url = `${B}/painel`) => {
  const r = await fetch(`${B}/api/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack: `Error\n    at handler (/var/task/components/Painel.tsx:12:3)`, url }),
  })
  const corpo = await r.json().catch(() => null)
  if (r.status === 429 || corpo?.reason === 'rate_limited') barrados += 1
  return corpo
}

/** O teto é por minuto de relógio; esperar a virada é mais honesto que
 *  afrouxar o limite só para o teste passar. */
const esperarJanela = async etiqueta => {
  const faltam = 61 - new Date().getSeconds()
  console.log(`   [espera] ${faltam}s para a próxima janela do limite (${etiqueta})`)
  await new Promise(r => setTimeout(r, faltam * 1000))
}

/** Quantas ocorrências cabem numa janela sem esbarrar no teto de 10/min. */
const LOTE = 8

const grupos = async () => {
  const r = await fetch(`${B}/api/errors?dias=1`, { headers: { Authorization: `Bearer ${SEGREDO}` } }).then(x => x.json())
  return (r.grupos ?? []).filter(g => g.message.includes(MARCA))
}

// ── 6. controle negativo: sem segredo, sem lista ────────────────────────────
const semSegredo = await fetch(`${B}/api/errors`)
semSegredo.status === 401
  ? ok('/api/errors recusa quem não tem o segredo', 'HTTP 401')
  : no('lista de defeitos exposta', `HTTP ${semSegredo.status}`)

// ── 1. mesma falha, várias vezes, identificadores diferentes ────────────────
await esperarJanela('lote 1')
for (let i = 0; i < LOTE; i += 1) await enviar(`${MARCA} usuário ${1000 + i} não encontrado`)
await new Promise(r => setTimeout(r, 1500))
if (barrados) { no('envios barrados pelo limite — teste inválido', `${barrados} de ${LOTE}`); }

let achados = await grupos()
const umGrupo = achados.filter(g => g.message.includes('não encontrado'))
umGrupo.length === 1 && umGrupo[0].total === LOTE
  ? ok(`${LOTE} ocorrências da mesma falha viram UM defeito`, `fp=${umGrupo[0].fp} total=${umGrupo[0].total}`)
  : no('agrupamento falhou', `${umGrupo.length} grupo(s): ${JSON.stringify(umGrupo.map(g => [g.fp, g.total]))}`)

// ── 2. controle negativo: defeito distinto não se funde ─────────────────────
await esperarJanela('lote 2')
await enviar(`${MARCA} conexão recusada pelo servidor`)
await new Promise(r => setTimeout(r, 1200))
achados = await grupos()
achados.length === 2
  ? ok('defeito distinto NÃO se funde com o anterior', `${achados.length} grupos`)
  : no('grupos se fundiram ou se multiplicaram', `${achados.length} grupos: ${JSON.stringify(achados.map(g => [g.message.slice(0, 40), g.total]))}`)

// ── 3. o filtro jsonb funciona no PostgREST ─────────────────────────────────
const fp = umGrupo[0]?.fp
const porFp = fp
  ? await admin(`/rest/v1/error_log?select=id&context->>fp=eq.${fp}`).then(r => r.json())
  : null
Array.isArray(porFp) && porFp.length === LOTE
  ? ok('filtro context->>fp funciona no PostgREST', `${porFp.length} linhas pelo fp`)
  : no('filtro jsonb não funcionou', JSON.stringify(porFp).slice(0, 200))

// ── 4 e 5. o aviso: novo acorda, repetido não ───────────────────────────────
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } })
const { avisarErrosNovos } = await import('../lib/error-alerts.ts').catch(e => {
  console.log(`   [caminho] import direto falhou: ${e.message.slice(0, 80)}`)
  return {}
})
if (!avisarErrosNovos) {
  no('não consegui exercitar o aviso', 'rode com `npx tsx`')
} else {
  const primeiro = await avisarErrosNovos(sb)
  primeiro?.avisou === true && primeiro.defeitosNovos >= 2
    ? ok('defeito novo acorda o dono', `${primeiro.defeitosNovos} novos · ${primeiro.ocorrencias} ocorrências · push=${primeiro.push?.sent ?? 0}`)
    : no('aviso não saiu para defeito novo', JSON.stringify(primeiro))

  // A MESMA falha de novo: agora ela é conhecida, e o dono não pode ser
  // acordado outra vez. É este o comportamento que o D-121 comprou.
  await esperarJanela('repetição do mesmo defeito')
  for (let i = 0; i < 5; i += 1) await enviar(`${MARCA} usuário ${2000 + i} não encontrado`)
  await new Promise(r => setTimeout(r, 1200))
  const segundo = await avisarErrosNovos(sb)
  segundo?.avisou === false && segundo.ocorrencias > 0
    ? ok('mesmo defeito repetido NÃO acorda de novo', `${segundo.ocorrencias} ocorrências, ${segundo.defeitosNovos} defeito novo — ${segundo.motivo}`)
    : no('aviso repetiria para defeito já conhecido', JSON.stringify(segundo))
}

// ── limpeza ─────────────────────────────────────────────────────────────────
stopServer()
const meus = await admin(`/rest/v1/error_log?select=id&message=like.*${MARCA}*`).then(r => r.json())
for (const l of meus ?? []) await admin(`/rest/v1/error_log?id=eq.${l.id}`, { method: 'DELETE' })
const donos = (process.env.ERROR_ALERT_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
for (const d of donos) await admin(`/rest/v1/circle_notifications?kind=eq.error_alert&recipient_id=eq.${d}`, { method: 'DELETE' })
console.log(`   [limpeza] ${(meus ?? []).length} linha(s) e os avisos de teste removidos`)

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
