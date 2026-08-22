/**
 * El perfil de las dos travesías que la isla usa para subir al Roque.
 *
 * Existe porque la portada iba a afirmar dos cosas con números —«la carretera
 * sube tanto en tantos kilómetros», «el GR-131 cruza la isla de la costa a la
 * cumbre»— y en este repositorio un número en texto se mide antes de
 * escribirlo. Las dos geometrías ya están en `public/layers/`, y la cota sale
 * del MISMO DEM con el que la aplicación corrige por altitud, así que lo que
 * salga de aquí es lo que el motor cree que hay bajo esas líneas.
 *
 * QUÉ NO ES. No es un perfil de carretera de precisión topográfica: el DEM de
 * la app tiene ~5 m de paso y una carretera de montaña cabe entera en un par de
 * celdas, así que el desnivel acumulado de la suma de tramos se dispara con el
 * ruido. Por eso aquí se publica el RANGO (mínimo, máximo, diferencia) y la
 * pendiente media del tramo que sube, que son robustos, y el acumulado se da
 * solo con un umbral de ruido declarado al lado.
 *
 *   npx tsx scripts/checks/subida-roque.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { elevationAt } from '../../src/lib/dem'
import { loadDem, REPO_ROOT } from '../dem-node'

type Pos = [number, number]

/** Metros que mide un grado de latitud. El mismo que usa `wind/field.ts`. */
const METERS_PER_DEG_LAT = 110_574

function metres(a: Pos, b: Pos): number {
  const mLon = METERS_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  const dx = (b[0] - a[0]) * mLon
  const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

function lines(feature: any): Pos[][] {
  const g = feature.geometry
  return g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]
}

function layer(name: string): any[] {
  const path = join(REPO_ROOT, `public/layers/${name}.geojson`)
  return JSON.parse(readFileSync(path, 'utf8')).features
}

interface Profile {
  km: number
  min: number
  max: number
  /** Acumulado con umbral de ruido, en metros. */
  gain: number
  /** Longitud del tramo que sube seguido, de mínimo a máximo, en km. */
  climbKm: number
  /** Muestras que cayeron fuera del DEM. Si no es 0, el perfil está cojo. */
  outside: number
  samples: number
}

/**
 * Recorre la polilínea muestreando el DEM cada `stepM` metros.
 *
 * El umbral de ruido `noiseM` es la subida mínima que cuenta como subida: por
 * debajo es la celda del DEM cambiando de valor, no la carretera trepando.
 */
function profile(parts: Pos[][], dem: ReturnType<typeof loadDem>, stepM = 25, noiseM = 3): Profile {
  const pts: { d: number; z: number }[] = []
  let outside = 0
  let dist = 0
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const a = part[i - 1] as Pos
      const b = part[i] as Pos
      const seg = metres(a, b)
      const n = Math.max(1, Math.round(seg / stepM))
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const lon = a[0] + (b[0] - a[0]) * t
        const lat = a[1] + (b[1] - a[1]) * t
        dist += seg / n
        const z = elevationAt(dem, lon, lat)
        // Fuera del DEM no hay cota. Se cuenta y se salta: rellenar con un cero
        // metería un «nivel del mar» inventado en mitad de la cumbre.
        if (z === null) outside++
        else pts.push({ d: dist, z })
      }
    }
  }
  let min = Infinity
  let max = -Infinity
  let iMin = 0
  let iMax = 0
  pts.forEach((p, i) => {
    if (p.z < min) { min = p.z; iMin = i }
    if (p.z > max) { max = p.z; iMax = i }
  })
  let gain = 0
  let ref = pts[0].z
  for (const p of pts) {
    if (p.z > ref + noiseM) { gain += p.z - ref; ref = p.z }
    else if (p.z < ref) ref = p.z
  }
  const climbKm = Math.abs(pts[iMax].d - pts[iMin].d) / 1000
  return { km: dist / 1000, min, max, gain, climbKm, outside, samples: pts.length }
}

