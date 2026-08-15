/**
 * La autosombra de las nubes: qué devuelve y cuánto cuesta.
 *
 * De aquí sale el suelo de dispersión múltiple de `lib/sky/selfshade.ts`, el
 * coste del barrido, y la comprobación de que el sol bajo hace lo que la
 * constante que se sustituye no podía hacer.
 *
 * Trae además la calibración que NO se usó, y se queda escrita para que nadie
 * la repita: igualar el brillo medio del mediodía con el que daba la constante
 * pide una dispersión múltiple de 0,7 a 0,95, o sea apagar el modelo y volver a
 * la constante por la puerta de atrás. El motivo es que los dos modelos no
 * miden lo mismo —aquélla oscurecía la base estuviera o no a la vista— y por
 * eso el mediodía sale más claro ahora, que es lo que es un mediodía.
 *
 *   npx tsx scripts/checks/cloud-selfshade.ts
 *
 * No pide nada: la escena la genera el mismo código que la genera en la
 * aplicación, a partir de una rejilla de nubosidad escrita aquí.
 */

import { MAP_BBOX } from '../../src/lib/geo.js'
import { buildCloudScene, puffCount, type Cloud } from '../../src/lib/sky/scene.js'
import type { SkySample } from '../../src/lib/sky/model.js'
import { selfShade, MULTIPLE_SCATTERING } from '../../src/lib/sky/selfshade.js'
import { crossShade } from '../../src/lib/sky/crossshade.js'
import type { SkyPosition } from '../../src/lib/sun.js'

const calm = { u: 0, v: 0 }

/** Una rejilla de nubosidad uniforme, como la de `scene.test.ts`. */
function uniform(low: number, mid: number, high: number, precipMm = 0): SkySample[] {
  const out: SkySample[] = []
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 6; i++) {
      out.push({
        lon: MAP_BBOX.west + ((i + 0.5) / 6) * (MAP_BBOX.east - MAP_BBOX.west),
        lat: MAP_BBOX.south + ((j + 0.5) / 9) * (MAP_BBOX.north - MAP_BBOX.south),
        low,
        mid,
        high,
        precipMm,
        wind: { low: calm, mid: calm, high: calm },
      })
    }
  }
  return out
}

const BAND = { base: 1200, top: 1700 }

/** La semilla de la escena. Fija: dos ejecuciones tienen que dar lo mismo. */
const SEED = 20260815

const sun = (elevationDeg: number, azimuthDeg: number): SkyPosition => ({
  elevationDeg,
  azimuthDeg,
})

/**
 * EL MODELO QUE SE SUSTITUYE, copiado literalmente de `CloudLayer` antes del
 * cambio. Está aquí porque es el patrón de calibración: lo que se busca no es
 * que el modelo nuevo se parezca a una idea, sino que a mediodía deje la escena
 * con el mismo brillo que tenía, que es el que se ajustó a ojo contra la
 * pantalla — el único juez que hay para esto.
 */
const OLD_BASE_SHADE: Record<Cloud['etage'], number> = { low: 0.45, mid: 0.32, high: 0.1 }
const OLD_SHADE_DEPTH = 0.55
const OLD_RAIN_HEAVY_MM = 4

function oldShade(cloud: Cloud): Float32Array {
  const rain = cloud.precipMm > 0 ? Math.min(1, cloud.precipMm / OLD_RAIN_HEAVY_MM) : 0
  const baseShade = Math.min(0.85, OLD_BASE_SHADE[cloud.etage] + 0.3 * rain)
  const out = new Float32Array(cloud.puffs.length)
  for (let i = 0; i < cloud.puffs.length; i++) {
    const hs = Math.min(1, cloud.puffs[i].h / OLD_SHADE_DEPTH)
    out[i] = 1 - baseShade * (1 - hs * hs * (3 - 2 * hs))
  }
  return out
}

const mean = (v: Float32Array | number[]): number => {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i]
  return v.length ? s / v.length : NaN
}

/**
 * Media del tercio de abajo y del tercio de arriba, POR RANGO de altura y no
 * por un corte fijo en 0,5: en una manta todas las motas están abajo —es plana
 * por definición— y un corte fijo deja el tercio de arriba vacío.
 */
