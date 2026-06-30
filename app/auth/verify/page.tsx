import Link from 'next/link'
import { cookies } from 'next/headers'

interface Props {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyPage({ searchParams }: Props) {
  const { email } = await searchParams
  const isPt = (await cookies()).get('eos-language')?.value !== 'en'

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Icon */}
        <div style={styles.iconWrap}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ac)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <h1 style={styles.title}>{isPt ? 'Verifique seu e-mail' : 'Check your email'}</h1>

        <p style={styles.body}>
          {isPt ? 'Enviamos um link de confirmação para ' : 'We sent a confirmation link to '}
          {email ? (
            <strong style={{ color: 'var(--tx)' }}>{email}</strong>
          ) : (
            (isPt ? 'seu e-mail' : 'your email')
          )}
          {isPt ? '. Clique no link para acessar o EOS.' : '. Click the link to access EOS.'}
        </p>

        <p style={styles.hint}>
          {isPt ? 'Não recebeu? Verifique a pasta de spam.' : 'Did not receive it? Check your spam folder.'}
        </p>

        <Link href="/auth/login" style={styles.backLink}>
          {isPt ? '← Voltar ao login' : '← Back to sign in'}
        </Link>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--sf)',
    border: '1px solid var(--bd)',
    borderRadius: 20,
    padding: '40px 28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    textAlign: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'rgba(0,229,160,0.08)',
    border: '1px solid rgba(0,229,160,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  body: {
    fontSize: 14,
    color: 'var(--mu)',
    lineHeight: 1.6,
  },
  hint: {
    fontSize: 12,
    color: 'var(--mu)',
    opacity: 0.7,
    marginTop: -4,
  },
  backLink: {
    fontSize: 13,
    color: 'var(--ac)',
    textDecoration: 'none',
    fontWeight: 600,
    marginTop: 8,
  },
}
