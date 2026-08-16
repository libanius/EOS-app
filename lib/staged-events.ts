/**
 * Eventos ENCENADOS para o treino (SIM-T12 / D-200).
 *
 * Ideia do dono, 2026-08-13: *"o simulador deveria incluir uns furacões de
 * mentira no mapa, se aproximando, avisos de terremoto..."*. Hoje o Simulador
 * derruba FONTES (`isSourceDown`) mas não FABRICA evento — então a faixa de
 * reavaliação de D-168 só aparece com alerta real na região, e o treino não
 * consegue ensaiar a coisa que mais importa.
 *
 * ── A pergunta difícil, e a resposta ──────────────────────────────────────
 *
 * *Como o evento falso entra sem contaminar o snapshot verdadeiro?*
 *
 * **Ele não entra.** Este módulo produz um fluxo SEPARADO, que existe só
 * enquanto a simulação está ativa e que o mapa compõe por cima. Nada é escrito
 * no snapshot, no cache de hazards ou no banco.
 *
 * Isso não é economia de esforço — é a única forma que não depende de limpeza.
 * Se o falso fosse injetado no real, encerrar o treino viraria uma operação de
 * *desfazer*, e toda operação de desfazer falha algum dia. Aqui encerrar o
 * treino apaga o evento **por construção**: a lista vem vazia quando não há
 * simulação, e não há nada para reverter.
 *
 * ── `simulated: true` é do TIPO, não do valor ─────────────────────────────
 *
 * O campo é o literal `true`, e não `boolean`. Um evento real não consegue
 * satisfazer `StagedEvent` sem se declarar simulado — o compilador recusa. É a
 * mesma ideia de `unknown ≠ safe` levada para o sistema de tipos: o perigoso
 * não pode ser o silêncio.
 *
 * ── Determinístico de propósito ───────────────────────────────────────────
 *
 * Nenhum `Math.random()`. O mesmo cenário produz o mesmo furacão, na mesma
 * rota, com o mesmo nome. Um treino que muda a cada execução não pode ser
 * repetido com a família, e "vamos fazer de novo, agora sem errar" é metade do
 * valor de treinar.
 */

import type { Severity, ThreatType } from '@/lib/simulation'

export type StagedKind = 'hurricane' | 'earthquake' | 'wildfire' | 'fallout'

export type Ponto = { lat: number; lng: number }

export type StagedEvent = {
  id: string
  kind: StagedKind
  /** O nome que a pessoa dá — "Furacão Ana". Nunca vazio. */
  name: string
  /** Literal, não `boolean`: um evento real não consegue se passar por este tipo. */
  simulated: true
  severity: Severity
  /** Onde ele está AGORA. */
  center: Ponto
  /** Para onde ele vai, se for o caso. Vazio para terremoto. */
  track: Ponto[]
  /** O desenho no mapa: polígono fechado em [lng, lat]. */
  footprint: Array<[number, number]>
  /** Quantos km da casa, agora. */
  distanceKm: number
  /** Horas até tocar a casa. `null` quando já está acontecendo. */
  etaHours: number | null
  headline: string
}

const R_TERRA_KM = 6371

/** Graus para radianos, sem depender de nada. */
const rad = (g: number) => (g * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/**
 * Um ponto a `distKm` de `origem`, no rumo `bearingDeg`.
 *
 * Fórmula de destino em grande círculo. Aproximar por "graus por km" quebra
 * perto dos polos e distorce a leste-oeste já na Flórida — e um cone torto num
 * treino ensina a coisa errada sobre de onde a tempestade vem.
 */
export function pontoDistante(origem: Ponto, bearingDeg: number, distKm: number): Ponto {
  const d = distKm / R_TERRA_KM
  const b = rad(bearingDeg)
  const lat1 = rad(origem.lat)
  const lng1 = rad(origem.lng)

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(
    Math.sin(b) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  )
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 }
}

/** O rumo de `a` para `b`, em graus de bússola. */
export function rumoEntre(a: Ponto, b: Ponto): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
    - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Distância em km entre dois pontos (haversine). */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Um círculo fechado, em [lng, lat], pronto para GeoJSON. */
