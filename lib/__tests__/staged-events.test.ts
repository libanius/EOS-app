/**
 * Eventos encenados (SIM-T12 / D-200).
 *
 * O que este arquivo protege não é o desenho — é a **fronteira**. Um evento
 * encenado tem que ser impossível de confundir com um real, e tem que sumir
 * sozinho quando o treino acaba. As duas coisas são estruturais, não visuais,
 * e é por isso que dá para testá-las sem abrir um navegador.
 */
import {
  stageEvents,
  isStaged,
  pontoDistante,
  distanciaKm,
  circulo,
  cunha,
  kindDoThreat,
  raioKm,
  categoriaFuracao,
  magnitudeTerremoto,
  coneDeIncerteza,
} from '@/lib/staged-events'

const CASA = { lat: 26.31, lng: -80.237 }   // Parkland, FL

const cenario = (over: Partial<Parameters<typeof stageEvents>[0]> = {}) => ({
  threat: 'hurricane' as const,
  severity: 3 as const,
  arrivalHours: 12,
  home: CASA,
  ...over,
})

describe('a geometria é de verdade', () => {
  it('um ponto a 100 km está a 100 km', () => {
    const p = pontoDistante(CASA, 90, 100)
    expect(distanciaKm(CASA, p)).toBeCloseTo(100, 0)
  })

  it('o rumo importa: leste e oeste caem em lados opostos', () => {
    expect(pontoDistante(CASA, 90, 50).lng).toBeGreaterThan(CASA.lng)
    expect(pontoDistante(CASA, 270, 50).lng).toBeLessThan(CASA.lng)
  })

  it('o círculo fecha e todos os pontos ficam no raio', () => {
    const anel = circulo(CASA, 80, 16)
    expect(anel[0]).toEqual(anel[anel.length - 1])
    for (const [lng, lat] of anel) {
      expect(distanciaKm(CASA, { lat, lng })).toBeCloseTo(80, 0)
    }
  })

  it('a cunha começa e termina no centro', () => {
    const c = cunha(CASA, 0, 60, 40)
    expect(c[0]).toEqual([CASA.lng, CASA.lat])
    expect(c[c.length - 1]).toEqual([CASA.lng, CASA.lat])
  })
})

describe('A FRONTEIRA — encenado nunca se passa por real', () => {
  it('todo evento sai marcado', () => {
    for (const t of ['hurricane', 'earthquake', 'wildfire', 'fallout'] as const) {
      const [e] = stageEvents(cenario({ threat: t }))
      expect(e.simulated).toBe(true)
      expect(isStaged(e)).toBe(true)
    }
  })

  it('e um evento real NÃO passa por encenado', () => {
    // O mapa recebe as duas listas juntas e precisa separar sem confiar em nome.
    expect(isStaged({ simulated: false })).toBe(false)
    expect(isStaged({})).toBe(false)
    expect(isStaged(null)).toBe(false)
    expect(isStaged(undefined)).toBe(false)
  })

  it('o id se declara na primeira palavra', () => {
    const [e] = stageEvents(cenario())
    expect(e.id.startsWith('staged:')).toBe(true)
  })
})

describe('SEM CASA não há encenação', () => {
  it('devolve vazio em vez de inventar posição', () => {
    /*
     * Encenar sem coordenada colocaria a tempestade num ponto arbitrário do
     * mundo. Um treino que mente sobre ONDE a coisa está é pior que um treino
     * sem mapa — a pessoa aprenderia a rota errada.
     */
    expect(stageEvents(cenario({ home: null }))).toEqual([])
  })
})

describe('nem toda ameaça tem geografia', () => {
  it('apagão, inverno, enchente e geral não viram objeto no mapa', () => {
    for (const t of ['blackout', 'winter', 'flood', 'general'] as const) {
      expect(kindDoThreat(t)).toBeNull()
      expect(stageEvents(cenario({ threat: t }))).toEqual([])
    }
  })

  it('os quatro que têm, têm', () => {
    expect(kindDoThreat('hurricane')).toBe('hurricane')
    expect(kindDoThreat('earthquake')).toBe('earthquake')
    expect(kindDoThreat('wildfire')).toBe('wildfire')
    expect(kindDoThreat('fallout')).toBe('fallout')
  })
})

