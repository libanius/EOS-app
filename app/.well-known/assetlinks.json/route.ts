/**
 * Digital Asset Links — o que prova que o app Android é deste site (D-133).
 *
 * Sem este arquivo o TWA abre com a barra de endereço do Chrome por cima. O
 * app fica funcionando, mas parece um site dentro de uma moldura de navegador,
 * e o Play trata isso como app de baixa qualidade.
 *
 * POR QUE UMA ROTA E NÃO UM ARQUIVO ESTÁTICO. A impressão digital do
 * certificado só existe depois que o dono cria o app no Play Console — o Play
 * assina com a chave DELE (Play App Signing), não com uma que esteja aqui. Um
 * arquivo estático obrigaria um commit e um deploy para colar esse valor.
 * Assim o dono cola em duas variáveis da Vercel e pronto.
 *
 * ENQUANTO NÃO HOUVER FINGERPRINT, esta rota devolve `[]` com 200 — que é a
 * resposta correta e verdadeira: "nenhum app está autorizado por este site".
 * Inventar um placeholder seria pior: o Chrome tentaria verificar, falharia, e
 * o dono ficaria caçando um erro que ele mesmo teria que causar.
 *
 * Como o dono preenche (docs/PENDENCIAS-DONO.md tem o passo a passo):
 *   TWA_PACKAGE_NAME=app.eos.familia
 *   TWA_SHA256_FINGERPRINTS=AA:BB:...:FF          (uma ou várias, por vírgula)
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Sem cache de build: a variável muda na Vercel sem novo deploy do código.
export const dynamic = 'force-dynamic'

/** `AA:BB:…` com 32 pares hex — o formato que o Play mostra. */
const FORMATO = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/

export async function GET() {
  const pacote = (process.env.TWA_PACKAGE_NAME ?? '').trim()
  const brutas = (process.env.TWA_SHA256_FINGERPRINTS ?? '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)

  // Uma impressão digital malformada é pior que nenhuma: o Chrome falha a
  // verificação em silêncio e a barra de endereço simplesmente continua lá,
  // sem dizer por quê. Melhor deixar de fora e o dono ver a lista vazia.
  const validas = brutas.filter(f => FORMATO.test(f))

  const corpo =
    pacote && validas.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: pacote,
              sha256_cert_fingerprints: validas,
            },
          },
        ]
      : []

  return NextResponse.json(corpo, {
    headers: {
      // O Chrome exige `application/json` aqui; com `text/plain` a verificação
      // falha sem mensagem.
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