export function circulo(centro: Ponto, raioKm: number, lados = 48): Array<[number, number]> {
  const pontos: Array<[number, number]> = []
  for (let i = 0; i <= lados; i += 1) {
    const p = pontoDistante(centro, (360 * i) / lados, raioKm)
    pontos.push([p.lng, p.lat])
  }
  return pontos
}

/**
 * Uma cunha a favor do vento — a forma de pluma e de fumaça.
 *
 * Abre `aberturaDeg` a partir do centro e vai até `alcanceKm`. O fecho volta
 * pelo próprio centro, então o polígono é válido para preenchimento.
 */
export function cunha(
  centro: Ponto,
  rumoDeg: number,
  alcanceKm: number,
  aberturaDeg: number,
): Array<[number, number]> {
  const pontos: Array<[number, number]> = [[centro.lng, centro.lat]]
  const passos = 24
  for (let i = 0; i <= passos; i += 1) {
    const t = i / passos
    const ang = rumoDeg - aberturaDeg / 2 + aberturaDeg * t
    // A cunha engorda com a distância, como pluma de verdade.
    const p = pontoDistante(centro, ang, alcanceKm)
    pontos.push([p.lng, p.lat])
  }
  pontos.push([centro.lng, centro.lat])
  return pontos
}

/** Severidade → categoria Saffir-Simpson. */
export function categoriaFuracao(s: Severity): number {
  return Math.min(5, Math.max(1, s))
}

/** Severidade → magnitude plausível. Não é previsão; é escala de treino. */
export function magnitudeTerremoto(s: Severity): number {
  return Number((3.8 + s * 0.7).toFixed(1))
}

/**
 * O raio que importa por tipo e severidade.
 *
 * São números de TREINO, e o comentário existe para que ninguém os confunda
 * com modelo: eles ordenam a severidade de forma plausível e nada mais. Um
 * furacão categoria 5 tem que desenhar maior que um categoria 1 porque a
 * pessoa precisa SENTIR a diferença — não porque isto prevê alguma coisa.
 */
export function raioKm(kind: StagedKind, s: Severity): number {
  switch (kind) {
    case 'hurricane': return 60 + s * 45      // 105 a 285 km de campo de vento
    case 'earthquake': return 25 + s * 35     // 60 a 200 km de tremor sentido
    case 'wildfire': return 4 + s * 9         // 13 a 49 km de perímetro
    case 'fallout': return 30 + s * 40        // 70 a 230 km de pluma
  }
}

/** O tipo de ameaça do Simulador vira (ou não) um evento no mapa. */
export function kindDoThreat(threat: ThreatType): StagedKind | null {
  switch (threat) {
    case 'hurricane': return 'hurricane'
    case 'earthquake': return 'earthquake'
    case 'wildfire': return 'wildfire'
    case 'fallout': return 'fallout'
    /*
     * Enchente, inverno, apagão e geral NÃO viram evento no mapa — de
     * propósito. Nenhum deles tem um objeto com posição e rumo: enchente é uma
     * superfície que a camada de flood já desenha, apagão não tem geografia, e
     * inventar um círculo para eles ensinaria que existe um "ponto do apagão".
     */
    default: return null
  }
}

export type StageInput = {
  threat: ThreatType
  severity: Severity
  arrivalHours: number
  /** Casa, ou onde a pessoa está. Sem isto não há o que encenar. */
  home: Ponto | null
  /** O nome que a pessoa deu. Vazio cai no padrão do tipo. */
  name?: string
  /** De onde ele vem, em graus. Padrão: sudeste, a rota clássica na Flórida. */
  bearingDeg?: number
  /**
   * Onde ele está, escolhido no mapa (SIM-T12c / D-202).
   *
   * Quando existe, **manda**: o rumo e o tempo de chegada deixam de decidir a
   * posição e passam a ser derivados dela. É a diferença entre "vem do sudeste
   * em 12h" e "está EXATAMENTE ali" — e a segunda é a que permite ensaiar a
   * tempestade que já aconteceu, no lugar em que ela aconteceu.
   */
  at?: Ponto | null
}

const NOME_PADRAO: Record<StagedKind, string> = {
  hurricane: 'Hurricane Ana',
  earthquake: 'M6.5 Event',
  wildfire: 'Ridge Fire',
  fallout: 'Plume Alpha',
}