describe('o nome é da pessoa', () => {
  it('usa o que ela escreveu', () => {
    const [e] = stageEvents(cenario({ name: 'Furacão Isadora' }))
    expect(e.name).toBe('Furacão Isadora')
    expect(e.headline).toContain('Furacão Isadora')
  })

  it('nome só de espaços cai no padrão em vez de virar vazio', () => {
    const [e] = stageEvents(cenario({ name: '   ' }))
    expect(e.name).toBe('Hurricane Ana')
  })

  it('a manchete do furacão carrega a categoria', () => {
    const [e] = stageEvents(cenario({ severity: 5, name: 'Ana' }))
    expect(e.headline).toBe('Ana · Cat 5')
  })

  it('a do terremoto carrega a magnitude', () => {
    const [e] = stageEvents(cenario({ threat: 'earthquake', severity: 4, name: 'Sismo' }))
    expect(e.headline).toBe(`Sismo · M${magnitudeTerremoto(4)}`)
  })
})

describe('a severidade tem que ser SENTIDA', () => {
  it('mais severo desenha maior, em todos os tipos', () => {
    for (const k of ['hurricane', 'earthquake', 'wildfire', 'fallout'] as const) {
      expect(raioKm(k, 5)).toBeGreaterThan(raioKm(k, 1))
    }
  })

  it('categoria segue Saffir-Simpson e não estoura', () => {
    expect(categoriaFuracao(1)).toBe(1)
    expect(categoriaFuracao(5)).toBe(5)
  })
})

describe('quem se aproxima, se aproxima', () => {
  it('mais horas até a chegada = começa mais longe', () => {
    const [perto] = stageEvents(cenario({ arrivalHours: 2 }))
    const [longe] = stageEvents(cenario({ arrivalHours: 24 }))
    expect(longe.distanceKm).toBeGreaterThan(perto.distanceKm)
  })

  it('a rota TERMINA na casa — é para lá que ele vai', () => {
    const [e] = stageEvents(cenario())
    const fim = e.track[e.track.length - 1]
    expect(distanciaKm(CASA, fim)).toBeLessThan(1)
  })

  it('a rota começa no centro atual', () => {
    const [e] = stageEvents(cenario())
    expect(distanciaKm(e.center, e.track[0])).toBeLessThan(1)
  })

  it('"agora" não vira ETA — vira null', () => {
    // Zero hora não é "chega em zero horas", é "já está aqui". Guardar 0
    // faria a tela escrever "em 0h", que é uma frase que ninguém diz.
    const [e] = stageEvents(cenario({ arrivalHours: 0 }))
    expect(e.etaHours).toBeNull()
    expect(e.distanceKm).toBeGreaterThan(0)
  })

  it('terremoto NÃO tem rota nem ETA', () => {
    const [e] = stageEvents(cenario({ threat: 'earthquake' }))
    expect(e.track).toEqual([])
    expect(e.etaHours).toBeNull()
  })
})

describe('DETERMINÍSTICO — o treino tem que poder ser repetido', () => {
  it('o mesmo cenário produz exatamente o mesmo evento', () => {
    /*
     * "Vamos fazer de novo, agora sem errar" é metade do valor de treinar. Um
     * furacão que muda de rota a cada execução torna isso impossível — e é o
     * motivo de não haver `Math.random()` neste módulo.
     */
    const a = stageEvents(cenario({ name: 'Ana' }))
    const b = stageEvents(cenario({ name: 'Ana' }))
    expect(a).toEqual(b)
  })

  it('mudar o rumo muda o lugar de onde ele vem', () => {
    const [norte] = stageEvents(cenario({ bearingDeg: 0 }))
    const [sul] = stageEvents(cenario({ bearingDeg: 180 }))
    expect(norte.center.lat).toBeGreaterThan(CASA.lat)
    expect(sul.center.lat).toBeLessThan(CASA.lat)
  })
})

