/**
 * Autonomia da casa (D-123).
 *
 * Um número de autonomia errado PARA CIMA é pior que nenhum: a família lê "seis
 * dias", não se prepara, e descobre no terceiro. Por isso metade destes casos
 * existe para provar que a conta não infla.
 */

import { autonomyDays, WATER_PER_PERSON_DAY, type HouseholdInventory } from '@/lib/household'

const inv = (over: Partial<HouseholdInventory> = {}): HouseholdInventory => ({
  waterLiters: 0,
  foodPersonDays: 0,
  fuelLiters: 0,
  batteryPercent: 0,
  hasMedicalKit: false,
  hasCommunicationDevice: false,
  contributors: 1,
  ...over,
})

describe('autonomyDays', () => {
  it('usa o recurso que acaba primeiro, não a média', () => {
    // 30 dias de comida e 1 dia de água é uma casa de UM dia. Uma média diria
    // quinze e meio, e quinze e meio é uma mentira que mata.
    const casa = inv({ waterLiters: 3, foodPersonDays: 30 })
    expect(autonomyDays(casa, 1)).toBe(1)
  })

  it('divide pelo tamanho da casa', () => {
    // 90 L para 3 pessoas a 3 L/dia = 10 dias de água; a comida limita em 6.
    expect(autonomyDays(inv({ waterLiters: 90, foodPersonDays: 18 }), 3)).toBe(6)
    // Com 6 pessoas a mesma água dura 5 dias, e passa a ser ela o limite.
    expect(autonomyDays(inv({ waterLiters: 90, foodPersonDays: 36 }), 6)).toBe(5)
  })

  it('mais gente NUNCA aumenta a autonomia', () => {
    const casa = inv({ waterLiters: 120, foodPersonDays: 60 })
    let anterior = Infinity
    for (const pessoas of [1, 2, 3, 4, 5, 8, 12]) {
      const dias = autonomyDays(casa, pessoas)
      expect(dias).toBeLessThanOrEqual(anterior)
      anterior = dias
    }
  })

  it('casa de tamanho zero não vira divisão por zero nem infinito', () => {
    // Acontece quando a leitura falha. `known: false` cobre o aviso; aqui o que
    // importa é o número não ser Infinity, que renderizaria como autonomia
    // ilimitada na tela.
    expect(autonomyDays(inv({ waterLiters: 100, foodPersonDays: 5 }), 0)).toBe(0)
    expect(Number.isFinite(autonomyDays(inv({ waterLiters: 100, foodPersonDays: 5 }), 0))).toBe(true)
  })

  it('sem água a autonomia é zero mesmo com despensa cheia', () => {
    expect(autonomyDays(inv({ waterLiters: 0, foodPersonDays: 30 }), 2)).toBe(0)
  })

  it('sem comida a autonomia é zero mesmo com água de sobra', () => {
    expect(autonomyDays(inv({ waterLiters: 500, foodPersonDays: 0 }), 2)).toBe(0)
  })

  it('a referência de litros por pessoa é a mesma do app inteiro', () => {
    expect(WATER_PER_PERSON_DAY).toBe(3)
    // Um dia exato para uma pessoa.
    expect(autonomyDays(inv({ waterLiters: WATER_PER_PERSON_DAY, foodPersonDays: 99 }), 1)).toBe(1)
  })

  it('somar inventário de duas contas dobra a água, não a autonomia por pessoa', () => {
    // O ponto de "morar junto": duas pessoas com 30 L cada viram 60 L para 2,
    // que é a MESMA autonomia por pessoa — o ganho é a despensa comum, não
    // um número inflado.
    const sozinho = autonomyDays(inv({ waterLiters: 30, foodPersonDays: 4 }), 1)
    const juntos = autonomyDays(inv({ waterLiters: 60, foodPersonDays: 8, contributors: 2 }), 2)
    expect(juntos).toBe(sozinho)
  })
})
