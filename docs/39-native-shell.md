# 39 — A casca nativa (iOS e Android)

> Decisão: **D-228**. Gate **G-03 — Mobile Readiness: CLEARED** em 2026-08-31.
> Roadmap: MOB-T01 … MOB-T07.
> Última atualização: 2026-08-31

Este documento é o que separa "os arquivos existem" de "o app está nas lojas".
A parte que faltava, quando ele foi escrito, era inteiramente de **credencial e
conta** — nada de código.

---

## 1. O que a casca é, e o que ela não é

A casca **carrega o EOS que já está em produção**. Ela não tem tela própria, não
tem rota própria, não tem estado próprio. Toda tela nova continua nascendo no
app web; se algo em `native/` precisar mudar para uma tela existir, a
arquitetura está errada, não o arquivo.

O que ela acrescenta é a borda que o navegador não alcança:

| Capacidade | Por que só existe aqui |
|---|---|
| **Push APNs / FCM** | Nem o WKWebView do iOS nem o WebView do Android implementam `PushManager`. Dentro do app de loja o Web Push não degrada — ele não existe. |
| **Cofre offline** | O app abre e mostra ficha e plano com zero rede, lendo armazenamento nativo. |
| **Geolocalização nativa** | Permissão do sistema, com texto revisado, em vez do diálogo genérico do navegador. |
| **Deep links** | App Links e Universal Links: o convite de círculo abre o app, não o Safari. |
| **Canal de notificação** | `IMPORTANCE_HIGH` no Android põe o alerta na tela de bloqueio com som. |

E o que ela **não** é: React Native. A alternativa foi avaliada e recusada na
D-228 — exigiria reescrever ~50 telas e a autenticação por cookie SSR, criando os
produtos paralelos que a D-084 proíbe.

---

## 2. Onde as coisas moram

```
native/                          workspace próprio, fora do build da Vercel
├── capacitor.config.ts          a origem carregada e o errorPath
├── www/offline.html             a tela de quando a rede caiu (vai no binário)
├── scripts/native-shell-check.mjs   guarda dos contratos entre arquivos
├── android/                     projeto Gradle — VERSIONADO
└── ios/                         projeto Xcode — VERSIONADO

lib/native/bridge.ts             fala com `window.Capacitor`, nunca por import
lib/native/vault.ts              monta e espelha o cofre offline
lib/native/push.ts               registro do token no aparelho
lib/push-native.ts               envio: APNs HTTP/2 + FCM v1
lib/push-native-fanout.ts        o leque aditivo para as 7 chamadas antigas
app/api/push/device/route.ts     grava o token
supabase/migrations/20260831000000_push_devices.sql
```

`ios/` e `android/` são versionados **de propósito**: carregam configuração
escrita à mão que nenhum comando recria. Rodar `cap add` de novo apagaria tudo em
silêncio.

---

## 3. Os contratos que nenhum compilador liga

Três pares de valores precisam ser idênticos em arquivos que não se importam.
Cada desencontro falha do mesmo jeito — em silêncio, em produção, no aparelho de
alguém:

| Valor | Onde | Se divergir |
|---|---|---|
| `eos.offline.vault.v1` | `lib/native/vault.ts` ↔ `native/www/offline.html` | A tela offline abre **vazia**, e ninguém descobre até faltar rede. |
| `eos_alerts` | `lib/push-native.ts` ↔ `MainActivity.java` ↔ `strings.xml` | O Android 8+ **descarta** a notificação sem avisar; o servidor relata sucesso. |
| Origem HTTPS | `capacitor.config.ts` ↔ `AndroidManifest` ↔ `App.entitlements` | Deep links deixam de abrir o app. |

**`cd native && npm run check` verifica os três.** Rode antes de todo build de
loja. Ele também reprova origem `localhost`, recurso remoto dentro do
`offline.html` e permissão de localização em segundo plano.

---

## 4. As credenciais de envio

Sem elas o app instala, abre e funciona — e **não notifica**. É o único
item verdadeiramente bloqueante do lançamento.

### 4.1 APNs (iOS) — sem Firebase, por decisão

Portal da Apple → Certificates, Identifiers & Profiles → **Keys** → nova chave
com *Apple Push Notifications service (APNs)* marcado. O `.p8` é baixado **uma
única vez**.

| Variável | O que é |
|---|---|
| `APNS_KEY_P8` | conteúdo do `.p8`. Aceita `\n` literal ou quebra real. |
| `APNS_KEY_ID` | os 10 caracteres do nome do arquivo (`AuthKey_XXXXXXXXXX.p8`) |
| `APNS_TEAM_ID` | Team ID, canto superior direito do portal |
| `APNS_BUNDLE_ID` | `app.eos.family` |
| `APNS_ENVIRONMENT` | ausente = produção; `sandbox` para builds de desenvolvimento |

