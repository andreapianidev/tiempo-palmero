/**
 * Cuántas teselas de fondo pide una pantalla de verdad, con los bordes.
 *
 * De aquí sale `INTENT_MAX_TILES` en `tiles/budget.ts`. La cuenta que se venía
 * usando —«1440 × 900 con teselas de 512 CSS px son 4 × 3»— es la de las
 * teselas ENTERAS, y las de los bordes también se piden: una ventana casi
 * nunca cae alineada con la rejilla, así que lo normal es una columna y una
 * fila de más.
 *
 * No pide nada a GRAFCAN: solo cuenta contra la rejilla de `tiles/grid.ts`.
 *
 *   npx tsx scripts/checks/pantalla-teselas.ts
 */

import { tilesInBbox } from '../../src/lib/tiles/grid'
import { TILE_CSS_SIZE } from '../../src/lib/realce/density'

const R2D = 180 / Math.PI

/** El bbox en grados de una ventana de w × h CSS px centrada en (lon, lat). */
function ventana(lon: number, lat: number, z: number, w: number, h: number) {
  const mundo = TILE_CSS_SIZE * 2 ** z
  const dLon = (w / mundo) * 360
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / R2D / 2)) / (2 * Math.PI)
  const dY = h / mundo
  const aLat = (yy: number) =>
    (2 * Math.atan(Math.exp((0.5 - yy) * 2 * Math.PI)) - Math.PI / 2) * R2D
  return {
    west: lon - dLon / 2,
    east: lon + dLon / 2,
    north: aLat(y - dY / 2),
    south: aLat(y + dY / 2),
  }
}

/** Tres sitios de la isla, para que la cuenta no dependa de dónde caiga la rejilla. */
const SITIOS: [string, number, number][] = [
  ['Los Llanos', -17.917, 28.61],
  ['Santa Cruz', -17.764, 28.681],
  ['Roque de los Muchachos', -17.885, 28.754],
]

const PANTALLAS: [string, number, number][] = [
  ['portátil 1440 × 900', 1440, 900],
  ['MacBook Pro 16" 1728 × 1117', 1728, 1117],
  ['iMac 27" 2560 × 1440', 2560, 1440],
  ['4K 3840 × 2160', 3840, 2160],
]

/** Los niveles que usa la app, de la vista inicial al techo de las fuentes. */
const ZOOMS = [9, 11, 13, 14, 15, 16, 17]

for (const [nombre, w, h] of PANTALLAS) {
  let peor = { n: 0, sitio: '', z: 0, bbox: {} }
  const formas = new Set<string>()
  for (const z of ZOOMS) {
    for (const [sitio, lon, lat] of SITIOS) {
      const bbox = ventana(lon, lat, z, w, h)
      const t = tilesInBbox(bbox, z)
      formas.add(`${new Set(t.map((a) => a.x)).size}×${new Set(t.map((a) => a.y)).size}`)
      if (t.length > peor.n) peor = { n: t.length, sitio, z, bbox }
    }
  }
  console.log(
    `${nombre.padEnd(30)} peor caso ${String(peor.n).padStart(3)} teselas (${peor.sitio}, z${peor.z}) · formas ${[...formas].sort().join(' ')}`,
  )
  // El bbox del peor caso, para poder fijarlo en una prueba sin recalcularlo.
  console.log(`${''.padEnd(30)} ${JSON.stringify({ ...peor.bbox, zoom: peor.z })}`)
}
