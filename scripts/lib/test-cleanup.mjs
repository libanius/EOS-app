/**
 * Limpeza garantida dos dados de teste (D-114).
 *
 * Todos os 17 scripts de teste criam contas no Supabase de PRODUÇÃO e apagam no
 * fim. O problema é a palavra "fim": quando uma asserção estoura, um seletor
 * expira ou o servidor não sobe, o processo morre antes da limpeza — e o resíduo
 * fica lá para sempre.
 *
 * Medido em 2026-08-04: **32 contas de teste contra 8 reais** no banco de
 * produção, mais 24 perfis órfãos. Nenhuma delas foi deixada de propósito; todas
 * são execuções que falharam no meio.
 *
 * Este módulo registra o que foi criado e garante a remoção em QUALQUER saída —
 * sucesso, exceção, rejeição não tratada ou Ctrl-C.
 *
 * USO:
 *   import { track, cleanupOnExit } from './lib/test-cleanup.mjs'
 *   cleanupOnExit(admin)                       // uma vez, no topo
 *   track.user(u.id); track.circle(c.id)       // ao criar
 *
 * A limpeza é IDEMPOTENTE: chamar duas vezes não quebra, e o `finally` do script
 * pode continuar apagando por conta própria sem conflito.
 */

const created = { users: new Set(), circles: new Set(), profiles: new Set() }
let adminFetch = null
let done = false

export const track = {
  user(id) { if (id) { created.users.add(id); created.profiles.add(id) } },
  circle(id) { if (id) created.circles.add(id) },
  profile(id) { if (id) created.profiles.add(id) },
}

async function purge() {
  if (done || !adminFetch) return
  done = true

  const total = created.users.size + created.circles.size
  if (!total) return

  // Círculos primeiro: eles seguram membros, planos e convites por chave
  // estrangeira. Apagar o usuário antes deixaria o círculo órfão se alguma FK
  // não tiver ON DELETE CASCADE — foi assim que sobraram 8 círculos de teste.
  for (const id of created.circles) {
    await adminFetch(`/rest/v1/circles?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
  for (const id of created.users) {
    await adminFetch(`/rest/v1/family_members?profile_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    await adminFetch(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {})
  }
  // O perfil é apagado DEPOIS da conta e sempre: a cascata de `auth.users` nem
  // sempre alcança `profiles`, e é exatamente daí que vinham os órfãos.
  for (const id of created.profiles) {
    await adminFetch(`/rest/v1/profiles?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }

  console.log(`   [limpeza] ${created.users.size} conta(s) e ${created.circles.size} círculo(s) removidos`)
}

/**
 * Liga a limpeza a toda forma de encerrar o processo.
 *
 * `beforeExit` é o gancho que aceita trabalho assíncrono; `exit` não. Por isso a
 * remoção acontece ali, e os handlers de erro apenas garantem que o processo
 * chegue a esse ponto em vez de morrer de imediato.
 */
export function cleanupOnExit(admin) {
  adminFetch = admin

  process.on('beforeExit', async () => { await purge() })

  const morrer = async (motivo, erro) => {
    console.error(`\n[${motivo}]`, erro?.stack ?? erro ?? '')
    await purge()
    process.exit(1)
  }
  process.on('uncaughtException', e => { void morrer('exceção não tratada', e) })
  process.on('unhandledRejection', e => { void morrer('promessa rejeitada', e) })
  process.on('SIGINT', () => { void morrer('interrompido', null) })
  process.on('SIGTERM', () => { void morrer('encerrado', null) })
}

/** Para quem quiser limpar explicitamente antes de sair. */
export const cleanupNow = purge

/**
 * Encerra o script LIMPANDO antes.
 *
 * `process.exit()` **não dispara `beforeExit`** — o gancho onde a limpeza mora.
 * Um script que termina com `process.exit(fail ? 1 : 0)` passa por cima de toda
 * a proteção deste módulo sem avisar nada. Foi assim que `guardrails-test.mjs`
 * deixou 7 contas no banco de produção depois do D-114 já estar em vigor: a
 * rede existia e o teste pulou por fora dela.
 *
 * Todo script de teste deve terminar com `await finish(fail)` em vez de
 * `process.exit(...)`.
 */
export async function finish(fail) {
  await purge()
  process.exit(fail ? 1 : 0)
}
