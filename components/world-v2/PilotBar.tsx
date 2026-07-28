'use client'

/**
 * PilotBar — one entry point for everything.
 *
 * There used to be a search field and, separately, a Pilot orb. That split was
 * wrong: the Pilot can already find places, name coordinates, draw a course and
 * turn advice into tasks. A second box that only does geocoding was a weaker
 * version of the same thing sitting next to it.
 *
 * So typing here IS talking to the Pilot. "home depot perto de mim" is a
 * question, not a query — and the specialist answers it, finds it, and offers to
 * put it on the map.
 */

import { useState } from 'react'
import { haptic } from './motion'

export default function PilotBar({
  pt,
  onAsk,
  onOpen,
  riskState,
}: {
  pt: boolean
  onAsk: (question: string) => void
  onOpen: () => void
  riskState: string
}) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const question = draft.trim()
    if (!question) {
      onOpen()
      return
    }
    haptic.impact()
    setDraft('')
    onAsk(question)
  }

  return (
    <div className="wv2-pilotbar">
      <form
        className="bar-field"
        role="search"
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onFocus={onOpen}
          placeholder={pt ? 'Pergunte ou procure algo' : 'Ask or search for anything'}
          aria-label={pt ? 'Perguntar ao Pilot ou procurar um lugar' : 'Ask the Pilot or search a place'}
          enterKeyHint="send"
          autoComplete="off"
        />
      </form>

      <button
        type="button"
        className="bar-orb wv2-fume"
        data-state={riskState}
        aria-label={pt ? 'Abrir o Pilot, seu especialista EOS' : 'Open the Pilot, your EOS specialist'}
        onClick={() => {
          haptic.impact()
          onOpen()
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C10.1 8 11.5 6.6 12 3Z"
            fill="currentColor"
          />
          <path
            d="M17.8 14.5c.28 2 1.05 2.77 3.05 3.05-2 .28-2.77 1.05-3.05 3.05-.28-2-1.05-2.77-3.05-3.05 2-.28 2.77-1.05 3.05-3.05Z"
            fill="currentColor"
            opacity="0.72"
          />
        </svg>
      </button>
    </div>
  )
}
