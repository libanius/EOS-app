#!/usr/bin/env node
/**
 * Guarda da casca nativa (MOB-T01 · D-228).
 *
 * ── Por que este script existe ────────────────────────────────────────────
 *
 * A casca criou contratos entre arquivos que NENHUM compilador liga. O
 * TypeScript não sabe que uma constante em `lib/native/vault.ts` precisa ser
 * igual a uma string dentro de um `<script>` em `native/www/offline.html`. O
 * Gradle não sabe que o id de canal em `MainActivity.java` precisa bater com o
 * `channel_id` que o servidor manda em `lib/push-native.ts`.
 *
 * Cada um desses desencontros falha do mesmo jeito: em silêncio, em produção, no
 * aparelho de alguém. Um cofre que não abre; uma notificação que o Android
 * descarta sem avisar. Nenhum deles aparece num build limpo.
 *
 * Rodar: `npm run check` dentro de `native/`.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NATIVE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAIZ = resolve(NATIVE, '..')

const falhas = []
const avisos = []

const ler = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const exige = (cond, msg) => { if (!cond) falhas.push(msg) }
const avisa = (cond, msg) => { if (!cond) avisos.push(msg) }

// ─── 1. A chave do cofre ────────────────────────────────────────────────────
{
  const vault = ler(join(RAIZ, 'lib/native/vault.ts'))
  const offline = ler(join(NATIVE, 'www/offline.html'))
  const doTs = vault?.match(/VAULT_KEY\s*=\s*'([^']+)'/)?.[1]
  const doHtml = offline?.match(/VAULT_KEY\s*=\s*'([^']+)'/)?.[1]

  exige(doTs, 'lib/native/vault.ts não declara VAULT_KEY')
  exige(doHtml, 'native/www/offline.html não declara VAULT_KEY')
  exige(
    doTs && doHtml && doTs === doHtml,
    `A chave do cofre divergiu: vault.ts="${doTs}" mas offline.html="${doHtml}". ` +
      'A tela offline vai abrir VAZIA — e ninguém descobre até faltar rede.',
  )
}

// ─── 2. O id do canal de notificação do Android ─────────────────────────────
{
  const servidor = ler(join(RAIZ, 'lib/push-native.ts'))
  const activity = ler(join(NATIVE, 'android/app/src/main/java/app/eos/family/MainActivity.java'))
  const strings = ler(join(NATIVE, 'android/app/src/main/res/values/strings.xml'))

  const noServidor = servidor?.match(/channel_id:\s*'([^']+)'/)?.[1]
  const naActivity = activity?.match(/CANAL_ALERTAS\s*=\s*"([^"]+)"/)?.[1]
  const nasStrings = strings?.match(/name="default_notification_channel_id">([^<]+)</)?.[1]

  exige(
    noServidor && naActivity && noServidor === naActivity,
    `Canal divergente: servidor manda "${noServidor}", o app cria "${naActivity}". ` +
      'O Android 8+ DESCARTA a notificação em silêncio — o servidor relata sucesso e o telefone nunca toca.',
  )
  exige(
    naActivity && nasStrings && naActivity === nasStrings,
    `strings.xml diz "${nasStrings}" e MainActivity cria "${naActivity}".`,
  )
}

// ─── 3. A origem que a casca carrega ────────────────────────────────────────
{
  const cfg = ler(join(NATIVE, 'capacitor.config.ts'))
  const origem = process.env.EOS_NATIVE_ORIGIN ?? cfg?.match(/'(https:\/\/[^']+)'/)?.[1]

  exige(origem, 'capacitor.config.ts não declara uma origem padrão')
  exige(
    !origem || origem.startsWith('https://'),
    `A origem "${origem}" não é HTTPS. A sessão do Supabase viaja neste WebView.`,
  )
  // Um build de loja apontando para a máquina de alguém é um app que não abre
  // para mais ninguém — e o erro só aparece depois da revisão da loja.
  exige(
    !origem || !/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./.test(origem),
    `A origem "${origem}" é local. Um build de loja com isso não abre em nenhum aparelho que não seja o seu.`,
  )
}

// ─── 4. O fallback offline não pode depender de rede ────────────────────────
{
  const offline = ler(join(NATIVE, 'www/offline.html'))
  exige(offline, 'native/www/offline.html não existe — sem rede o app mostra a tela de erro do sistema')
  if (offline) {
    // A página do momento em que não há para onde buscar. Um `fetch`, uma fonte
    // do Google, uma imagem remota: qualquer um deles é uma falha de carga
    // exatamente quando a tela precisa aparecer.
    exige(!/\bfetch\s*\(/.test(offline), 'offline.html chama fetch() — é a tela de quando NÃO HÁ rede')
    exige(
      !/(src|href)\s*=\s*["']https?:\/\//.test(offline),
      'offline.html carrega recurso remoto — ele não vai carregar quando esta tela aparecer',
    )
  }
  const cfg = ler(join(NATIVE, 'capacitor.config.ts'))
  exige(
    cfg && /errorPath:\s*'offline\.html'/.test(cfg),
    'capacitor.config.ts sem errorPath: sem rede o WebView mostra a página de erro do sistema',
  )
}

// ─── 5. Permissões: nada de localização em segundo plano (D-228 §6) ─────────
{
  const manifest = ler(join(NATIVE, 'android/app/src/main/AndroidManifest.xml'))
  const plist = ler(join(NATIVE, 'ios/App/App/Info.plist'))

  /*
   * Casa a DECLARAÇÃO, não a menção.
   *
   * A primeira versão usava `includes()` e acusou o comentário do próprio
   * manifesto, que explica por que a permissão não está lá. Um guarda que
   * reprova a documentação da decisão que ele guarda ensina a ignorá-lo.
   */
  const pedeSegundoPlano = /<uses-permission[^>]*ACCESS_BACKGROUND_LOCATION/.test(manifest ?? '')
  exige(
    manifest && !pedeSegundoPlano,
    'AndroidManifest pede localização em segundo plano. A D-228 §6 decidiu não pedir: ' +
      'a varredura roda no servidor sobre a última posição, e essa permissão exige justificativa em vídeo.',
  )
  const pedeSempre = /<key>NSLocation(Always|AlwaysAndWhenInUse)UsageDescription<\/key>/.test(plist ?? '')
  exige(plist && !pedeSempre, 'Info.plist pede localização "sempre". Mesma decisão: D-228 §6.')
  exige(
    /<uses-permission[^>]*POST_NOTIFICATIONS/.test(manifest ?? ''),
    'AndroidManifest sem POST_NOTIFICATIONS: no Android 13+ o alerta de perigo nunca aparece.',
  )
  exige(
    /<key>NSLocationWhenInUseUsageDescription<\/key>/.test(plist ?? ''),
    'Info.plist sem texto de uso de localização: a App Store rejeita, e o diálogo fica sem frase.',
  )
  exige(
    manifest && manifest.includes('android:allowBackup="false"'),
    'AndroidManifest com backup automático ligado: o cofre offline carrega dado de saúde.',
  )
}

