'use client'

/**
 * As seções da Preparação (PREP-T07 / D-164, generalizada em NAV-T05).
 *
 * O eixo é **o que eu tenho × o que falta** — Holding × Requirement. Não é
 * "Em casa × Mochilas", como `docs/36` chegou a propor: aquilo colocava
 * localização e kit, que são dimensões independentes, no mesmo eixo — o mesmo
 * defeito de `checklists.kit_type`, reproduzido na navegação (`docs/37` §29.2).
 * Localização e kit são FILTROS dentro de cada superfície.
 *
 * `Plano` e `Aprender` entraram em NAV-T04. Com cinco destinos a faixa estoura
 * 360px, então ela rola e o chip ativo é trazido para a vista.
 */

import { useLanguage } from '@/lib/i18n'
import DomainNav from './DomainNav'

const DESTINOS = [
  { href: '/preparedness', pt: 'Visão', en: 'Overview' },
  { href: '/preparedness/o-que-tenho', pt: 'O que tenho', en: 'What I have' },
  { href: '/preparedness/o-que-falta', pt: 'O que falta', en: 'What’s missing' },
  { href: '/preparedness/plano', pt: 'Plano', en: 'Plan' },
  { href: '/preparedness/aprender', pt: 'Aprender', en: 'Learn' },
]

export default function PreparednessNav() {
  const { language } = useLanguage()
  return (
    <DomainNav
      destinos={DESTINOS}
      rotulo={language === 'pt' ? 'Seções da Preparação' : 'Preparedness sections'}
    />
  )
}
