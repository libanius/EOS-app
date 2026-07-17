'use client'

/**
 * Procedural cartography layer — contour lines drawn in the CURRENT risk
 * state color (they re-tint with the 600ms state shift, since the stroke
 * reads var(--e2-state)). Sits between the fog plate and the content.
 */
export default function CartoLayer() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none', opacity: 0.6,
      }}
    >
      <g
        fill="none"
        stroke="var(--e2-state)"
        strokeWidth="1"
        style={{ transition: 'stroke 600ms cubic-bezier(.2,.8,.2,1)' }}
      >
        <path opacity=".16" d="M-40 620C120 560 180 420 340 400S620 470 780 420 1040 260 1240 300" />
        <path opacity=".22" d="M-40 680C140 620 220 480 380 460S640 530 800 480 1060 330 1240 370" />
        <path opacity=".14" d="M-40 740C160 690 260 550 420 525S660 590 820 545 1080 410 1240 440" />
        <path opacity=".10" d="M-40 190C160 240 300 140 460 120S720 180 880 150 1090 60 1240 110" />
        <path opacity=".16" d="M-40 130C180 180 320 80 480 60S740 120 900 90 1100 10 1240 55" />
        <path opacity=".08" d="M-40 260C170 300 330 210 490 190S750 250 910 220 1110 130 1240 175" />
        {/* closed elevation rings, like a peak on the chart */}
        <ellipse opacity=".14" cx="950" cy="620" rx="150" ry="64" />
        <ellipse opacity=".20" cx="950" cy="620" rx="104" ry="42" />
        <ellipse opacity=".26" cx="950" cy="620" rx="60" ry="23" />
        <ellipse opacity=".12" cx="180" cy="150" rx="130" ry="52" />
        <ellipse opacity=".18" cx="180" cy="150" rx="84" ry="32" />
        {/* hatch field */}
        <g opacity=".12">
          <path d="M90 460l26 26M150 450l26 26M215 445l26 26M285 450l26 26M355 460l26 26" />
        </g>
      </g>
    </svg>
  )
}
