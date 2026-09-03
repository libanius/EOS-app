/*
 * Quem o motor de alerta enxerga (2026-09-03).
 *
 * A varredura lia SÓ `last_location_*`, o ponto de GPS ao vivo, e só enquanto
 * ele fosse recente. Essa coluna é escrita pelo `LocationReporter`, que só roda
 * com o app ABERTO em primeiro plano e a permissão já concedida — então o
 * motor de push avisava exatamente quem tinha acabado de olhar o app, e mais
 * ninguém. Medido em produção: `locations: 1, usersConsidered: 1` na mesma
 * passada em que o cron de clima, que usa o endereço, checou 12 perfis.
 *
 * O que estes testes travam é a regra de escolha do ponto, não a consulta: o
 * endereço é reserva do GPS fresco, e um GPS velho não vale como endereço.
 */

import { scanLocationFor } from '@/lib/hazards/scan'
import { HAZARD_CONFIG } from '@/lib/hazards/config'

const AGORA = Date.parse('2026-09-03T12:00:00Z')
const DIA_MS = 86_400_000
const JANELA_DIAS = HAZARD_CONFIG.alerting.locationMaxAgeDays

// Parkland, FL — a casa da família, e o lugar onde a chuva não gerou aviso.
const CASA = { location_lat: 26.31, location_lng: -80.24 }

function haDias(dias: number) {
  return new Date(AGORA - dias * DIA_MS).toISOString()
}

describe('scanLocationFor', () => {
  it('usa o GPS ao vivo quando ele é recente', () => {
    const ponto = scanLocationFor(
      { ...CASA, last_location_lat: 25.77, last_location_lng: -80.19, last_location_at: haDias(1) },
      AGORA,
    )
    expect(ponto).toEqual({ lat: 25.77, lng: -80.19, source: 'live' })
  })

  it('cai para o endereço quando o GPS ao vivo está velho', () => {
    const ponto = scanLocationFor(
      {
        ...CASA,
        last_location_lat: 25.77,
        last_location_lng: -80.19,
        last_location_at: haDias(JANELA_DIAS + 1),
      },
      AGORA,
    )
    expect(ponto).toEqual({ lat: 26.31, lng: -80.24, source: 'home' })
  })

  it('cai para o endereço quando nunca houve GPS ao vivo — o caso da maioria', () => {
    expect(scanLocationFor({ ...CASA }, AGORA)).toEqual({ lat: 26.31, lng: -80.24, source: 'home' })
  })

  it('cai para o endereço quando há coordenada ao vivo sem carimbo de tempo', () => {
    const ponto = scanLocationFor(
      { ...CASA, last_location_lat: 25.77, last_location_lng: -80.19, last_location_at: null },
      AGORA,
    )
    expect(ponto?.source).toBe('home')
  })

  it('não inventa um ponto a partir de GPS velho sem endereço', () => {
    const ponto = scanLocationFor(
      {
        location_lat: null,
        location_lng: null,
        last_location_lat: 25.77,
        last_location_lng: -80.19,
        last_location_at: haDias(JANELA_DIAS + 1),
      },
      AGORA,
    )
    expect(ponto).toBeNull()
  })

  it('devolve nulo quando o perfil não tem nenhuma coordenada', () => {
    expect(scanLocationFor({}, AGORA)).toBeNull()
  })

  it('ignora coordenada não finita em vez de scanear NaN', () => {
    const ponto = scanLocationFor(
      { location_lat: Number.NaN, location_lng: -80.24, last_location_lat: null, last_location_lng: null },
      AGORA,
    )
    expect(ponto).toBeNull()
  })

  it('a borda da janela ainda conta como ao vivo', () => {
    const ponto = scanLocationFor(
      {
        ...CASA,
        last_location_lat: 25.77,
        last_location_lng: -80.19,
        last_location_at: new Date(AGORA - JANELA_DIAS * DIA_MS).toISOString(),
      },
      AGORA,
    )
    expect(ponto?.source).toBe('live')
  })
})
