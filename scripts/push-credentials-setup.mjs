#!/usr/bin/env node
/**
 * Põe as credenciais de push nativo na Vercel (MOB-T03 · D-228).
 *
 * ── Por que um script, e não seis comandos ────────────────────────────────
 *
 * São seis variáveis, e cada uma tem um jeito próprio de dar errado em
 * silêncio: o `.p8` colado pela metade, o Key ID de OUTRA chave, o Team ID com
 * espaço no fim, o JSON do service account de outro projeto. Nenhum desses
 * erros aparece no deploy. Aparecem como um telefone que não toca.
 *
 * Aqui cada valor é VALIDADO antes de subir — o `.p8` tem de assinar de
 * verdade, o JSON tem de ter os três campos — e o Key ID sai do nome do próprio
 * arquivo, que é a fonte que não erra.
 *
 * ── E por que os valores nunca são impressos ──────────────────────────────
 *
 * O conteúdo vai do arquivo para o stdin do `vercel env add` e mais nada. Quem
 * tem a chave `.p8` pode notificar todo aparelho do EOS; ela não tem por que
 * aparecer num terminal, num log de sessão ou no histórico do shell.
 *
 * Uso:
 *   node scripts/push-credentials-setup.mjs \
 *     --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \
 *     --team ZZZZ999999 \
 *     --sa ~/Downloads/eos-firebase-adminsdk.json
 *
 *   --env production|preview   (padrão: production)
 *   --dry-run                  valida tudo e não escreve nada
 */

import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

// ─── Argumentos ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const arg = nome => {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const flag = nome => argv.includes(`--${nome}`)

const P8 = arg('p8')
const TEAM = arg('team')?.trim()
const SA = arg('sa')
const KEY_ID_MANUAL = arg('key-id')?.trim()
const BUNDLE = arg('bundle')?.trim() ?? 'app.eos.family'
const ALVO = arg('env') ?? 'production'
const DRY = flag('dry-run')

const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const err = m => console.log(`  \x1b[31m✗\x1b[0m ${m}`)
const info = m => console.log(`    ${m}`)

if (!P8 && !SA) {
  console.log(`
Põe as credenciais de push nativo na Vercel, validando antes de subir.

  node scripts/push-credentials-setup.mjs \\
    --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \\
    --team ZZZZ999999 \\
    --sa ~/Downloads/<projeto>-firebase-adminsdk-<hash>.json

  --env production|preview   padrão: production
  --key-id XXXXXXXXXX        só se o .p8 foi renomeado
  --bundle app.eos.family    padrão: app.eos.family
  --dry-run                  valida tudo e não escreve nada

Pode rodar só um dos lados: passe apenas --p8/--team, ou apenas --sa.
Depois: npm run check:push -- --env <arquivo puxado com vercel env pull>
`)
  process.exit(1)
}

if (!['production', 'preview', 'development'].includes(ALVO)) {
  err(`--env inválido: "${ALVO}". Use production, preview ou development.`)
  process.exit(1)
}

/*
 * O valor NUNCA vira argumento de linha de comando.
 *
 * Argumento aparece em `ps`, no histórico do shell e em qualquer log de
 * processo da máquina. Stdin não aparece em nenhum dos três.
 */
