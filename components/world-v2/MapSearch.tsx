'use client'

/**
 * MapSearch — place search over the map.
 *
 * Google Maps puts search at the top and so does this, because that is where
 * people look for it. But the mechanic is deliberately different: results come
 * on SUBMIT, not on every keystroke. Nominatim's usage policy forbids typeahead
 * against the public instance, and burning that would take geocoding down for
 * the whole app — including the profile address lookup EOS already depends on.
 *
 * So the field is honest about it: it looks like search, it behaves like search,
 * and it asks for Enter instead of pretending to predict.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SPRING, haptic } from './motion'
import type { GeocodeResult } from '@/app/api/geocode/search/route'

type Props = {
  pt: boolean
  /** Biases results toward the user's region. */
  near: { lat: number; lng: number } | null
  onPick: (result: GeocodeResult) => void
  onClear: () => void
}

export default function MapSearch({ pt, near, onPick, onClear }: Props) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // setState identities are stable, so binding once is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    setResults([])
    setState('idle')
  }

  const search = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setState('searching')
    haptic.selection()

    const params = new URLSearchParams({ q })
    if (near) {
      params.set('lat', String(near.lat))
      params.set('lng', String(near.lng))
    }

    const response = await fetch(`/api/geocode/search?${params}`).catch(() => null)
    if (!response?.ok) {
      setState('error')
      setResults([])
      return
    }
    const data = (await response.json().catch(() => null)) as
      | { results?: GeocodeResult[]; error?: string }
      | null

    const found = data?.results ?? []
    setResults(found)
    setState(data?.error ? 'error' : found.length ? 'idle' : 'empty')
  }

  const pick = (result: GeocodeResult) => {
    haptic.impact()
    setQuery(result.name)
    close()
    inputRef.current?.blur()
    onPick(result)
  }

  const clear = () => {
    setQuery('')
    close()
    onClear()
    inputRef.current?.focus()
  }

  const showPanel = state === 'searching' || state === 'empty' || state === 'error' || results.length > 0

  return (
    <div className="wv2-search">
      <form
        className="search-field"
        role="search"
        onSubmit={event => {
          event.preventDefault()
          void search()
        }}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            if (!event.target.value) close()
          }}
          placeholder={pt ? 'Buscar um lugar' : 'Search a place'}
          aria-label={pt ? 'Buscar um lugar no mapa' : 'Search a place on the map'}
          enterKeyHint="search"
          autoComplete="off"
        />
        {query && (
          <button type="button" className="search-clear" onClick={clear} aria-label={pt ? 'Limpar' : 'Clear'}>
            <ClearIcon />
          </button>
        )}
      </form>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            className="search-results"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.quick}
          >
            {state === 'searching' && (
              <p className="search-note t-sub ink-2">{pt ? 'Buscando…' : 'Searching…'}</p>
            )}
            {state === 'empty' && (
              <p className="search-note t-sub ink-2">
                {pt ? 'Nada encontrado com esse nome.' : 'Nothing found with that name.'}
              </p>
            )}
            {state === 'error' && (
              <p className="search-note t-sub ink-2">
                {pt ? 'Busca indisponível agora.' : 'Search is unavailable right now.'}
              </p>
            )}
            {results.map(result => (
              <button key={result.id} type="button" className="search-hit" onClick={() => pick(result)}>
                <PinIcon />
                <span>
                  <strong className="t-sub">{result.name}</strong>
                  <em className="t-foot ink-3">{result.label}</em>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.22" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
