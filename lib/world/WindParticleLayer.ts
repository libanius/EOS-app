import type { Map as MLMap } from 'maplibre-gl'
import type { WindReading } from './wind'

export type WindParticleLayerConfig = {
  particleCount: number
  mobileParticleCount: number
  fadeAlpha: number
  lineWidth: number
  speedScale: number
  maxAgeMin: number
  maxAgeJitter: number
  scalarOpacity: number
  scalarMaxDpr: number
}

type Particle = {
  lng: number
  lat: number
  age: number
  maxAge: number
}

type Vector = {
  uMps: number
  vMps: number
  speedMph: number
}

type Grid = {
  lats: number[]
  lngs: number[]
  cells: Array<Array<WindReading | null>>
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const DEFAULT_CONFIG: WindParticleLayerConfig = {
  particleCount: 1800,
  mobileParticleCount: 780,
  fadeAlpha: 0.9,
  lineWidth: 1.05,
  speedScale: 0.00018,
  maxAgeMin: 42,
  maxAgeJitter: 78,
  scalarOpacity: 0.62,
  scalarMaxDpr: 1.25,
}

function uniqSorted(values: number[]) {
  return Array.from(new Set(values.map(v => Number(v.toFixed(4))))).sort((a, b) => a - b)
}

function colorFor(speedMph: number) {
  if (speedMph >= 45) return 'rgba(255,255,255,0.92)'
  if (speedMph >= 32) return 'rgba(255,202,88,0.86)'
  if (speedMph >= 22) return 'rgba(74,222,128,0.78)'
  if (speedMph >= 12) return 'rgba(82,178,255,0.72)'
  return 'rgba(136,116,255,0.58)'
}

function scalarColor(speedMph: number, opacity: number): [number, number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 72, 66, 255],
    [10, 55, 185, 242],
    [20, 82, 222, 128],
    [32, 255, 214, 10],
    [45, 255, 130, 44],
    [62, 255, 69, 58],
    [85, 255, 255, 255],
  ]
  if (speedMph <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3], Math.round(120 * opacity)]
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]
    const b = stops[i + 1]
    if (speedMph <= b[0]) {
      const t = (speedMph - a[0]) / (b[0] - a[0])
      const mix = (x: number, y: number) => Math.round(x + (y - x) * t)
      return [mix(a[1], b[1]), mix(a[2], b[2]), mix(a[3], b[3]), Math.round(255 * opacity)]
    }
  }
  return [255, 255, 255, Math.round(245 * opacity)]
}

function makeGrid(readings: WindReading[]): Grid | null {
  const lats = uniqSorted(readings.map(r => r.lat))
  const lngs = uniqSorted(readings.map(r => r.lng))
  if (lats.length < 2 || lngs.length < 2) return null

  const byKey = new Map<string, WindReading>()
  readings.forEach(r => byKey.set(`${r.lat.toFixed(4)},${r.lng.toFixed(4)}`, r))

  const cells = lats.map(lat => lngs.map(lng => byKey.get(`${lat.toFixed(4)},${lng.toFixed(4)}`) ?? null))
  return {
    lats,
    lngs,
    cells,
    minLat: lats[0],
    maxLat: lats[lats.length - 1],
    minLng: lngs[0],
    maxLng: lngs[lngs.length - 1],
  }
}

function lowerIndex(axis: number[], value: number) {
  if (value < axis[0] || value > axis[axis.length - 1]) return -1
  let lo = 0
  let hi = axis.length - 1
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (axis[mid] <= value) lo = mid
    else hi = mid
  }
  return lo
}

