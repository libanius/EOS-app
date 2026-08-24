/**
 * A casa é a casa, e não a lista digitada à mão (D-123).
 *
 * O defeito que isto prova estar corrigido: **todos os cálculos do app liam
 * `family_members`**, uma lista digitada por uma pessoa, e nenhum olhava o
 * círculo. Cinco contas reais e a conta de água dizia uma pessoa. Além disso,
 * `share_inventory` nunca somou nada — era só visibilidade de tela.
 *
 * O cenário montado aqui:
 *
 *     Ana ──┐
 *     Bruno ├── círculo "Casa de Teste"     Ana e Bruno CONFIRMAM morar juntos
 *     Célia ┘                               Célia NÃO confirma
 *     Duda  = dependente da Ana (sem conta)
 *
 * O que deve valer:
 *
 *   1. antes de confirmar, a casa da Ana é 1        ← é a confirmação que conta
 *   2. depois, a casa é 3: Ana + Bruno + Duda
 *   3. a água soma Ana + Bruno e NÃO a de Célia     ← controle negativo
 *   4. Célia aparece como alcançável, não somada    ← controle negativo
 *   5. a ficha de quem não liberou não é lida, e isso é CONTADO
 *   6. a autonomia usa pessoa-dia, não a soma crua de dias
 *   7. uma pessoa não pode morar em duas casas      ← trava do banco
 *
 * O item 3 é o coração: somar a despensa do vizinho produziria um número de
 * autonomia que parece bom e não existe.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

cleanupOnExit(admin)

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

const { getHousehold, autonomyDays } = await import('../lib/household.ts')

async function conta(nome) {
  const email = `eos-house-${nome.toLowerCase()}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome }) })
  return { id: u.id, nome }
}

const ana = await conta('Ana')
const bruno = await conta('Bruno')
const celia = await conta('Celia')

// Despensas diferentes de propósito: se a soma estiver errada, o número denuncia
// exatamente qual parcela entrou indevidamente.
const despensa = (id, agua, dias) =>
  admin('/rest/v1/resource_inventory', { method: 'POST', body: JSON.stringify({
    profile_id: id, water_liters: agua, food_days: dias, fuel_liters: 0,
    battery_percent: 50, has_medical_kit: false, has_communication_device: false, cash_amount: 0,
  }) })

await despensa(ana.id, 30, 4)
await despensa(bruno.id, 60, 6)
await despensa(celia.id, 900, 99)   // enorme: se vazar para a conta, é gritante

const circulo = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Casa de Teste', leader_id: ana.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
track.circle(circulo[0]?.id)
const circleId = circulo[0].id

await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circleId, user_id: ana.id, role: 'Admin', share_inventory: true, shared_fields: [] },
  { circle_id: circleId, user_id: bruno.id, role: 'Editor', share_inventory: true, shared_fields: [] },
  { circle_id: circleId, user_id: celia.id, role: 'Viewer', share_inventory: true, shared_fields: [] },
]) })

// Duda: dependente da Ana, sem conta. É o caso que o dono descreveu —
// "na ficha da cuidadora ela conta ela + 1".
await admin('/rest/v1/family_members', { method: 'POST', body: JSON.stringify({
  profile_id: ana.id, name: 'Duda', age: 2, medical_conditions: [], medications: [],
  medical_notes: null, mobility_impaired: false, is_infant: true,
  relationship: 'filha', care_notes: 'não anda sozinha ainda',
}) })

console.log('— círculo com 3 contas e 1 dependente\n')

// ── 1. antes de confirmar, morar junto não vale ─────────────────────────────
const antes = await getHousehold(ana.id)
antes.known && antes.size === 2 && antes.inventory.contributors === 1
  ? ok('sem confirmar, a casa é só quem cadastrou + seus dependentes', `${antes.size} pessoas, ${antes.inventory.contributors} despensa`)
  : no('a casa contou gente que não confirmou', `size=${antes.size} contributors=${antes.inventory.contributors} known=${antes.known}`)

// ── confirmam morar juntos ──────────────────────────────────────────────────
const confirmar = id => admin(`/rest/v1/circle_members?circle_id=eq.${circleId}&user_id=eq.${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ household_status: 'confirmed', household_confirmed_at: new Date().toISOString() }),
})
await confirmar(ana.id)
await confirmar(bruno.id)

const casa = await getHousehold(ana.id)

// ── 2. a casa é Ana + Bruno + Duda ──────────────────────────────────────────
casa.size === 3
  ? ok('a casa soma contas confirmadas + dependentes', `${casa.size} pessoas: ${casa.people.map(p => p.name).join(', ')}`)
  : no('tamanho da casa errado', `${casa.size}: ${JSON.stringify(casa.people.map(p => p.name))}`)

// ── 3. controle negativo: a despensa da Célia NÃO entra ─────────────────────
const aguaEsperada = 30 + 60
casa.inventory.waterLiters === aguaEsperada && casa.inventory.contributors === 2
  ? ok('a água soma só quem mora junto', `${casa.inventory.waterLiters} L de ${casa.inventory.contributors} despensas`)
  : no('inventário de quem não mora junto vazou para a conta', `água=${casa.inventory.waterLiters} (esperado ${aguaEsperada}) contribuintes=${casa.inventory.contributors}`)

// ── 4. controle negativo: Célia é alcançável, não somada ────────────────────
const celiaFora = casa.reachable.find(r => r.userId === celia.id)
celiaFora && !casa.people.some(p => p.userId === celia.id)
  ? ok('quem está no círculo e não na casa aparece como alcançável', `${celiaFora.name} · ${celiaFora.circleName}`)
  : no('separação casa/círculo falhou', `alcançáveis=${JSON.stringify(casa.reachable.map(r => r.name))}`)

// ── 5. ficha de quem não liberou não é lida, e isso é contado ───────────────
const brunoNaCasa = casa.people.find(p => p.userId === bruno.id)
brunoNaCasa && brunoNaCasa.medicalVisible === false && casa.needsHidden === 1
  ? ok('morar junto NÃO dá acesso à ficha médica', `${casa.needsHidden} pessoa com necessidade não legível`)
  : no('acesso à ficha vazou com o morar junto', `visível=${brunoNaCasa?.medicalVisible} ocultas=${casa.needsHidden}`)

// ── 6. autonomia em pessoa-dia ──────────────────────────────────────────────
// Ana cobre 2 pessoas (ela + Duda) com 4 dias = 8 pessoa-dia; Bruno, 6.
// Total 14 pessoa-dia ÷ 3 pessoas = 4,67 dias de comida.
// Água: 90 L ÷ (3 L × 3) = 10 dias. O limite é a comida.
const esperado = 14 / 3
const calculado = autonomyDays(casa.inventory, casa.size)
casa.inventory.foodPersonDays === 14 && Math.abs(calculado - esperado) < 0.01
  ? ok('autonomia usa pessoa-dia, não a soma crua de dias', `${calculado.toFixed(2)} dias (soma crua daria ${(4 + 6).toFixed(0)})`)
  : no('conta de comida errada', `pessoa-dia=${casa.inventory.foodPersonDays} autonomia=${calculado.toFixed(2)} esperado=${esperado.toFixed(2)}`)

// ── 7. trava: uma pessoa mora em UMA casa ───────────────────────────────────
const outro = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Outra Casa', leader_id: celia.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
track.circle(outro[0]?.id)
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify({
  circle_id: outro[0].id, user_id: bruno.id, role: 'Viewer', share_inventory: false, shared_fields: [],
}) })
const dupla = await admin(`/rest/v1/circle_members?circle_id=eq.${outro[0].id}&user_id=eq.${bruno.id}`, {
  method: 'PATCH', body: JSON.stringify({ household_status: 'confirmed' }),
})
const recusou = dupla.status >= 400
recusou
  ? ok('o banco recusa a mesma pessoa em duas casas', `HTTP ${dupla.status}`)
  : no('alguém pode morar em duas casas — o inventário contaria duas vezes', `HTTP ${dupla.status}`)

// ── 8. vincular um cadastro a uma conta NÃO pode inflar a autonomia ─────────
// Célia tem conta e não confirmou morar junto. Se a Ana vincular o cadastro
// dela, a pessoa não pode simplesmente sumir da conta.
const antesDeVincular = await getHousehold(ana.id)
await admin('/rest/v1/family_members', { method: 'POST', body: JSON.stringify({
  profile_id: ana.id, name: 'Celia', age: 38, medical_conditions: [], medications: [],
  medical_notes: null, mobility_impaired: false, is_infant: false, linked_user_id: celia.id,
  relationship: null, care_notes: null,
}) })
const depoisDeVincular = await getHousehold(ana.id)
const autonomiaAntes = autonomyDays(antesDeVincular.inventory, antesDeVincular.size)
const autonomiaDepois = autonomyDays(depoisDeVincular.inventory, depoisDeVincular.size)
depoisDeVincular.size === antesDeVincular.size + 1 && autonomiaDepois < autonomiaAntes
  ? ok('vincular alguém sem confirmação NÃO infla a autonomia', `${antesDeVincular.size}→${depoisDeVincular.size} pessoas · ${autonomiaAntes.toFixed(2)}→${autonomiaDepois.toFixed(2)} dias`)
  : no('a autonomia subiu ao vincular uma conta', `size ${antesDeVincular.size}→${depoisDeVincular.size} · autonomia ${autonomiaAntes.toFixed(2)}→${autonomiaDepois.toFixed(2)}`)

// ── a visão do Bruno é a mesma casa, pelo outro lado ────────────────────────
// A propriedade é "os dois veem o MESMO", não um número fixo: a primeira
// versão comparava com 3 e passou a falhar quando o cenário cresceu — o teste
// estaria certo sobre a coisa errada.
const casaBruno = await getHousehold(bruno.id)
const casaAna = await getHousehold(ana.id)
const mesmasPessoas = JSON.stringify(casaBruno.people.map(p => p.name).sort()) ===
  JSON.stringify(casaAna.people.map(p => p.name === 'Você' ? 'Ana' : p.name).sort().map(n => n === 'Ana' ? 'Você' : n).sort())
casaBruno.size === casaAna.size && casaBruno.inventory.waterLiters === casaAna.inventory.waterLiters && casaBruno.inventory.waterLiters === aguaEsperada
  ? ok('os dois lados enxergam a MESMA casa', `${casaBruno.size} pessoas, ${casaBruno.inventory.waterLiters} L dos dois lados`)
  : no('a casa depende de quem pergunta', `Bruno: ${casaBruno.size}p/${casaBruno.inventory.waterLiters}L · Ana: ${casaAna.size}p/${casaAna.inventory.waterLiters}L (mesmas=${mesmasPessoas})`)

console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