// ─── 6. A ponte APNs no AppDelegate ─────────────────────────────────────────
{
  const appDelegate = ler(join(NATIVE, 'ios/App/App/AppDelegate.swift'))
  exige(
    appDelegate && appDelegate.includes('capacitorDidRegisterForRemoteNotifications'),
    'AppDelegate.swift sem a ponte APNs: `register()` resolve sem erro, o evento nunca dispara, ' +
      'e nenhum iPhone jamais é gravado em push_devices.',
  )
  const ents = ler(join(NATIVE, 'ios/App/App/App.entitlements'))
  exige(ents && ents.includes('aps-environment'), 'App.entitlements sem aps-environment: push não funciona no iOS')
}

// ─── 7. Credenciais de envio (aviso, não falha) ─────────────────────────────
{
  const env = process.env
  avisa(
    env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID,
    'APNs sem credencial no ambiente: iPhones registrados não receberão nada (ver docs/39 §4)',
  )
  avisa(
    env.FCM_SERVICE_ACCOUNT_JSON,
    'FCM sem credencial no ambiente: aparelhos Android registrados não receberão nada (ver docs/39 §4)',
  )
}

// ─── Relatório ──────────────────────────────────────────────────────────────
for (const a of avisos) console.warn(`  aviso  ${a}`)
for (const f of falhas) console.error(`  FALHA  ${f}`)

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`)
  process.exit(1)
}
console.log(`Casca nativa: ${avisos.length ? `ok, com ${avisos.length} aviso(s)` : 'ok'}.`)
