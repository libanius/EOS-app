'use client'

/**
 * A faixa de seções de um domínio (NAV-T05 / D-178).
 *
 * Extraída de `PreparednessNav`, que a inaugurou em PREP-T07. Ao criar a
 * segunda — Família — a escolha era copiar ou generalizar, e copiar já custou
 * caro cinco vezes nesta frente: a régua da água chegou a existir em cinco
 * lugares, e a divergência entre duas cópias produziu o defeito em que o Pilot
 * afirmava autonomia zero.
 *
 * ── Por que chips com ROTA, e não abas ─────────────────────────────────────
 *
 * Cada subtópico é um endereço de verdade. O Pilot precisa poder apontar para
 * eles; o manifesto do PWA tem atalhos; convites e push chegam em rotas
 * profundas. Estado de navegação que só existe em memória não recebe nada disso.
 *
 * E por serem rotas, a semântica correta é `<nav>` + `<a>` + `aria-current`.
 * **Não `role="tab"`**: sem painéis em memória, um `tablist` anunciaria ao
 * leitor de tela uma troca de aba que na verdade é navegação — mentir para a
 * tecnologia assistiva é pior do que não usar o padrão.
 *
 * ── Duas rotas para o mesmo lugar, de propósito ────────────────────────────
 *
 * Os chips ficam no topo, fora do arco do polegar. Na primeira visita e no uso
 * de uma mão, o caminho principal são os cartões dentro da rolagem. Os chips
 * são o caminho de repetição, para quem já sabe onde vai.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useLanguage } from '@/lib/i18n'

type Destino = { href: string; pt: string; en: string }

/**
 * O eixo é **o que eu tenho × o que falta** — Holding × Requirement.
 *
 * Não é "Em casa × Mochilas", como `docs/36` chegou a propor: aquilo colocava
 * localização e kit, que são dimensões independentes, no mesmo eixo — o mesmo
 * defeito de `checklists.kit_type`, reproduzido na navegação (`docs/37` §29.2).
 * Localização e kit viram FILTROS dentro de cada superfície.
 *
 * `Plano` e `Aprender` entraram em NAV-T04 (D-177). Com cinco destinos a faixa
 * ESTOURA 360px — por isso ela rola, e por isso o chip ativo é trazido para a
 * vista no `useEffect` abaixo. Uma navegação cujo item atual está escondido é
 * pior que navegação nenhuma: a pessoa perde a única pista de onde está.
 */
export type DomainNavProps = {
  destinos: Destino[]
  /** O que o leitor de tela anuncia. Ex.: "Seções da Preparação". */
  rotulo: string
}

export default function DomainNav({ destinos, rotulo }: DomainNavProps) {
  const pathname = usePathname()
  const { language } = useLanguage()
  const faixa = useRef<HTMLDivElement>(null)

  /*
   * O chip ativo nunca pode nascer fora da vista. Com cinco destinos a faixa
   * estoura 360px, e uma navegação cujo item atual está escondido é pior que
   * navegação nenhuma — a pessoa perde a única pista de onde está.
   */
  useEffect(() => {
    const ativo = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]')
    ativo?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <nav ref={faixa} aria-label={rotulo} style={S.faixa}>
      {destinos.map(destino => {
        // Igualdade exata: `/preparedness` é prefixo de todas as outras, e um
        // `startsWith` deixaria "Visão" aceso em todas as sub-rotas.
        const ativo = pathname === destino.href
        return (
          <Link
            key={destino.href}
            href={destino.href}
            aria-current={ativo ? 'page' : undefined}
            style={{ ...S.chip, ...(ativo ? S.chipAtivo : null) }}
          >
            {language === 'pt' ? destino.pt : destino.en}
          </Link>
        )
      })}
    </nav>
  )
}

const S: Record<string, React.CSSProperties> = {
  faixa: {
    display: 'flex',
    gap: 8,
    // Rolagem horizontal em vez de quebra de linha: a faixa cresce para cinco
    // destinos, e duas fileiras de chips confundem mais do que uma que rola.
    overflowX: 'auto',
    scrollbarWidth: 'none',
    // Grudada no topo — trocar de seção depois de rolar é o movimento mais
    // comum, e não pode exigir voltar ao começo da página.
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg)',
    padding: '10px 0 12px',
    marginBottom: 4,
  },
  chip: {
    flexShrink: 0,
    // 44px de altura mínima no toque: `wv2-chip` é dimensionado para linha de
    // texto, e um alvo de 28px falha em qualquer diretriz de acessibilidade.
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: '1px solid var(--bd)',
    background: 'var(--sf)',
    color: 'var(--mu)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  chipAtivo: {
    // Cor E peso — nunca só cor. O verde de acento já tem dono neste app
    // (D-131), e daltonismo não pode custar a noção de onde se está.
    borderColor: 'rgba(0,229,160,0.45)',
    background: 'rgba(0,229,160,0.12)',
    color: 'var(--tx)',
    fontWeight: 800,
  },
}
