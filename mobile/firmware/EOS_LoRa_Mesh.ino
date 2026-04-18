/*
 * EOS_LoRa_Mesh.ino
 *
 * EOS Emergency Operating System — LoRa Mesh Firmware
 * Target: ESP32 + SX1276 (TTGO LoRa32 V2 / Heltec WiFi LoRa 32)
 *
 * Responsibilities
 *  - Form an ad-hoc LoRa mesh (no infrastructure) for SURVIVAL mode comms
 *  - Forward packets with TTL-based flood routing + dedup cache
 *  - Expose a BLE GATT service for the EOS mobile app to read/write messages
 *
 * Packet format (little-endian):
 *   uint32_t nodeIdFrom   // sender
 *   uint32_t nodeIdTo     // 0xFFFFFFFF = broadcast
 *   uint16_t messageId    // sequence # per origin
 *   uint8_t  ttl          // hops remaining (decrement on forward, drop at 0)
 *   uint8_t  type         // 0=text, 1=beacon, 2=ack, 3=sos
 *   uint8_t  payloadLen
 *   uint8_t  payload[payloadLen]  // <= 200 bytes (LoRa MTU aware)
 *
 * Dependencies (Arduino Library Manager):
 *   - LoRa by Sandeep Mistry
 *   - ESP32 BLE Arduino (bundled with ESP32 core)
 *
 * License: MIT (c) EOS Systems 2026
 */

#include <SPI.h>
#include <LoRa.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <EEPROM.h>

// ============================================================
// Pin config — TTGO LoRa32 V2 (change for Heltec if needed)
// ============================================================
#define LORA_SCK   5
#define LORA_MISO 19
#define LORA_MOSI 27
#define LORA_CS   18
#define LORA_RST  23
#define LORA_DIO0 26

// Region: 915 MHz (Americas). Change to 868E6 for EU, 433E6 for Asia.
#define LORA_FREQ 915E6

// ============================================================
// Protocol constants
// ============================================================
#define MAX_PAYLOAD   200
#define DEFAULT_TTL   5
#define DEDUP_SLOTS   20
#define BROADCAST     0xFFFFFFFF

#define TYPE_TEXT    0
#define TYPE_BEACON  1
#define TYPE_ACK     2
#define TYPE_SOS     3

// ============================================================
// BLE UUIDs (custom EOS namespace — do not reuse)
// ============================================================
#define BLE_SERVICE_UUID       "e05a7a01-0000-4e4f-8000-524553455155"
#define BLE_CHAR_TX_UUID       "e05a7a01-0001-4e4f-8000-524553455155" // app -> node
#define BLE_CHAR_RX_UUID       "e05a7a01-0002-4e4f-8000-524553455155" // node -> app (notify)
#define BLE_CHAR_STATUS_UUID   "e05a7a01-0003-4e4f-8000-524553455155" // node status (read/notify)

// ============================================================
// State
// ============================================================
struct Packet {
  uint32_t from;
  uint32_t to;
  uint16_t messageId;
  uint8_t  ttl;
  uint8_t  type;
  uint8_t  payloadLen;
  uint8_t  payload[MAX_PAYLOAD];
};

struct DedupEntry {
  uint32_t from;
  uint16_t messageId;
};

static uint32_t myNodeId = 0;
static uint16_t nextMessageId = 1;
static DedupEntry dedupCache[DEDUP_SLOTS];
static uint8_t dedupHead = 0;
static uint32_t packetsSeen = 0;
static uint32_t packetsForwarded = 0;

BLEServer* bleServer = nullptr;
BLECharacteristic* rxChar = nullptr;      // node -> app (notify)
BLECharacteristic* statusChar = nullptr;  // status (read/notify)
bool bleClientConnected = false;

// ============================================================
// Helpers
// ============================================================
uint32_t loadOrCreateNodeId() {
  EEPROM.begin(16);
  uint32_t id = 0;
  EEPROM.get(0, id);
  if (id == 0 || id == 0xFFFFFFFF) {
    // Generate from MAC + random — stable per device
    id = ((uint32_t)ESP.getEfuseMac()) ^ esp_random();
    if (id == 0 || id == 0xFFFFFFFF) id = 0xDEADBEEF;
    EEPROM.put(0, id);
    EEPROM.commit();
  }
  return id;
}

bool seenBefore(uint32_t from, uint16_t messageId) {
  for (int i = 0; i < DEDUP_SLOTS; i++) {
    if (dedupCache[i].from == from && dedupCache[i].messageId == messageId) {
      return true;
    }
  }
  return false;
}

void rememberPacket(uint32_t from, uint16_t messageId) {
  dedupCache[dedupHead].from = from;
  dedupCache[dedupHead].messageId = messageId;
  dedupHead = (dedupHead + 1) % DEDUP_SLOTS;
}

void transmitPacket(const Packet& p) {
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&p.from, 4);
  LoRa.write((uint8_t*)&p.to, 4);
  LoRa.write((uint8_t*)&p.messageId, 2);
  LoRa.write(p.ttl);
  LoRa.write(p.type);
  LoRa.write(p.payloadLen);
  LoRa.write(p.payload, p.payloadLen);
  LoRa.endPacket();
}

void deliverToApp(const Packet& p) {
  if (\!bleClientConnected || \!rxChar) return;
  // Frame for BLE: same layout as LoRa packet, sent raw
  uint8_t buf[MAX_PAYLOAD + 12];
  size_t idx = 0;
  memcpy(buf + idx, &p.from, 4); idx += 4;
  memcpy(buf + idx, &p.to, 4); idx += 4;
  memcpy(buf + idx, &p.messageId, 2); idx += 2;
  buf[idx++] = p.ttl;
  buf[idx++] = p.type;
  buf[idx++] = p.payloadLen;
  memcpy(buf + idx, p.payload, p.payloadLen); idx += p.payloadLen;
  rxChar->setValue(buf, idx);
  rxChar->notify();
}

