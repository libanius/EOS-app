'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { flushQueue } from '@/lib/sync'

export default function SyncStatus({ onReconnect }: { onReconnect?: () => void }) {
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [visible, setVisible] = useState(false)

  const handleFlushed = useCallback(() => {
    setLastSync(new Date())
    onReconnect?.()
  }, [onReconnect])

  const { online, queueSize, flushing } = useOfflineQueue(handleFlushed)

  useEffect(() => {
    if (!online || queueSize > 0 || flushing) {
      setVisible(true)
    } else {
      const t = setTimeout(() => setVisible(false), 3000)
      return () => clearTimeout(t)
    }
  }, [online, queueSize, flushing])

  useEffect(() => {
    if (online) setLastSync(new Date())
  }, [online])

  const manualFlush = async () => {
    await flushQueue()
    setLastSync(new Date())
    onReconnect?.()
  }

  if (!visible) return null

  const color = !online ? '#f87171' : flushing ? '#fbbf24' : queueSize > 0 ? '#f97316' : '#34d399'
  const label = !online
    ? `Offline · ${queueSize} pendente${queueSize !== 1 ? 's' : ''}`
    : flushing
    ? 'Sincronizando…'
    : queueSize > 0
    ? `${queueSize} para sincronizar`
    : `Sincronizado ${lastSync ? fmt(lastSync) : ''}`

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', left: 12, right: 12, maxWidth: 360,
      margin: '0 auto', padding: '8px 14px',
      background: '#111116', border: `1px solid ${color}44`,
      borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
      zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: color,
        boxShadow: online && !flushing && !queueSize ? `0 0 6px ${color}` : 'none',
      }} />
      <span style={{ flex: 1, fontSize: 12, color: '#a1a1aa' }}>{label}</span>
      {queueSize > 0 && online && !flushing && (
        <button
          onClick={manualFlush}
          style={{ fontSize: 11, color, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
        >
          Sincronizar
        </button>
      )}
    </div>
  )
}

function fmt(d: Date): string {
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 10) return 'agora'
  if (diff < 60) return `há ${diff}s`
  return `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
