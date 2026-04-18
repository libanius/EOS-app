# EOS — Mobile (React Native bare workflow)

This folder contains the **intelligence layer + UI** for the EOS mobile app.

The roadmap splits the mobile setup into two gated steps:

1. **t61 / t62 (your responsibility):**
   - `npx react-native@latest init EOSMobile --template react-native-template-typescript`
   - `cd EOSMobile && npm install llama.rn react-native-fs zustand react-native-device-info @react-native-community/netinfo @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context`
   - `npx pod-install`
   - Enable **New Architecture** in Xcode and in the `AndroidManifest.xml`.

2. **t63 / t64 / t65 / t66 (already in this folder):**
   Copy the contents of `/mobile/` into the `EOSMobile/src/` directory of the RN
   project (rename or merge as you like). Wire `App.tsx` at the project root.

## File map

```
eos-intelligence-layer.ts   Production intelligence layer (llama.rn + RNFS)
App.tsx                     Navigation, connectivity, model bootstrap
store/index.ts              zustand global store
services/ConnectivityService.ts
                           Polls NetInfo and sets mode = CONNECTED | LOCAL_AI | SURVIVAL
screens/ModelSetupScreen.tsx
screens/ScenarioScreen.tsx
components/ModeIndicator.tsx
```

All screens match the EOS design system (dark base + green accent).

## Phase 11 — LoRa Mesh (Hardware)

### Firmware

`firmware/EOS_LoRa_Mesh.ino` — Arduino sketch for ESP32 + SX1276 boards
(TTGO LoRa32 V2 / Heltec WiFi LoRa 32).

**Flash steps:**

1. Install Arduino IDE 2.x + ESP32 board package (v2.0.14+).
2. Library Manager → install **LoRa by Sandeep Mistry**.
3. Board: `TTGO LoRa32-OLED` (or Heltec WiFi LoRa 32 V2).
4. Region — for USA leave `LORA_FREQ 915E6`. For EU use `868E6`, Asia `433E6`.
5. Upload. Open Serial Monitor @ 115200 baud — you should see:
   `[EOS] Booting LoRa mesh node...` / `[EOS] nodeId=...` / `[EOS] Ready.`

### Mobile client

Install react-native-ble-plx in `EOSMobile/`:

```
npm i react-native-ble-plx buffer
cd ios && pod install && cd ..
```

**Android permissions** (`android/app/src/main/AndroidManifest.xml`):
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.BLUETOOTH_SCAN` (+ `neverForLocation` flag)
- `android.permission.BLUETOOTH_CONNECT`

**iOS** (`ios/EOSMobile/Info.plist`):
- `NSBluetoothAlwaysUsageDescription` = "EOS conecta a nós LoRa para
  mensagens sem internet."

### End-to-end test (t114)

1. Flash two ESP32 LoRa boards — each generates a unique `nodeId`.
2. Physically separate them (opposite ends of a building or ~100m outside).
3. Open the EOS app on a phone near node A → `LoRa Mesh` screen → Scan.
4. Connect to node A. Send `"alive"` (broadcast).
5. Node B's serial log should print the incoming packet; if a second phone
   is paired to node B, the message appears in its feed.
6. With 3+ nodes, place node B out of node A's range but within node C's
   range — packets must still arrive at A via C (TTL decrements, dedup
   prevents storms).

Expected RSSI at 100m open field: ≥ −110 dBm with SF9 BW125.
