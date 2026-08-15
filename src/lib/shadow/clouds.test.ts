import { describe, expect, it } from 'vitest'
import type { Dem, DemManifest } from '../dem'
import { pixelXToLon, pixelYToLat } from '../geo'
import { EFFECTIVE_OVERLAP, type Cloud, type Puff } from '../sky/scene'
import { cloudShadowMask } from './clouds'

// Un DEM plano PERO PUESTO SOBRE LA PALMA: las nubes se sitúan en grados, y
// sobre un recuadro en el Ártico el coseno de la latitud deformaría todo.
const ZOOM = 12
const TILE = 256
const X0 = 1841
const Y0 = 1703
const MPP = 33.54
const W = 512
const H = 512

function palmaDem(fill = 0): Dem {
  const manifest: DemManifest = {
    zoom: ZOOM,
    minZoom: 9,
    tileSize: TILE,
    x0: X0,
    y0: Y0,
    cols: 2,
    rows: 2,
    metersPerPixel: MPP,
    attribution: '',
    encoding: 'terrarium',
    generated: '',
  }
  const heights = new Float32Array(W * H)
  if (fill) heights.fill(fill)
  return { manifest, heights, width: W, height: H, originX: X0 * TILE, originY: Y0 * TILE }
}

const CENTER_LON = pixelXToLon(X0 * TILE + W / 2, ZOOM)
const CENTER_LAT = pixelYToLat(Y0 * TILE + H / 2, ZOOM)

function puff(over: Partial<Puff> = {}): Puff {
  return { dx: 0, dy: 0, h: 0.5, radiusM: 600, seed: 0.5, phase: 0, ...over }
}

function cloud(over: Partial<Cloud> = {}): Cloud {
  return {
    lon: CENTER_LON,
    lat: CENTER_LAT,
    etage: 'low',
    base: 1000,
    top: 1400,
    radiusM: 2600,
    puffs: [puff()],
    precipMm: 0,
    density: 0.8,
    u: 0,
    v: 0,
    ...over,
  }
}

/** Celda más oscura de la malla, y dónde está. */
function darkest(mask: { data: Uint8Array; width: number }) {
  let best = -1
  let at = { x: 0, y: 0 }
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] > best) {
      best = mask.data[i]
      at = { x: i % mask.width, y: Math.floor(i / mask.width) }
    }
  }
  return { value: best, ...at }
}