function interpolate(grid: Grid, lng: number, lat: number): Vector | null {
  const ix = lowerIndex(grid.lngs, lng)
  const iy = lowerIndex(grid.lats, lat)
  if (ix < 0 || iy < 0 || ix >= grid.lngs.length - 1 || iy >= grid.lats.length - 1) return null

  const q11 = grid.cells[iy][ix]
  const q21 = grid.cells[iy][ix + 1]
  const q12 = grid.cells[iy + 1][ix]
  const q22 = grid.cells[iy + 1][ix + 1]
  if (!q11 || !q21 || !q12 || !q22) return null

  const x1 = grid.lngs[ix]
  const x2 = grid.lngs[ix + 1]
  const y1 = grid.lats[iy]
  const y2 = grid.lats[iy + 1]
  const tx = x2 === x1 ? 0 : (lng - x1) / (x2 - x1)
  const ty = y2 === y1 ? 0 : (lat - y1) / (y2 - y1)
  const blend = (a: number, b: number, c: number, d: number) =>
    a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty

  return {
    uMps: blend(q11.uMps, q21.uMps, q12.uMps, q22.uMps),
    vMps: blend(q11.vMps, q21.vMps, q12.vMps, q22.vMps),
    speedMph: blend(q11.speedMph, q21.speedMph, q12.speedMph, q22.speedMph),
  }
}

export class WindParticleLayer {
  private map: MLMap
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private scalarCanvas: HTMLCanvasElement | null
  private scalarCtx: CanvasRenderingContext2D | null
  private config: WindParticleLayerConfig
  private particles: Particle[] = []
  private grid: Grid | null = null
  private enabled = false
  private frame: number | null = null
  private scalarTimer: number | null = null
  private scalarPixels = 0
  private hidden = false

