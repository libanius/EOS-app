'use client'

/**
 * O orbe do Pilot — UM só, em toda tela (D-136).
 *
 * Existiam dois. No dashboard, `.bar-orb`: 46px, pílula de vidro esfumaçado,
 * ícone de 22px, sempre verde. Em todas as outras telas, `.wv2-dock-orb`: 56px,
 * círculo com borda e fundo próprios, ícone de 24px, brilho de 8px, e a cor
 * mudando com o risco — verde, amarelo, laranja, vermelho.
 *
 * Duas aparências para o MESMO botão é o mesmo defeito que a casa tinha em duas
 * contagens: o app dizendo duas coisas sobre uma. E aqui custa mais caro que
 * feio — a pessoa aprende a reconhecer o Pilot numa tela e precisa aprender de
 * novo na seguinte. Num app que se abre sob estresse, reconhecer é metade do
 * trabalho.
 *
 * A aparência que ficou é a do dashboard, por decisão do dono. As consequências
 * de escolher essa e não a outra:
 *
 *   - O orbe NÃO muda de cor com o risco. O risco tem lugares próprios para
 *     ser dito — a faixa, o índice, os alertas. Um botão que muda de cor é um
 *     botão que a pessoa deixa de reconhecer justamente no dia em que mais
 *     precisa achá-lo.
 *   - O pulso no crítico fica, nos dois. Era a única coisa que as duas versões
 *     já faziam igual, e é a que se justifica: só o crítico pulsa, senão nada
 *     chama atenção.
 *
 * ONDE ele fica continua sendo de quem o usa: na barra de busca no dashboard,
 * flutuante e arrastável nas outras. O que não muda mais é O QUE ele é.
 */

import { forwardRef } from 'react'

/** A faísca do Pilot. Um desenho só — antes havia dois, de 22 e 24px. */
function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C10.1 8 11.5 6.6 12 3Z"
        fill="currentColor"
      />
      <path
        d="M17.8 14.5c.28 2 1.05 2.77 3.05 3.05-2 .28-2.77 1.05-3.05 3.05-.28-2-1.05-2.77-3.05-3.05 2-.28 2.77-1.05 3.05-3.05Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  )
}

export type PilotOrbProps = {
  onClick?: () => void
  label: string
  /** Estado de risco: só serve para o pulso do crítico, nunca para a cor. */
  riskState?: 'safe' | 'watch' | 'warning' | 'critical' | string
  /** Classe de quem posiciona — a barra ou o dock. */
  className?: string
  style?: React.CSSProperties
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void
  /**
   * Sem isto o arraste nunca termina quando o sistema cancela o ponteiro — um
   * gesto do aparelho, uma chamada entrando — e o orbe fica preso no estado
   * "arrastando", crescido e sem sombra, até a próxima navegação. Quase deixei
   * de fora ao extrair o componente.
   */
  onPointerCancel?: (e: React.PointerEvent<HTMLButtonElement>) => void
}

const PilotOrb = forwardRef<HTMLButtonElement, PilotOrbProps>(function PilotOrb(
  { onClick, label, riskState, className = '', style, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      // `wv2-fume` é o vidro esfumaçado do dashboard, e `pilot-orb` é o formato.
      // Quem chama acrescenta só a posição.
      className={`pilot-orb wv2-fume${className ? ` ${className}` : ''}`}
      aria-label={label}
      data-risk={riskState}
      onClick={onClick}
      style={style}
      {...resto}
    >
      <SparkIcon />
    </button>
  )
})

export default PilotOrb
