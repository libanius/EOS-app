import type { Metadata, Viewport } from 'next'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n'
import AffiliateAttribution from '@/components/AffiliateAttribution'
import ClientErrorReporter from '@/components/ClientErrorReporter'
import BootSplash from '@/components/BootSplash'

export const metadata: Metadata = {
  title: 'EOS — Emergency Operating System',
  description:
    'EOS transforms chaos into prioritized action — for any family, any crisis, with or without internet.',
  keywords: ['emergency', 'survival', 'preparedness', 'offline', 'family safety'],
  authors: [{ name: 'EOS Systems' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'EOS',
    statusBarStyle: 'black-translucent',
  },
  // BRAND-T01 / D-237: identidade v0.7 (O chanfrado sobre basalto).
  // O iPhone ignora SVG como ícone da tela inicial — por isso o PNG de 180.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0f',
}

/**
 * D-238 — telas de abertura do iPhone (`apple-touch-startup-image`).
 *
 * Sem elas o iOS mostra uma tela BRANCA entre o toque no ícone e o primeiro
 * HTML. Cada imagem é o primeiro quadro da abertura (fundo basalto, O virado
 * para a esquerda, na mesma posição), então a troca para a animação não se vê.
 * Geradas por `scripts/gen-ios-splash.py` (D-238).
 */
const IOS_SPLASH: [string, number, number, number][] = [
  ['/splash/iphone-17-pro-max.png', 440, 956, 3],
  ['/splash/iphone-air.png', 420, 912, 3],
  ['/splash/iphone-17-pro.png', 402, 874, 3],
  ['/splash/iphone-16-pro-max.png', 430, 932, 3],
  ['/splash/iphone-15.png', 393, 852, 3],
  ['/splash/iphone-14-plus.png', 428, 926, 3],
  ['/splash/iphone-14.png', 390, 844, 3],
  ['/splash/iphone-11-pro-max.png', 414, 896, 3],
  ['/splash/iphone-11.png', 414, 896, 2],
  ['/splash/iphone-x.png', 375, 812, 3],
  ['/splash/iphone-8-plus.png', 414, 736, 3],
  ['/splash/iphone-8.png', 375, 667, 2],
  ['/splash/iphone-se-1.png', 320, 568, 2],
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /*
   * D-198: o documento nasce em INGLÊS.
   *
   * O `LanguageProvider` corrige para `pt-BR` quando a pessoa escolheu
   * português ou quando o aparelho está em português. O EOS opera nos EUA —
   * NWS, USGS, NHC e FEMA falam inglês, e o alerta chega no telefone em inglês.
   */
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        {IOS_SPLASH.map(([href, w, h, r]) => (
          <link
            key={href}
            rel="apple-touch-startup-image"
            href={href}
            media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body>
        {/* BRAND-T02 / D-237: a abertura vem no primeiro HTML, antes do JS. */}
        <BootSplash />
        <LanguageProvider>
          {/* Raiz de propósito: cobre a tela de entrada, onde uma falha dói mais. */}
          <ClientErrorReporter />
          <AffiliateAttribution />
          <div id="app">{children}</div>
        </LanguageProvider>
      </body>
    </html>
  )
}
