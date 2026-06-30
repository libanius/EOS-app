'use client'

import { useCallback, useEffect, useState } from 'react'
import { flushQueue, getQueue } from '@/lib/sync'

/** Returns online status and triggers a queue flush when coming back online. */
export function useOfflineQueue(onFlushed?: () => void) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [queueSize, setQueueSize] = useState(0)
  const [flushing, setFlushing] = useState(false)

  const refresh = useCallback(() => {
    setQueueSize(getQueue().length)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      const pending = getQueue()
      if (!pending.length) return
      setFlushing(true)
      await flushQueue()
      setQueueSize(getQueue().length)
      setFlushing(false)
      onFlushed?.()
    }
    const handleOffline = () => {
      setOnline(false)
      refresh()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [onFlushed, refresh])

  return { online, queueSize, flushing }
}
