'use client'

/**
 * As seções do MUNDO (NAV-T07 / D-182).
 *
 * `docs/35` §5: MUNDO responde **o que está acontecendo ao meu redor**. Clima
 * era um DESTINO paralelo na barra global — alertas e condições em duas telas,
 * com duas linguagens visuais, e nenhuma das duas dona do assunto. É o achado
 * A3 do diagnóstico.
 *
 *   Mapa      onde estou, quem está perto, o índice de risco
 *   Alertas   alertas oficiais, condições, qualidade do ar, previsão
 *
 * ── Por que só dois chips ─────────────────────────────────────────────────
 *
 * O documento prevê quatro: `Mapa · Alertas · Abrigos · Camadas`. Abrigos hoje
 * é cartão dentro da folha e Camadas é uma folha sobre o mapa — dar endereço
 * aos dois é a fase 2, e nenhuma delas precisava vir junto com esta.
 *
 * Uma faixa de dois é honesta; uma faixa com dois chips MORTOS não seria.
 */

import { useLanguage } from '@/lib/i18n'
import DomainNav from './DomainNav'

const DESTINOS = [
  { href: '/dashboard', pt: 'Mapa', en: 'Map' },
  { href: '/dashboard/alertas', pt: 'Alertas', en: 'Alerts' },
]

export default function WorldNav() {
  const { language } = useLanguage()
  return (
    <DomainNav
      destinos={DESTINOS}
      rotulo={language === 'pt' ? 'Seções do Mundo' : 'World sections'}
    />
  )
}
