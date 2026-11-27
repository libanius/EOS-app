/**
 * Configuração VAPID, lida num lugar só (PUSH-403-001).
 *
 * A Apple (web.push.apple.com) é muito mais rígida que o FCM do Chrome. Três
 * coisas que o Chrome perdoa viram **HTTP 403 BadJwtToken** na Apple — e o
 * `web-push` não reclama de nenhuma delas:
 *
 *  1. `VAPID_SUBJECT` com sujeira invisível. Uma quebra de linha ou aspas
 *     coladas no painel da Vercel passam pelo `new URL()` do `web-push` (que
 *     ignora espaço nas pontas), mas vão CRUAS para o campo `sub` do JWT;
 *  2. `mailto: alguem@x.com` com espaço depois dos dois-pontos, ou `localhost`;
 *  3. chave pública e privada que não são um par (uma foi trocada sem a outra).
 *     Cada uma sozinha passa na validação de formato; juntas, a assinatura
 *     não confere.
 *
 * Aqui o assunto é limpo e normalizado, e o par é conferido matematicamente:
 * deriva-se a pública a partir da privada e compara-se com a configurada.
 */

import { createECDH } from 'crypto'

/** Mesmo remetente padrão que as rotas antigas já usavam. */
export const DEFAULT_VAPID_SUBJECT = 'mailto:brightscalegroup@gmail.com'

export type VapidConfig = { subject: string; publicKey: string; privateKey: string }

export type VapidProblem = 'missing' | 'key_invalid' | 'key_pair_mismatch'

export type VapidRead =
  | { ok: true; config: VapidConfig; subjectFixed: boolean }
  | { ok: false; problem: VapidProblem }

/** Tira espaços, quebras de linha e aspas que vêm coladas do painel. */
export function cleanEnv(value: string | undefined | null): string {
  if (!value) return ''
  let s = value.trim()
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/**
 * Devolve um assunto que a Apple aceita, ou `null`.
 * Aceito: `mailto:usuario@dominio.tld` ou `https://` sem localhost.
 */
export function normalizeSubject(raw: string | undefined | null): string | null {
  const s = cleanEnv(raw).replace(/\s+/g, '')
  if (!s) return null
  if (/^mailto:/i.test(s)) {
    const addr = s.slice('mailto:'.length)
    return /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(addr) ? 'mailto:' + addr : null
  }
  if (/^https:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      if (u.protocol !== 'https:') return null
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') return null
      return s
    } catch {
      return null
    }
  }
  return null
}

const B64URL = /^[A-Za-z0-9_-]+$/

/** `true` quando a privada gera exatamente a pública configurada (P-256). */
export function isVapidKeyPair(publicKey: string, privateKey: string): boolean {
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, 'base64url'))
  } catch {
    return false
  }
}

export function readVapid(env: Record<string, string | undefined> = process.env): VapidRead {
  const publicKey = cleanEnv(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  const privateKey = cleanEnv(env.VAPID_PRIVATE_KEY)
  if (!publicKey || !privateKey) return { ok: false, problem: 'missing' }

  if (!B64URL.test(publicKey) || !B64URL.test(privateKey)
      || Buffer.from(publicKey, 'base64url').length !== 65
      || Buffer.from(privateKey, 'base64url').length !== 32) {
    return { ok: false, problem: 'key_invalid' }
  }
  if (!isVapidKeyPair(publicKey, privateKey)) return { ok: false, problem: 'key_pair_mismatch' }

  const normalized = normalizeSubject(env.VAPID_SUBJECT)
  const subject = normalized ?? DEFAULT_VAPID_SUBJECT
  // "Consertado" = o valor bruto não era exatamente o que vai no JWT.
  const subjectFixed = (env.VAPID_SUBJECT ?? '') !== subject
  if (!normalized) {
    console.warn('[EOS] VAPID_SUBJECT ausente ou inválido para a Apple; usando o remetente padrão.')
  }
  return { ok: true, config: { subject, publicKey, privateKey }, subjectFixed }
}

/**
 * Motivo que o serviço de push devolveu, só se for um identificador curto
 * (a Apple responde `{"reason":"BadJwtToken"}`). Nunca ecoa corpo arbitrário.
 */
export function providerReason(error: unknown): string | null {
  const body = (error as { body?: unknown })?.body
  if (typeof body !== 'string' || !body) return null
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason
    return typeof reason === 'string' && /^[A-Za-z]{1,40}$/.test(reason) ? reason : null
  } catch {
    return null
  }
}
