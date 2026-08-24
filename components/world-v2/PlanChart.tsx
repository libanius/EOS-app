'use client'

/**
 * PlanChart — a carta do plano, desenhada em SVG (PLAN-T06 / doc 18 §10, §13).
 *
 * O critério de aceitação do plano é o avião no chão: sem rede, sem GPS, a
 * família precisa **seguir as rotas desenhadas sobre um mapa**. Um mapa de tiles
 * não atende isso — tile é arquivo de servidor, e é justamente o servidor que
 * sumiu.
 *
 * Então a carta não é um mapa: é o **desenho do próprio plano**. Casa, pontos de
 * encontro numerados pela escada, lugares importantes e o traçado que a família
 * fez, projetados a partir das coordenadas que já estão no aparelho. Não depende
 * de rede, de chave de API, de WebGL nem de biblioteca de mapa.
 *
 * O que ela deliberadamente NÃO faz é fingir ser um mapa: sem ruas desenhadas,
 * sem prédios, sem rótulo de bairro. Tem norte, escala e as distâncias reais
 * escritas. Uma carta que insinuasse detalhe que não tem seria pior que nenhuma
 * — a família confiaria num contorno inventado.
 */

import { useEffect, useRef, useState } from 'react'
import { planEnvelope, projector, scaleBar } from '@/lib/plan-envelope'
import { distanceKm } from '@/lib/world/shelters'
import { formatDistance, walkingMinutes } from '@/lib/world/navigation'
import { RENDEZVOUS, type PlanRoute, type PlanWaypoint } from '@/lib/family-plan'

const RUNG = ['1', '2', '3']

function rungOf(kind: string): string | null {
  const index = RENDEZVOUS.findIndex(r => r.kind === kind)
  return index >= 0 ? RUNG[index] : null
}

export default function PlanChart({
  waypoints,
  routes,
  pt,
}: {
  waypoints: PlanWaypoint[]
  routes: PlanRoute[]
  pt: boolean
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // A carta acompanha o container: é a mesma no telefone e no desktop, e o
  // desenho é recalculado em vez de ser esticado.
  useEffect(() => {
    const element = holder.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (box) setSize({ width: box.width, height: Math.max(240, Math.min(box.width * 0.8, 420)) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const envelope = planEnvelope(waypoints, routes)
  const ready = envelope && size.width > 0

  const project = ready ? projector(envelope, size.width, size.height) : null
  const bar = ready ? scaleBar(envelope, size.width) : null
  const home = waypoints.find(w => w.kind === 'home') ?? null

  return (
    <div ref={holder} className="wv2-chart">
      {!ready ? (
        <p className="t-foot ink-3">
          {pt
            ? 'A carta aparece quando o plano tiver ao menos um lugar.'
            : 'The chart appears once the plan has at least one place.'}
        </p>
      ) : (
        <>
          <svg
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={
              pt
                ? `Carta do plano: ${waypoints.length} lugares e ${routes.length} rota(s), abrangendo ${envelope.spanKm.toFixed(1)} km`
                : `Plan chart: ${waypoints.length} places and ${routes.length} route(s), spanning ${envelope.spanKm.toFixed(1)} km`
            }
          >
            {/* Rotas primeiro: os pinos ficam por cima, nunca escondidos. */}
            {routes.map((route, i) => {
              const coords = (route.geometry as { coordinates?: Array<[number, number]> } | undefined)?.coordinates
              if (!Array.isArray(coords) || coords.length < 2) return null
              const d = coords.map(([lng, lat], j) => `${j ? 'L' : 'M'}${project!(lng, lat).join(' ')}`).join(' ')
              return (
                <g key={i}>
                  <path d={d} className="chart-route-glow" />
                  <path
                    d={d}
                    className="chart-route"
                    // Rota a pé é tracejada: a diferença entre andar e dirigir
                    // muda o plano inteiro e não pode depender só da legenda.
                    strokeDasharray={route.mode === 'foot' ? '7 6' : undefined}
                  />
                </g>
              )
            })}

            {waypoints.map((w, i) => {
              const [x, y] = project!(w.lng, w.lat)
              const rung = rungOf(w.kind)
              const isHome = w.kind === 'home'
              return (
                <g key={i} className={`chart-pin${isHome ? ' home' : ''}${rung ? ' rendezvous' : ''}`}>
                  {isHome ? (
                    <path d={`M${x} ${y - 11} L${x + 9} ${y - 2} L${x + 9} ${y + 9} L${x - 9} ${y + 9} L${x - 9} ${y - 2} Z`} />
                  ) : (
                    <circle cx={x} cy={y} r={rung ? 10 : 6} />
                  )}
                  {rung && <text x={x} y={y + 4} textAnchor="middle">{rung}</text>}
                  <text x={x} y={y - 16} textAnchor="middle" className="chart-label">{w.name}</text>
                </g>
              )
            })}

            {/* Norte e escala: sem os dois, um desenho sem ruas não se lê. */}
            <g className="chart-north" transform={`translate(${size.width - 26} 24)`}>
              <path d="M0 -12 L5 6 L0 2 L-5 6 Z" />
              <text y="20" textAnchor="middle">N</text>
            </g>
            <g className="chart-scale" transform={`translate(20 ${size.height - 20})`}>
              <line x1="0" y1="0" x2={bar!.pixels} y2="0" />
              <line x1="0" y1="-4" x2="0" y2="4" />
              <line x1={bar!.pixels} y1="-4" x2={bar!.pixels} y2="4" />
              <text x={bar!.pixels / 2} y="-8" textAnchor="middle">{bar!.label}</text>
            </g>
          </svg>

          {/* O texto abaixo é o que sobrevive a qualquer falha de renderização —
              e é também o equivalente acessível da carta. */}
          <ul className="wv2-chart-legend">
            {waypoints
              .filter(w => w.kind !== 'home')
              .map((w, i) => {
                const km = home ? distanceKm(home, w) : null
                return (
                  <li key={i} className="t-foot ink-2">
                    <strong>{rungOf(w.kind) ? `${rungOf(w.kind)}. ` : ''}{w.name}</strong>
                    {km !== null && (
                      <span className="ink-3">
                        {' '}· {formatDistance(km, pt)} · ~{walkingMinutes(km)} min {pt ? 'a pé' : 'on foot'}
                      </span>
                    )}
                  </li>
                )
              })}
          </ul>
        </>
      )}
    </div>
  )
}
