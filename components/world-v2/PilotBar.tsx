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
 *
 * The conversation only opens on ENTER. Touching the field used to raise the
 * whole sheet over the map before a single character existed — the person had
 * asked nothing and was already covered. Focus is intent to type; Enter is
 * intent to ask. The orb next door is the way in when there is no question yet.
 */

import { useRef, useState } from 'react'
import { haptic } from './motion'
import PilotOrb from './PilotOrb'

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
  const fieldRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const question = draft.trim()
    // Enter with nothing typed is a slip, not a request: stay where we are.
    if (!question) return
    haptic.impact()
    setDraft('')
    // Hand the screen back to the answer: the field keeps focus after submit,
    // so on a phone the keyboard would stay up covering the conversation.
    fieldRef.current?.blur()
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
          ref={fieldRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={pt ? 'Pergunte ou procure algo' : 'Ask or search for anything'}
          aria-label={pt ? 'Perguntar ao Pilot ou procurar um lugar' : 'Ask the Pilot or search a place'}
          enterKeyHint="send"
          autoComplete="off"
        />
      </form>

      {/* O mesmo orbe de todas as telas (D-136) — aqui ele só ganha um lugar. */}
      <PilotOrb
        className="bar-orb"
        riskState={riskState}
        label={pt ? 'Abrir o Pilot, seu especialista EOS' : 'Open the Pilot, your EOS specialist'}
        onClick={() => {
          if (draft.trim()) {
            submit()
            return
          }
          haptic.impact()
          onOpen()
        }}
      />
    </div>
  )
}