/**
 * O evento encenado a partir do cenário — ou nada.
 *
 * Devolve **lista**, e não um evento, porque um treino pode um dia ter dois
 * (o furacão e o incêndio que ele começou). Devolve **vazia** quando não há
 * casa ou quando a ameaça não tem geografia: encenar sem posição colocaria a
 * tempestade num ponto arbitrário do mundo, e um treino que mente sobre onde a
 * coisa está é pior que um treino sem mapa.
 */
export function stageEvents(input: StageInput): StagedEvent[] {
  const kind = kindDoThreat(input.threat)
  if (!kind || !input.home) return []

  const home = input.home
  const bearing = input.bearingDeg ?? 135          // vem do sudeste
  const nome = (input.name ?? '').trim() || NOME_PADRAO[kind]
  const severidade = input.severity

  /*
   * Terremoto não viaja: ele acontece. `arrivalHours` vira profundidade
   * narrativa, não distância — por isso ele nasce PERTO e sem rota.
   */
  if (kind === 'earthquake') {
    const epicentro = input.at ?? pontoDistante(home, bearing, 18 + severidade * 12)
    return [{
      id: `staged:earthquake:${nome}`,
      kind,
      name: nome,
      simulated: true,
      severity: severidade,
      center: epicentro,
      track: [],
      footprint: circulo(epicentro, raioKm(kind, severidade)),
      distanceKm: Math.round(distanciaKm(home, epicentro)),
      etaHours: null,
      headline: `${nome} · M${magnitudeTerremoto(severidade)}`,
    }]
  }

  /*
   * Os outros três se APROXIMAM. A distância inicial sai do tempo de chegada:
   * quanto mais horas, mais longe ele começa. É o que faz "chega em 12h"
   * desenhar diferente de "chega agora".
   */
  const velocidadeKmH = kind === 'hurricane' ? 22 : kind === 'wildfire' ? 6 : 35

  /*
   * Posição escolhida MANDA sobre rumo e tempo (D-202).
   *
   * Quando a pessoa aponta no mapa, a distância e o rumo passam a ser
   * **medidos** a partir dali em vez de calculados a partir do relógio. O
   * cenário deixa de descrever uma abstração e passa a descrever um lugar.
   */
  const centro = input.at ?? pontoDistante(home, bearing, Math.max(8, input.arrivalHours * velocidadeKmH))
  const distanciaInicial = Math.max(0.5, distanciaKm(home, centro))
  const rumoReal = input.at ? rumoEntre(home, centro) : bearing

  // A rota é o caminho de volta até a casa: é para lá que ele vai.
  const track: Ponto[] = []
  const passos = 5
  for (let i = 0; i <= passos; i += 1) {
    track.push(pontoDistante(home, rumoReal, distanciaInicial * (1 - i / passos)))
  }

  const rumoDeImpacto = (rumoReal + 180) % 360
  const raio = raioKm(kind, severidade)

  const footprint = kind === 'hurricane'
    ? circulo(centro, raio)
    // Incêndio e pluma são direcionais: eles se espalham PARA a casa.
    : cunha(centro, rumoDeImpacto, raio, kind === 'wildfire' ? 55 : 40)

  const headline = kind === 'hurricane'
    ? `${nome} · Cat ${categoriaFuracao(severidade)}`
    : nome

  return [{
    id: `staged:${kind}:${nome}`,
    kind,
    name: nome,
    simulated: true,
    severity: severidade,
    center: centro,
    track,
    footprint,
    distanceKm: Math.round(distanciaInicial),
    /*
     * Com posição escolhida, o ETA é MEDIDO — distância dividida por
     * velocidade. Repetir o `arrivalHours` do formulário faria a tela dizer
     * "12h" para uma tempestade que a pessoa acabou de colocar a 5 km.
     */
    etaHours: input.at
      ? Math.round((distanciaInicial / velocidadeKmH) * 10) / 10 || null
      : input.arrivalHours > 0 ? input.arrivalHours : null,
    headline,
  }]
}

/**
 * Este evento é encenado?
 *
 * Existe para o lado do mapa, que recebe eventos reais e encenados na mesma
 * lista e **precisa** conseguir distinguir sem confiar em convenção de nome.
 */
export function isStaged(e: { simulated?: boolean } | null | undefined): boolean {
  return e?.simulated === true
}
