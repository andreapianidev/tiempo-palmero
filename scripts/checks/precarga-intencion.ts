/**
 * Comprueba, contra un navegador de verdad, las dos precargas nuevas:
 *
 *   1. **Por intención**: pasar el puntero por el chip de un fondo baja su
 *      encuadre antes del clic, y las teselas que baja son LAS MISMAS que
 *      MapLibre va a pedir al soltarlo.
 *   2. **Del paso siguiente del zoom**: al subir un nivel de tesela se bajan
 *      las cuatro hijas de la del centro.
 *
 * POR QUÉ NO BASTA CON LOS TESTS. Lo mismo que ya justifica
 * `tile-cache.ts`, más un fallo nuevo que solo se ve aquí: la precarga por
 * intención calcula el nivel de tesela con `rasterTileZoom` a partir del zoom
 * de la cámara, y MapLibre lo calcula por dentro con su `coveringZoomLevel`.
 * Si los dos no dan el MISMO número, la precarga se baja una pantalla entera
 * del nivel equivocado: no falla nada, no se ve nada, y GRAFCAN recibe el doble
 * de peticiones para que el usuario no se ahorre ni una espera. El único sitio
 * donde eso se puede comprobar es un navegador con MapLibre dentro.
 *
 * CÓMO SE LEE. El nivel de cada petición no está en la URL —el WMS lleva un
 * bbox, no un z—, así que se deduce del ancho del recuadro: una tesela de nivel
 * z mide `2·π·R / 2^z` metros de lado en EPSG:3857.
 *
 *   npm i --no-save playwright
 *   npx playwright install chromium
 *   npm run dev &
 *   npx tsx scripts/checks/precarga-intencion.ts
 *
 * Pide teselas a GRAFCAN en vivo: alrededor de una pantalla y la vista de
 * lejos, o sea lo que gasta una persona que enciende la ortofoto una vez.
 *
 * LO QUE DIO EL 18 DE AGOSTO DE 2026, con el mapa a z15 sobre Los Llanos y una
 * ventana de 1440 × 900:
 *
 *   1. relieve, quieto                 0 peticiones a GRAFCAN
 *   2. el puntero sobre «Satélite»    24 peticiones, todas z15, todas ortofoto
 *   3. al pulsar                       2 nuevas de las 26 de la pantalla — 92 %
 *                                      ya guardado — más las 17 de la vista de
 *                                      lejos (z9:1 z10:4 z11:12)
 *   4. un paso de zoom con la rueda   23 de la pantalla a z16 + 4 hijas a z17
 *   —                                 76 peticiones, 0 repetidas
 *
 * Las 24 del paso 2 son el tope entero: el encuadre en 3D es más ancho que el
 * plano, así que a z15 la pantalla pide 26 y la precarga se queda en 24. Y el
 * 92 % del paso 3 es lo que prueba que `rasterTileZoom` coincide con el
 * `coveringZoomLevel` de MapLibre — con un nivel de diferencia sería 0 %.
 */

import { chromium, type Page } from 'playwright'

const URL_APP = process.env.APP_URL ?? 'http://localhost:5173'
const GRAFCAN = 'idecan1.grafcan.es'
/** Medio mundo en EPSG:3857, el mismo de `tiles/grid.ts`. */
const HALF = Math.PI * 6378137

/** El nivel de tesela de una petición WMS, deducido del ancho de su bbox. */
function nivelDe(url: string): number {
  const bbox = new URL(url).searchParams.get('bbox')
  if (!bbox) return NaN
  const [minx, , maxx] = bbox.split(',').map(Number)
  return Math.round(Math.log2((2 * HALF) / (maxx - minx)))
}

const porNivel = (urls: string[]): string => {
  const cuenta = new Map<number, number>()
  for (const u of urls) cuenta.set(nivelDe(u), (cuenta.get(nivelDe(u)) ?? 0) + 1)
  return (
    [...cuenta]
      .sort((a, b) => a[0] - b[0])
      .map(([z, n]) => `z${z}:${n}`)
      .join(' ') || '—'
  )
}

