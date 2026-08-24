/**
 * Dias da casa, num lugar só (PILOT-T12 / D-174).
 *
 * O teste que existe por causa de um defeito real: o Pilot afirmou
 * "sua autonomia está em zero, o que significa que sua família não tem
 * reservas" enquanto o painel mostrava 2,7 dias. A causa foi zero viajando no
 * lugar de "não sei".
 *
 * **Zero não é ausência de informação.** Zero é um fato, e o pior possível.
 */
import { householdDays, type DaysInput } from '@/lib/household-days'
import { gallonsToLiters } from '@/lib/units'

const inv = (over: Partial<DaysInput> = {}): DaysInput => ({
  waterLiters: gallonsToLiters(9),   // 3 dias para 3 pessoas
  foodPersonDays: 12,
  fuelLiters: 20,
  batteryPercent: 100,
  ...over,
})

describe('casa conhecida', () => {
  it('calcula os quatro recursos', () => {
    const d = householdDays(inv(), 3, true)
    expect(d.water).toBeCloseTo(3, 6)
    expect(d.food).toBeCloseTo(4, 6)
    expect(d.power).toBeCloseTo(3, 6)
    expect(d.fuel).toBeCloseTo(2, 6)
  })

  it('autonomia é o menor entre água e comida', () => {
    // Energia e combustível são CAPACIDADE, não sobrevivência (D-129).
    expect(householdDays(inv(), 3, true).autonomy).toBeCloseTo(3, 6)
  })

  it('comida limitando manda na autonomia', () => {
    expect(householdDays(inv({ foodPersonDays: 3 }), 3, true).autonomy).toBeCloseTo(1, 6)
  })
})

describe('NÃO SEI não é ZERO — o defeito que originou este arquivo', () => {
  it('casa desconhecida devolve null em tudo', () => {
    const d = householdDays(inv(), 3, false)
    expect(d).toEqual({ water: null, food: null, power: null, fuel: null, autonomy: null })
  })

  it('tamanho zero devolve null, não divide por um', () => {
    // Presumir "uma pessoa" produziria autonomia inventada — a mesma armadilha
    // que `lib/attention.ts` evita.
    expect(householdDays(inv(), 0, true).autonomy).toBeNull()
  })

  it('inventário ausente devolve null', () => {
    expect(householdDays(null, 3, true).autonomy).toBeNull()
  })

  it('e null NUNCA é confundível com zero legítimo', () => {
    /*
     * Uma casa que de fato não tem nada devolve ZERO — que é um fato e deve
     * alarmar. Uma casa que não conhecemos devolve NULL — que não deve virar
     * frase nenhuma sobre reservas.
     */
    const semNada = householdDays(inv({ waterLiters: 0, foodPersonDays: 0 }), 3, true)
    expect(semNada.autonomy).toBe(0)

    const desconhecida = householdDays(inv(), 3, false)
    expect(desconhecida.autonomy).toBeNull()

    expect(semNada.autonomy).not.toBe(desconhecida.autonomy)
  })
})
