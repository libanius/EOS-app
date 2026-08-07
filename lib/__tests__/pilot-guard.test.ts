/**
 * A regra crítica sobrepõe a IA (D-125 / PILOT-T03).
 *
 * O que estes casos protegem: **o modelo não pode amaciar uma condição
 * crítica**. Metade deles existe para provar que o veredito NÃO vira GO quando
 * não deveria — porque num app de emergência o erro caro é o otimista.
 */

import { evaluateGuard, guardToTag, CHAVES_DE_REGRA } from '@/lib/pilot-guard'
import fs from 'node:fs'
import path from 'node:path'
import type { Household, HouseholdPerson } from '@/lib/household'

const pessoa = (over: Partial<HouseholdPerson> = {}): HouseholdPerson => ({
  userId: 'u1', name: 'Alguém', isMe: false, age: 30,
  medicalConditions: [], medications: [], mobilityImpaired: false, isInfant: false,
  dependsOn: null, relationship: null, careNotes: null,
  medicalVisible: true, awaitingConfirmation: false,
  ...over,
})

const casa = (over: Partial<Household> = {}): Household => ({
  people: [pessoa(), pessoa({ userId: 'u2' })],
  size: 2,
  inventory: {
    waterLiters: 120, foodPersonDays: 20, fuelLiters: 0, batteryPercent: 80,
    hasMedicalKit: true, hasCommunicationDevice: true, contributors: 2,
  },
  reachable: [], needsHidden: 0, pendingNames: [], known: true,
  ...over,
})

describe('o veredito nunca é otimista sem base', () => {
  it('casa que não pôde ser lida vira WAIT, nunca GO', () => {
    // Uma falha de leitura que virasse "pode ir" seria uma tranquilização
    // inventada — e quem lê não teria como saber que é um erro.
    const g = evaluateGuard(casa({ known: false }), { pt: true })
    expect(g.verdict).toBe('WAIT')
    expect(g.binding).toBe(true)
    expect(g.autonomyDays).toBeNull()
  })

  it('casa de tamanho zero também vira WAIT', () => {
    expect(evaluateGuard(casa({ size: 0, people: [] }), { pt: true }).verdict).toBe('WAIT')
  })

  it('água crítica dispara PRIORITY_OVERRIDE e é vinculante', () => {
    const g = evaluateGuard(
      casa({ inventory: { ...casa().inventory, waterLiters: 1, foodPersonDays: 20 } }),
      { pt: true },
    )
    expect(g.verdict).toBe('PRIORITY_OVERRIDE')
    expect(g.binding).toBe(true)
    expect(g.rules.join(' ')).toMatch(/[Áa]gua/)
  })

  it('alerta ativo segura a saída mesmo com a despensa cheia', () => {
    const g = evaluateGuard(casa(), { pt: true, alerts: 2 })
    expect(g.verdict).toBe('WAIT')
  })

  it('casa em ordem e sem alerta libera GO', () => {
    const g = evaluateGuard(casa(), { pt: true, alerts: 0 })
    expect(g.verdict).toBe('GO')
    expect(g.binding).toBe(false)
  })
})

describe('guardToTag — uma mecânica de veredito só', () => {
  /*
   * O chat já tinha etiqueta de veredito, alimentada pelo motor local. Duas
   * mecânicas na mesma tela é como um produto passa a discordar de si mesmo:
   * o servidor diria "AVOID" e a bolha ao lado, "Tudo certo".
   */
  it('cada estado do servidor cai numa etiqueta que o chat já sabe mostrar', () => {
    const casos: Array<[Parameters<typeof guardToTag>[0]['verdict'], string]> = [
      ['GO', 'ready'], ['LIMITED', 'watch'], ['WAIT', 'hold'],
      ['AVOID', 'act'], ['PRIORITY_OVERRIDE', 'act'],
    ]
    for (const [verdict, esperado] of casos) {
      expect(guardToTag({ verdict, headline: '', rules: [], binding: false, autonomyDays: null })).toBe(esperado)
    }
  })

  it('o texto do modelo NUNCA é alterado pelo veredito', () => {
    // Foi o desenho que o dono cortou: enfiar markdown na resposta suja o chat
    // livre. A etiqueta fica ao lado; a resposta continua sendo a resposta.
    const g = evaluateGuard(casa({ inventory: { ...casa().inventory, waterLiters: 1 } }), { pt: true })
    expect(g.verdict).toBe('PRIORITY_OVERRIDE')
    expect(Object.keys(g)).not.toContain('reply')
  })
})

describe('o veredito independe do que o modelo escreveu', () => {
  it('a mesma casa dá o mesmo veredito com qualquer resposta', () => {
    const doente = casa({ inventory: { ...casa().inventory, waterLiters: 1 } })
    const a = evaluateGuard(doente, { pt: true })
    const b = evaluateGuard(doente, { pt: true })
    expect(a.verdict).toBe(b.verdict)
    // E o texto do modelo não entra na conta em nenhum momento: `evaluateGuard`
    // nem recebe a resposta. É isso que torna a trava uma trava.
    expect(evaluateGuard.length).toBe(2)
  })
})

describe('nenhuma sigla do motor chega ao usuário', () => {
  /*
   * A primeira versão traduzia três chaves e deixava outras oito vazarem
   * cruas: o teste de integração mostrou "FOOD_LOW: 1.0 dias" e "SEM_COMMS"
   * na tela. Este caso lê o motor de regras e cobra a tradução de cada uma —
   * quem acrescentar uma regra nova é avisado antes do usuário ver a sigla.
   */
  it('toda mensagem que o RulesEngine emite tem frase humana', () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), 'lib/rules-engine.ts'), 'utf8')
    const emitidas = Array.from(fonte.matchAll(/message: [`']([^`'$]+)/g))
      .map(m => m[1].replace(/:.*$/, '').trim())
      .filter(Boolean)
    const semTraducao = Array.from(new Set(emitidas)).filter(
      chave => !CHAVES_DE_REGRA.some(k => k.startsWith(chave) || chave.startsWith(k)),
    )
    expect(semTraducao).toEqual([])
  })
})