/**
 * Espera a que la precarga se quede quieta: nada en vuelo Y nada nuevo en `ms`.
 *
 * LAS DOS CONDICIONES, y la primera es la que le faltaba a la primera versión
 * de este script. Con solo «nada nuevo en 4 s», dos teselas lentas —y la cola
 * de GRAFCAN medida llega a 2,3 s de p100 y una vez a 12,8 s— bastan para que
 * no salga ninguna petición nueva durante la ventana entera: los dos obreros
 * están ocupados, la fila está llena y el script daba por terminada la precarga
 * cuando iba por la segunda tesela. Salían siempre exactamente dos, que es el
 * número de obreros, y parecía un fallo del código que no existía.
 *
 * Y NI SIQUIERA BASTA CON MIRAR LO QUE VA POR EL CABLE: entre tesela y tesela
 * un obrero pasa por IndexedDB, y ahí no hay ninguna petición en vuelo ni
 * ninguna nueva. Por eso se le pregunta a la fila misma —`window.__precarga`,
 * que `MapView` cuelga solo en desarrollo— y a MapLibre si ha terminado de
 * cargar lo suyo. Las tres condiciones, o la medida sale corta.
 */
async function reposo(page: Page, lista: string[], enVuelo: () => number, ms = 4000): Promise<void> {
  for (;;) {
    const previo = lista.length
    await page.waitForTimeout(ms)
    const quieto = await page.evaluate(() => {
      const w = window as never as {
        __precarga?: () => number
        __map?: { areTilesLoaded: () => boolean }
      }
      return (w.__precarga?.() ?? 0) === 0 && (w.__map?.areTilesLoaded() ?? true)
    })
    if (previo === lista.length && enVuelo() === 0 && quieto) return
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const peticiones: string[] = []
  let vuelo = 0
  page.on('request', (r) => {
    if (r.url().includes(GRAFCAN)) {
      peticiones.push(r.url())
      vuelo++
    }
  })
  const cerrar = (r: { url: () => string }) => {
    if (r.url().includes(GRAFCAN)) vuelo--
  }
  page.on('requestfinished', cerrar)
  page.on('requestfailed', cerrar)
  const enVuelo = () => vuelo
  page.on('pageerror', (e) => console.log(`  [ERROR EN PÁGINA] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [${m.type()}] ${m.text()}`)
  })

  await page.goto(URL_APP, { waitUntil: 'load' })
  type Ventana = { __map: { loaded: () => boolean; jumpTo: (o: unknown) => void; zoomTo: (z: number, o: unknown) => void } }
  await page.waitForFunction(() => !!(window as never as { __map?: unknown }).__map, null, {
    timeout: 120_000,
  })
  await page.waitForFunction(() => (window as never as Ventana).__map.loaded(), null, {
    timeout: 120_000,
  })

  // 1. El fondo de casa, en un sitio concreto y a un zoom concreto.
  await page.evaluate(() =>
    (window as never as Ventana).__map.jumpTo({ center: [-17.917, 28.61], zoom: 15 }),
  )
  await reposo(page, peticiones, enVuelo)
  const antes = peticiones.length
  const estado = async () =>
    page.evaluate(() => {
      const m = (window as never as { __map: { getZoom: () => number; getCenter: () => { lng: number; lat: number }; getStyle: () => { layers: { id: string }[] } } }).__map
      return {
        zoom: Number(m.getZoom().toFixed(2)),
        centro: [Number(m.getCenter().lng.toFixed(3)), Number(m.getCenter().lat.toFixed(3))],
        capas: m.getStyle().layers
          .filter((l) => l.id.startsWith('basemap-'))
          .map((l) => `${l.id}=${(l as { layout?: { visibility?: string } }).layout?.visibility ?? 'visible'}`),
        teselasListas: (m as never as { areTilesLoaded: () => boolean }).areTilesLoaded(),
      }
    })
  console.log(`\n1. RELIEVE a z15 sobre Los Llanos`)
  console.log(`   estado: ${JSON.stringify(await estado())}`)
  console.log(`   peticiones a GRAFCAN: ${antes}   ${antes === 0 ? '✔' : '✘ debería ser 0'}`)

  // 2. El puntero se posa en «Satélite». Sin pulsar.
  await page.getByText('Fondo y vista').click()
  await page.getByRole('button', { name: 'Satélite', exact: true }).hover()
  await reposo(page, peticiones, enVuelo)
  const intencion = peticiones.slice(antes)
  console.log(`\n2. EL PUNTERO ENCIMA DEL CHIP, SIN PULSAR`)
  console.log(`   peticiones: ${intencion.length}   niveles: ${porNivel(intencion)}`)
  console.log(
    `   todas de la ortofoto: ${intencion.every((u) => u.includes('/Ortofoto?')) ? '✔' : '✘'}`,
  )

  // 3. Ahora sí se pulsa. Lo que MapLibre pida para la pantalla ya tiene que
  //    estar guardado: lo único que debería salir es la vista de lejos.
  await page.getByRole('button', { name: 'Satélite', exact: true }).click()
  await reposo(page, peticiones, enVuelo)
  const trasClic = peticiones.slice(antes + intencion.length)
  const z15 = trasClic.filter((u) => nivelDe(u) === 15)
  const pantalla = intencion.length + z15.length
  const ahorro = Math.round((intencion.length / pantalla) * 100)
  console.log(`\n3. AL PULSAR`)
  console.log(`   estado: ${JSON.stringify(await estado())}`)
  console.log(`   peticiones: ${trasClic.length}   niveles: ${porNivel(trasClic)}`)
  console.log(
    `   de la pantalla (z15): ${z15.length} nuevas de ${pantalla} · ${ahorro} % ya guardadas por la intención`,
  )
  // El criterio no es «cero»: la intención tiene un tope de una pantalla y el
  // encuadre en 3D es más ancho que el plano, así que MapLibre siempre pide
  // unas cuantas más. Lo que se comprueba es que el NIVEL coincide: si la
  // intención hubiera pedido z14 o z16, el ahorro sería exactamente 0 %.
  console.log(`   el nivel coincide con el de MapLibre: ${ahorro > 50 ? '✔' : '✘'}`)

  // 4. Un paso de zoom: al subir de nivel se piden las cuatro hijas del centro.
  const antesZoom = peticiones.length
  // CON LA RUEDA Y NO CON `zoomTo`, y no es un capricho de realismo: la
  // precarga del paso siguiente solo se dispara con un movimiento de una
  // persona (`originalEvent`), porque durante el arranque la cámara se coloca
  // sola pasando por reposos intermedios y leerlos como «se está acercando»
  // provocaba dos peticiones repetidas — ver `useTileCache.ts`. Un `zoomTo`
  // programático es indistinguible de eso, así que aquí se gira la rueda.
  const lienzo = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.move(lienzo.x + lienzo.width / 2, lienzo.y + lienzo.height / 2)
  await page.mouse.wheel(0, -500)
  await reposo(page, peticiones, enVuelo)
  const trasZoom = peticiones.slice(antesZoom)
  const z17 = trasZoom.filter((u) => nivelDe(u) === 17)
  console.log(`\n4. UN PASO DE ZOOM, DE z15 A z16`)
  console.log(`   estado: ${JSON.stringify(await estado())}`)
  console.log(`   peticiones: ${trasZoom.length}   niveles: ${porNivel(trasZoom)}`)
  console.log(
    `   hijas del centro precargadas (z17): ${z17.length}   ${z17.length === 4 ? '✔' : '✘ deberían ser 4'}`,
  )

  const repetidas = peticiones.length - new Set(peticiones).size
  console.log(`\nTOTAL ${peticiones.length} peticiones · repetidas ${repetidas} ${repetidas === 0 ? '✔' : '✘'}\n`)
  await browser.close()
}

main()