describe('a pegada existe e é desenhável', () => {
  it('todo tipo produz polígono fechado com pontos suficientes', () => {
    for (const t of ['hurricane', 'earthquake', 'wildfire', 'fallout'] as const) {
      const [e] = stageEvents(cenario({ threat: t }))
      expect(e.footprint.length).toBeGreaterThan(10)
      expect(e.footprint[0]).toEqual(e.footprint[e.footprint.length - 1])
      for (const [lng, lat] of e.footprint) {
        expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true)
        expect(Math.abs(lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(lng)).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('POSIÇÃO ESCOLHIDA manda sobre o rumo (D-202)', () => {
  const ALVO = { lat: 26.9, lng: -80.9 }   // a noroeste da casa

  it('o evento nasce exatamente onde foi apontado', () => {
    const [e] = stageEvents(cenario({ at: ALVO }))
    expect(distanciaKm(e.center, ALVO)).toBeLessThan(0.5)
  })

  it('o rumo do formulário é IGNORADO quando há posição', () => {
    // Sudeste no formulário, mas o ponto está a noroeste: vale o ponto.
    const [e] = stageEvents(cenario({ at: ALVO, bearingDeg: 135 }))
    expect(e.center.lat).toBeGreaterThan(CASA.lat)
    expect(e.center.lng).toBeLessThan(CASA.lng)
  })

  it('a distância passa a ser MEDIDA, não calculada pelo relógio', () => {
    const [e] = stageEvents(cenario({ at: ALVO, arrivalHours: 24 }))
    expect(e.distanceKm).toBe(Math.round(distanciaKm(CASA, ALVO)))
  })

  it('e o ETA também — senão a tela diria 12h para algo a 5 km', () => {
    const perto = pontoDistante(CASA, 90, 44)   // 44 km = 2h a 22 km/h
    const [e] = stageEvents(cenario({ at: perto, arrivalHours: 12 }))
    expect(e.etaHours).toBeCloseTo(2, 0)
    expect(e.etaHours).not.toBe(12)
  })

  it('a rota continua terminando na casa', () => {
    const [e] = stageEvents(cenario({ at: ALVO }))
    expect(distanciaKm(CASA, e.track[e.track.length - 1])).toBeLessThan(1)
  })

  it('terremoto também obedece ao ponto', () => {
    const [e] = stageEvents(cenario({ threat: 'earthquake', at: ALVO }))
    expect(distanciaKm(e.center, ALVO)).toBeLessThan(0.5)
  })
})

describe('o CONE de incerteza, como o do NOAA (D-203)', () => {
  it('quem tem rumo tem cone; terremoto não', () => {
    for (const t of ['hurricane', 'wildfire', 'fallout'] as const) {
      expect(stageEvents(cenario({ threat: t }))[0].cone.length).toBeGreaterThan(10)
    }
    expect(stageEvents(cenario({ threat: 'earthquake' }))[0].cone).toEqual([])
  })

  it('ele ALARGA ao longo da rota — a incerteza cresce com o tempo', () => {
    /*
     * É a propriedade que define o cone. Um "cone" de largura constante seria
     * um corredor, e diria que se sabe o mesmo sobre daqui a 1h e daqui a 3
     * dias.
     */
    const cone = coneDeIncerteza(
      [CASA, pontoDistante(CASA, 0, 100), pontoDistante(CASA, 0, 200)],
      20, 90,
    )
    // Lado esquerdo do primeiro ponto contra o do último.
    const larguraInicio = distanciaKm(CASA, { lng: cone[0][0], lat: cone[0][1] })
    const larguraFim = distanciaKm(
      pontoDistante(CASA, 0, 200),
      { lng: cone[2][0], lat: cone[2][1] },
    )
    expect(larguraFim).toBeGreaterThan(larguraInicio * 2)
  })

  it('fecha, para poder ser preenchido', () => {
    const [e] = stageEvents(cenario())
    expect(e.cone[0]).toEqual(e.cone[e.cone.length - 1])
  })

  it('rota curta demais não inventa cone', () => {
    expect(coneDeIncerteza([CASA], 10, 50)).toEqual([])
    expect(coneDeIncerteza([], 10, 50)).toEqual([])
  })

  it('o cone é MAIS ESTREITO que a pegada perto da origem', () => {
    /*
     * A distinção que mata gente todo ano: o cone é onde o CENTRO passa, a
     * pegada é o que ele cobre. Quem mora "fora do cone" conclui que está a
     * salvo — e o campo de vento é muito maior.
     */
    const [e] = stageEvents(cenario({ severity: 4 }))
    const raioCone = distanciaKm(e.center, { lng: e.cone[0][0], lat: e.cone[0][1] })
    expect(raioCone).toBeLessThan(raioKm('hurricane', 4))
  })
})
