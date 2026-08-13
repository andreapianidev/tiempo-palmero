/**
 * Qué pendientes y qué orientaciones tiene de verdad esta isla.
 *
 * De aquí salen las cifras que van en los comentarios de `lib/fire/terrain.ts`
 * y en su test. La regla del repositorio es que un umbral se mide contra el
 * dato real; esta es la medición, y se deja escrita para poder repetirla el día
 * que el DEM cambie de resolución.
 *
 *   npx tsx scripts/checks/relief-check.ts
 */

import { loadDem } from '../dem-node.js'
import { SEA_LEVEL_M } from '../../src/lib/dem.js'
import { pixelXToLon, pixelYToLat } from '../../src/lib/geo.js'
import { reliefAtPixel, SLOPE_STEP_PX } from '../../src/lib/fire/terrain.js'

const dem = loadDem()
const { zoom, metersPerPixel } = dem.manifest
const step = SLOPE_STEP_PX

const slopes: number[] = []
const aspects = new Array(8).fill(0) as number[]
let land = 0
let flat = 0
let steepest = { slope: 0, lon: 0, lat: 0, elev: 0 }

// El CENTRO de cada celda, no su esquina: es como muestrea `rasterizeGrid` y
// como muestrea el entrenamiento en `scripts/ml/`. Con la esquina salían once
// celdas de tierra de más, todas en el borde de la costa, y las tres cuentas
// dejaban de ser la misma cuenta.
const half = step >> 1
for (let y = half; y < dem.height; y += step) {
  for (let x = half; x < dem.width; x += step) {
    const elev = dem.heights[y * dem.width + x]
    if (elev <= SEA_LEVEL_M) continue
    land++
    const r = reliefAtPixel(dem, x, y, step)
    slopes.push(r.slopeDeg)
    if (r.aspectDeg === null) {
      flat++
    } else {
      aspects[Math.floor(((r.aspectDeg + 22.5) % 360) / 45)]++
    }
    if (r.slopeDeg > steepest.slope) {
      steepest = {
        slope: r.slopeDeg,
        lon: pixelXToLon(dem.originX + x, zoom),
        lat: pixelYToLat(dem.originY + y, zoom),
        elev,
      }
    }
  }
}

slopes.sort((a, b) => a - b)
const q = (p: number) => slopes[Math.min(slopes.length - 1, Math.floor(p * slopes.length))]
const mean = slopes.reduce((s, v) => s + v, 0) / slopes.length

console.log(`DEM z${zoom}, paso ${step} px = ${(step * metersPerPixel).toFixed(0)} m`)
console.log(`celdas de tierra: ${land}   llanas (<0,1°): ${flat} (${((flat / land) * 100).toFixed(2)} %)`)
console.log(
  `pendiente  media ${mean.toFixed(1)}°  mediana ${q(0.5).toFixed(1)}°  ` +
    `p90 ${q(0.9).toFixed(1)}°  p99 ${q(0.99).toFixed(1)}°  máx ${slopes[slopes.length - 1].toFixed(1)}°`,
)
console.log(
  `la más inclinada: ${steepest.slope.toFixed(1)}° en ` +
    `${steepest.lat.toFixed(4)}, ${steepest.lon.toFixed(4)} a ${steepest.elev.toFixed(0)} m`,
)

const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const withAspect = land - flat
console.log('orientación (reparto de la isla):')
for (let i = 0; i < 8; i++) {
  const pct = (aspects[i] / withAspect) * 100
  console.log(`  ${NAMES[i].padEnd(2)} ${pct.toFixed(1).padStart(5)} %  ${'█'.repeat(Math.round(pct))}`)
}
