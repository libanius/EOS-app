/**
 * O cofre offline (D-228 §5).
 *
 * A propriedade que estes testes guardam: **um cofre vazio nunca apaga um cofre
 * cheio.** A tela offline é lida no pior momento possível, e a causa mais
 * provável de o cofre chegar vazio é justamente a rede ter falhado — o mesmo
 * evento que faz a pessoa abrir a tela.
 */

import type { PlanDocument } from '@/lib/family-plan'
import {
  VAULT_KEY,
  fichaParaCofre,
  limparCofre,
  montarCofre,
  planoParaCofre,
  salvarCofre,
} from '@/lib/native/vault'

const AGORA = new Date('2026-08-31T12:00:00.000Z')

function cascaFalsa() {
  const store = new Map<string, string>()
  return {
    store,
    scope: {
      Capacitor: {
        getPlatform: () => 'ios',
        Plugins: {
          Preferences: {
            set: async ({ key, value }: { key: string; value: string }) => {
              store.set(key, value)
            },
            get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
            remove: async ({ key }: { key: string }) => {
              store.delete(key)
            },
          },
        },
      },
    },
  }
}

describe('fichaParaCofre', () => {
  it('junta arrays em texto legível — a tela offline não formata nada', () => {
    expect(
      fichaParaCofre({
        name: 'Ana',
        blood_type: 'O-',
        allergies: ['amendoim', 'penicilina'],
        medications: ['insulina'],
      }),
    ).toEqual({
      name: 'Ana',
      bloodType: 'O-',
      allergies: 'amendoim, penicilina',
      medications: 'insulina',
      medicalNotes: undefined,
      emergencyContact: undefined,
    })
  })

  it('une nome e telefone do contato num campo só', () => {
    expect(
      fichaParaCofre({ emergency_contact_name: 'João', emergency_contact_phone: '+55 11 90000' })
        ?.emergencyContact,
    ).toBe('João · +55 11 90000')
  })

  it('aceita contato pela metade sem deixar separador solto', () => {
    expect(fichaParaCofre({ emergency_contact_phone: '190' })?.emergencyContact).toBe('190')
    expect(fichaParaCofre({ emergency_contact_name: 'João' })?.emergencyContact).toBe('João')
  })

  it('ficha sem nada útil é undefined, não um objeto de campos vazios', () => {
    expect(fichaParaCofre(null)).toBeUndefined()
    expect(fichaParaCofre({})).toBeUndefined()
    expect(fichaParaCofre({ name: '   ', blood_type: '', allergies: [] })).toBeUndefined()
  })
})

describe('planoParaCofre', () => {
  const doc = {
    plan: { id: 'p1', name: 'Plano de casa', version: 4, status: 'active', updated_at: '' },
    waypoints: [
      { kind: 'rendezvous_2', name: 'Praça da Sé', lat: 0, lng: 0, sort_order: 2 },
      { kind: 'rendezvous_1', name: 'Portão de casa', lat: 0, lng: 0, sort_order: 1, notes: 'atrás do carro' },
    ],
    routes: [],
    roles: [{ member_user_id: 'a3f2-9c11-4b', responsibility: 'levar o rádio' }],
    triggers: [
      { condition: 'sirene', action: 'sair pelo portão dos fundos', sort_order: 1 },
    ],
    acknowledgedBy: [],
    myAck: null,
  } as unknown as PlanDocument

  it('respeita sort_order — a ordem do plano É o plano', () => {
    const p = planoParaCofre(doc, 'pt')
    expect(p?.steps[0]).toBe('Ponto de encontro 1: Portão de casa — atrás do carro')
    expect(p?.steps[1]).toBe('Ponto de encontro 2: Praça da Sé')
  })

  it('gatilhos viram "se … então"', () => {
    expect(planoParaCofre(doc, 'pt')?.steps).toContain('Se sirene → sair pelo portão dos fundos')
    expect(planoParaCofre(doc, 'en')?.steps).toContain('If sirene → sair pelo portão dos fundos')
  })

  it('NÃO inclui papéis, porque offline um id não vira nome', () => {
    /*
     * `roles` referencia `member_user_id`. Sem rede não há como transformar
     * isso num nome, e um passo dizendo "a3f2-9c11-4b leva o rádio" é pior que
     * passo nenhum: parece defeito e não informa.
     */
    const texto = (planoParaCofre(doc, 'pt')?.steps ?? []).join(' ')
    expect(texto).not.toContain('a3f2')
    expect(texto).not.toContain('levar o rádio')
  })

  it('carrega título e versão para a tela poder datar o que mostra', () => {
    const p = planoParaCofre(doc, 'pt')
    expect(p?.title).toBe('Plano de casa')
    expect(p?.version).toBe(4)
  })

  it('descarta gatilho e ponto pela metade em vez de mostrar meia frase', () => {
    const meio = {
      ...doc,
      waypoints: [{ kind: 'rendezvous_1', name: '  ', lat: 0, lng: 0 }],
      triggers: [{ condition: 'sirene', action: '' }],
    } as unknown as PlanDocument
    expect(planoParaCofre(meio, 'pt')).toBeUndefined()
  })

  it('plano sem conteúdo é undefined', () => {
    expect(planoParaCofre(null, 'pt')).toBeUndefined()
    expect(
      planoParaCofre({ waypoints: [], routes: [], roles: [], triggers: [], plan: null, acknowledgedBy: [], myAck: null } as unknown as PlanDocument, 'pt'),
    ).toBeUndefined()
  })
})

