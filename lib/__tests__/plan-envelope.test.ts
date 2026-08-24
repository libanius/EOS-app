/**
 * O envelope do plano (PLAN-T06).
 *
 * O que estes testes protegem é a GEOMETRIA — a única coisa que continua
 * funcionando com a rede caída. Se a projeção errar, o desenho do plano offline
 * mostra a família num lugar onde ela não está, que é pior do que não mostrar.
 */

import { planEnvelope, projector, scaleBar } from '../plan-envelope'
import type { PlanRoute, PlanWaypoint } from '../family-plan'

const wp = (kind: PlanWaypoint['kind'], lat: number, lng: number): PlanWaypoint => ({
  kind,
  name: kind,
  lat,
  lng,
})

const HOME = wp('home', 26.31, -80.24)
const NORTH = wp('rendezvous_2', 26.35, -80.24)
const EAST = wp('rendezvous_1', 26.31, -80.19)

describe('planEnvelope', () => {
  it('devolve null quando não há ponto nenhum', () => {
    expect(planEnvelope([], [])).toBeNull()
  })

  it('contém todos os pontos, com margem em volta', () => {
    const env = planEnvelope([HOME, NORTH, EAST])!
    expect(env.bounds.south).toBeLessThan(26.31)
    expect(env.bounds.north).toBeGreaterThan(26.35)
    expect(env.bounds.west).toBeLessThan(-80.24)
    expect(env.bounds.east).toBeGreaterThan(-80.19)
  })

  it('inclui os vértices das rotas, não só os lugares', () => {
    // Uma rota que sai da caixa dos waypoints precisa esticar o envelope: seguir
    // um traçado que sai da tela é o mesmo que não ter o traçado.
    const rota: PlanRoute = {
      label: 'desvio',
      geometry: { type: 'LineString', coordinates: [[-80.24, 26.31], [-80.40, 26.31]] },
    }
    const semRota = planEnvelope([HOME])!
    const comRota = planEnvelope([HOME], [rota])!
    expect(comRota.bounds.west).toBeLessThan(semRota.bounds.west)
    expect(comRota.bounds.west).toBeLessThan(-80.4)
  })

  it('dá margem mínima a um plano de ponto único, em vez de uma caixa de área zero', () => {
    const env = planEnvelope([HOME])!
    expect(env.bounds.east - env.bounds.west).toBeGreaterThan(0)
    expect(env.spanKm).toBeGreaterThan(0.5)
    expect(env.spanKm).toBeLessThan(3)
  })

  it('corrige a longitude pelo cosseno da latitude', () => {
    // Em 26°N um grau de longitude vale ~100 km, não os 111,32 km do equador.
    // Ignorar isso superestimaria a área do plano em ~11%. A conta é feita sobre
    // os bounds JÁ com margem — comparar com o span cru foi o erro da primeira
    // versão deste teste.
    const env = planEnvelope([wp('home', 26.0, -80.0), wp('work', 26.0, -79.9)])!
    const larguraGraus = env.bounds.east - env.bounds.west
    const alturaKm = (env.bounds.north - env.bounds.south) * 111.32
    const kmPorGrauLng = env.areaKm2 / alturaKm / larguraGraus
    expect(kmPorGrauLng).toBeCloseTo(111.32 * Math.cos((26 * Math.PI) / 180), 1)
    expect(kmPorGrauLng).toBeLessThan(111.32)
  })
})

describe('projector', () => {
  const env = planEnvelope([HOME, NORTH, EAST])!
  const project = projector(env, 400, 400)

  it('põe o norte em cima', () => {
    const [, yNorte] = project(NORTH.lng, NORTH.lat)
    const [, yCasa] = project(HOME.lng, HOME.lat)
    expect(yNorte).toBeLessThan(yCasa)
  })

  it('põe o leste à direita', () => {
    const [xLeste] = project(EAST.lng, EAST.lat)
    const [xCasa] = project(HOME.lng, HOME.lat)
    expect(xLeste).toBeGreaterThan(xCasa)
  })

  it('mantém tudo dentro da tela', () => {
    for (const p of [HOME, NORTH, EAST]) {
      const [x, y] = project(p.lng, p.lat)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(400)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(400)
    }
  })

  it('usa a MESMA escala nos dois eixos', () => {
    // Esticar um eixo deformaria o traçado que a família desenhou, e o formato
    // do caminho é parte da informação: é assim que se reconhece a rua.
    const quadrado = planEnvelope([wp('home', 26.0, -80.0), wp('work', 26.02, -79.98)])!
    const p = projector(quadrado, 600, 300)
    const [x1, y1] = p(-80.0, 26.0)
    const [x2, y2] = p(-79.98, 26.02)
    const razao = Math.abs(x2 - x1) / Math.abs(y2 - y1)
    // 0,02° de longitude em 26°N encolhe pelo cosseno (~0,9), então a razão fica
    // perto de 0,9 e não de 1 — o que confirma que a correção é aplicada e a
    // escala não é esticada para preencher a tela larga.
    expect(razao).toBeGreaterThan(0.85)
    expect(razao).toBeLessThan(0.95)
  })
})

describe('scaleBar', () => {
  it('escolhe um comprimento redondo que cabe na tela', () => {
    const env = planEnvelope([HOME, NORTH, EAST])!
    const bar = scaleBar(env, 400)
    expect([0.1, 0.2, 0.5, 1, 2, 5, 10]).toContain(bar.km)
    expect(bar.pixels).toBeGreaterThan(10)
    expect(bar.pixels).toBeLessThan(400)
    expect(bar.label).toMatch(/km|m$/)
  })

  it('usa metros quando o plano é de quarteirão', () => {
    const env = planEnvelope([wp('home', 26.31, -80.24), wp('rendezvous_1', 26.312, -80.24)])!
    expect(scaleBar(env, 400).label).toMatch(/m$/)
  })
})
