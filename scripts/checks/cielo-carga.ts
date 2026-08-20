/**
 * Que la escena nocturna se descargue Y SE DIBUJE, en un navegador de verdad.
 *
 * POR QUÉ EXISTE. El catálogo de estrellas estuvo en producción descargándose
 * con HTTP 200 y sin pintar una sola estrella. El fallo no era de red ni de
 * datos: era el ciclo de vida de un efecto de React —`loading` en las
 * dependencias del efecto que lo pone, `alive` puesto a `false` por la limpieza
 * de su propio render—, y por eso ninguna prueba de `npm test` podía verlo. En
 * Node no hay React montando y desmontando; el error solo existe en un
 * navegador.
 *
 * QUÉ COMPRUEBA, y las dos mitades importan:
 *
 *  1. Que las tres piezas del catálogo se piden y contestan 200.
 *  2. **Que el panel deja de decir «Descargando…» y enseña las cifras.** Ésta
 *     es la que habría cazado el fallo: la primera pasaba perfectamente con la
 *     aplicación rota.
 *
 * LOS PLANETAS YA NO SON UNA DESCARGA CON NOMBRE. Eran `planetas.bin` y ahora
 * son un fragmento de JavaScript que carga un `import()`, así que la primera
 * mitad no puede mirarlos: lo que se comprueba es la segunda, que el panel
 * llegue a nombrar un planeta.
 *
 * VA EN `checks/` Y NO EN LAS PRUEBAS porque necesita Playwright, un build y un
 * servidor. Se ejecuta a mano, y sobre todo antes de tocar cualquiera de los
 * dos ganchos que descargan.
 *
 * Uso: `npm run build && npx tsx scripts/checks/cielo-carga.ts`
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4399

/** Puesta por `main` en cuanto hay servidor, para que el `catch` la alcance. */
let stopServerRef: (() => void) | null = null

async function main() {
  /**
   * `detached` NO ES UN DETALLE: es lo único que permite matar el servidor.
   *
   * `npx` lanza a `vite` como HIJO suyo, y `vite` lanza a `esbuild`. Un
   * `server.kill()` a secas mata solo a `npx` y deja los otros dos vivos con el
   * puerto cogido — y como este script termina con `process.exit`, nadie más va
   * a recogerlos. Han sobrevivido a sesiones enteras así, ocupando el 4399 y
   * haciendo fallar la siguiente ejecución por `--strictPort`.
   *
   * Con `detached` el grupo de procesos es propio y `process.kill(-pid)` se los
   * lleva a los tres.
   */
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  })
  const stopServer = () => {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM')
    } catch {
      // Ya estaba muerto.
    }
  }
  stopServerRef = stopServer
  await new Promise((r) => setTimeout(r, 3000))

  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200))
  })
  page.on('response', (r) => {
    if (r.url().includes('/cielo/')) requests.push(`${r.status()} ${r.url().split('/').pop()}`)
  })

  await page.addInitScript(() => {
    localStorage.setItem(
      'tiempo-palmero:ajustes',
      JSON.stringify({ nightSky: true, nightMoon: true, nightPlanets: true, terrain: true }),
    )
  })
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.locator('text=Experimental').first().click({ force: true })
  await page.waitForTimeout(1000)
  for (const label of ['Cielo estrellado en 3D', 'Los planetas', 'La Vía Láctea']) {
    const box = page.locator(`label:has-text("${label}") input`)
    if ((await box.count()) && !(await box.first().isChecked())) {
      await box.first().click({ force: true })
    }
    await page.waitForTimeout(1200)
  }
  await page.waitForTimeout(4000)

  const text = await page.locator('body').innerText()
  const checks: [string, boolean][] = [
    ['estrellas.bin contesta 200', requests.some((r) => r === '200 estrellas.bin')],
    ['figuras.bin contesta 200', requests.some((r) => r === '200 figuras.bin')],
    ['nombres.json contesta 200', requests.some((r) => r === '200 nombres.json')],
    ['el catálogo deja de descargarse', !text.includes('Descargando el catálogo')],
    ['las efemérides dejan de cargarse', !text.includes('Cargando las efemérides')],
    // Sustituye a la comprobación de que `planetas.bin` contestaba 200. Ahora
    // las efemérides son un fragmento de JavaScript y no una descarga con
    // nombre propio, así que lo que se mira es el efecto: que el panel llegue a
    // nombrar un planeta. Sin efemérides la tabla del panel sale vacía.
    ['el panel enseña algún planeta', /Júpiter|Venus|Saturno|Marte/.test(text)],
    ['vialactea.png contesta 200', requests.some((r) => r === '200 vialactea.png')],
    ['el mapa de la Vía Láctea deja de descargarse', !text.includes('Descargando el mapa')],
    // La cifra que dice cuánto se ve. Sin ella el bloque está a medias: el mapa
    // puede haber llegado y la capa no haber recibido estado.
    ['el panel enseña la luz que pone la Vía Láctea', text.includes('Luz que pone ella')],
    ['el panel enseña las estrellas visibles', text.includes('Estrellas visibles')],
    ['el panel enseña la luna', text.includes('Fase')],
    ['sin errores de consola', errors.length === 0],
  ]

  let ok = true
  for (const [what, passed] of checks) {
    console.log(`${passed ? '  ok  ' : ' FALLA'}  ${what}`)
    if (!passed) ok = false
  }
  if (errors.length) console.log('\nerrores:\n' + errors.slice(0, 10).join('\n'))

  await browser.close()
  stopServer()
  process.exit(ok ? 0 : 1)
}

/**
 * Y también se mata si el script se va por el desagüe. Antes, un fallo entre el
 * `spawn` y el final —Playwright sin navegador instalado, un `goto` que agota
 * el tiempo— dejaba el servidor corriendo para siempre.
 */
main().catch((e) => {
  console.error(e)
  stopServerRef?.()
  process.exit(1)
})
