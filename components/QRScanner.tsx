'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  onScan: (text: string) => void
  onClose: () => void
  title?: string
  hint?: string
}

// Camera QR scanner (html5-qrcode is imported dynamically so it never runs on
// the server). Calls onScan once with the decoded text, then stops the camera.
export default function QRScanner({ onScan, onClose, title = 'Escanear QR', hint }: Props) {
  const [error, setError] = useState<string | null>(null)
  const containerId = 'eos-qr-reader'

  // Read the latest onScan through a ref so the effect below never re-runs on
  // parent re-renders. Restarting the camera mid-flight races html5-qrcode's
  // async start() — on iOS the permission prompt keeps start() pending, and a
  // stop() issued during that window leaves an orphaned <video> playing the
  // camera feed with no decoding attached.
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    let cancelled = false
    let scanned = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instance: any
    let startPromise: Promise<void> | null = null

    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled) return
        instance = new mod.Html5Qrcode(containerId)
        startPromise = instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            if (cancelled || scanned) return
            scanned = true
            instance.stop().catch(() => {}).finally(() => onScanRef.current(decodedText))
          },
          () => {}, // per-frame decode failures are normal — ignore
        )
        await startPromise
        // Torn down while start() was pending (permission prompt, fast
        // close/reopen): release the camera we just acquired.
        if (cancelled && !scanned) {
          instance.stop().catch(() => {}).then(() => instance.clear?.()).catch(() => {})
        }
      } catch {
        if (!cancelled) {
          setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.')
        }
      }
    })()

    return () => {
      cancelled = true
      const inst = instance
      if (!inst || !startPromise) return
      // Only stop after start() settles — stopping mid-start leaks the stream.
      startPromise.then(
        () => {
          if (!scanned) inst.stop().catch(() => {}).then(() => inst.clear?.()).catch(() => {})
        },
        () => {},
      )
    }
  }, [])

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
          <button onClick={onClose} style={styles.close} aria-label="Fechar">✕</button>
        </div>
        {error ? (
          <div style={styles.error}>{error}</div>
        ) : (
          <>
            <div id={containerId} style={styles.reader} />
            {hint && <p style={styles.hint}>{hint}</p>}
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 },
  sheet: { width: '100%', maxWidth: 380, background: '#141420', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: 700, color: '#f5f5f5' },
  close: { background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 18, cursor: 'pointer', padding: 4 },
  reader: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  hint: { fontSize: 13, color: '#a1a1aa', textAlign: 'center', margin: 0 },
  error: { fontSize: 14, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 14, textAlign: 'center' },
}
