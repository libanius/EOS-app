/**
 * A régua da água, uma vez só (D-158 / D-159 / PREP-T11).
 *
 * O ponto destes testes não é aritmética — é impedir que a constante volte a
 * ter cópias. Antes de PREP-T11 o número "3 litros por pessoa por dia" existia
 * em cinco lugares, e cinco cópias de um número que decide se a família tem
 * água são cinco chances de divergirem.
 */
import {
  GALLON_SHORT,
  LITERS_PER_GALLON,
  WATER_GALLONS_PER_PERSON_DAY,
  WATER_LITERS_PER_PERSON_DAY,
  formatGallons,
  gallonsToLiters,
  litersToGallons,
} from '@/lib/units'

describe('unidades de água', () => {
  it('o galão é o americano, não o britânico', () => {
    // O britânico tem 4,546 L e não é o da FEMA. Confundir os dois inventaria
    // 20% de água que não existe.
    expect(LITERS_PER_GALLON).toBeCloseTo(3.785411784, 9)
  })

  it('a régua é a da FEMA: 1 galão por pessoa por dia', () => {
    expect(WATER_GALLONS_PER_PERSON_DAY).toBe(1)
    expect(WATER_LITERS_PER_PERSON_DAY).toBe(LITERS_PER_GALLON)
  })

  it('a régua nova é mais rigorosa que os 3 L antigos', () => {
    expect(WATER_LITERS_PER_PERSON_DAY).toBeGreaterThan(3)
    // ~21% a mais de água exigida para o mesmo dia de autonomia.
    expect(WATER_LITERS_PER_PERSON_DAY / 3 - 1).toBeCloseTo(0.2618, 3)
  })

  it('converter ida e volta não perde água', () => {
    for (const galoes of [0, 0.5, 1, 4, 20, 137.5]) {
      expect(litersToGallons(gallonsToLiters(galoes))).toBeCloseTo(galoes, 9)
    }
  })

  it('entrada inválida vira zero, nunca NaN', () => {
    // Um NaN atravessando a autonomia viraria um veredito em branco na tela.
    expect(litersToGallons(Number.NaN)).toBe(0)
    expect(gallonsToLiters(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('formata com uma casa decimal', () => {
    expect(formatGallons(gallonsToLiters(20))).toBe('20.0')
    expect(formatGallons(gallonsToLiters(1.25))).toBe('1.3')
    expect(formatGallons(0)).toBe('0.0')
  })

  it('a abreviação não é traduzida', () => {
    // `gal` é a mesma em pt-BR e en. Traduzir unidade padronizada cria duas
    // verdades para o mesmo número.
    expect(GALLON_SHORT).toBe('gal')
  })
})
