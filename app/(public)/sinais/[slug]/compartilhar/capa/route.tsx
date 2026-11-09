/**
 * Capa gerada do Sinal (SIGNAL-SHARE-001, "Capa v2"): para Sinais sem foto.
 * Mesma composição da capa do FORTRESS — painel basalto, borda Signal, logo
 * oficial v0.7 (nunca o nome digitado em fonte), nível, nome, gancho.
 */
import { ImageResponse } from 'next/og'
import { signalBySlug } from '@/lib/signals-content'
import { signalShareHook } from '@/lib/signal-sharing'
import { OG_FONT_BARLOW_700_B64, OG_FONT_DM_MONO_500_B64, OG_FONT_DM_SANS_500_B64, OG_LOGO_SVG_B64 } from '@/lib/og-assets'

export const runtime = 'edge'
const size = { width: 1200, height: 630 }

const LEVEL = {
  pt: { AGIR: 'Agir', PREPARAR: 'Preparar', MONITORAR: 'Monitorar', CONTEXTO: 'Contexto' },
  en: { AGIR: 'Act', PREPARAR: 'Prepare', MONITORAR: 'Monitor', CONTEXTO: 'Context' },
} as const

const bytes = (b64: string): ArrayBuffer => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer

const BASALT = '#0a0e16'
const SIGNAL = '#00E5A0'
const TEXT = '#F2F5F3'
const MUTED = '#a3adbf'

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const signal = signalBySlug(params.slug)
  if (!signal) return new Response('Not found', { status: 404 })
  const lang = new URL(request.url).searchParams.get('lang') === 'pt' ? 'pt' : 'en'

  const logo = `data:image/svg+xml;base64,${OG_LOGO_SVG_B64}`
  const fonts = [
    { name: 'Barlow Condensed', data: bytes(OG_FONT_BARLOW_700_B64), weight: 700 as const },
    { name: 'DM Sans', data: bytes(OG_FONT_DM_SANS_500_B64), weight: 500 as const },
    { name: 'DM Mono', data: bytes(OG_FONT_DM_MONO_500_B64), weight: 500 as const },
  ]

  const title = signal.title[lang]
  const cut = title.indexOf(':')
  const name = (cut > 0 ? title.slice(0, cut) : signal.slug).toUpperCase()
  const rest = cut > 0 ? title.slice(cut + 1).trim() : title
  const eyebrow = `${lang === 'pt' ? 'Sinal' : 'Signal'} · ${LEVEL[lang][signal.level]}`.toUpperCase()

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: BASALT, color: TEXT, fontFamily: 'DM Sans', position: 'relative' }}>
        <div style={{ position: 'absolute', left: -200, top: -240, width: 760, height: 660, display: 'flex', background: 'radial-gradient(closest-side, rgba(0,229,160,0.12), rgba(0,229,160,0))' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, display: 'flex', background: SIGNAL }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 80px 58px 72px', width: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} height={46} width={231} alt="EOS" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 18, letterSpacing: 4, color: SIGNAL, fontFamily: 'DM Mono' }}>
              <div style={{ width: 10, height: 10, background: SIGNAL, marginRight: 14, display: 'flex' }} />
              {eyebrow}
            </div>
            <div style={{ display: 'flex', fontSize: name.length > 14 ? 110 : 140, fontWeight: 700, lineHeight: 0.92, marginTop: 18, fontFamily: 'Barlow Condensed' }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginTop: 14, maxWidth: 960, lineHeight: 1.3 }}>{rest}</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 500, marginTop: 26 }}>{signalShareHook(lang)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, letterSpacing: 4, color: MUTED, fontFamily: 'DM Mono' }}>
            <div style={{ width: 56, height: 2, background: SIGNAL, marginRight: 18, display: 'flex' }} />
            {(lang === 'pt' ? 'Preparação, sem pânico' : 'Preparation, not panic').toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