function thirds(cloud: Cloud, light: Float32Array): { base: number; top: number } {
  const idx = cloud.puffs.map((_, i) => i).sort((a, b) => cloud.puffs[a].h - cloud.puffs[b].h)
  const k = Math.max(1, Math.round(idx.length / 3))
  const pick = (ids: number[]) => mean(ids.map((i) => light[i]))
  return { base: pick(idx.slice(0, k)), top: pick(idx.slice(-k)) }
}

/**
 * Cuánto separa la luz a los dos lados de la nube en la dirección del sol.
 *
 * Es lo que la constante NO podía dar: con el sol rasante, la cara que mira al
 * sol tiene que estar encendida y la contraria apagada, y eso no depende de la
 * altura dentro de la nube sino de la posición horizontal.
 */
function flankSplit(cloud: Cloud, light: Float32Array, azimuthDeg: number): number {
  const a = (azimuthDeg * Math.PI) / 180
  const ex = Math.sin(a)
  const ny = Math.cos(a)
  let near = 0
  let nearN = 0
  let far = 0
  let farN = 0
  for (let i = 0; i < cloud.puffs.length; i++) {
    const p = cloud.puffs[i]
    // Proyección sobre la dirección del sol, en planta.
    const t = (p.dx * ex + p.dy * ny) / cloud.radiusM
    if (t > 0.3) {
      near += light[i]
      nearN++
    } else if (t < -0.3) {
      far += light[i]
      farN++
    }
  }
  return nearN && farN ? near / nearN - far / farN : NaN
}

const scenes: { name: string; samples: SkySample[] }[] = [
  { name: 'manta baja (95 %)', samples: uniform(95, 0, 0) },
  { name: 'cúmulos sueltos (35 %)', samples: uniform(35, 0, 0) },
  { name: 'manta con lluvia', samples: uniform(90, 0, 0, 3) },
  { name: 'tres estratos', samples: uniform(60, 50, 40) },
]

// --- 1. la calibración -------------------------------------------------------
//
// Qué dispersión múltiple deja la escena de MEDIODÍA con el brillo que tenía.
// El sol alto es donde la constante que se sustituye era razonable —una nube
// iluminada desde arriba sí tiene la panza oscura—, así que es el punto donde
// los dos modelos tienen que coincidir. Todo lo demás del día es donde uno
// acierta y el otro no, y ahí no hay nada que calibrar.
const HIGH_SUN = sun(80, 180)

/**
 * CUÁNTO SE VE CADA MOTA, que es la parte que la primera versión de esta
 * calibración se dejó fuera y que cambia el resultado por completo.
 *
 * La media de todas las motas NO es lo que se ve. El sombreador dibuja de atrás
 * adelante y con opacidad alta, así que las últimas —las de la superficie que
 * mira a la cámara— se comen prácticamente el resultado, y las del interior de
 * la nube no se ven en absoluto por muy oscuras que estén. Calibrar contra la
 * media de todas es calibrar contra un número que nadie mira: al hacerlo salía
 * que hacía falta una dispersión múltiple de 0,82, o sea apagar el modelo entero
 * y quedarse con la constante otra vez.
 *
 * Así que cada mota pesa lo que se ve: la transmitancia desde ella hacia la
 * cámara, promediada sobre ocho rumbos —la vista de esta aplicación mira la isla
 * desde arriba y puede girar, así que ninguno es más suyo que otro— con la
 * inclinación de entrada de la vista 3D. Es el mismo barrido, apuntado a otro
 * sitio.
 */
function exposure(cloud: Cloud): Float32Array {
  const out = new Float32Array(cloud.puffs.length)
  // La lluvia no entra en cuánto se ve una mota: oscurece, no tapa.
  const dry = { ...cloud, precipMm: 0 }
  const views = 8
  for (let k = 0; k < views; k++) {
    // 35° de elevación: la vista 3D entra con 55° de inclinación de cámara, o
    // sea mirando desde 35° sobre el horizonte.
    const vis = selfShade(dry, sun(35, (360 * k) / views), { multipleScattering: 0 })
    for (let i = 0; i < out.length; i++) out[i] += vis[i] / views
  }
  return out
}

