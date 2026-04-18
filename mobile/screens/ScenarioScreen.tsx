/**
 * EOS — ScenarioScreen (mobile)
 *
 * Minimal entry point that mirrors the web /scenario page. Takes user input,
 * runs the intelligence layer, displays the plan.
 */

import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { runIntelligence } from '../eos-intelligence-layer'
import { useEOSStore } from '../store'

const SCENARIOS = ['GENERAL', 'HURRICANE', 'EARTHQUAKE', 'FALLOUT', 'PANDEMIC', 'FIRE', 'FLOOD']

export function ScenarioScreen() {
  const mode = useEOSStore((s) => s.mode)
  const setLastOutput = useEOSStore((s) => s.setLastOutput)
  const bearerToken = useEOSStore((s) => s.bearerToken)
  const [type, setType] = useState('GENERAL')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<ReturnType<typeof String> | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      const res = await runIntelligence(
        {
          scenarioType: type,
          scenario: desc,
          familySize: 1, // TODO: wire from local profile
          hasInfants: false,
          hasMedicalConditions: false,
          water_liters: 0,
          food_days: 0,
        },
        {
          currentMode: mode,
          remoteApiUrl: 'https://eos.app', // configure in production
          bearerToken: bearerToken ?? undefined,
        },
      )
      setLastOutput(res)
      setOutput(JSON.stringify(res, null, 2))
    } finally {
      setBusy(false)
    }
  }, [type, desc, mode, bearerToken, setLastOutput])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 22 }}>
      <Text style={styles.title}>Scenario</Text>

      <View style={styles.chips}>
        {SCENARIOS.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setType(s)}
            style={[styles.chip, type === s && styles.chipActive]}
          >
            <Text style={[styles.chipText, type === s && styles.chipTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        value={desc}
        onChangeText={setDesc}
        placeholder="Descreva o cenário…"
        placeholderTextColor="#4a4a5a"
        style={styles.input}
        multiline
      />

      <TouchableOpacity
        style={[styles.btn, busy && { opacity: 0.5 }]}
        onPress={run}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0f" />
        ) : (
          <Text style={styles.btnLabel}>Gerar plano</Text>
        )}
      </TouchableOpacity>

      {output && (
        <View style={styles.output}>
          <Text style={styles.outputText}>{output as unknown as string}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0f' },
  title: { color: '#e6e6eb', fontSize: 24, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)' },
  chipText: { color: '#8a8a99', fontSize: 11, letterSpacing: 1.2 },
  chipTextActive: { color: '#22c55e' },
  input: {
    backgroundColor: '#0f0f17',
    color: '#e6e6eb',
    borderColor: '#2a2a3a',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 16,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  btn: {
    backgroundColor: '#22c55e',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  btnLabel: { color: '#0a0a0f', fontWeight: '700' },
  output: {
    marginTop: 22,
    padding: 12,
    backgroundColor: '#0f0f17',
    borderRadius: 8,
  },
  outputText: {
    color: '#a5a5b5',
    fontFamily: 'Menlo',
    fontSize: 12,
  },
})
