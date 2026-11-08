import { ImageResponse } from 'next/og'
import { signalBySlug } from '@/lib/signals-content'
export const runtime = 'edge'
const size = { width: 1200, height: 630 }
export function GET(_request: Request, { params }: { params: { slug: string } }) {
  const signal = signalBySlug(params.slug)
  if (!signal) return new Response('Not found', { status: 404 })
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 70, background: '#090f19', color: '#edf4f7', fontFamily: 'sans-serif' }}><div style={{ fontSize: 44, color: '#80e2c2' }}>EOS · SIGNALS</div><div style={{ fontSize: 58, lineHeight: 1.15 }}>{signal.title.en}</div><div style={{ fontSize: 30, color: '#80e2c2' }}>Preparation, not panic.</div></div>, size)
}
