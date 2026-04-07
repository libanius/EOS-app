import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EOS — Emergency Operating System',
  description:
    'EOS transforms chaos into prioritized action — for any family, any crisis, with or without internet.',
  keywords: ['emergency', 'survival', 'preparedness', 'offline', 'family safety'],
  authors: [{ name: 'EOS Systems' }],
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
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <div id="app">{children}</div>
      </body>
    </html>
  )
}
