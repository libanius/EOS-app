/**
 * EOS — ModeIndicator
 *
 * Small pill in the header showing the current intelligence mode with a
 * pulsing dot. Tapping it shows a toast with an explanation.
 *
 * Colors:
 *   CONNECTED  → green  (#22c55e)
 *   LOCAL_AI   → blue   (#3b82f6)
 *   SURVIVAL   → amber  (#f59e0b)
 */

import React, { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  Platform,
  Alert,
} from 'react-native'
import { useEOSStore } from '../store'
import type { Mode } from '../eos-intelligence-layer'

const LABELS: Record<Mode, string> = {
  CONNECTED: 'CONNECTED',
  LOCAL_AI: 'LOCAL AI',
  LORA_MESH: 'LORA MESH',
  SURVIVAL: 'SURVIVAL MODE',
}

const COLORS: Record<Mode, string> = {
  CONNECTED: '#22c55e',
  LOCAL_AI: '#3b82f6',
  LORA_MESH: '#a855f7',
  SURVIVAL: '#f59e0b',
}

const EXPLAIN: Record<Mode, string> = {
  CONNECTED:
    'Conectado à nuvem EOS — análise com contexto completo (RAG + LLM).',
  LOCAL_AI:
    'Sem internet — rodando o modelo local no seu device. Respostas completas, só um pouco mais lentas.',
  LORA_MESH:
    'Conectado a um nó LoRa via Bluetooth — mensagens de mesh peer-to-peer sem internet nem celular.',
  SURVIVAL:
    'Sem internet e sem modelo local — usando apenas o Rules Engine. Instruções determinísticas.',
}

export function ModeIndicator() {
  const mode = useEOSStore((s) => s.mode)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [pulse])

  const showToast = () => {
    const msg = EXPLAIN[mode]
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.LONG)
    } else {
      Alert.alert(LABELS[mode], msg)
    }
  }

  return (
    <TouchableOpacity onPress={showToast} activeOpacity={0.7}>
      <View style={[styles.pill, { borderColor: COLORS[mode] }]}>
        <Animated.View
          style={[styles.dot, { backgroundColor: COLORS[mode], opacity: pulse }]}
        />
        <Text style={[styles.label, { color: COLORS[mode] }]}>
          {LABELS[mode]}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0a0a0f',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
})
