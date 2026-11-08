import type { Signal } from './signals'

export type ShareLanguage = 'pt' | 'en'
export function shareLanguage(value?: string): ShareLanguage { return value === 'pt' ? 'pt' : 'en' }
export function publicSignalSharePath(path: string): boolean {
  return /^\/sinais\/[a-z0-9-]+\/compartilhar(?:\/capa)?\/?$/.test(path)
}
export function signalSharePath(slug: string, lang: ShareLanguage): string {
  return `/sinais/${encodeURIComponent(slug)}/compartilhar?lang=${lang}`
}
export function signalShareHook(lang: ShareLanguage): string {
  return lang === 'pt' ? 'Sua família está pronta?' : 'Is your family ready?'
}
export function signalShareInvite(lang: ShareLanguage): string {
  return lang === 'pt' ? 'Descubra o que sua família precisa para começar a se preparar.' : 'Find out what your family needs to start preparing.'
}
export function signalShareText(signal: Signal, lang: ShareLanguage, url: string, full = false): string {
  const tail = lang === 'pt' ? 'Preparação, sem pânico. EOS' : 'Preparation, not panic. EOS'
  return [url, '', `EOS · ${signalShareHook(lang)}`, signalShareInvite(lang), '', signal.title[lang], '',
    ...(full ? [signal.whatItIs[lang], '', signal.whatItIsNot[lang], '', signal.curatorNote[lang], '',
      lang === 'pt' ? 'Contexto, fontes e preparação para sua família no link acima.' : 'Context, sources and preparation for your family at the link above.'] : []),
    '', tail].join('\n')
}
