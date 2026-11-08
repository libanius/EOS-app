/**
 * D-237 — versão no rodapé.
 *
 * Mostra a versão do produto (package.json) e o commit que está no ar.
 * Quando alguém relata um problema, o rodapé diz exatamente qual build ele
 * tinha na mão. Fora da Vercel o commit não existe e só a versão aparece.
 */
export function appVersionLabel(): string {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT || ''
  return commit ? `EOS v${version} · ${commit}` : `EOS v${version}`
}

export default function AppVersion({ style }: { style?: React.CSSProperties }) {
  return (
    <p
      data-testid="app-version"
      style={{
        fontFamily: "'DM Mono', ui-monospace, 'SF Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.12em',
        color: 'var(--mu)',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {appVersionLabel()}
    </p>
  )
}