describe('montarCofre', () => {
  it('devolve null quando não há NADA que valha guardar', () => {
    expect(montarCofre({ ficha: null, plan: null })).toBeNull()
    expect(montarCofre({ ficha: {}, plan: null })).toBeNull()
  })

  it('monta com só a ficha, e omite a chave do plano', () => {
    const c = montarCofre({ ficha: { blood_type: 'A+' }, now: AGORA })
    expect(c).toEqual({ savedAt: AGORA.toISOString(), lang: 'pt', ficha: { name: undefined, bloodType: 'A+', allergies: undefined, medications: undefined, medicalNotes: undefined, emergencyContact: undefined } })
    expect(c && 'plan' in c).toBe(false)
  })

  it('só "en" vira inglês; qualquer outra coisa cai em português', () => {
    expect(montarCofre({ ficha: { name: 'x' }, lang: 'en' })?.lang).toBe('en')
    expect(montarCofre({ ficha: { name: 'x' }, lang: 'pt-BR' })?.lang).toBe('pt')
    expect(montarCofre({ ficha: { name: 'x' }, lang: null })?.lang).toBe('pt')
  })
})

describe('salvarCofre', () => {
  it('grava JSON na MESMA chave que offline.html lê', async () => {
    /*
     * `VAULT_KEY` é um contrato entre dois arquivos que nenhum compilador liga:
     * este módulo e `native/www/offline.html`. Se um mudar sozinho, a tela
     * offline fica em branco — e ninguém descobre até faltar rede.
     */
    const { store, scope } = cascaFalsa()
    await expect(salvarCofre({ ficha: { blood_type: 'B+' }, now: AGORA }, scope)).resolves.toBe(true)
    expect(VAULT_KEY).toBe('eos.offline.vault.v1')
    expect(JSON.parse(store.get(VAULT_KEY)!).ficha.bloodType).toBe('B+')
  })

  it('cofre vazio NÃO apaga o cofre bom que já existe', async () => {
    /*
     * O teste central deste arquivo.
     *
     * A causa mais provável de a ficha chegar vazia é a chamada de rede ter
     * falhado — exatamente o evento que faz a pessoa precisar da tela offline.
     * Sobrescrever ali seria apagar o dado no instante em que ele importa.
     */
    const { store, scope } = cascaFalsa()
    await salvarCofre({ ficha: { blood_type: 'B+' }, now: AGORA }, scope)
    await expect(salvarCofre({ ficha: null, plan: null }, scope)).resolves.toBe(false)
    expect(JSON.parse(store.get(VAULT_KEY)!).ficha.bloodType).toBe('B+')
  })

  it('MESCLA: gravar só a ficha não apaga o plano, e vice-versa', async () => {
    /*
     * A ficha e o plano são carregados por telas diferentes. Se cada uma
     * escrevesse o cofre inteiro, abrir `/ficha` apagaria o plano do cofre e
     * abrir o plano apagaria a ficha — e a tela offline mostraria sempre a
     * última visitada, nunca as duas.
     */
    const { store, scope } = cascaFalsa()
    const doc = {
      plan: { id: 'p', name: 'Plano', version: 1, status: 'active', updated_at: '' },
      waypoints: [{ kind: 'rendezvous_1', name: 'Portão', lat: 0, lng: 0 }],
      routes: [], roles: [], triggers: [], acknowledgedBy: [], myAck: null,
    } as unknown as PlanDocument

    await salvarCofre({ plan: doc, now: AGORA }, scope)
    await salvarCofre({ ficha: { blood_type: 'AB+' }, now: AGORA }, scope)

    const cofre = JSON.parse(store.get(VAULT_KEY)!)
    expect(cofre.ficha.bloodType).toBe('AB+')
    expect(cofre.plan.steps[0]).toBe('Ponto de encontro 1: Portão')
  })

  it('substitui a seção que veio, em vez de acumular versões velhas', async () => {
    const { store, scope } = cascaFalsa()
    await salvarCofre({ ficha: { blood_type: 'AB+' }, now: AGORA }, scope)
    await salvarCofre({ ficha: { blood_type: 'O-' }, now: AGORA }, scope)
    expect(JSON.parse(store.get(VAULT_KEY)!).ficha.bloodType).toBe('O-')
  })

  it('no navegador não faz nada e devolve false, sem lançar', async () => {
    await expect(salvarCofre({ ficha: { blood_type: 'B+' } }, {})).resolves.toBe(false)
  })
})

describe('limparCofre', () => {
  it('apaga de verdade — sair da conta não pode deixar a ficha médica legível', async () => {
    const { store, scope } = cascaFalsa()
    await salvarCofre({ ficha: { blood_type: 'B+' }, now: AGORA }, scope)
    await expect(limparCofre(scope)).resolves.toBe(true)
    expect(store.has(VAULT_KEY)).toBe(false)
  })
})
