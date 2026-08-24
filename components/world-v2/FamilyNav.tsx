'use client'

/**
 * As seções da Família (NAV-T05 / D-178).
 *
 * `docs/35` §5: Família responde **quem é meu e onde está**. Círculos e Ficha
 * eram destinos soltos — Círculos ocupava um slot da barra global e a Ficha
 * vivia atrás do ☰ —, mas os dois são o mesmo assunto para o usuário:
 *
 *   Status    quem está onde, agora
 *   A casa    quem mora aqui — pessoas, dependentes, endereço
 *   Ficha     a ficha médica e o QR para socorristas
 *   Círculos  com quem eu compartilho, e o que
 *
 * `useCircleFamily.ts` já provava o parentesco: o código funde círculo e
 * família para desenhar as pessoas no mapa. A navegação só passou a concordar.
 */

import { useLanguage } from '@/lib/i18n'
import DomainNav from './DomainNav'

const DESTINOS = [
  { href: '/family', pt: 'Status', en: 'Status' },
  { href: '/family/cadastro', pt: 'A casa', en: 'Household' },
  { href: '/family/ficha', pt: 'Ficha', en: 'Record' },
  { href: '/family/circulos', pt: 'Círculos', en: 'Circles' },
]

export default function FamilyNav() {
  const { language } = useLanguage()
  return (
    <DomainNav
      destinos={DESTINOS}
      rotulo={language === 'pt' ? 'Seções da Família' : 'Family sections'}
    />
  )
}