> ⚠️ **`APNS_ENVIRONMENT` é a variável mais perigosa do conjunto.** Um token de
> desenvolvimento recusado pelo host de produção volta como `BadDeviceToken` —
> exatamente a mesma resposta de um token inválido de verdade. É por isso que
> `lib/push-native.ts` **não** remove tokens nesse caso: as duas causas são
> indistinguíveis, e apagar transformaria um deploy errado na perda de todos os
> iPhones da base.

### 4.2 FCM (Android)

Console do Firebase → projeto → Configurações → **Contas de serviço** → gerar
nova chave privada. Baixa um JSON.

| Variável | O que é |
|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | o JSON inteiro, em uma linha |

E o `google-services.json` (Configurações → app Android → `app.eos.family`) vai
em `native/android/app/google-services.json`. Ele **não** é versionado.

---

## 5. O que só o dono pode fazer

Nada abaixo é código. É conta, chave e assinatura.

| # | Passo | Onde | Bloqueia |
|---|---|---|---|
| 1 | Conta Apple Developer (US$ 99/ano) | developer.apple.com | tudo no iOS |
| 2 | Conta Google Play (US$ 25, uma vez) | play.google.com/console | tudo no Android |
| 3 | App ID `app.eos.family` com **Push Notifications** e **Associated Domains** | portal Apple | push e deep link |
| 4 | Chave `.p8` da APNs → `APNS_*` na Vercel | portal Apple → Vercel | push no iOS |
| 5 | `FCM_SERVICE_ACCOUNT_JSON` + `google-services.json` | Firebase | push no Android |
| 6 | Aplicar `20260831000000_push_devices.sql` | SQL Editor do Supabase | **todo** o push nativo |
| 7 | Keystore de release do Android (guardar fora do repositório) | máquina local | publicar |
| 8 | `/.well-known/apple-app-site-association` e `/.well-known/assetlinks.json` | `public/` do app web | deep links |
| 9 | No Xcode: ligar as capacidades e adicionar `pt-BR.lproj`/`en.lproj` ao alvo | Xcode | push, links, i18n do diálogo |
| 10 | Ícones e splash das duas plataformas | `native/*/res`, `Assets.xcassets` | revisão da loja |

O passo **6** é o mais fácil de esquecer e o mais silencioso: sem a migração, a
rota de registro responde `503 push_devices_missing` e nenhum aparelho é gravado.

### 5.1 Os arquivos `.well-known`

Não foram criados com valor de exemplo de propósito: um arquivo servido com
conteúdo errado é pior que ausente, porque valida como se estivesse certo.

`public/.well-known/apple-app-site-association` (sem extensão, `Content-Type:
application/json`):

```json
{ "applinks": { "details": [ { "appIDs": ["TEAMID.app.eos.family"], "components": [{ "/": "/*" }] } ] } }
```

`public/.well-known/assetlinks.json` — a impressão sai de
`keytool -list -v -keystore <release.keystore>`:

```json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "app.eos.family",
               "sha256_cert_fingerprints": ["<SHA-256 da chave de release>"] } }]
```

---

## 6. Pontos de decisão que ficaram abertos

Estão escritos como dúvida porque são dúvida, e nenhum deles é de engenharia.

**6.1 O cofre offline no backup do iCloud.** O cofre carrega tipo sanguíneo,
alergias e medicamentos. No Android, `allowBackup="false"` impede que isso saia
pelo backup automático. No iOS, `UserDefaults` **entra** no backup do iCloud.

O contrapeso é que este é o mesmo conteúdo que `/ficha/[id]` já publica sem
login, por decisão de produto, para ser lido por um socorrista. Se ainda assim
incomodar, a correção é trocar `Preferences` por arquivo com
`isExcludedFromBackup` — trabalho pequeno, mas é decisão sua.

**6.2 A ficha médica no prompt da OpenAI.** Continua pendente da `docs/38` §1.2 e
agora vale para duas lojas em vez de uma. A recomendação de lá não mudou: uma
chave "o Pilot pode ler minha ficha médica", desligada por padrão.

**6.3 Guideline 4.2 da Apple.** Uma casca que carrega um site é rejeitável por
"funcionalidade mínima". A defesa desta casca não é retórica — push nativo na
tela de bloqueio, cofre que abre sem rede e geolocalização do sistema são
capacidades que um navegador em iOS não tem. Vale escrever isso nas notas para o
revisor, com essas palavras.

---

## 7. O ciclo de trabalho

```bash
# apontar a casca para um preview ou para a máquina local
EOS_NATIVE_ORIGIN=https://<preview>.vercel.app npm run sync   # dentro de native/

cd native && npm run check     # os contratos, antes de qualquer build
npm run open:ios               # abre o Xcode
npm run open:android           # abre o Android Studio
```

`cap sync` só copia `www/` e a configuração. **Mudança no app web não exige
sync**: a casca carrega a origem remota, então um deploy na Vercel já chega ao
aparelho. Sync é necessário quando muda `capacitor.config.ts`, `www/` ou a lista
de plugins.
