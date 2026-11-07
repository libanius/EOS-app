import {
  answerToStatus,
  checkAnswerable,
  houseItemStates,
  houseKeys,
  statusToAnswer,
  userCanReach,
  needsWrite,
  type BaselineRow,
} from '@/lib/signal-house'
import { signalBySlug } from '@/lib/signals-content'

const names = new Map([['me', 'Paulo'], ['dani', 'Daniela']])
const row = (p: Partial<BaselineRow>): BaselineRow => ({
  profile_id: 'me', resource_key: 'lanterna', status: 'met', provenance: 'PROTOCOL', updated_at: '2026-11-07T10:00:00Z', ...p,
})

describe('a casa responde junto (SIGNAL-002 D-M1, §3.4)', () => {
  it('E1: a resposta mais recente da casa vale, com quem respondeu', () => {
    const s = houseItemStates([
      row({ profile_id: 'me', status: 'met', updated_at: '2026-11-07T10:00:00Z' }),
      row({ profile_id: 'dani', status: 'needed', updated_at: '2026-11-07T12:00:00Z' }),
    ], names, 'me')
    expect(s.lanterna.status).toBe('needed')
    expect(s.lanterna.by).toEqual({ name: 'Daniela', isMe: false })
  })

  it('proposed não é resposta da casa', () => {
    const s = houseItemStates([
      row({ status: 'met', updated_at: '2026-11-07T10:00:00Z' }),
      row({ profile_id: 'dani', status: 'proposed', updated_at: '2026-11-07T12:00:00Z' }),
    ], names, 'me')
    expect(s.lanterna.status).toBe('met')
    expect(s.lanterna.by.isMe).toBe(true)
  })

  it('houseKeys separa met e not_applicable', () => {
    const s = houseItemStates([
      row({ resource_key: 'lanterna', status: 'met' }),
      row({ resource_key: 'extintor', status: 'not_applicable' }),
      row({ resource_key: 'pilhas', status: 'needed' }),
    ], names, 'me')
    const k = houseKeys(s)
    expect(Array.from(k.metKeys)).toEqual(['lanterna'])
    expect(Array.from(k.notApplicableKeys)).toEqual(['extintor'])
  })
})

describe('respostas e transições (§5.4)', () => {
  it('cada resposta vira o estado certo, e volta', () => {
    expect(answerToStatus('have')).toBe('met')
    expect(answerToStatus('need')).toBe('needed')
    expect(answerToStatus('not_applicable')).toBe('not_applicable')
    expect(statusToAnswer('met')).toBe('have')
    expect(statusToAnswer('proposed')).toBeNull()
  })

  it('o usuário chega a qualquer resposta, passando por needed quando preciso', () => {
    expect(userCanReach(null, 'met')).toBe(true)
    expect(userCanReach('met', 'not_applicable')).toBe(true) // via needed
    expect(userCanReach('proposed', 'met')).toBe(true) // E12: via needed
    expect(userCanReach('not_applicable', 'met')).toBe(true) // via needed
    expect(userCanReach('met', 'met')).toBe(true) // E4
  })
})

describe('precisa gravar? (E4, E15)', () => {
  const st = (status: 'met' | 'needed', isMe: boolean) => ({ status, updatedAt: '2026-11-07T00:00:00Z', by: { name: isMe ? 'Eu' : 'Daniela', isMe }, provenance: 'PROTOCOL' as const })
  it('resposta diferente da minha linha: grava', () => {
    expect(needsWrite('needed', 'met', st('needed', true))).toBe(true)
    expect(needsWrite(null, 'met', undefined)).toBe(true)
  })
  it('E4: mesma resposta e a casa já lê a minha: não grava', () => {
    expect(needsWrite('met', 'met', st('met', true))).toBe(false)
  })
  it('E15: mesma resposta na minha linha, mas outra conta respondeu depois: grava', () => {
    expect(needsWrite('met', 'met', st('needed', false))).toBe(true)
    expect(needsWrite('met', 'met', st('met', false))).toBe(true)
  })
})

describe('que item aceita resposta (§4.3)', () => {
  const fortress = signalBySlug('fortress')!

  it('item de ter ou não ter do Sinal no ar: aceita', () => {
    const r = checkAnswerable(fortress, 'lanterna')
    expect(r.ok).toBe(true)
  })

  it('E7: chave fora do protocolo é 404', () => {
    expect(checkAnswerable(fortress, 'barco')).toMatchObject({ ok: false, status: 404 })
    expect(checkAnswerable(null, 'lanterna')).toMatchObject({ ok: false, status: 404 })
  })

  it('água e comida são 422', () => {
    expect(checkAnswerable(fortress, 'agua')).toMatchObject({ ok: false, status: 422 })
    expect(checkAnswerable(fortress, 'comida')).toMatchObject({ ok: false, status: 422 })
  })

  it('E6: Sinal arquivado é 409', () => {
    expect(checkAnswerable({ ...fortress, status: 'archived' }, 'lanterna')).toMatchObject({ ok: false, status: 409 })
  })
})