function show(title: string, p: Profile, official?: number) {
  const grade = ((p.max - p.min) / (p.climbKm * 1000)) * 100
  console.log(`\n── ${title}`)
  console.log(`   longitud DEM      ${p.km.toFixed(1)} km` + (official ? `   (oficial ${(official / 1000).toFixed(1)} km)` : ''))
  console.log(`   cota mínima       ${Math.round(p.min)} m`)
  console.log(`   cota máxima       ${Math.round(p.max)} m`)
  console.log(`   desnivel del tramo ${Math.round(p.max - p.min)} m en ${p.climbKm.toFixed(1)} km → ${grade.toFixed(1)} % de media`)
  console.log(`   acumulado (umbral 3 m) ${Math.round(p.gain)} m`)
  console.log(`   muestras           ${p.samples}` + (p.outside ? `   ⚠ ${p.outside} fuera del DEM` : ' · ninguna fuera del DEM'))
}

const dem = loadDem()

const carreteras = layer('carreteras')
const lp4 = carreteras.find((f) => f.properties.nomenclatura === 'LP-4')
show('LP-4 · Roque de los Muchachos', profile(lines(lp4), dem), lp4.properties.longitud_oficial_m)

const senderos = layer('senderos')
const gr131 = senderos
  .filter((f) => /^GR131[0-9]?$/.test(f.properties.codigo) && f.properties.codigo !== 'GR1310')
  .sort((a, b) => a.properties.codigo.localeCompare(b.properties.codigo))
console.log(
  `\nGR-131: ${gr131.map((f) => f.properties.codigo).join(', ')} · ` +
    `${gr131.reduce((s, f) => s + f.properties.longitud_km, 0).toFixed(1)} km catalogados`,
)
for (const f of gr131) {
  show(`${f.properties.codigo} · dificultad ${f.properties.dificultad}`, profile(lines(f), dem), f.properties.longitud_m)
}
const grAll = senderos.filter((f) => f.properties.tipo === 'GR')
console.log(
  `\nTodos los GR: ${grAll.length} tramos · ` +
    `${grAll.reduce((s, f) => s + f.properties.longitud_km, 0).toFixed(1)} km`,
)

/**
 * La rama que sube de la LP-4, que es de lo que habla un ciclista: desde el
 * extremo de Santa Cruz hasta el punto más alto de la carretera, sin la bajada
 * al norte que viene después.
 */
{
  const parts = lines(lp4)
  const main = parts.reduce((a, b) => (b.length > a.length ? b : a))
  const zIni = elevationAt(dem, main[0][0], main[0][1])!
  const zFin = elevationAt(dem, main[main.length - 1][0], main[main.length - 1][1])!
  console.log(`\nLP-4 · extremos del tramo largo: ${Math.round(zIni)} m (Santa Cruz) → ${Math.round(zFin)} m (Hoya Grande)`)
  const p = profile([main], dem)
  // Corta en el punto más alto: la mitad este es subida continua.
  let dist = 0
  let best = { d: 0, z: -Infinity }
  const acc: { d: number; z: number }[] = []
  for (let i = 1; i < main.length; i++) {
    dist += metres(main[i - 1] as Pos, main[i] as Pos)
    const z = elevationAt(dem, main[i][0], main[i][1])
    if (z === null) continue
    acc.push({ d: dist, z })
    if (z > best.z) best = { d: dist, z }
  }
  const subida = acc.filter((q) => q.d <= best.d)
  const zMin = Math.min(...subida.map((q) => q.z))
  console.log(
    `LP-4 · rama este: ${Math.round(zIni)} → ${Math.round(best.z)} m en ${(best.d / 1000).toFixed(1)} km · ` +
      `${(((best.z - zIni) / best.d) * 100).toFixed(1)} % de media (mínimo por el camino ${Math.round(zMin)} m)`,
  )
  void p
}
