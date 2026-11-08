import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { signalBySlug } from '@/lib/signals-content'
import { getSiteUrl } from '@/lib/site-url'
import { shareLanguage, signalSharePath } from '@/lib/signal-sharing'
import SignalShareButtons from '@/components/signals/SignalShareButtons'
import './share.css'

type Props = { params: { slug: string }; searchParams: { lang?: string } }
export function generateMetadata({ params, searchParams }: Props): Metadata {
  const signal = signalBySlug(params.slug)
  if (!signal) return { title: 'EOS — Signal not found', robots: { index: false } }
  const lang = shareLanguage(searchParams.lang)
  const url = `${getSiteUrl()}${signalSharePath(signal.slug, lang)}`
  const image = signal.slug === 'fortress' ? `${getSiteUrl()}/signals/fortress-share.jpg` : `${getSiteUrl()}/sinais/${signal.slug}/compartilhar/capa`
  return { metadataBase: new URL(getSiteUrl()), title: `EOS · ${signal.title[lang]}`, description: signal.summary[lang], alternates: { canonical: url },
    openGraph: { title: `EOS · ${signal.title[lang]}`, description: signal.summary[lang], url, type: 'article', locale: lang === 'pt' ? 'pt_BR' : 'en_US', images: [{ url: image, width: 1200, height: 630, alt: `EOS · ${signal.title[lang]}` }] },
    twitter: { card: 'summary_large_image', title: `EOS · ${signal.title[lang]}`, description: signal.summary[lang], images: [image] } }
}
export default function PublicSignal({ params, searchParams }: Props) {
  const signal = signalBySlug(params.slug)
  if (!signal) notFound()
  const lang = shareLanguage(searchParams.lang), pt = lang === 'pt'
  const destination = `/sinais/${signal.slug}`
  const login = `/auth/login?redirectTo=${encodeURIComponent(destination)}`
  return <main className="signal-public" lang={pt ? 'pt-BR' : 'en'}>
    <header><Link href="/">EOS <span>Emergency Operating System</span></Link><nav aria-label="Language"><Link href={signalSharePath(signal.slug, 'pt')} aria-current={pt ? 'page' : undefined}>PT</Link><Link href={signalSharePath(signal.slug, 'en')} aria-current={!pt ? 'page' : undefined}>EN</Link></nav></header>
    <article>
      <p className="eyebrow">{pt ? 'SINAIS · CONTEXTO PARA SE PREPARAR' : 'SIGNALS · CONTEXT TO PREPARE'}</p>
      {signal.slug === 'fortress' && <figure><Image priority src="/signals/fortress-share.jpg" width={1200} height={630} alt={pt ? 'EOS FORTRESS: equipamentos organizados para preparação familiar' : 'EOS FORTRESS: organized family preparedness supplies'} /><figcaption>{pt ? 'Imagem promocional ilustrativa do EOS.' : 'Illustrative EOS promotional image.'}</figcaption></figure>}
      <h1>{signal.title[lang]}</h1><p className="lead">{signal.summary[lang]}</p>
      <p className="date">{pt ? 'Publicado em' : 'Published'} {signal.publishedOn}</p>
      {!signal.reviewedByCurator && <p className="date">{pt ? 'Publicado antes da revisão final da curadoria.' : 'Published before final curator review.'}</p>}
      {signal.status === 'archived' && <p role="note">{pt ? 'Sinal arquivado. Disponível somente para leitura.' : 'Archived Signal. Available for reading only.'}</p>}
      <section><h2>{pt ? 'O que é' : 'What it is'}</h2><p>{signal.whatItIs[lang]}</p></section>
      <section><h2>{pt ? 'O que não é' : 'What it is not'}</h2><p>{signal.whatItIsNot[lang]}</p></section>
      <section className="takeaway"><h2>{pt ? 'E para sua família?' : 'What about your family?'}</h2><p>{signal.curatorNote[lang]}</p><p>{pt ? 'No EOS, você adapta a preparação ao tamanho da sua casa e acompanha o que já tem e o que falta.' : 'In EOS, adapt preparation to your household size and track what you have and what is missing.'}</p></section>
      {signal.status === 'published' && <section className="join"><h2>{pt ? 'Transforme informação em preparação.' : 'Turn information into preparation.'}</h2><p>{pt ? 'Crie sua conta gratuita para abrir este Sinal e começar a preparar sua família.' : 'Create your free account to open this Signal and start preparing your family.'}</p><Link className="primary" href={`${login}&mode=signup`}>{pt ? 'Criar conta gratuita' : 'Create free account'}</Link><Link href={destination}>{pt ? 'Já tenho conta · abrir meu protocolo' : 'I have an account · open my protocol'}</Link><Link href="/#pricing">{pt ? 'Conhecer os planos EOS' : 'Explore EOS plans'}</Link></section>}
      <section><h2>{pt ? 'Compartilhe com alguém' : 'Share with someone'}</h2><SignalShareButtons signal={signal} lang={lang} /></section>
      <section><h2>{pt ? 'Fontes' : 'Sources'}</h2><ul>{signal.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></section>
      <footer>{pt ? 'Preparação, sem pânico.' : 'Preparation, not panic.'} EOS</footer>
    </article>
  </main>
}
