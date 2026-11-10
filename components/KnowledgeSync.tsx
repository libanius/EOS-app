'use client'

import { useEffect } from 'react'
import { syncOfflineKnowledge } from '@/lib/offline-knowledge-client'

/** Sync the entire published library, not only articles the user has opened. */
export default function KnowledgeSync() {
  useEffect(() => {
    const sync = () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return
      void syncOfflineKnowledge().then(pack => {
        window.dispatchEvent(new CustomEvent('eos:knowledge-sync', { detail: { pack } }))
      }).catch(() => {
        window.dispatchEvent(new CustomEvent('eos:knowledge-sync', { detail: { error: true } }))
      })
    }
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    const timer = window.setInterval(sync, 5 * 60 * 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  return null
}