  constructor(
    map: MLMap,
    canvas: HTMLCanvasElement,
    scalarCanvas: HTMLCanvasElement | null = null,
    config: Partial<WindParticleLayerConfig> = {},
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('wind_canvas_unavailable')
    this.map = map
    this.canvas = canvas
    this.ctx = ctx
    this.scalarCanvas = scalarCanvas
    this.scalarCtx = scalarCanvas?.getContext('2d', { willReadFrequently: false }) ?? null
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.handleVisibility = this.handleVisibility.bind(this)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  enable() {
    if (this.enabled) return
    this.enabled = true
    this.resize()
    this.scheduleScalarRender()
    this.ensureParticles()
    this.loop()
  }

  disable() {
    this.enabled = false
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    if (this.scalarTimer !== null) window.clearTimeout(this.scalarTimer)
    this.frame = null
    this.scalarTimer = null
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.clearScalar()
    this.debug(false)
  }

  destroy() {
    this.disable()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.particles = []
    this.grid = null
  }

  setData(readings: WindReading[]) {
    this.grid = makeGrid(readings)
    this.particles = []
    if (this.enabled) {
      this.resize()
      this.scheduleScalarRender()
      this.ensureParticles()
      this.debug(true)
    }
  }

  updateViewport() {
    if (!this.enabled) return
    this.resize()
    this.scheduleScalarRender()
  }

  sample(lng: number, lat: number) {
    return this.grid ? interpolate(this.grid, lng, lat) : null
  }

  private handleVisibility() {
    this.hidden = document.visibilityState !== 'visible'
    if (!this.hidden && this.enabled && this.frame === null) this.loop()
    if (!this.hidden && this.enabled) this.scheduleScalarRender()
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private resizeScalar() {
    const canvas = this.scalarCanvas
    const ctx = this.scalarCtx
    if (!canvas || !ctx) return null
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.scalarMaxDpr)
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return { width, height, dpr }
  }

  private clearScalar() {
    const canvas = this.scalarCanvas
    const ctx = this.scalarCtx
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    this.scalarPixels = 0
  }

  private scheduleScalarRender() {
    if (!this.enabled || this.hidden) return
    if (this.scalarTimer !== null) window.clearTimeout(this.scalarTimer)
    this.scalarTimer = window.setTimeout(() => {
      this.scalarTimer = null
      this.renderScalarField()
    }, 120)
  }

  private renderScalarField() {
    const grid = this.grid
    const ctx = this.scalarCtx
    const size = this.resizeScalar()
    if (!grid || !ctx || !size) {
      this.clearScalar()
      return
    }
    const { width, height, dpr } = size
    const image = ctx.createImageData(width, height)
    const data = image.data
    let drawn = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const lngLat = this.map.unproject([x / dpr, y / dpr])
        const vector = interpolate(grid, lngLat.lng, lngLat.lat)
        const idx = (y * width + x) * 4
        if (!vector) {
          data[idx + 3] = 0
          continue
        }
        const [r, g, b, a] = scalarColor(vector.speedMph, this.config.scalarOpacity)
        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = a
        drawn += 1
      }
    }
    ctx.putImageData(image, 0, 0)
    this.scalarPixels = drawn
    this.debug(true)
  }

  private targetCount() {
    const mobile = window.matchMedia('(max-width: 700px)').matches
    return mobile ? this.config.mobileParticleCount : this.config.particleCount
  }

  private ensureParticles() {
    const target = this.targetCount()
    while (this.particles.length < target) this.particles.push(this.newParticle())
    if (this.particles.length > target) this.particles.length = target
  }

  private newParticle(): Particle {
    const p = { lng: 0, lat: 0, age: 0, maxAge: 1 }
    this.respawn(p)
    p.age = Math.random() * p.maxAge
    return p
  }

  private respawn(p: Particle) {
    const grid = this.grid
    if (!grid) return
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const lng = grid.minLng + Math.random() * (grid.maxLng - grid.minLng)
      const lat = grid.minLat + Math.random() * (grid.maxLat - grid.minLat)
      if (interpolate(grid, lng, lat)) {
        p.lng = lng
        p.lat = lat
        p.age = 0
        p.maxAge = this.config.maxAgeMin + Math.random() * this.config.maxAgeJitter
        return
      }
    }
  }

  private stepParticle(p: Particle) {
    const vector = this.grid ? interpolate(this.grid, p.lng, p.lat) : null
    if (!vector) {
      this.respawn(p)
      return
    }
    const old = this.map.project([p.lng, p.lat])
    const latRad = p.lat * Math.PI / 180
    p.lng += (vector.uMps * this.config.speedScale) / Math.max(0.2, Math.cos(latRad))
    p.lat += vector.vMps * this.config.speedScale
    const moved = this.grid ? interpolate(this.grid, p.lng, p.lat) : null
    if (!moved) {
      this.respawn(p)
      return
    }
    const next = this.map.project([p.lng, p.lat])
    this.ctx.strokeStyle = colorFor(vector.speedMph)
    this.ctx.lineWidth = vector.speedMph >= 32 ? this.config.lineWidth * 1.45 : this.config.lineWidth
    this.ctx.beginPath()
    this.ctx.moveTo(old.x, old.y)
    this.ctx.lineTo(next.x, next.y)
    this.ctx.stroke()
    p.age += 1
    if (p.age > p.maxAge) this.respawn(p)
  }

  private loop = () => {
    if (!this.enabled) return
    if (this.hidden || !this.grid) {
      this.frame = requestAnimationFrame(this.loop)
      return
    }
    this.resize()
    const rect = this.canvas.getBoundingClientRect()
    this.ctx.globalCompositeOperation = 'destination-in'
    this.ctx.fillStyle = `rgba(0,0,0,${this.config.fadeAlpha})`
    this.ctx.fillRect(0, 0, rect.width, rect.height)
    this.ctx.globalCompositeOperation = 'source-over'
    this.ensureParticles()
    this.particles.forEach(p => this.stepParticle(p))
    this.debug(true)
    this.frame = requestAnimationFrame(this.loop)
  }

  private debug(active: boolean) {
    ;(window as unknown as { __eosWindLayer?: unknown }).__eosWindLayer = active
      ? {
          active: true,
          mode: 'bilinear',
          scalar: Boolean(this.scalarCanvas),
          scalarPixels: this.scalarPixels,
          particles: this.particles.length,
          readings: this.grid ? this.grid.lats.length * this.grid.lngs.length : 0,
          grid: this.grid ? `${this.grid.lngs.length}x${this.grid.lats.length}` : null,
        }
      : { active: false }
  }
}
