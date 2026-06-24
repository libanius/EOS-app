# 05 — Platform Strategy

---

## Active Platform: Web PWA

**Status**: Live on Vercel. Auto-deploys on push to main.

The Web PWA is the MVP. It works on all devices with a browser.
Installable on iOS (Safari Add to Home Screen) and Android (Chrome install prompt).

**Offline capability**: SURVIVAL mode + IndexedDB cache for profile/inventory/plans.

---

## Planned Platform: React Native

**Status**: Template files exist in `/mobile/`. Project NOT initialized.

`npx react-native init EOSMobile` has not been run.
The mobile app is a Phase 2 goal, blocked until the Web PWA passes end-to-end testing.

Key mobile features (Phase 2):
- LOCAL_AI mode via llama.rn (on-device model, works without internet)
- LoRa BLE bridge screen (connect to ESP32 LoRa mesh)
- Secure storage for JWT (SecureStore)
- Push notifications

---

## Long-Horizon Platform: LoRa Mesh

**Status**: ESP32 firmware prototype exists. Not integrated with app.

LoRa (Long Range radio) allows communication between devices without internet or cell towers.
Use case: neighborhood coordination during infrastructure collapse.

Phase 4 goal. Blocked on mobile app completion and Gate G-05.

---

## Platform Gaps

| Gap | Severity | Notes |
|---|---|---|
| PWA icons missing | LOW | icon-192.png and icon-512.png not in /public/ |
| React Native not initialized | MEDIUM | /mobile/ is a template, not a working app |
| LOCAL_AI not implemented | MEDIUM | llama.rn integration is Phase 2 |
| LoRa not integrated | LOW | Long-horizon, Phase 4 |
