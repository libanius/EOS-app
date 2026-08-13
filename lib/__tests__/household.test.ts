/**
 * Autonomia da casa (D-123).
 *
 * Um número de autonomia errado PARA CIMA é pior que nenhum: a família lê "seis
 * dias", não se prepara, e descobre no terceiro. Por isso metade destes casos
 * existe para provar que a conta não infla.
 */

import { autonomyDays, WATER_LITERS_PER_PERSON_DAY, type HouseholdInventory } from '@/lib/household'
import { LITERS_PER_GALLON, WATER_GALLONS_PER_PERSON_DAY } from '@/lib/units'

/*
 * Energia e combustível cheios por padrão (D-129).
 *
 * A autonomia passou a incluir os quatro recursos, e sem isso todo caso que
 * queria testar água ou comida media, na verdade, o combustível zerado. As
 * fixtures antigas não tinham os dois campos porque a fórmula não os usava — e
 * foi assim que estes três casos reprovaram na hora da unificação, que é
 * exatamente o que se espera deles.
 */
const inv = (over: Partial<HouseholdInventory> = {}): HouseholdInventory => ({
  waterLiters: 0,
  foodPersonDays: 0,
  fuelLiters: 999,
  batteryPercent: 100,
  hasMedicalKit: false,
  hasCommunicationDevice: false,
  contributors: 1,
  ...over,
})

describe('autonomyDays', () => {
  it('usa o recurso que acaba primeiro, não a média', () => {
    // 30 dias de comida e 1 dia de água é uma casa de UM dia. Uma média diria
    // quinze e meio, e quinze e meio é uma mentira que mata.
    //
    // A água vem da constante, não de um literal: este teste já ficou vermelho
    // uma vez por fixar `3` quando a régua mudou para o galão da FEMA (D-159).
    const casa = inv({ waterLiters: WATER_LITERS_PER_PERSON_DAY, foodPersonDays: 30 })
    expect(autonomyDays(casa, 1)).toBe(1)
  })

  it('divide pelo tamanho da casa', () => {
    // Água para 10 dias de 3 pessoas; a comida limita antes, em 6.
    const dezDiasDeTres = WATER_LITERS_PER_PERSON_DAY * 3 * 10
    expect(autonomyDays(inv({ waterLiters: dezDiasDeTres, foodPersonDays: 18 }), 3)).toBe(6)

    // A MESMA água, o dobro de bocas: cinco dias, e agora é ela o limite.
    expect(autonomyDays(inv({ waterLiters: dezDiasDeTres, foodPersonDays: 36 }), 6)).toBe(5)
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

  it('a régua da água é a da FEMA: 1 galão por pessoa por dia (D-159)', () => {
    /*
     * Este teste afirmava `toBe(3)` — travando os 3 L que o EOS usava e que
     * ficavam 21% abaixo do padrão que o próprio app distribui no EDU. Um teste
     * que trava um número errado é parte do erro, e por isso foi corrigido no
     * mesmo commit da constante, não depois.
     */
    expect(WATER_GALLONS_PER_PERSON_DAY).toBe(1)
    expect(WATER_LITERS_PER_PERSON_DAY).toBeCloseTo(3.785411784, 6)
    expect(WATER_LITERS_PER_PERSON_DAY).toBe(LITERS_PER_GALLON)

    // Um galão, uma pessoa, um dia exato.
    expect(autonomyDays(inv({ waterLiters: LITERS_PER_GALLON, foodPersonDays: 99 }), 1)).toBe(1)

    // A régua ficou mais rigorosa: a mesma água rende MENOS dias que antes.
    const antes = 30 / (3 * 2)
    const agora = autonomyDays(inv({ waterLiters: 30, foodPersonDays: 99 }), 2)
    expect(agora).toBeLessThan(antes)
    expect(agora).toBeCloseTo(30 / (LITERS_PER_GALLON * 2), 6)
  })

  it('bateria vazia NÃO reduz a sobrevivência', () => {
    /*
     * Eu tinha unificado incluindo energia, e o teste mostrou o absurdo: com
     * `BATTERY_FULL_DAYS = 3`, nenhuma casa poderia passar de três dias, e uma
     * bateria em 10% afirmaria que a família sobrevive 0,3 dias. Não sobrevive:
     * fica sem luz. Autonomia é água e comida; energia é capacidade.
     */
    const casa = inv({ waterLiters: 300, foodPersonDays: 30, batteryPercent: 0, fuelLiters: 0 })
    expect(autonomyDays(casa, 1)).toBe(30)
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
