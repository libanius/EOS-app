'use client'

import { useEffect } from 'react'
import { AFFILIATE_STORAGE_KEY, normalizeAffiliateCode } from '@/lib/affiliate'

export default function AffiliateAttribution() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = normalizeAffiliateCode(params.get('ref') ?? params.get('affiliate'))
    if (!ref) return
    try {
      localStorage.setItem(AFFILIATE_STORAGE_KEY, ref)
      document.cookie = `eos_affiliate_ref=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`
    } catch {
      // Attribution is best-effort; checkout also reads the cookie set by middleware.
    }
  }, [])

  return null
}
