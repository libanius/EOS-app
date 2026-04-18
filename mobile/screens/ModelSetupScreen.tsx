/**
 * EOS — ModelSetupScreen
 *
 * Flow:
 *   1. Detect RAM → recommend best model that fits.
 *   2. User taps "Download". Show progress bar 0..100%.
 *   3. On completion, load the model and call setModelReady(true).
 *   4. Navigate to the main app.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  MODELS,
  recommendModel,
  modelManager,
  type ModelSpec,
} from '../eos-intelligence-layer'
import { useEOSStore } from '../store'

interface Props {
  onReady: () => void
}

export function ModelSetupScreen({ onReady }: Props) {
  const [recommended, setRecommended] = useState<ModelSpec | null>(null)
  const [selected, setSelected] = useState<ModelSpec | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const setModelReady = useEOSStore((s) => s.setModelReady)

  useEffect(() => {
    void recommendModel().then((m) => {
      setRecommended(m)
      setSelected(m)
    })
  }, [])

  const install = useCallback(async () => {
    if (!selected || busy) return
    setBusy(true)
    setProgress(0)
    try {
      if (!(await modelManager.isDownloaded(selected))) {
        await modelManager.download(selected, setProgress)
      }
      setProgress(100)
      await modelManager.load(selected)
      setModelReady(true, selected)
      onReady()
    } catch (e) {
      Alert.alert(
        'Falha ao preparar modelo',
        e instanceof Error ? e.message : 'Erro desconhecido',
      )
    } finally {
      setBusy(false)
    }
  }, [selected, busy, onReady, setModelReady])

  const skip = useCallback(() => {
    setModelReady(false, null)
    onReady()
  }, [onReady, setModelReady])

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>EOS · INTELLIGENCE</Text>
      <Text style={styles.title}>Local AI Setup</Text>
      <Text style={styles.body}>
        Baixe um modelo para rodar o EOS sem internet. Recomendamos{' '}
        <Text style={{ color: '#22c55e' }}>
          {recommended?.label ?? '…'}
        </Text>{' '}
        para seu device.
      </Text>

      <View style={{ marginVertical: 18 }}>
        {MODELS.map((m) => {
          const active = selected?.id === m.id
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => !busy && setSelected(m)}
              style={[
                styles.card,
                active && {
                  borderColor: '#22c55e',
                  backgroundColor: 'rgba(34,197,94,0.06)',
                },
              ]}
            >
              <Text style={styles.cardTitle}>{m.label}</Text>
              <Text style={styles.cardMeta}>
                {(m.sizeMB / 1024).toFixed(1)} GB · requer {m.minRAMGB}GB RAM
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {progress !== null && (
        <View style={{ marginVertical: 12 }}>
          <View style={styles.barOuter}>
            <View style={[styles.barInner, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress}% {busy && progress < 100 ? 'baixando…' : 'pronto'}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.btnPrimary, busy && { opacity: 0.5 }]}
        onPress={install}
        disabled={busy || !selected}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0f" />
        ) : (
          <Text style={styles.btnPrimaryLabel}>
            Baixar e ativar modelo local
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnGhost} onPress={skip} disabled={busy}>
        <Text style={styles.btnGhostLabel}>
          Pular — usar SURVIVAL MODE (rules only)
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 22,
    backgroundColor: '#0a0a0f',
  },
  eyebrow: {
    color: '#8a8a99',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 30,
  },
  title: {
    color: '#e6e6eb',
    fontSize: 26,
    fontWeight: '700',
    marginTop: 6,
  },
  body: {
    color: '#a5a5b5',
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#222231',
    borderRadius: 10,
    marginBottom: 10,
  },
  cardTitle: { color: '#e6e6eb', fontSize: 15, fontWeight: '600' },
  cardMeta: { color: '#8a8a99', fontSize: 12, marginTop: 4 },
  barOuter: {
    height: 6,
    backgroundColor: '#16161f',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barInner: { height: 6, backgroundColor: '#22c55e' },
  progressText: { color: '#8a8a99', fontSize: 12, marginTop: 6 },
  btnPrimary: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
  },
  btnPrimaryLabel: { color: '#0a0a0f', fontWeight: '700' },
  btnGhost: { alignItems: 'center', marginTop: 14 },
  btnGhostLabel: { color: '#8a8a99', fontSize: 12 },
})
