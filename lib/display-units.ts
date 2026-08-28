/**
 * Unidade de EXIBIÇÃO para dados de clima e perigo — °F/°C, mph/km/h, mi/km.
 *
 * Separado de `lib/units.ts` de propósito: aquele arquivo é a régua de ÁGUA da
 * FEMA (D-158/D-159), com litro no banco e galão na tela. São dois assuntos que
 * só parecem um. Juntá-los criaria duas verdades sobre a água — exatamente o
 * que aquele arquivo existe para impedir — e a conversão de água já tem dono
 * lá, em `formatGallons`.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * A tela de Alertas reportava °F, mph, milhas e polegadas para todo mundo,
 * inclusive para quem escolheu português — 13 sítios imperiais, nenhuma
 * conversão. A crítica de 2026-08-20 pontuou a heurística "sistema ↔ mundo
 * real" com 1 de 4 por causa disso, e a captura para a Play Store tornou o
 * problema visível fora do app: não dá para publicar `40 mph` e `~2273 mi`
 * numa ficha em português.
 *
 * ── A regra ──────────────────────────────────────────────────────────────
 *
 * O EOS bebe de fontes americanas — NWS, NHC, USGS, FEMA — que falam imperial.
 * Converter na entrada seria perder precisão e brigar com o dado original a
 * cada comparação. Então **o dado permanece imperial em memória** e a conversão
 * acontece uma vez só, na borda, na hora de escrever na tela. É o mesmo
 * princípio da D-158: unidade é dado, não convenção, e nenhum número é gravado
 * em campo cujo nome contradiga a unidade.
 *
 * O sistema segue o idioma, que é a única preferência que a pessoa já
 * declarou (D-206: inglês é a base; português quando escolhido):
 *
 *   inglês     → imperial  ·  °F, mph, mi, gal, relógio de 12 h
 *   português  → métrico   ·  °C, km/h, km, L, relógio de 24 h
 *
 * Um dia isso pode virar preferência própria — um americano que usa o app em
 * português, um brasileiro na Flórida que quer mph para conversar com o vizinho.
 * Enquanto essa pessoa não aparecer com um caso real, uma chave a mais em
 * Ajustes é mais uma decisão para quem só quer saber se pode sair de casa.
 */
import type { Language } from '@/lib/i18n'

export type UnitSystem = 'imperial' | 'metric'

export function unitSystemFor(language: Language): UnitSystem {
  return language === 'pt' ? 'metric' : 'imperial'
}

// ─── Conversões ───────────────────────────────────────────────────────────────
// Fatores exatos por definição internacional, não arredondados: a milha é
// 1609,344 m exatos, e usar 1,609 acumula ~200 m de erro a cada 1000 km. Numa
// distância de furacão isso não muda decisão nenhuma, mas o custo de escrever o
// número certo é zero.

export const fahrenheitToCelsius = (f: number) => (f - 32) * (5 / 9)
export const milesToKm = (mi: number) => mi * 1.609344
export const inchesToMm = (inches: number) => inches * 25.4

// ─── Formatação ───────────────────────────────────────────────────────────────
// Cada função devolve a string PRONTA, com número e unidade juntos. Devolver só
// o número deixaria a unidade para a tela montar, e é assim que se acaba com
// `{temp}°F` cravado num JSX que ninguém revisita.

/** Temperatura. A fonte entrega Fahrenheit. */
export function formatTemp(f: number | null | undefined, system: UnitSystem, withUnit = true): string {
  if (f == null || !Number.isFinite(f)) return '—'
  const v = system === 'metric' ? fahrenheitToCelsius(f) : f
  const n = Math.round(v)
  return withUnit ? `${n}°${system === 'metric' ? 'C' : 'F'}` : `${n}°`
}

/** Velocidade de vento. A fonte entrega mph. */
export function formatSpeed(mph: number | null | undefined, system: UnitSystem): string {
  if (mph == null || !Number.isFinite(mph)) return '—'
  return system === 'metric'
    ? `${Math.round(milesToKm(mph))} km/h`
    : `${Math.round(mph)} mph`
}

/**
 * Só o número da velocidade, convertido, sem unidade.
 *
 * Existe para a faixa horária, onde a célula tem 58 px e a unidade já está
 * implícita no `g` de rajada. `formatSpeed` ali imprimiria "55 km/h" a 9 px
 * dentro de uma coluna que não cabe — trocar um número por um estouro de
 * layout não é internacionalizar, é quebrar.
 */
export function speedValue(mph: number | null | undefined, system: UnitSystem): string {
  if (mph == null || !Number.isFinite(mph)) return '—'
  return String(Math.round(system === 'metric' ? milesToKm(mph) : mph))
}

/**
 * Distância. A fonte entrega milhas.
 *
 * Abaixo de 10 unidades mantém uma casa decimal: "0 km" para um alerta a 400 m
 * é pior do que inútil, é errado.
 */
export function formatDistance(mi: number | null | undefined, system: UnitSystem): string {
  if (mi == null || !Number.isFinite(mi)) return '—'
  const v = system === 'metric' ? milesToKm(mi) : mi
  const unit = system === 'metric' ? 'km' : 'mi'
  return v < 10 ? `${v.toFixed(1)} ${unit}` : `${Math.round(v)} ${unit}`
}

/** Visibilidade. A fonte entrega milhas; sempre com uma casa. */
export function formatVisibility(mi: number | null | undefined, system: UnitSystem): string {
  if (mi == null || !Number.isFinite(mi)) return '—'
  const v = system === 'metric' ? milesToKm(mi) : mi
  return `${v.toFixed(1)} ${system === 'metric' ? 'km' : 'mi'}`
}

/** Precipitação. A fonte entrega polegadas. */
export function formatPrecip(inches: number | null | undefined, system: UnitSystem): string {
  if (inches == null || !Number.isFinite(inches)) return '—'
  return system === 'metric'
    ? `${Math.round(inchesToMm(inches))} mm`
    : `${inches.toFixed(2)} in`
}


// ─── Relógio ──────────────────────────────────────────────────────────────────
// Separado das unidades de propósito: o formato de hora segue o IDIOMA, não o
// sistema de medida. São eixos diferentes que hoje andam juntos por acaso, e
// escrevê-los juntos esconderia isso do próximo que mexer aqui.

const localeFor = (language: Language) => (language === 'pt' ? 'pt-BR' : 'en-US')

/** Hora e minuto. `1:52 PM` em inglês, `13:52` em português. */
export function formatClock(iso: string | null | undefined, language: Language): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(localeFor(language), {
    hour: language === 'pt' ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: language !== 'pt',
  })
}

/** Só a hora cheia, para a faixa horária. `1 PM` / `13h`. */
export function formatHour(iso: string | null | undefined, language: Language): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  if (language === 'pt') return `${d.getHours()}h`
  return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
}
