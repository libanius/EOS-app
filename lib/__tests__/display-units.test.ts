/**
 * A conversão de unidade é o tipo de código que "obviamente funciona" e erra
 * calado: um fator invertido dá um número plausível, e ninguém confere 25 °C
 * contra 77 °F de cabeça no meio de um furacão.
 */
import {
  fahrenheitToCelsius,
  formatClock,
  formatDistance,
  formatHour,
  formatPrecip,
  formatSpeed,
  speedValue,
  formatTemp,
  formatVisibility,
  inchesToMm,
  milesToKm,
  unitSystemFor,
} from '@/lib/display-units'

describe('unitSystemFor', () => {
  it('inglês é a base e usa imperial (D-206)', () => {
    expect(unitSystemFor('en')).toBe('imperial')
  })
  it('português usa métrico', () => {
    expect(unitSystemFor('pt')).toBe('metric')
  })
})

describe('conversões', () => {
  it('pontos de referência que qualquer um confere de cabeça', () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 10)
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 10)
    expect(fahrenheitToCelsius(98.6)).toBeCloseTo(37, 10)
  })
  it('usa os fatores exatos, não os arredondados', () => {
    expect(milesToKm(1)).toBeCloseTo(1.609344, 10)
    expect(inchesToMm(1)).toBeCloseTo(25.4, 10)
      })
  it('1000 milhas com o fator exato difere do arredondado em ~344 m', () => {
    expect(milesToKm(1000) - 1000 * 1.609).toBeCloseTo(0.344, 3)
  })
})

describe('formatTemp', () => {
  it('imperial mantém Fahrenheit', () => {
    expect(formatTemp(77, 'imperial')).toBe('77°F')
  })
  it('métrico converte para Celsius', () => {
    expect(formatTemp(77, 'metric')).toBe('25°C')
  })
  it('sabe omitir a unidade quando a tela já a declarou', () => {
    expect(formatTemp(77, 'metric', false)).toBe('25°')
  })
  it('ausência não vira zero — 0°F é uma temperatura real', () => {
    expect(formatTemp(null, 'metric')).toBe('—')
    expect(formatTemp(undefined, 'imperial')).toBe('—')
    expect(formatTemp(NaN, 'imperial')).toBe('—')
    expect(formatTemp(0, 'imperial')).toBe('0°F')
  })
})

describe('formatSpeed', () => {
  it('imperial mantém mph', () => {
    expect(formatSpeed(40, 'imperial')).toBe('40 mph')
  })
  it('métrico converte para km/h', () => {
    expect(formatSpeed(40, 'metric')).toBe('64 km/h')
  })
  it('vento de furacão categoria 1 (74 mph) vira 119 km/h', () => {
    expect(formatSpeed(74, 'metric')).toBe('119 km/h')
  })
  it('vento parado é zero, não ausência', () => {
    expect(formatSpeed(0, 'metric')).toBe('0 km/h')
    expect(formatSpeed(null, 'metric')).toBe('—')
  })
})

describe('speedValue', () => {
  it('devolve so o numero, para celula estreita', () => {
    expect(speedValue(34, 'imperial')).toBe('34')
    expect(speedValue(34, 'metric')).toBe('55')
  })
  it('ausencia nao vira zero', () => {
    expect(speedValue(null, 'metric')).toBe('—')
  })
})

describe('formatDistance', () => {
  it('converte e arredonda longe', () => {
    expect(formatDistance(2273, 'metric')).toBe('3658 km')
    expect(formatDistance(2273, 'imperial')).toBe('2273 mi')
  })
  it('mantém uma casa perto, para não transformar 400 m em "0 km"', () => {
    expect(formatDistance(0.25, 'metric')).toBe('0.4 km')
    expect(formatDistance(0.25, 'imperial')).toBe('0.3 mi')
  })
  it('a fronteira das 10 unidades é do valor JÁ convertido', () => {
    // 6 mi = 9,66 km → ainda com decimal; 7 mi = 11,3 km → arredondado.
    expect(formatDistance(6, 'metric')).toBe('9.7 km')
    expect(formatDistance(7, 'metric')).toBe('11 km')
  })
})

describe('formatVisibility, formatPrecip, formatVolume', () => {
  it('visibilidade sempre com uma casa', () => {
    expect(formatVisibility(10, 'imperial')).toBe('10.0 mi')
    expect(formatVisibility(10, 'metric')).toBe('16.1 km')
  })
  it('precipitação em polegada ou milímetro', () => {
    expect(formatPrecip(0.5, 'imperial')).toBe('0.50 in')
    expect(formatPrecip(0.5, 'metric')).toBe('13 mm')
  })
})

describe('relógio', () => {
  // A hora é montada no fuso LOCAL e reconvertida para ISO, então a asserção
  // vale em qualquer máquina. Fixar `process.env.TZ` aqui não funcionaria: o
  // Node já leu o fuso quando o teste começa, e a variável passa a ser
  // decoração — foi exatamente assim que este teste falhou da primeira vez,
  // acusando 13h onde se esperava 17h.
  const iso = new Date(2026, 7, 28, 17, 52, 0).toISOString()

  it('português usa 24 h e inglês usa 12 h', () => {
    expect(formatClock(iso, 'pt')).toBe('17:52')
    expect(formatClock(iso, 'en')).toMatch(/5:52\s?PM/)
  })
  it('a hora cheia da faixa horária segue o mesmo eixo', () => {
    expect(formatHour(iso, 'pt')).toBe('17h')
    expect(formatHour(iso, 'en')).toMatch(/5\s?PM/)
  })
  it('data inválida ou ausente vira travessão, nunca "Invalid Date"', () => {
    expect(formatClock(null, 'pt')).toBe('—')
    expect(formatClock('não é data', 'pt')).toBe('—')
    expect(formatHour(undefined, 'en')).toBe('—')
  })
})
