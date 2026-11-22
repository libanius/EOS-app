'use client'

import { useState } from 'react'
import { tornadoInstructions, tornadoPhase, type TornadoPhase } from '@/lib/hazards/tornado-experience'

/** Embedded alert detail: never simulates official warning delivery or all-clear. */
export default function TornadoEmergency({ event, expiresAt, source, onShowMap }: {
  event: 'Tornado Watch' | 'Tornado Warning'
  expiresAt: string
  source: string
  onShowMap?: () => void
}) {
  const [sheltered, setSheltered] = useState(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const expired = Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= Date.now()
  const phase = tornadoPhase(event, expired, sheltered) as TornadoPhase
  const danger = phase === 'warning' || phase === 'shelter'
  return <section aria-label="Official tornado alert" style={{ background: '#101820', color: '#fff', padding: 20, borderRadius: 16, border: `2px solid ${danger ? '#ff6565' : '#ffb347'}` }}>
    <p style={{ color: danger ? '#ff8585' : '#ffca77', fontWeight: 800, margin: 0 }}>EOS ALERTS · {event.toUpperCase()}</p>
    <h2 style={{ margin: '12px 0' }}>{phase === 'warning' ? 'Seek shelter now' : phase === 'shelter' ? 'Stay sheltered' : phase === 'watch' ? 'Prepare to shelter' : 'Warning expired'}</h2>
    <p>Official source: {source}</p>
    <p>Expires: {expiresAt || 'Unknown — check official updates'}</p>
    <ol>{tornadoInstructions(phase).map(step => <li key={step} style={{ marginBottom: 10 }}>{step}</li>)}</ol>
    {onShowMap && <button type="button" onClick={onShowMap} style={{ padding: 12, marginRight: 8 }}>View official alert area</button>}
    {danger && <button type="button" onClick={() => { setSheltered(true); setConfirmedAt(new Date().toISOString()) }} style={{ padding: 12, background: '#35c97a', color: '#07140d', fontWeight: 700, borderRadius: 8 }}>I'm in shelter</button>}
    {confirmedAt && <p role="status">Shelter check-in saved in this screen at {confirmedAt}. This does not mean the danger has passed or notify contacts.</p>}
    <p style={{ fontSize: 12, opacity: .8 }}>Instructions available in the installed app only when this screen and its assets have been cached. New alerts require connectivity.</p>
  </section>
}
