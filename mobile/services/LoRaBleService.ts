/**
 * LoRaBleService
 *
 * EOS mobile client for the ESP32 LoRa mesh firmware (EOS_LoRa_Mesh.ino).
 *
 * Responsibilities
 *  - Scan for EOS-xxxxxxxx BLE peripherals
 *  - Connect and subscribe to RX + STATUS characteristics
 *  - Expose a typed API for sending packets (TEXT, SOS, ACK)
 *  - Surface LORA_MESH mode when a node is connected (mode 4 in store)
 *
 * Requires: react-native-ble-plx (install: npm i react-native-ble-plx;
 * iOS: add NSBluetoothAlwaysUsageDescription; Android: ACCESS_FINE_LOCATION +
 * BLUETOOTH_SCAN + BLUETOOTH_CONNECT runtime permissions).
 */

import { BleManager, Device, Characteristic, Subscription } from 'react-native-ble-plx'
import { Buffer } from 'buffer'
import { useEOSStore } from '../store'

const BLE_SERVICE_UUID = 'e05a7a01-0000-4e4f-8000-524553455155'
const BLE_CHAR_TX_UUID = 'e05a7a01-0001-4e4f-8000-524553455155'
const BLE_CHAR_RX_UUID = 'e05a7a01-0002-4e4f-8000-524553455155'
const BLE_CHAR_STATUS_UUID = 'e05a7a01-0003-4e4f-8000-524553455155'

export const BROADCAST = 0xffffffff

export type PacketType = 0 | 1 | 2 | 3 // TEXT | BEACON | ACK | SOS

export interface IncomingPacket {
  from: number
  to: number
  messageId: number
  ttl: number
  type: PacketType
  payload: string
  rssi: number | null
}

export interface NodeStatus {
  nodeId: number
  seen: number
  fwd: number
  rssi: number
  ble: number
}

type PacketHandler = (p: IncomingPacket) => void
type StatusHandler = (s: NodeStatus) => void

class LoRaBleServiceImpl {
  private manager: BleManager | null = null
  private device: Device | null = null
  private rxSub: Subscription | null = null
  private statusSub: Subscription | null = null
  private packetHandlers = new Set<PacketHandler>()
  private statusHandlers = new Set<StatusHandler>()

  init() {
    if (this.manager) return
    this.manager = new BleManager()
  }

  onPacket(h: PacketHandler): () => void {
    this.packetHandlers.add(h)
    return () => this.packetHandlers.delete(h)
  }

  onStatus(h: StatusHandler): () => void {
    this.statusHandlers.add(h)
    return () => this.statusHandlers.delete(h)
  }

  /** Scan for up to 10 s, return the first EOS-* device found. */
  async scan(timeoutMs = 10000): Promise<Device | null> {
    this.init()
    if (!this.manager) return null
    const manager = this.manager
    return new Promise((resolve) => {
      let resolved = false
      const done = (d: Device | null) => {
        if (resolved) return
        resolved = true
        try {
          manager.stopDeviceScan()
        } catch {}
        resolve(d)
      }
      manager.startDeviceScan([BLE_SERVICE_UUID], null, (err, d) => {
        if (err) {
          done(null)
          return
        }
        if (d && d.name && d.name.startsWith('EOS-')) {
          done(d)
        }
      })
      setTimeout(() => done(null), timeoutMs)
    })
  }

  /** Connect to a device and subscribe to notifications. */
  async connect(device: Device): Promise<boolean> {
    this.init()
    try {
      this.device = await device.connect()
      await this.device.discoverAllServicesAndCharacteristics()

      this.rxSub = this.device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_RX_UUID,
        (err, ch) => {
          if (err || !ch || !ch.value) return
          const packet = this.parsePacket(ch)
          if (packet) this.packetHandlers.forEach((h) => h(packet))
        }
      )

      this.statusSub = this.device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_STATUS_UUID,
        (err, ch) => {
          if (err || !ch || !ch.value) return
          try {
            const json = Buffer.from(ch.value, 'base64').toString('utf8')
            const status: NodeStatus = JSON.parse(json)
            this.statusHandlers.forEach((h) => h(status))
          } catch {}
        }
      )

      // Transition to LORA_MESH mode in store
      useEOSStore.getState().setMode('LORA_MESH')

      this.device.onDisconnected(() => {
        this.handleDisconnect()
      })

      return true
    } catch {
      this.handleDisconnect()
      return false
    }
  }

  /** Send a text packet. Returns true on write success. */
  async sendText(to: number, text: string): Promise<boolean> {
    return this.sendPacket(to, 0, Buffer.from(text, 'utf8'))
  }

  /** Send an SOS beacon (broadcast, high priority). */
  async sendSOS(text: string): Promise<boolean> {
    return this.sendPacket(BROADCAST, 3, Buffer.from(text, 'utf8'))
  }

  private async sendPacket(
    to: number,
    type: PacketType,
    payload: Buffer
  ): Promise<boolean> {
    if (!this.device || payload.length > 200) return false
    // Frame per firmware TxCallback: to(4) + messageId(2, ignored) + ttl(1) + type(1) + len(1) + payload
    const buf = Buffer.alloc(9 + payload.length)
    buf.writeUInt32LE(to, 0)
    buf.writeUInt16LE(0, 4) // messageId — firmware overrides
    buf.writeUInt8(5, 6) // ttl — default
    buf.writeUInt8(type, 7)
    buf.writeUInt8(payload.length, 8)
    payload.copy(buf, 9)
    try {
      await this.device.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_TX_UUID,
        buf.toString('base64')
      )
      return true
    } catch {
      return false
    }
  }

  private parsePacket(ch: Characteristic): IncomingPacket | null {
    if (!ch.value) return null
    const b = Buffer.from(ch.value, 'base64')
    if (b.length < 12) return null
    const from = b.readUInt32LE(0)
    const to = b.readUInt32LE(4)
    const messageId = b.readUInt16LE(8)
    const ttl = b.readUInt8(10)
    const type = b.readUInt8(11) as PacketType
    const len = b.readUInt8(12)
    const payloadBuf = b.slice(13, 13 + len)
    return {
      from,
      to,
      messageId,
      ttl,
      type,
      payload: payloadBuf.toString('utf8'),
      rssi: null,
    }
  }

  private handleDisconnect() {
    this.rxSub?.remove()
    this.statusSub?.remove()
    this.rxSub = null
    this.statusSub = null
    this.device = null
    // Step back down to best available mode
    const s = useEOSStore.getState()
    s.setMode(s.modelReady ? 'LOCAL_AI' : 'SURVIVAL')
  }

  async disconnect() {
    try {
      if (this.device) await this.device.cancelConnection()
    } catch {}
    this.handleDisconnect()
  }
}

export const LoRaBleService = new LoRaBleServiceImpl()
