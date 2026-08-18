/**
 * Comprueba, contra un navegador de verdad, que la caché de teselas hace lo que
 * dice: servir de IndexedDB lo ya visto y **no pedir nada dos veces**.
 *
 * POR QUÉ NO BASTA CON LOS TESTS. `tiles/grid.ts` transcribe la aritmética con
 * la que MapLibre sustituye `{bbox-epsg-3857}`, y `grid.test.ts` comprueba que
 * esa aritmética es coherente consigo misma y con el manifiesto del DEM. Lo que
 * ninguna prueba de Node puede comprobar es lo único que de verdad importa: que
 * la cadena que escribe MapLibre por dentro y la que escribe el precargador
 * sean **el mismo texto**. Si difieren en un decimal, las dos URL son válidas,
 * las dos devuelven la imagen correcta, no falla nada visible… y cada tesela se
 * descarga dos veces. La caché haría exactamente lo contrario de aquello para
 * lo que existe, y quien lo pagaría es un servicio público ajeno.
 *
 * QUÉ MIDE, en tres pasadas sobre la misma vista:
 *
 *   1. Primera visita con la ortofoto encendida: cuántas peticiones salen a
 *      GRAFCAN y cuántas de ellas están repetidas.
 *   2. Recarga de la página: cuántas salen ahora. Es el número que justifica
 *      todo esto — hoy, sin caché, es el mismo de la primera.
 *   3. El inventario de IndexedDB: cuántas teselas quedaron guardadas.
 *
 * CÓMO SE USA. Necesita Playwright y **el servidor de desarrollo**, igual que
 * `occlusion-margin.ts`. Playwright, porque se ejecuta a mano y no es
 * dependencia de esta aplicación. El servidor de desarrollo, porque el asidero
 * `window.__map` que hace falta para saber cuándo ha terminado de cargar el
 * mapa solo existe con `import.meta.env.DEV`: en el paquete de producción esa
 * línea no se compila, y apuntar esto a tiempopalmero.com solo da un tiempo de
 * espera agotado. Lo que se mide aquí es el código, que es el mismo.
 *
 *   npm i --no-save playwright
 *   npx playwright install chromium
 *   npm run dev &
 *   npx tsx scripts/checks/tile-cache.ts
 *
 * Pide teselas a GRAFCAN en vivo: una pantalla, dos veces.
 */

import { chromium, type Browser, type Page } from 'playwright'

const URL_APP = process.env.APP_URL ?? 'http://localhost:5173'
const GRAFCAN = 'idecan1.grafcan.es'

interface Pasada {
  peticiones: string[]
  repetidas: string[]
}

/**
 * Arranca con la ortofoto ya elegida, sembrando el ajuste guardado.
 *
 * Y no pulsando el chip del panel, que sería lo natural: el selector vive
 * dentro de una `<Section>` plegable y puede estar cerrada, así que la prueba
 * dependería de qué secciones estén abiertas. El sobre es el de
 * `settings/store.ts`, con su versión delante — si esa versión sube y este
 * script no se entera, `parseSettings` descarta el sobre entero y la pasada
 * mediría el relieve, que no pide nada a GRAFCAN. De ahí que el veredicto avise
 * cuando la primera visita no pide ni una tesela.
 */
async function sembrarSatelite(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tiempo-palmero:ajustes',
      JSON.stringify({ v: 2, values: { basemap: 'satelite' } }),
    )
  })
}

async function pasada(page: Page, primera: boolean): Promise<Pasada> {
  const peticiones: string[] = []
  const onRequest = (url: string) => {
    if (url.includes(GRAFCAN)) peticiones.push(url)
  }
  page.on('request', (r) => onRequest(r.url()))

  if (primera) await sembrarSatelite(page)
  await page.goto(URL_APP, { waitUntil: 'load' })
  // `MapView` cuelga el mapa de `window.__map` (misma puerta que usa
  // `occlusion-margin.ts`). Esperar al lienzo no basta: existe antes de que el
  // DEM esté descargado, y hasta entonces no se pide una sola tesela de fondo.
  // El tercer argumento, no el segundo: `waitForFunction(fn, arg, options)`.
  // Puesto en el segundo, Playwright lo toma por el argumento de la función y
  // aplica su espera de 30 s por defecto — que llega en local y no contra
  // producción, donde el DEM viaja por la red.
  try {
    await page.waitForFunction(() => !!(window as never as { __map?: unknown }).__map, null, {
      timeout: 120_000,
    })
  } catch {
    throw new Error(
      `${URL_APP} no expone window.__map. Esto necesita \`npm run dev\`: en el ` +
        'paquete de producción ese asidero no existe (ver la cabecera).',
    )
  }
  await page.waitForFunction(
    () => (window as never as { __map: { loaded: () => boolean } }).__map.loaded(),
    null,
    { timeout: 120_000 },
  )
  // Reposo: sin peticiones nuevas durante cinco segundos seguidos. Cinco y no
  // tres porque la mediana de GRAFCAN medida es 556 ms pero su cola llega a
  // varios segundos, y cortar antes de tiempo contaría de menos.
  let previo = -1
  while (previo !== peticiones.length) {
    previo = peticiones.length
    await page.waitForTimeout(5000)
  }
  page.removeAllListeners('request')
  // Guardar en IndexedDB va por detrás de la respuesta a propósito (ver
  // `protocol.ts`): sin esta espera el inventario se lee a medio escribir.
  await page.waitForTimeout(1500)

  const vistas = new Set<string>()
  const repetidas: string[] = []
  for (const u of peticiones) {
    if (vistas.has(u)) repetidas.push(u)
    vistas.add(u)
  }
  return { peticiones, repetidas }
}