function definirVariavel(nome, valor) {
  if (DRY) {
    ok(`${nome} → ${ALVO}  (dry-run: nada foi escrito)`)
    return true
  }
  // Uma variável já existente não é sobrescrita pelo `add` — ela precisa sair
  // primeiro, ou o comando falha e a credencial velha continua valendo.
  spawnSync('vercel', ['env', 'rm', nome, ALVO, '--yes'], { stdio: 'ignore' })

  const r = spawnSync('vercel', ['env', 'add', nome, ALVO], {
    input: valor,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    err(`${nome}: o Vercel CLI recusou (${r.status})`)
    info((r.stderr ?? '').split('\n').filter(Boolean).slice(-3).join('\n    '))
    return false
  }
  ok(`${nome} → ${ALVO}`)
  return true
}

let falhou = false

console.log(`\nCredenciais de push nativo → Vercel (${ALVO})${DRY ? '  [DRY-RUN]' : ''}`)

// ─── APNs ───────────────────────────────────────────────────────────────────
if (P8) {
  console.log('\n\x1b[1mAPNs — iOS\x1b[0m')

  if (!TEAM) {
    err('--team é obrigatório junto de --p8 (o Team ID, canto superior direito do portal da Apple)')
    process.exit(1)
  }

  let pem
  try {
    pem = readFileSync(resolve(P8), 'utf8')
  } catch (e) {
    err(`Não consegui ler ${P8}: ${e.message}`)
    process.exit(1)
  }

  /*
   * A prova de que o `.p8` está inteiro é ASSINAR com ele.
   *
   * Conferir se o texto começa com "BEGIN PRIVATE KEY" não basta: um arquivo
   * truncado no meio passa nesse teste e falha na Apple, com uma mensagem que
   * não diz que o problema é o arquivo.
   */
  try {
    crypto.sign('sha256', Buffer.from('eos'), { key: pem, dsaEncoding: 'ieee-p1363' })
    ok('O .p8 assina — a chave está íntegra')
  } catch (e) {
    err(`O .p8 não consegue assinar: ${e.message}`)
    info('O arquivo precisa estar inteiro, com as linhas BEGIN/END PRIVATE KEY.')
    process.exit(1)
  }

  // O nome do arquivo é a fonte que não erra: a Apple o gera como
  // `AuthKey_<KEYID>.p8`, e o Key ID é exatamente esse pedaço.
  const doNome = basename(P8).match(/AuthKey_([A-Z0-9]{10})\.p8$/i)?.[1]
  const KEY_ID = KEY_ID_MANUAL ?? doNome
  if (!KEY_ID) {
    err('Não consegui deduzir o Key ID do nome do arquivo.')
    info('O nome original é AuthKey_XXXXXXXXXX.p8. Se você renomeou, passe --key-id XXXXXXXXXX.')
    process.exit(1)
  }
  if (KEY_ID_MANUAL && doNome && KEY_ID_MANUAL !== doNome) {
    err(`--key-id (${KEY_ID_MANUAL}) não bate com o nome do arquivo (${doNome}).`)
    info('Isso quase sempre é o Key ID de OUTRA chave — a causa nº 1 de InvalidProviderToken.')
    process.exit(1)
  }
  ok(`Key ID ${KEY_ID}${doNome ? ' (do nome do arquivo)' : ''}`)

  if (!/^[A-Z0-9]{10}$/.test(TEAM)) {
    err(`Team ID "${TEAM}" não tem o formato esperado (10 caracteres alfanuméricos maiúsculos).`)
    process.exit(1)
  }
  ok(`Team ID ${TEAM}`)
  ok(`Bundle ${BUNDLE}`)

  console.log('')
  falhou = !definirVariavel('APNS_KEY_P8', pem) || falhou
  falhou = !definirVariavel('APNS_KEY_ID', KEY_ID) || falhou
  falhou = !definirVariavel('APNS_TEAM_ID', TEAM) || falhou
  falhou = !definirVariavel('APNS_BUNDLE_ID', BUNDLE) || falhou

  // `APNS_ENVIRONMENT` fica DELIBERADAMENTE ausente: ausente = produção. Ver
  // docs/39 §4.1 — é a variável mais perigosa do conjunto.
}

// ─── FCM ────────────────────────────────────────────────────────────────────
if (SA) {
  console.log('\n\x1b[1mFCM — Android\x1b[0m')

  let bruto
  try {
    bruto = readFileSync(resolve(SA), 'utf8')
  } catch (e) {
    err(`Não consegui ler ${SA}: ${e.message}`)
    process.exit(1)
  }

  let j
  try {
    j = JSON.parse(bruto)
  } catch (e) {
    err(`Não é JSON válido: ${e.message}`)
    process.exit(1)
  }
  for (const campo of ['project_id', 'client_email', 'private_key']) {
    if (!j[campo]) {
      err(`Falta "${campo}" no JSON — isto não parece uma chave de conta de serviço.`)
      info('Firebase → ⚙️ Configurações → Contas de serviço → Gerar nova chave privada.')
      process.exit(1)
    }
  }
  try {
    crypto.sign('sha256', Buffer.from('eos'), j.private_key)
    ok('A private_key assina — o JSON está íntegro')
  } catch (e) {
    err(`A private_key do JSON não assina: ${e.message}`)
    process.exit(1)
  }
  ok(`Projeto ${j.project_id}`)
  ok(`Conta   ${j.client_email}`)

  console.log('')
  // Achatado: uma linha só evita qualquer surpresa de quebra de linha no
  // caminho até a Vercel. `JSON.parse` do outro lado é indiferente ao formato.
  falhou = !definirVariavel('FCM_SERVICE_ACCOUNT_JSON', JSON.stringify(j)) || falhou
}

// ─── Fim ────────────────────────────────────────────────────────────────────
console.log('')
if (falhou) {
  console.log('\x1b[31mAlgo não subiu. Nada foi impresso do conteúdo das chaves.\x1b[0m\n')
  process.exit(1)
}

if (DRY) {
  console.log('\x1b[32mTudo válido. Rode de novo sem --dry-run para escrever.\x1b[0m\n')
  process.exit(0)
}

console.log('\x1b[32mVariáveis gravadas.\x1b[0m Faltam dois passos, e o primeiro é obrigatório:\n')
console.log('  1. REDEPLOY — variável nova não alcança um deploy que já existe.')
console.log('     vercel --prod\n')
console.log('  2. Conferir contra os servidores da Apple e do Google:')
console.log('     vercel env pull .env.vercel.local')
console.log('     npm run check:push -- --env .env.vercel.local\n')
