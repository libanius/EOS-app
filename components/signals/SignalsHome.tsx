'use client'

/**
 * `/sinais` — os Sinais da curadoria (SIGNAL-001 §3.3, Marco 1).
 *
 * Topo: a autonomia da casa e o próximo degrau, pela mesma conta do painel.
 * Abaixo: os Sinais publicados, por nível e depois data, com o "% pronto" no
 * degrau recomendado de cada um.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import './signals.css'
import { useLanguage } from '@/lib/i18n'
import { publishedSignals } from '@/lib/signals-content'
import { DEGREE_DAYS, nextDegree, protocolView, type Signal, type SignalLevel } from '@/lib/signals'
import { useSignalHouse } from './useSignalHouse'

const LEVEL_ORDER: SignalLevel[] = ['AGIR', 'PREPARAR', 'MONITORAR', 'CONTEXTO']

const T = {
  pt: {
    eyebrow: 'Sinais da curadoria EOS',
    autonomy: 'Autonomia da casa',
    days: 'dias',
    bearing: (d: number) => `Rumo até ${d === 3 ? '72 horas' : `${d} dias`}`,
    heroText: 'Quanto tempo a sua casa aguenta sozinha hoje, pelo recurso que acaba primeiro.',
    unknown: 'Conte quem mora na casa para ver a autonomia.',
    familyLink: 'Ir para Família',
    tipAutonomy: 'Dias de autonomia: o menor entre água (1 galão por pessoa por dia) e comida. É a mesma conta do painel e do Pilot.',
    level: { AGIR: 'Agir', PREPARAR: 'Preparar', MONITORAR: 'Monitorar', CONTEXTO: 'Contexto' },
    levelTip: {
      AGIR: 'Ação imediata recomendada.',
      PREPARAR: 'Vale agir agora, com calma e sem pânico.',
      MONITORAR: 'Acompanhe e mantenha o kit em dia.',
      CONTEXTO: 'Informação que ajuda a dar proporção ao assunto.',
    },
    ready: (p: number) => `${p}% pronto`,
    readyTip: 'Quanto do checklist do degrau recomendado a sua casa já cumpre.',
    open: 'Abrir protocolo',
    empty: 'Nenhum Sinal publicado agora. Quando a curadoria publicar, ele aparece aqui.',
    error: 'Não foi possível ler a sua casa agora. O conteúdo dos Sinais continua disponível.',
  },
  en: {
    eyebrow: 'EOS curated Signals',
    autonomy: 'Home autonomy',
    days: 'days',
    bearing: (d: number) => `Heading to ${d === 3 ? '72 hours' : `${d} days`}`,
    heroText: 'How long your home can hold on its own today, by whatever runs out first.',
    unknown: 'Count who lives in your home to see its autonomy.',
    familyLink: 'Go to Family',
    tipAutonomy: 'Days of autonomy: the lower of water (1 gallon per person per day) and food. Same math as the dashboard and Pilot.',
    level: { AGIR: 'Act', PREPARAR: 'Prepare', MONITORAR: 'Monitor', CONTEXTO: 'Context' },
    levelTip: {
      AGIR: 'Immediate action recommended.',
      PREPARAR: 'Worth acting now, calmly and without panic.',
      MONITORAR: 'Keep an eye on it and keep your kit current.',
      CONTEXTO: 'Information that puts the topic in proportion.',
    },
    ready: (p: number) => `${p}% ready`,
    readyTip: 'How much of the recommended level checklist your home already meets.',
    open: 'Open protocol',
    empty: 'No Signals published right now. When the curators publish one, it shows up here.',
    error: 'We could not read your home right now. Signal content is still available.',
  },
}

export function formatDate(iso: string, lang: 'pt' | 'en'): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SignalsHome() {
  const { language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'pt'
  const t = T[lang]
  const { loading, house, metKeys, notApplicableKeys } = useSignalHouse()

  const signals = useMemo(
    () =>
      [...publishedSignals()].sort(
        (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || b.occurredOn.localeCompare(a.occurredOn),
      ),
    [],
  )

  const first: Signal | undefined = signals[0]
  const autonomyView = house && first ? protocolView(first.protocol, first.protocol.recommendedDegree, house, metKeys, notApplicableKeys) : null
  const autonomy = autonomyView?.householdDays.autonomy ?? null
  const next = first ? nextDegree(first.protocol, autonomy) : 'D14'

  return (
    <main className="sg">
      <div className="sg-wrap">
        <section className="sg-hero" aria-live="polite">
          <span className="sg-label">{t.autonomy}</span>
          {loading ? (
            <div className="sg-big" aria-busy="true">··</div>
          ) : autonomy === null ? (
            <>
              <p>{t.unknown}</p>
              <Link className="sg-btn" href="/family">{t.familyLink}</Link>
            </>
          ) : (
            <>
              <div className="sg-big" tabIndex={0} data-tip={t.tipAutonomy}>
                {String(Math.floor(autonomy)).padStart(2, '0')}
                <small>{t.days}</small>
              </div>
              <div className="sg-bearing">{t.bearing(DEGREE_DAYS[next])}</div>
              <p>{t.heroText}</p>
            </>
          )}
          {!loading && !house && <p className="sg-note">{t.error}</p>}
        </section>

        <section className="sg-stack" aria-labelledby="sg-list-title">
          <h1 id="sg-list-title" className="sg-label mint">{t.eyebrow}</h1>
          {!signals.length && <div className="sg-empty">{t.empty}</div>}
          {signals.map(s => {
            const view = house ? protocolView(s.protocol, s.protocol.recommendedDegree, house, metKeys, notApplicableKeys) : null
            return (
              <Link key={s.slug} href={`/sinais/${s.slug}`} className="sg-card" aria-label={`${s.title[lang]} — ${t.open}`}>
                <div className="sg-stack" style={{ gap: 8 }}>
                  <div className="sg-row" style={{ gap: 10 }}>
                    <span className={`sg-lv ${s.level}`} data-tip={t.levelTip[s.level]}>{t.level[s.level]}</span>
                    <span className="sg-label" style={{ fontSize: 14, color: 'var(--sg-dim)' }}>{formatDate(s.occurredOn, lang)}</span>
                  </div>
                  <h3>{s.title[lang]}</h3>
                  <p className="sg-muted" style={{ fontSize: 15 }}>{s.summary[lang]}</p>
                  {view?.ready != null && (
                    <span className="sg-pct" data-tip={t.readyTip}>{t.ready(Math.round(view.ready * 100))}</span>
                  )}
                </div>
                <svg className="sg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )
          })}
        </section>
      </div>
    </main>
  )
}