async function inventario(page: Page): Promise<{ tiles: number; bytes: number }> {
  return page.evaluate(
    () =>
      new Promise<{ tiles: number; bytes: number }>((resolve) => {
        const req = indexedDB.open('tiempo-palmero-teselas')
        req.onerror = () => resolve({ tiles: 0, bytes: 0 })
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('meta')) return resolve({ tiles: 0, bytes: 0 })
          const all = db.transaction('meta', 'readonly').objectStore('meta').getAll()
          all.onerror = () => resolve({ tiles: 0, bytes: 0 })
          all.onsuccess = () => {
            const rows = all.result as { size: number }[]
            resolve({ tiles: rows.length, bytes: rows.reduce((s, r) => s + r.size, 0) })
          }
        }
      }),
  )
}

async function main(): Promise<void> {
  let browser: Browser | undefined
  try {
    browser = await chromium.launch()
    // Un contexto persistente no hace falta: IndexedDB sobrevive a un
    // `reload()` dentro del mismo contexto, que es justo el caso que se mide.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } } as never)

    console.log(`\nPRIMERA VISITA (${URL_APP})\n`)
    const uno = await pasada(page, true)
    const inv1 = await inventario(page)
    console.log(`  peticiones a GRAFCAN: ${uno.peticiones.length}`)
    console.log(`  de ellas repetidas:   ${uno.repetidas.length}`)
    console.log(`  guardadas en IndexedDB: ${inv1.tiles} teselas, ${(inv1.bytes / 1024).toFixed(0)} kB`)

    console.log('\nSEGUNDA VISITA (misma vista, recarga)\n')
    const dos = await pasada(page, false)
    const inv2 = await inventario(page)
    console.log(`  peticiones a GRAFCAN: ${dos.peticiones.length}`)
    console.log(`  guardadas en IndexedDB: ${inv2.tiles} teselas, ${(inv2.bytes / 1024).toFixed(0)} kB`)

    console.log('\nVEREDICTO\n')
    // La primera con repetidas > 0 significa que el precargador y MapLibre no
    // escriben la misma URL: es el fallo que este script existe para cazar.
    if (uno.peticiones.length === 0) {
      console.log('  ✗ la primera visita no pidió NADA: la ortofoto no llegó a encenderse')
      console.log('    (¿subió `SETTINGS_VERSION` en `settings/store.ts`?)')
      return
    }
    // DOS FALLOS DISTINTOS, y confundirlos manda a arreglar lo que no es:
    //
    //   - la MISMA URL dos veces en la primera pasada es una carrera: dos
    //     peticiones a la vez antes de que ninguna llegara a guardarse. Es lo
    //     que destapó esta comprobación el 18 de agosto de 2026 y lo que
    //     arregla `inflight.ts`.
    //   - peticiones en la SEGUNDA pasada, con la caché ya llena, es que el
    //     precargador y MapLibre no escriben la misma URL: lo guardado no le
    //     sirve a quien lo pide. Ese es el fallo caro, y es mudo.
    console.log(
      uno.repetidas.length === 0
        ? '  ✓ ninguna tesela pedida dos veces en la primera visita'
        : `  ✗ ${uno.repetidas.length} pedidas dos veces a la vez (carrera, ver inflight.ts):\n    ${uno.repetidas[0]}`,
    )
    console.log(
      dos.peticiones.length === 0
        ? '  ✓ la segunda visita no pide nada: la clave del precargador ES la de MapLibre'
        : `  ✗ la segunda visita todavía pide ${dos.peticiones.length}: hay claves que no casan`,
    )
    const ahorro =
      uno.peticiones.length > 0
        ? (1 - dos.peticiones.length / uno.peticiones.length) * 100
        : 0
    console.log(
      `  la segunda visita pide ${dos.peticiones.length} de ${uno.peticiones.length}: ` +
        `${ahorro.toFixed(0)} % menos a GRAFCAN`,
    )
    console.log()
  } finally {
    await browser?.close()
  }
}

main()
