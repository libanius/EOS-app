/**
 * LoRaMeshScreen
 *
 * Scan for EOS-* LoRa nodes over BLE, connect, and send/receive mesh messages.
 * When connected, store mode flips to LORA_MESH (via LoRaBleService).
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import {
  LoRaBleService,
  IncomingPacket,
  NodeStatus,
  BROADCAST,
} from '../services/LoRaBleService'

export function LoRaMeshScreen() {
  const [scanning, setScanning] = useState(false)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [messages, setMessages] = useState<IncomingPacket[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const offPkt = LoRaBleService.onPacket((p) =>
      setMessages((prev) => [p, ...prev].slice(0, 50))
    )
    const offStatus = LoRaBleService.onStatus((s) => setStatus(s))
    return () => {
      offPkt()
      offStatus()
    }
  }, [])

  async function onScan() {
    setScanning(true)
    const device = await LoRaBleService.scan(10000)
    setScanning(false)
    if (!device) {
      Alert.alert('Nenhum nó encontrado', 'Verifique se o dispositivo EOS LoRa está ligado e dentro do alcance BLE.')
      return
    }
    const ok = await LoRaBleService.connect(device)
    setConnected(ok)
    if (!ok) Alert.alert('Falha ao conectar', 'Tente novamente.')
  }

  async function onSend() {
    if (!draft.trim()) return
    const ok = await LoRaBleService.sendText(BROADCAST, draft.trim())
    if (ok) setDraft('')
    else Alert.alert('Erro', 'Falha ao enviar pacote.')
  }

  async function onSOS() {
    const ok = await LoRaBleService.sendSOS('SOS')
    Alert.alert(ok ? 'SOS enviado' : 'Erro', ok ? 'Beacon SOS transmitido ao mesh.' : 'Falha ao enviar SOS.')
  }

  async function onDisconnect() {
    await LoRaBleService.disconnect()
    setConnected(false)
    setStatus(null)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LoRa Mesh</Text>

      {!connected ? (
        <TouchableOpacity
          style={[styles.btn, scanning && styles.btnDisabled]}
          onPress={onScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Procurar nó EOS</Text>
          )}
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.statusBox}>
            <Text style={styles.statusLine}>
              Nó: {status ? `0x${status.nodeId.toString(16).padStart(8, '0')}` : '—'}
            </Text>
            <Text style={styles.statusLine}>
              RSSI: {status ? status.rssi : '—'} dBm
            </Text>
            <Text style={styles.statusLine}>
              Pacotes vistos: {status?.seen ?? 0} · Repassados: {status?.fwd ?? 0}
            </Text>
          </View>

          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Mensagem para o mesh…"
              placeholderTextColor="#64748b"
              maxLength={180}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={onSend}>
              <Text style={styles.btnText}>Enviar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sosBtn} onPress={onSOS}>
            <Text style={styles.btnText}>SOS</Text>
          </TouchableOpacity>

          <ScrollView style={styles.feed}>
            {messages.map((m, i) => (
              <View key={`${m.from}-${m.messageId}-${i}`} style={styles.msg}>
                <Text style={styles.msgFrom}>
                  0x{m.from.toString(16).padStart(8, '0')}
                  {m.type === 3 ? ' · SOS' : m.type === 1 ? ' · beacon' : ''}
                </Text>
                <Text style={styles.msgBody}>{m.payload || '(sem payload)'}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.disconnectBtn} onPress={onDisconnect}>
            <Text style={styles.disconnectText}>Desconectar</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', padding: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  btn: {
    backgroundColor: '#a855f7',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600' },
  statusBox: {
    backgroundColor: '#1a1a24',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  statusLine: { color: '#e2e8f0', fontSize: 13, marginBottom: 2 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: {
    flex: 1,
    backgroundColor: '#1a1a24',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
  },
  sendBtn: {
    backgroundColor: '#a855f7',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  sosBtn: {
    backgroundColor: '#dc2626',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  feed: { flex: 1, backgroundColor: '#141420', borderRadius: 8, padding: 10 },
  msg: { marginBottom: 10, borderBottomColor: '#222', borderBottomWidth: 1, paddingBottom: 6 },
  msgFrom: { color: '#a855f7', fontSize: 12, fontWeight: '600' },
  msgBody: { color: '#fff', fontSize: 14, marginTop: 2 },
  disconnectBtn: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  disconnectText: { color: '#94a3b8' },
})
