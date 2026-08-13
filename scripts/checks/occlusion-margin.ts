/**
 * Mide el margen de `lib/occlusion.ts` contra el veredicto del propio MapLibre.
 *
 * QUÉ COMPARA. Dos formas de contestar la misma pregunta —«¿hay montaña entre
 * la cámara y este punto?»— sobre exactamente la misma escena:
 *
 *   - la de MapLibre, que lee el búfer de profundidad de la escena YA dibujada
 *     (`terrain.depthAtPoint`) y la compara con la profundidad del punto. Es la
 *     verdad de lo que se está viendo en pantalla, y es la que costaba 1.694 ms
 *     por cada seis segundos de vista inclinada;
 *   - la de `reliefAboveSight`, que lanza el rayo sobre las teselas terrarium de
 *     `public/dem/` y devuelve cuántos metros asoma el relieve por encima de la
 *     línea de visión.
 *
 * QUÉ IMPRIME. Las **dos orillas**, que es lo que decide el umbral: cuántos
 * metros asoma el relieve en el punto TAPADO más justo, y cuántos en el
 * VISIBLE más justo. El margen tiene que caer entre las dos, y la prueba que
 * importa no es «¿caza los tapados?» sino «¿los caza sin esconder ninguno que
 * se ve?» — esconder una estación que está a la vista es peor que dibujar una
 * que no lo está, porque el dato desaparece sin decir por qué.
 *
 * CÓMO SE USA. Necesita el servidor de desarrollo en marcha, que es donde
 * `MapView` expone el mapa:
 *
 *   npm run dev &
 *   npx tsx scripts/checks/occlusion-margin.ts
 *
 * No pide un solo byte a ninguna API: el relieve y el modelo de elevación son
 * ficheros estáticos del propio repositorio.
 */

import { chromium } from 'playwright'
import { loadDem } from '../dem-node.js'
import { reliefAboveSight } from '../../src/lib/occlusion.js'

const URL = process.env.TP_URL ?? 'http://localhost:5173'
const EXAGGERATION = 1

/** Cámaras distintas para que el resultado no dependa de una sola postal. */
const VIEWS = [
  { center: [-17.86, 28.72], zoom: 11.6, pitch: 62, bearing: 0 },
  { center: [-17.88, 28.75], zoom: 12.2, pitch: 64, bearing: 120 },
  { center: [-17.84, 28.6], zoom: 11.8, pitch: 58, bearing: 240 },
  { center: [-17.9, 28.68], zoom: 12.6, pitch: 65, bearing: 300 },
]

/**
 * Lo que corre DENTRO de la página: coloca la cámara, muestrea una rejilla de
 * puntos de la vista y le pregunta a MapLibre por cada uno.
 *
 * `forgiveness` 0,006 es la constante que usa el propio `Marker._updateOpacity`
 * de maplibre-gl 4.7.1: se copia para preguntar exactamente lo que él pregunta,
 * no algo parecido.
 */
const PROBE = ({ view, cols, rows }: { view: any; cols: number; rows: number }): Promise<any> =>
  new Promise((done) => {
    const map = (window as any).__map
    map.jumpTo(view)
    // Un fotograma dibujado antes de leer: el búfer de profundidad es el de la
    // última escena pintada, y sin esperar se leería la anterior.
    map.once('idle', () => {
      const terrain = map.terrain
      const tr = map.transform
      const c = tr.getCameraPosition()
      const W = map.getCanvas().clientWidth
      const H = map.getCanvas().clientHeight
      const out = []
      for (let j = 1; j < rows; j++) {
        for (let i = 1; i < cols; i++) {
          const x = (W * i) / cols
          const y = (H * j) / rows
          const ll = map.unproject([x, y])
          const elevation = terrain.getElevationForLngLatZoom(ll, tr.tileZoom)
          // Fuera de la isla no hay nada que pueda tapar nada.
          if (!(elevation > 1.5)) continue
          const pt = map.project(ll)
          if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) continue
          const terrainDepth = terrain.depthAtPoint(pt)
          const pointDepth = tr.lngLatToCameraDepth(ll, elevation)
          out.push({
            lon: ll.lng,
            lat: ll.lat,
            elevation,
            occluded: pointDepth - terrainDepth >= 0.006,
          })
        }
      }
      done({
        camera: { lon: c.lngLat.lng, lat: c.lngLat.lat, altitude: c.altitude },
        points: out,
      })
    })
    map.triggerRepaint()
  })

const pct = (n: number, d: number) => `${((100 * n) / (d || 1)).toFixed(1)} %`

const main = async () => {
  const dem = loadDem()
  const browser = await chromium.launch({
    headless: false,
    executablePath: process.env.TP_CHROME,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // Ni una petición a ninguna API: para medir relieve sobran los datos vivos, y
  // el motivo por el que existe la mitad de este trabajo es no pedir de más.
  await page.route('**/api/**', (r) => r.abort())
  await page.goto(URL, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForFunction(() => !!(window as any).__map, { timeout: 60_000 })
  await page.waitForTimeout(4000)

  const sec = page.locator('summary, .sec-head, button', { hasText: 'Fondo y vista' }).first()
  if (await sec.count()) await sec.click().catch(() => {})
  await page.locator('label', { hasText: 'Relieve en tres dimensiones' }).first().click()
  await page.waitForTimeout(6000)

  const rows: any[] = []
  for (const view of VIEWS) {
    const { camera, points } = await page.evaluate(PROBE, { view, cols: 34, rows: 22 })
    for (const p of points as { lon: number; lat: number; elevation: number; occluded: boolean }[]) {
      const above = reliefAboveSight(dem, camera, p, EXAGGERATION)
      if (above === null || !Number.isFinite(above)) continue
      rows.push({ ...p, above })
    }
    console.log(`vista ${JSON.stringify(view.center)} b=${view.bearing}° → ${points.length} puntos`)
  }
  await browser.close()

  const occluded = rows.filter((r: any) => r.occluded).map((r: any) => r.above).sort((a, b) => a - b)
  const visible = rows.filter((r: any) => !r.occluded).map((r: any) => r.above).sort((a, b) => a - b)
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] ?? NaN

  console.log(`\n${rows.length} puntos: ${occluded.length} tapados, ${visible.length} visibles`)
  console.log('\nCuánto asoma el relieve sobre la línea de visión, en metros:')
  console.log(
    `  tapados según MapLibre   p05 ${q(occluded, 0.05).toFixed(0)}  ` +
      `p50 ${q(occluded, 0.5).toFixed(0)}  p95 ${q(occluded, 0.95).toFixed(0)}`,
  )
  console.log(
    `  visibles según MapLibre  p05 ${q(visible, 0.05).toFixed(0)}  ` +
      `p50 ${q(visible, 0.5).toFixed(0)}  p95 ${q(visible, 0.95).toFixed(0)}`,
  )

  console.log('\nMargen  esconde-de-más  deja-pasar   aciertos')
  for (const m of [0, 5, 10, 15, 20, 25, 30, 40, 60, 100]) {
    // Esconder un punto que se ve es el error caro: el dato desaparece.
    const falsePositives = visible.filter((a: number) => a > m).length
    const falseNegatives = occluded.filter((a: number) => a <= m).length
    const ok = rows.length - falsePositives - falseNegatives
    console.log(
      `  ${String(m).padStart(4)} m   ` +
        `${String(falsePositives).padStart(6)} (${pct(falsePositives, visible.length)})   ` +
        `${String(falseNegatives).padStart(6)} (${pct(falseNegatives, occluded.length)})   ` +
        `${pct(ok, rows.length)}`,
    )
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
