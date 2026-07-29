'use client'

/**
 * MemberSheet — tap a face on the map, act on that person (D-073).
 *
 * A marker that only says where someone is answers half a question. The half
 * that matters during an event is "and what do I do about it": go to them, or
 * tell them something.
 *
 * Messages are PRESETS, not free text. Under stress people do not compose, they
 * pick — and a fixed vocabulary is recognised instantly by whoever receives it.
 */

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { distanceKm } from '@/lib/world/shelters'
import { directionsUrl, formatDistance, walkingMinutes } from '@/lib/world/navigation'
import { FADE, SPRING, haptic } from './motion'
import { PING_PRESETS, type PingPreset } from '@/lib/family-ping'

export type MapMember = {
  id: string
  name: string
  lat: number
  lng: number
  freshness: string
  isMe?: boolean
  avatarUrl?: string | null
  approximate?: boolean
}

// The order is the order of likelihood in an event, not alphabetical.
const PRESETS: PingPreset[] = ['where', 'ok', 'on_my_way', 'come_home', 'meet', 'help']

export default function MemberSheet({
  member,
  pt,
  myCoords,
  onClose,
  onShowCourse,
}: {
  member: MapMember | null
  pt: boolean
  myCoords: { lat: number; lng: number } | null
  onClose: () => void
  onShowCourse: (destination: { label: string; lat: number; lng: number }) => void
}) {
  const reduceMotion = useReducedMotion()
  const [sent, setSent] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const away = member && myCoords ? distanceKm(myCoords, member) : null

  const send = async (preset: string) => {
    if (!member) return
    haptic.impact()
    setFailed(null)
    const response = await fetch('/api/family/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: member.id, preset, pt }),
    })
      .then(r => r.json())
      .catch(() => null)

    if (response?.ok) setSent(preset)
    // Honest failure: the sender must not believe a message arrived when the
    // recipient has no device registered for notifications.
    else setFailed(response?.reason === 'no_device'
      ? (pt ? 'Ela ainda não ativou os alertas no aparelho.' : 'They have not enabled alerts on their device.')
      : (pt ? 'Não foi possível entregar agora.' : 'Could not deliver right now.'))
  }

  return (
    <AnimatePresence>
      {member && (
        <>
          <motion.button
            type="button"
            className="wv2-pilot-scrim"
            aria-label={pt ? 'Fechar' : 'Close'}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
          <motion.section
            className="wv2-member wv2-fume"
            role="dialog"
            aria-label={member.name}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, filter: 'blur(12px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.sheet}
          >
            <header>
              <span className="face" aria-hidden="true">
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatarUrl} alt="" />
                ) : (
                  member.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="who">
                <strong className="t-title2">{member.name}</strong>
                <em className="t-foot ink-2">
                  {member.approximate
                    ? pt
                      ? 'Endereço do perfil, não posição atual'
                      : 'Profile address, not a current position'
                    : `${pt ? 'Leitura' : 'Reading'} ${member.freshness}`}
                  {away !== null && ` · ${formatDistance(away, pt)}`}
                  {away !== null && away <= 12 && ` · ~${walkingMinutes(away)} min ${pt ? 'a pé' : 'on foot'}`}
                </em>
              </span>
            </header>

            {!member.isMe && (
              <>
                <div className="go">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      haptic.impact()
                      onShowCourse({ label: member.name, lat: member.lat, lng: member.lng })
                      onClose()
                    }}
                  >
                    {pt ? 'Rota até ela' : 'Route to them'}
                  </button>
                  <a
                    href={directionsUrl({ lat: member.lat, lng: member.lng }, member.name)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => haptic.impact()}
                  >
                    {pt ? 'Abrir no app de mapas' : 'Open in maps'}
                  </a>
                </div>

                <p className="t-caps ink-3 label">{pt ? 'Mandar mensagem' : 'Send a message'}</p>
                <div className="presets">
                  {PRESETS.map(key => (
                    <button
                      key={key}
                      type="button"
                      className={sent === key ? 'done' : ''}
                      disabled={sent === key}
                      onClick={() => send(key)}
                    >
                      {sent === key ? `✓ ${pt ? 'Enviado' : 'Sent'}` : PING_PRESETS[key][pt ? 'pt' : 'en']}
                    </button>
                  ))}
                </div>
                {failed && <p className="t-foot warn">{failed}</p>}
              </>
            )}

            {member.approximate && (
              <p className="t-foot ink-3 note">
                {pt
                  ? 'Para ver onde ela realmente está, ela precisa abrir o Mundo e conceder o GPS uma vez.'
                  : 'To see where they actually are, they need to open World and grant GPS once.'}
              </p>
            )}
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}