void updateStatus() {
  if (\!statusChar) return;
  char buf[96];
  int rssi = LoRa.packetRssi();
  snprintf(buf, sizeof(buf),
           "{\"nodeId\":%u,\"seen\":%u,\"fwd\":%u,\"rssi\":%d,\"ble\":%d}",
           (unsigned)myNodeId, (unsigned)packetsSeen, (unsigned)packetsForwarded,
           rssi, bleClientConnected ? 1 : 0);
  statusChar->setValue((uint8_t*)buf, strlen(buf));
  statusChar->notify();
}

// ============================================================
// LoRa RX handler (polled in loop())
// ============================================================
void handleLoRaReceive(int packetSize) {
  if (packetSize < 12) return; // malformed
  Packet p;
  LoRa.readBytes((uint8_t*)&p.from, 4);
  LoRa.readBytes((uint8_t*)&p.to, 4);
  LoRa.readBytes((uint8_t*)&p.messageId, 2);
  p.ttl = LoRa.read();
  p.type = LoRa.read();
  p.payloadLen = LoRa.read();
  if (p.payloadLen > MAX_PAYLOAD) return;
  for (int i = 0; i < p.payloadLen; i++) {
    if (\!LoRa.available()) return;
    p.payload[i] = LoRa.read();
  }

  packetsSeen++;

  // Dedup — drop if already seen
  if (seenBefore(p.from, p.messageId)) return;
  rememberPacket(p.from, p.messageId);

  // Deliver locally if addressed to us or broadcast
  if (p.to == myNodeId || p.to == BROADCAST) {
    deliverToApp(p);
  }

  // Forward if TTL remaining and not our own packet
  if (p.ttl > 1 && p.from \!= myNodeId) {
    Packet fwd = p;
    fwd.ttl -= 1;
    // Small random jitter to reduce collisions
    delay(random(10, 80));
    transmitPacket(fwd);
    packetsForwarded++;
  }
}

// ============================================================
// BLE — app writes to TX characteristic to send a packet
// ============================================================
class TxCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* ch) override {
    std::string v = ch->getValue();
    if (v.length() < 12 || v.length() > MAX_PAYLOAD + 12) return;
    Packet p;
    size_t idx = 0;
    memcpy(&p.to, v.data() + idx, 4); idx += 4;
    memcpy(&p.messageId, v.data() + idx, 2); idx += 2; // app can propose, we override below
    p.ttl = v[idx++];
    p.type = v[idx++];
    p.payloadLen = v[idx++];
    if (p.payloadLen > v.length() - idx) return;
    memcpy(p.payload, v.data() + idx, p.payloadLen);

    p.from = myNodeId;
    p.messageId = nextMessageId++;
    if (p.ttl == 0 || p.ttl > DEFAULT_TTL) p.ttl = DEFAULT_TTL;

    rememberPacket(p.from, p.messageId);
    transmitPacket(p);
  }
};

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleClientConnected = true; }
  void onDisconnect(BLEServer* s) override {
    bleClientConnected = false;
    s->startAdvertising(); // keep discoverable
  }
};

// ============================================================
// Setup / loop
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("[EOS] Booting LoRa mesh node..."));

  myNodeId = loadOrCreateNodeId();
  Serial.printf("[EOS] nodeId=%u\n", myNodeId);

  // LoRa init
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);
  if (\!LoRa.begin(LORA_FREQ)) {
    Serial.println(F("[EOS] LoRa init FAILED — halting"));
    while (true) { delay(1000); }
  }
  LoRa.setSpreadingFactor(9);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);
  LoRa.setTxPower(17);
  LoRa.enableCrc();
  Serial.println(F("[EOS] LoRa up @ 915 MHz SF9 BW125"));

  // BLE init
  char bleName[32];
  snprintf(bleName, sizeof(bleName), "EOS-%08X", (unsigned)myNodeId);
  BLEDevice::init(bleName);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCb());
  BLEService* svc = bleServer->createService(BLE_SERVICE_UUID);

  BLECharacteristic* txChar = svc->createCharacteristic(
    BLE_CHAR_TX_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  txChar->setCallbacks(new TxCallback());

  rxChar = svc->createCharacteristic(
    BLE_CHAR_RX_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  rxChar->addDescriptor(new BLE2902());

  statusChar = svc->createCharacteristic(
    BLE_CHAR_STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  statusChar->addDescriptor(new BLE2902());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.printf("[EOS] BLE advertising as %s\n", bleName);
  Serial.println(F("[EOS] Ready."));
}

uint32_t lastBeacon = 0;
uint32_t lastStatus = 0;

void loop() {
  int packetSize = LoRa.parsePacket();
  if (packetSize) handleLoRaReceive(packetSize);

  uint32_t now = millis();

  // Periodic beacon every 60s
  if (now - lastBeacon > 60000) {
    lastBeacon = now;
    Packet beacon = {};
    beacon.from = myNodeId;
    beacon.to = BROADCAST;
    beacon.messageId = nextMessageId++;
    beacon.ttl = 2;
    beacon.type = TYPE_BEACON;
    beacon.payloadLen = 0;
    rememberPacket(beacon.from, beacon.messageId);
    transmitPacket(beacon);
  }

  // Push status to app every 5s
  if (now - lastStatus > 5000) {
    lastStatus = now;
    updateStatus();
  }
}
