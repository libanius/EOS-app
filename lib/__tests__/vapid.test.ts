import { createECDH } from 'crypto'
import {
  DEFAULT_VAPID_SUBJECT,
  cleanEnv,
  isVapidKeyPair,
  normalizeSubject,
  providerReason,
  readVapid,
} from '@/lib/vapid'

function parDeChaves() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  }
}

describe('PUSH-403-001 — VAPID aceito pela Apple', () => {
  const a = parDeChaves()
  const b = parDeChaves()

  test('CA1: limpa quebra de linha, espaço e aspas do painel', () => {
    expect(cleanEnv('  "mailto:x@y.com"\n')).toBe('mailto:x@y.com')
    expect(cleanEnv("'abc'")).toBe('abc')
    expect(cleanEnv(undefined)).toBe('')
  })

  test('CA2: normaliza assuntos que a Apple recusaria', () => {
    expect(normalizeSubject('mailto:x@y.com\n')).toBe('mailto:x@y.com')
    expect(normalizeSubject('mailto: x@y.com')).toBe('mailto:x@y.com')
    expect(normalizeSubject('https://eos.app')).toBe('https://eos.app')
    expect(normalizeSubject('https://localhost:3000')).toBeNull()
    expect(normalizeSubject('mailto:sem-arroba')).toBeNull()
    expect(normalizeSubject('x@y.com')).toBeNull()
    expect(normalizeSubject('')).toBeNull()
  })

  test('CA3: reconhece par verdadeiro e par trocado', () => {
    expect(isVapidKeyPair(a.publicKey, a.privateKey)).toBe(true)
    expect(isVapidKeyPair(a.publicKey, b.privateKey)).toBe(false)
  })

  test('CA4: readVapid recusa par trocado, chave ausente e chave mal formada', () => {
    expect(readVapid({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: b.privateKey }))
      .toEqual({ ok: false, problem: 'key_pair_mismatch' })
    expect(readVapid({ VAPID_PRIVATE_KEY: a.privateKey })).toEqual({ ok: false, problem: 'missing' })
    expect(readVapid({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'abc', VAPID_PRIVATE_KEY: a.privateKey }))
      .toEqual({ ok: false, problem: 'key_invalid' })
  })

  test('CA5: readVapid aceita par com sujeira e usa remetente padrão se o assunto for inválido', () => {
    const r = readVapid({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: ` ${a.publicKey}\n`,
      VAPID_PRIVATE_KEY: `"${a.privateKey}"`,
      VAPID_SUBJECT: 'mailto: x@y.com\n',
    })
    expect(r.ok && r.config).toEqual({ subject: 'mailto:x@y.com', publicKey: a.publicKey, privateKey: a.privateKey })
    expect(r.ok && r.subjectFixed).toBe(true)

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const d = readVapid({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: a.privateKey })
    expect(d.ok && d.config.subject).toBe(DEFAULT_VAPID_SUBJECT)
    warn.mockRestore()
  })

  test('CA6: extrai só o motivo curto da Apple', () => {
    expect(providerReason({ body: '{"reason":"BadJwtToken"}' })).toBe('BadJwtToken')
    expect(providerReason({ body: '{"reason":"<script>"}' })).toBeNull()
    expect(providerReason({ body: 'not json' })).toBeNull()
    expect(providerReason(null)).toBeNull()
  })
})