/** Media de la escena PESADA POR LO QUE SE VE, con una dispersión múltiple dada. */
function sceneMean(clouds: Cloud[], ms: number, position = HIGH_SUN): number {
  let sum = 0
  let w = 0
  for (const c of clouds) {
    const light = selfShade(c, position, { multipleScattering: ms })
    const vis = exposure(c)
    for (let i = 0; i < c.puffs.length; i++) {
      sum += light[i] * vis[i]
      w += vis[i]
    }
  }
  return w ? sum / w : NaN
}

function oldSceneMean(clouds: Cloud[]): number {
  let sum = 0
  let w = 0
  for (const c of clouds) {
    const light = oldShade(c)
    const vis = exposure(c)
    for (let i = 0; i < light.length; i++) {
      sum += light[i] * vis[i]
      w += vis[i]
    }
  }
  return w ? sum / w : NaN
}

/**
 * El percentil 5 de lo que SE VE, o sea lo más oscuro que la nube llega a
 * enseñar. Las motas pesan por su exposición, igual que en la media.
 */
function darkestVisible(clouds: Cloud[], ms: number, position: SkyPosition): number {
  const rows: { v: number; w: number }[] = []
  let total = 0
  for (const c of clouds) {
    if (c.precipMm > 0) continue
    const light = selfShade(c, position, { multipleScattering: ms })
    const vis = exposure(c)
    for (let i = 0; i < c.puffs.length; i++) {
      rows.push({ v: light[i], w: vis[i] })
      total += vis[i]
    }
  }
  rows.sort((a, b) => a.v - b.v)
  let acc = 0
  for (const r of rows) {
    acc += r.w
    if (acc >= 0.05 * total) return r.v
  }
  return NaN
}

// --- 0. el suelo -------------------------------------------------------------
//
// Cuánta luz le queda a una mota a la que el sol NO llega. No es cero: una nube
// se reparte la luz por dentro muchísimas veces, y por eso la panza de un cúmulo
// es gris claro y no negra. Cuánto vale eso no se puede sacar de ningún dato de
// este repositorio, así que se acota por las dos orillas de siempre.
//
// La de abajo la pone lo que ya había: el modelo anterior nunca dejaba una nube
// sin lluvia por debajo de 0,55 —su base— y ese número está ajustado a ojo
// contra la pantalla, que para esto es el único juez. La de arriba es que cada
// punto de suelo se come el contraste direccional, que es la razón de ser del
// cambio. O sea: el suelo más flojo que respete el 0,55.
{
  const clouds = buildCloudScene(uniform(60, 50, 40), BAND, SEED)
  const low = sun(12, 100)
  console.log('EL SUELO — lo más oscuro que se ve, con el sol a 12°\n')
  console.log('  dispersión   lo más oscuro   cara al sol − contraria   mediodía')
  for (const ms of [0, 0.1, 0.15, 0.2, 0.22, 0.25, 0.3, 0.4, 0.55]) {
    const sample = clouds.filter((c) => c.etage === 'low')[0]
    const split = flankSplit(sample, selfShade(sample, low, { multipleScattering: ms }), 100)
    console.log(
      `  ${ms.toFixed(2).padStart(8)}     ${darkestVisible(clouds, ms, low).toFixed(3)}` +
        `           ${split.toFixed(3)}                  ${sceneMean(clouds, ms).toFixed(3)}`,
    )
  }
  console.log()
}

console.log('CALIBRACIÓN — qué dispersión múltiple iguala el mediodía de antes\n')
console.log('  escena                    antes    ms=0    ms elegida   después')
const calibrated: number[] = []
for (const s of scenes) {
  const clouds = buildCloudScene(s.samples, BAND, SEED)
  const target = oldSceneMean(clouds)
  // Biseccion sobre `ms`: la media crece de forma monótona con él.
  let lo = 0
  let hi = 0.95
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (sceneMean(clouds, mid) < target) lo = mid
    else hi = mid
  }
  const ms = (lo + hi) / 2
  calibrated.push(ms)
  console.log(
    `  ${s.name.padEnd(24)}  ${target.toFixed(3)}   ${sceneMean(clouds, 0).toFixed(3)}   ` +
      `${ms.toFixed(3)}        ${sceneMean(clouds, MULTIPLE_SCATTERING).toFixed(3)}`,
  )
}
const spread = Math.max(...calibrated) - Math.min(...calibrated)
console.log(
  `\n  las cuatro piden entre ${Math.min(...calibrated).toFixed(3)} y ` +
    `${Math.max(...calibrated).toFixed(3)} (${spread.toFixed(3)} de diferencia); ` +
    `la media es ${(calibrated.reduce((a, b) => a + b, 0) / calibrated.length).toFixed(3)}`,
)
console.log(`  puesta en el módulo: ${MULTIPLE_SCATTERING}\n`)