describe('cloudShadowMask', () => {
  it('no proyecta nada de noche ni sin nubes', () => {
    expect(cloudShadowMask(palmaDem(), [cloud()], { elevationDeg: -5, azimuthDeg: 90 })).toBeNull()
    expect(cloudShadowMask(palmaDem(), [], { elevationDeg: 45, azimuthDeg: 90 })).toBeNull()
  })

  it('con el sol en la vertical la mancha cae debajo de la nube', () => {
    const dem = palmaDem()
    const mask = cloudShadowMask(dem, [cloud()], { elevationDeg: 89.5, azimuthDeg: 180 })!
    const dark = darkest(mask)
    expect(dark.value).toBeGreaterThan(0)
    // El centro de la malla, con una celda de margen.
    expect(Math.abs(dark.x - mask.width / 2)).toBeLessThan(2)
    expect(Math.abs(dark.y - mask.height / 2)).toBeLessThan(2)
  })

  it('con el sol por el este la mancha se va al oeste, y a la distancia que toca', () => {
    const dem = palmaDem()
    // Nube a 1200 m de cota media, sol a 45°: la sombra cae a 1200 m al oeste.
    const mask = cloudShadowMask(dem, [cloud()], { elevationDeg: 45, azimuthDeg: 90 })!
    const dark = darkest(mask)
    const cells = 1200 / mask.metersPerCell
    expect(mask.width / 2 - dark.x).toBeGreaterThan(cells - 2)
    expect(mask.width / 2 - dark.x).toBeLessThan(cells + 2)
    // Sin desplazarse en latitud.
    expect(Math.abs(dark.y - mask.height / 2)).toBeLessThan(2)
  })

  it('con el sol por el sur la mancha se va al norte', () => {
    const dem = palmaDem()
    const mask = cloudShadowMask(dem, [cloud()], { elevationDeg: 45, azimuthDeg: 180 })!
    const dark = darkest(mask)
    // Fila menor = más al norte.
    expect(dark.y).toBeLessThan(mask.height / 2 - 2)
    expect(Math.abs(dark.x - mask.width / 2)).toBeLessThan(2)
  })

  it('la mancha se estira en la dirección de la luz con el sol bajo', () => {
    const dem = palmaDem()
    const mask = cloudShadowMask(dem, [cloud()], { elevationDeg: 12, azimuthDeg: 90 })!
    const dark = darkest(mask)
    // Se mide el ancho de la mancha en la fila y en la columna del máximo.
    let alongLight = 0
    for (let x = 0; x < mask.width; x++) if (mask.data[dark.y * mask.width + x] > 0) alongLight++
    let acrossLight = 0
    for (let y = 0; y < mask.height; y++) if (mask.data[y * mask.width + dark.x] > 0) acrossLight++
    // 1/sen(12°) = 4,8. Se pide bastante menos por el recorte de la malla y el
    // redondeo a celdas, pero la anisotropía tiene que verse sin discusión.
    expect(alongLight).toBeGreaterThan(acrossLight * 3)
  })

  it('las motas que se solapan devuelven la opacidad de la nube, no más', () => {
    // Es la prueba que ata esta sombra a lo que se ve arriba: apilando
    // EFFECTIVE_OVERLAP motas en el mismo sitio tiene que salir la densidad de
    // la nube. Una mota suelta da la quinta parte, y eso es correcto — una nube
    // de verdad tiene treinta.
    const dem = palmaDem()
    const stacked = cloud({
      density: 0.8,
      puffs: Array.from({ length: EFFECTIVE_OVERLAP }, () => puff()),
    })
    const mask = cloudShadowMask(dem, [stacked], { elevationDeg: 89.5, azimuthDeg: 180 })!
    expect(darkest(mask).value / 255).toBeCloseTo(0.8, 1)
  })

  it('una nube más espesa da una sombra más oscura', () => {
    const dem = palmaDem()
    const sun = { elevationDeg: 60, azimuthDeg: 180 }
    const thin = darkest(cloudShadowMask(dem, [cloud({ density: 0.2 })], sun)!).value
    const thick = darkest(cloudShadowMask(dem, [cloud({ density: 0.95 })], sun)!).value
    expect(thick).toBeGreaterThan(thin * 2)
  })

  it('el terreno acorta la caída: una nube sobre una montaña proyecta más cerca', () => {
    const sun = { elevationDeg: 30, azimuthDeg: 90 }
    const sea = darkest(cloudShadowMask(palmaDem(0), [cloud()], sun)!)
    const summit = darkest(cloudShadowMask(palmaDem(1000), [cloud()], sun)!)
    // Con 1000 m de terreno debajo, al rayo le quedan 200 m de caída en vez de
    // 1200: la mancha se queda mucho más cerca de la vertical de la nube.
    expect(summit.x).toBeGreaterThan(sea.x + 5)
  })

  it('apilar nubes no revienta la escala: la sombra satura, no desborda', () => {
    const dem = palmaDem()
    const many = Array.from({ length: 12 }, () => cloud({ density: 0.99 }))
    const mask = cloudShadowMask(dem, many, { elevationDeg: 89.5, azimuthDeg: 180 })!
    expect(darkest(mask).value).toBeLessThanOrEqual(255)
    expect(darkest(mask).value).toBeGreaterThan(240)
  })

  it('las motas de una nube componen una sola mancha, no un racimo de lunares', () => {
    const dem = palmaDem()
    // Tres motas separadas 500 m: con radio 600 se solapan y el hueco entre
    // ellas tiene que quedar en sombra, no en blanco.
    const c = cloud({
      puffs: [puff({ dx: -500 }), puff({ dx: 0 }), puff({ dx: 500 })],
      density: 0.7,
    })
    const mask = cloudShadowMask(dem, [c], { elevationDeg: 89.5, azimuthDeg: 180 })!
    const row = mask.height >> 1
    const between = mask.data[row * mask.width + (mask.width >> 1) + 2]
    expect(between).toBeGreaterThan(60)
  })
})
