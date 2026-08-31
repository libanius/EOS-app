# `native/` — a casca iOS e Android do EOS

> D-228 · G-03 CLEARED · spec completa em [`docs/39-native-shell.md`](../docs/39-native-shell.md)

Esta pasta **não é um segundo app**. É a camada de adaptadores da
`docs/05-platform-strategy.md`: ela carrega o Next.js que já está em produção e
acrescenta o que o navegador não alcança — push APNs/FCM, cofre offline,
geolocalização do sistema, deep links.

Toda tela nova continua nascendo no app web. Se algo aqui precisar mudar para
uma tela existir, a arquitetura está errada, não o arquivo.

## Começar

```bash
cd native && npm install
npm run check          # os contratos entre arquivos, antes de qualquer build
npm run open:ios       # Xcode
npm run open:android   # Android Studio
```

## Antes de todo build de loja

`npm run check` verifica o que nenhum compilador verifica: a chave do cofre
igual entre `lib/native/vault.ts` e `www/offline.html`, o id do canal de
notificação igual entre servidor, `MainActivity` e `strings.xml`, a origem sendo
HTTPS e não `localhost`, o `offline.html` sem nenhuma dependência de rede, e a
ausência de localização em segundo plano.

Cada um desses desencontros falha em silêncio, em produção, no aparelho de
alguém — e nenhum aparece num build limpo.

## Apontar para outro ambiente

```bash
EOS_NATIVE_ORIGIN=https://<preview>.vercel.app npm run sync
```

**Mudança no app web não exige sync.** A casca carrega a origem remota, então um
deploy na Vercel já chega ao aparelho. Sync só é necessário quando muda
`capacitor.config.ts`, `www/` ou a lista de plugins.

## O que é fonte e o que é gerado

`ios/` e `android/` são versionados de propósito: carregam configuração escrita à
mão que nenhum comando recria — permissões, a ponte APNs no `AppDelegate`, os
entitlements, o canal de notificação. **Rodar `cap add` de novo apagaria tudo em
silêncio.** O que sai do git é só o que `cap sync` regenera.
