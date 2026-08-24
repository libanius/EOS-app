'use client'

/**
 * As seções de MAIS (NAV-T08 / D-184).
 *
 * MAIS nasceu em D-180 como página única — não havia sub-rota, e faixa com um
 * chip só é enfeite. Com o Treino descendo para `/mais/treino`, passou a haver
 * duas, e a faixa vira a mesma coisa que Preparação, Família e MUNDO já têm.
 *
 *   Mais     conta, plano e cobrança, idioma, notificações, admin
 *   Treino   a cabine do Simulador
 *
 * `docs/35` prevê ainda `Conta · Plano e cobrança · Notificações · Idioma`
 * como sub-rotas próprias. Elas continuam sendo seções de uma página só; virar
 * rota é trabalho próprio e nada depende dele.
 */

import { useLanguage } from '@/lib/i18n'
import DomainNav from './DomainNav'

const DESTINOS = [
  { href: '/mais', pt: 'Mais', en: 'More' },
  { href: '/mais/treino', pt: 'Treino', en: 'Drill' },
]

export default function MaisNav() {
  const { language } = useLanguage()
  return (
    <DomainNav
      destinos={DESTINOS}
      rotulo={language === 'pt' ? 'Seções de Mais' : 'More sections'}
      tone="drill"
    />
  )
}
