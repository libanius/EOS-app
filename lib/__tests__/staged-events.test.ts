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
