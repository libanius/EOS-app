/**
 * EOS — Connectivity service
 *
 * Polls NetInfo every 10 seconds (plus reacts to change events) and sets the
 * global `mode` in the store:
 *   - Internet reachable + healthy → CONNECTED
 *   - Offline + local model ready  → LOCAL_AI
 *   - Offline + no model           → SURVIVAL
 *
 * CA-03 spec: detector must react within 35 s of Wi-Fi disconnect. Polling
 * at 10 s + event listener comfortably beats that.
 */

import NetInfo from '@react-native-community/netinfo'
import { useEOSStore } from '../store'
import { modelManager } from '../eos-intelligence-layer'

const POLL_MS = 10_000

let started = false

export function startConnectivityService(): void {
  if (started) return
  started = true

  const evaluate = async () => {
    const state = await NetInfo.fetch()
    const online = state.isConnected && state.isInternetReachable !== false
    const modelReady = await modelManager.isReady()

    const next = online ? 'CONNECTED' : modelReady ? 'LOCAL_AI' : 'SURVIVAL'
    const store = useEOSStore.getState()
    if (store.mode !== next) {
      store.setMode(next)
    }
  }

  // React to any change immediately
  NetInfo.addEventListener(() => {
    void evaluate()
  })

  // Poll safety net (covers captive portals, flaky networks)
  setInterval(() => {
    void evaluate()
  }, POLL_MS)

  void evaluate()
}
