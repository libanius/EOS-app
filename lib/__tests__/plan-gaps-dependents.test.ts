/**
 * Ninguém fica para trás (D-135 fase 3).
 *
 * A seção do plano se chama "Quem busca quem" e só sabia dizer QUEM BUSCA: a
 * lista de papéis apontava para `member_user_id`, uma conta. Quem é buscado
 * normalmente não tem conta — é a criança, é a avó, é justamente quem não sai
 * sozinho.
 *
 * A família contornava escrevendo "buscar a Avó Ana" no texto livre da
 * responsabilidade. Isso funciona para um humano lendo e falha para todo o
 * resto: o Pilot não raciocina sobre um nome dentro de uma frase, e a
 * verificação de lacunas não tinha como saber que alguém tinha ficado sem
 * responsável.
 *
 * O que estes testes protegem é a única lacuna do plano que fala de uma PESSOA:
 * um plano completo em que a avó não aparece é um plano que parece pronto e
 * deixa alguém para trás.
 */

import { planGaps, planWarnings, type PlanRole, type DependenteDoPlano } from '@/lib/family-plan'

const comPontoDeEncontro = [
  { kind: 'rendezvous_1' as const, name: 'Portão', lat: 26.3, lng: -80.2 },
]

const papel = (over: Partial<PlanRole> = {}): PlanRole => ({
  member_user_id: 'conta-do-paulo',
  for_member_id: null,
  responsibility: 'levar o rádio',
  ...over,
})

const avo: DependenteDoPlano = { id: 'dep-avo', name: 'Avó Ana', precisaDeAlguem: true }
const bebe: DependenteDoPlano = { id: 'dep-bebe', name: 'Tomás', precisaDeAlguem: true }
const adolescente: DependenteDoPlano = { id: 'dep-teen', name: 'Fabinho', precisaDeAlguem: false }

describe('quem não sai sozinho precisa de alguém', () => {
  it('a avó sem responsável vira lacuna, com o nome dela', () => {
    const gaps = planWarnings({ roles: [papel()], dependents: [avo] }, true)
    // O nome importa: "falta um papel" manda procurar; "ninguém ficou
    // encarregado de Avó Ana" já diz o que fazer.
    expect(gaps).toContain('Ninguém ficou encarregado de Avó Ana')
  })

  it('com alguém encarregado, a lacuna some', () => {
    const gaps = planWarnings({ roles: [papel({ for_member_id: 'dep-avo', responsibility: 'buscar na escola' })], dependents: [avo] }, true)
    expect(gaps).toEqual([])
  })

  it('cada pessoa é cobrada por si', () => {
    const gaps = planWarnings({ roles: [papel({ for_member_id: 'dep-avo' })], dependents: [avo, bebe] }, true)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toContain('Tomás')
  })

  it('em inglês também', () => {
    const gaps = planWarnings({ roles: [papel()], dependents: [avo] }, false)
    expect(gaps).toContain('Nobody is assigned to Avó Ana')
  })
})

describe('o que NÃO pode virar pendência', () => {
  it('um adolescente cadastrado como dependente não vira lacuna', () => {
    /*
     * Uma lacuna que sempre aparece é uma lacuna que ninguém lê. Se toda pessoa
     * cadastrada exigisse um responsável, uma casa de seis abriria o plano com
     * seis pendências e a família aprenderia a ignorar a seção inteira — junto
     * com a linha da avó, que é a que importa.
     */
    const gaps = planWarnings({ roles: [papel()], dependents: [adolescente] }, true)
    expect(gaps).toEqual([])
  })

  it('um papel que não é sobre pessoa continua válido', () => {
    // "levar o rádio" não tem alvo, e a maioria dos papéis é assim.
    const gaps = planWarnings({ roles: [papel({ for_member_id: null })], dependents: [] }, true)
    expect(gaps).toEqual([])
  })

  it('sem a lista de dependentes, nada muda para quem já usava', () => {
    // A chamada antiga (sem `dependents`) não pode passar a reprovar planos que
    // eram válidos ontem.
    const gaps = planWarnings({ roles: [papel()] }, true)
    expect(gaps).toEqual([])
  })
})

describe('avisar não é bloquear', () => {
  /*
   * `planGaps` TRAVA o save; `planWarnings` não. A separação é o conserto.
   *
   * A primeira versão pôs "ninguém ficou encarregado da Avó Ana" dentro de
   * `planGaps`, e o teste do editor pegou na hora: o botão Salvar ficou
   * desabilitado. Uma família que abriu o plano para corrigir uma rota não
   * conseguiria salvar até resolver outra coisa — e o provável não é que ela
   * resolva, é que feche a tela e perca a correção que veio fazer.
   *
   * O próprio `planGaps` já dizia isso no comentário, sobre outro caso:
   * "bloquear o save por causa da casa seria eu inventando regra".
   */
  it('a avó desamparada NÃO entra nas lacunas que travam o save', () => {
    const bloqueiam = planGaps({ waypoints: comPontoDeEncontro, roles: [papel()] }, true)
    expect(bloqueiam).toEqual([])
    // …mas o aviso existe, e é o mesmo cenário.
    expect(planWarnings({ roles: [papel()], dependents: [avo] }, true)).toHaveLength(1)
  })

  it('as lacunas estruturais continuam travando', () => {
    const gaps = planGaps({ waypoints: [], roles: [] }, true)
    expect(gaps).toHaveLength(2)
    expect(gaps.join(' ')).toMatch(/ponto de encontro/)
    expect(gaps.join(' ')).toMatch(/quem busca quem/)
  })
})
