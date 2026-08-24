import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Congelamento visto em uso em 2026-08-19, em Chrome e Safari, inclusive em
 * aba anônima: ligar o Vento travava a página e o navegador oferecia "aguardar
 * ou sair". Pior no HÍBRIDO, que é a única base que liga o terreno 3D — e com
 * terreno o `unproject` do MapLibre vira raycast contra a malha de elevação.
 *
 * A causa era `renderScalarField` amostrar UM PONTO POR PIXEL do canvas
 * (~705 mil num laptop) para desenhar um campo cuja fonte tem 625 pontos.
 */
describe('campo escalar do vento não amostra por pixel', () => {
  const source = readFileSync(join(process.cwd(), 'lib/world/WindParticleLayer.ts'), 'utf8')

  it('desprojeta na rede de amostragem, não em cada pixel', () => {
    // O laço antigo caminhava de pixel em pixel sobre width/height.
    expect(source).not.toContain('for (let x = 0; x < width; x += 1)')
    expect(source).not.toContain('for (let y = 0; y < height; y += 1)')

    expect(source).toContain('scalarSampleStep')
    expect(source).toContain('const cols = Math.max(1, Math.ceil(width / step))')
    expect(source).toContain('const rows = Math.max(1, Math.ceil(height / step))')
  })

  it('mantém o unproject real por amostra, sem interpolar entre cantos', () => {
    /*
     * Com pitch de 56° a projeção não é afim. Interpolar lng/lat entre os
     * cantos da tela seria mais rápido e colocaria o vento no lugar errado
     * perto do horizonte — falha pior que a lentidão que ela resolveria.
     */
    expect(source).toContain('this.map.unproject([px, py])')
  })

  it('amplia com suavização, senão o campo vira bloco', () => {
    expect(source).toContain('imageSmoothingEnabled = true')
    expect(source).toContain('ctx.drawImage(scratch, 0, 0, cols, rows, 0, 0, width, height)')
  })

  it('o passo padrão corta a conta em pelo menos 32x', () => {
    const step = Number(/scalarSampleStep: (\d+)/.exec(source)?.[1])
    expect(Number.isFinite(step)).toBe(true)
    expect(step * step).toBeGreaterThanOrEqual(32)
  })
})

/**
 * D-221 — relatos do dono em uso: (1) o vento voltava ligado ao reabrir o app,
 * e (2) o menu de controles do vento "às vezes aparece, na maioria das vezes
 * não".
 */
describe('D-221 — vento começa desligado e o controle não some sozinho', () => {
  const worldV2 = readFileSync(join(process.cwd(), 'components/world-v2/WorldV2.tsx'), 'utf8')
  const worldMap = readFileSync(join(process.cwd(), 'components/world-dashboard/WorldMap.tsx'), 'utf8')

  it('não restaura o vento a partir do armazenamento', () => {
    expect(worldV2).not.toContain('storedLayersRef.current?.wind')
    // a montagem continua forçando desligado
    expect(worldV2).toContain('setLayers(current => ({ ...current, ...parsed, wind: false }))')
  })

  it('plano desconhecido não manda o assinante para o muro de pagamento', () => {
    const toggle = worldV2.slice(worldV2.indexOf('const toggleWind ='))
    const body = toggle.slice(0, toggle.indexOf('setLayers('))
    // a guarda de plano indefinido vem ANTES do redirecionamento
    expect(body.indexOf('if (plan === null) return')).toBeGreaterThan(-1)
    expect(body.indexOf('if (plan === null) return')).toBeLessThan(body.indexOf("'/mais'"))
  })

  it('o controle nasce com a camada, não com a chegada da grade', () => {
    expect(worldMap).not.toContain('if (windForMap?.readings.length) setWindControlsVisible(true)')
  })

  it('o que esconde no arrasto devolve no fim do gesto', () => {
    expect(worldMap).toContain("map.on('moveend', settle)")
    expect(worldMap).toContain("map.on('zoomend', settle)")
    expect(worldMap).toContain("map.off('moveend', settle)")
    expect(worldMap).toContain("map.off('zoomend', settle)")
  })
})
