'use client'

/**
 * First-run onboarding nudge: on a user's first entry into the app, if their
 * Master Card (ficha) is incomplete, send them straight to /ficha to fill it —
 * once (a localStorage flag prevents repeats, so it never traps the user).
 * Mounted in the (app) layout. Uses the same completion signals as the ficha page.
 */

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const FLAG = 'eos-ficha-firstrun'

type Ficha = {
  name?: string | null
  location?: string | null
  blood_type?: string | null
  allergies?: unknown[] | null
  medical_notes?: string | null
  medications?: unknown[] | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

export default function FichaFirstRun() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(FLAG)) return
    // Don't fire on the ficha/onboarding screens themselves.
    if (pathname.startsWith('/ficha') || pathname.startsWith('/onboarding')) return

    let cancelled = false
    fetch('/api/profile/ficha')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { ficha?: Ficha } | null) => {
        if (cancelled) return
        // Fire at most once ever (regardless of outcome) so we never loop.
        localStorage.setItem(FLAG, '1')
        const f = d?.ficha
        if (!f) return
        const signals = [
          Boolean((f.name ?? '').trim()),
          Boolean((f.location ?? '').trim()),
          Boolean(f.blood_type),
          Boolean((f.allergies?.length) || (f.medical_notes ?? '').trim() || (f.medications?.length)),
          Boolean((f.emergency_contact_name ?? '').trim()),
          Boolean((f.emergency_contact_phone ?? '').trim()),
        ]
        if (!signals.every(Boolean)) router.replace('/ficha?welcome=1')
      })
      .catch(() => { /* offline / not authed — skip */ })
    return () => { cancelled = true }
  }, [pathname, router])

  return null
}