// --- 2. lo que la constante no podía hacer -----------------------------------

console.log('COMPORTAMIENTO — con la dispersión múltiple ya puesta\n')
for (const s of scenes) {
  const clouds = buildCloudScene(s.samples, BAND, SEED)
  const low = clouds.filter((c) => c.etage === 'low')
  const sample = low[0] ?? clouds[0]
  const before = oldShade(sample)
  const beforeThirds = thirds(sample, before)
  console.log(
    `${s.name}: ${clouds.length} nubes, ${puffCount(clouds)} motas · ` +
      `muestra ${sample.etage}, densidad ${sample.density.toFixed(2)}, ` +
      `${sample.puffs.length} motas, lluvia ${sample.precipMm.toFixed(1)} mm`,
  )
  console.log(
    `    ANTES, a cualquier hora:  base ${beforeThirds.base.toFixed(3)}  ` +
      `cima ${beforeThirds.top.toFixed(3)}  cara al sol − contraria 0,000`,
  )
  console.log('    sol            base    cima    cara al sol − contraria')
  for (const [el, az] of [
    [80, 180],
    [45, 150],
    [20, 110],
    [8, 95],
    [2, 88],
    [-4, 85],
  ] as [number, number][]) {
    const light = selfShade(sample, sun(el, az))
    const t = thirds(sample, light)
    console.log(
      `    ${String(el).padStart(3)}°/${String(az).padStart(3)}°     ` +
        `${t.base.toFixed(3)}   ${t.top.toFixed(3)}   ${flankSplit(sample, light, az).toFixed(3)}`,
    )
  }
  console.log()
}

// --- 3. la sombra entre nubes ------------------------------------------------
//
// Lo que la autosombra no puede dar: una manta tapa a la nube que tiene detrás.
{
  console.log('SOMBRA ENTRE NUBES — cuánta luz le queda a cada nube\n')
  console.log('  escena                    sol      media   la más tapada   a la sombra (<0,7)')
  for (const s2 of scenes) {
    const clouds = buildCloudScene(s2.samples, BAND, SEED)
    for (const [el, az] of [[70, 180], [20, 110], [8, 95]] as [number, number][]) {
      const beam = crossShade(clouds, sun(el, az))
      const v = [...beam].sort((a, b) => a - b)
      const shaded = v.filter((x) => x < 0.7).length
      console.log(
        `  ${s2.name.padEnd(24)}  ${String(el).padStart(3)}°   ` +
          `${mean(v).toFixed(3)}   ${v[0].toFixed(3)}          ` +
          `${((100 * shaded) / v.length).toFixed(0)} %`,
      )
    }
  }
  console.log()
}

// --- el coste ---------------------------------------------------------------
//
// El barrido entero de la escena, que es lo que se paga cada vez que el sol se
// mueve medio grado —unos dos minutos de reloj—.
const worst = buildCloudScene(uniform(95, 90, 90), BAND, SEED)
const out = new Float32Array(64)
const cross = new Float32Array(worst.length)
const sweep = () => {
  crossShade(worst, sun(35, 120), cross)
  for (let i = 0; i < worst.length; i++) {
    selfShade(worst[i], sun(35, 120), { out, beam: cross[i] })
  }
}
sweep()
sweep()
const runs: number[] = []
for (let k = 0; k < 20; k++) {
  const t0 = performance.now()
  sweep()
  runs.push(performance.now() - t0)
}
runs.sort((a, b) => a - b)
console.log(
  `coste del barrido, escena peor (${worst.length} nubes, ${puffCount(worst)} motas): ` +
    `mediana ${runs[runs.length >> 1].toFixed(2)} ms · ` +
    `p95 ${runs[Math.floor(runs.length * 0.95)].toFixed(2)} ms · ` +
    `máximo ${runs[runs.length - 1].toFixed(2)} ms`,
)
console.log(
  `un fotograma a 60 Hz son 16,7 ms; esto se hace una vez cada ~2 minutos de reloj.`,
)
