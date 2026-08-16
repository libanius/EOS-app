import type { Metadata, Viewport } from 'next'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n'
import AffiliateAttribution from '@/components/AffiliateAttribution'
import ClientErrorReporter from '@/components/ClientErrorReporter'

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
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon.svg' }],
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
      </head>
      <body>
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
