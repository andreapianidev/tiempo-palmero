/**
 * Que la Vía Láctea SE DIBUJE, y no solo que su PNG conteste 200.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA UNA COMPROBACIÓN APARTE. `cielo-carga.ts` mira que el mapa
 * se descargue y que el panel deje de decir «Descargando…», y las dos cosas
 * pasan perfectamente con un sombreador que no pinta un píxel: un `discard` de
 * más, una textura que se sube volteada, un `uniform` que se quedó sin asignar.
 * Un sombreador no lo prueba `npm test` — en Node no hay GPU— y no lo delata
 * ningún error de consola, porque no hay ningún error.
 *
 * LO QUE SE MIDE ES LA DIFERENCIA. Se dibuja el mismo instante, con la misma
 * cámara, dos veces: con la casilla marcada y sin ella. Todo lo demás se apaga
 * —luna, planetas, figuras y sobre todo el CENTELLEO, que usa el reloj y haría
 * que cada fotograma fuese distinto— para que lo único que cambie sea esto.
 *
 * EL RELOJ VA CONGELADO en la madrugada del 21 de agosto de 2026, y la fecha no
 * es casual: es la primera ventana desde que esto se escribió con el sol a
 * −48,9° y la luna 5,7° POR DEBAJO del horizonte. Con la luna arriba, la prueba
 * fallaría teniendo razón — la Vía Láctea se apaga, que es justo lo que hace en
 * el cielo de verdad.
 *
 * LOS DOS UMBRALES, MEDIDOS con esta escena:
 *
 *  - **Que el cielo cambie.** En la franja de arriba cambia el 23,5 % de los
 *    píxeles. El umbral en 5 % está casi cinco veces por debajo.
 *  - **Y que el suelo NO.** Es la mitad que importa, porque un fallo que tiñera
 *    la pantalla entera pasaría el primer umbral. Abajo —relieve, mar y panel—
 *    cambia el 1,5 %, que es el oleaje animándose entre dos ejecuciones. La
 *    razón medida es 15,3× y el umbral está en 5×.
 *
 * SE COMPARAN DENSIDADES Y NO EL REPARTO DE LA DIFERENCIA, que fue la primera
 * versión de esto y flotaba entre el 55 % y el 63 % de una ejecución a otra: la
 * franja de abajo es diez veces más grande, así que un poco de ruido repartido
 * por toda la isla pesaba tanto como la banda entera. Con densidades el sesgo
 * de tamaño desaparece y la prueba mide lo que dice medir.
 *
 * Uso: `npm run build && npx tsx scripts/checks/vialactea-dibujo.ts`
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const PORT = 4403
/** Sol a −48,9°, luna a −5,7°. Ver la cabecera. */
const WHEN = Date.UTC(2026, 7, 21, 1, 0, 0)
/** Donde empieza el mapa: a la izquierda está el panel lateral. */
const MAP_X = 330
/** La franja de cielo que la cámara alcanza con el tope de inclinación. */
const SKY_ROWS = 80

let stopServer: (() => void) | null = null

async function shoot(port: number, milkyWay: boolean): Promise<PNG> {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.addInitScript(`(() => {
      const FIXED = ${WHEN}
      const RealDate = Date
      const D = function (...a) { return a.length ? new RealDate(...a) : new RealDate(FIXED) }
      D.now = () => FIXED
      D.parse = RealDate.parse; D.UTC = RealDate.UTC; D.prototype = RealDate.prototype
      globalThis.Date = D
      localStorage.setItem('tiempo-palmero:ajustes', JSON.stringify({ v: 2, values: {
        terreno: true, nightSky: true, nightMilkyWay: ${milkyWay},
        nightMoon: false, nightPlanets: false, nightFigures: false, nightTwinkle: false,
      }}))
    })()`)
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(7000)
    // Enfocar SIN hacer clic: un clic en el mapa selecciona un punto y abre el
    // panel de la derecha, que taparía justo el trozo de cielo que se mide.
    await page.locator('canvas').first().focus()
    await page.waitForTimeout(500)
    // El teclado de MapLibre, que es repetible: 10° de cabeceo y 15° de giro
    // por pulsación. Acimut 225°, que es donde el ecuador galáctico está a 15°
    // de altura en ese instante.
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Shift+ArrowUp')
      await page.waitForTimeout(120)
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Shift+ArrowRight')
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(6000)
    return PNG.sync.read(await page.screenshot({ timeout: 120000 }))
  } finally {
    await browser.close()
  }
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  })
  stopServer = () => {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM')
    } catch {
      // Ya estaba muerto.
    }
  }
  await new Promise((r) => setTimeout(r, 6000))

  const on = await shoot(PORT, true)
  const off = await shoot(PORT, false)

  /**
   * DENSIDAD DE PÍXELES CAMBIADOS EN UNA FRANJA, que es lo que se compara.
   *
   * No el reparto de la diferencia, que era la primera versión de esto y
   * flotaba entre el 55 % y el 63 % entre ejecuciones: la franja de abajo es
   * mucho más grande que la de arriba, así que un poco de ruido de oleaje
   * repartido por toda la isla pesa tanto como la banda entera. Comparar
   * DENSIDADES —cambios por píxel disponible— quita ese sesgo de tamaño y
   * convierte la prueba en lo que de verdad es: señal contra ruido.
   */
  const density = (from: number, to: number): number => {
    let changed = 0
    for (let y = from; y < to; y++) {
      for (let x = MAP_X; x < on.width; x++) {
        const i = (y * on.width + x) * 4
        const d =
          Math.abs(on.data[i] - off.data[i]) +
          Math.abs(on.data[i + 1] - off.data[i + 1]) +
          Math.abs(on.data[i + 2] - off.data[i + 2])
        // Seis de 765 es el suelo de ruido de dos codificaciones del mismo píxel.
        if (d > 6) changed++
      }
    }
    return changed / ((to - from) * (on.width - MAP_X))
  }

  const cielo = density(0, SKY_ROWS)
  // El resto: relieve, mar y panel. Ahí NO hay Vía Láctea, y lo que se mueva es
  // el oleaje, que se anima con el reloj del navegador. Es el ruido de fondo.
  const suelo = density(300, on.height)
  const razon = suelo > 0 ? cielo / suelo : Infinity

  const checks: [string, boolean][] = [
    [`el cielo cambia (${(cielo * 100).toFixed(1)} % de esa franja)`, cielo > 0.05],
    // MEDIDO en dos ejecuciones seguidas: 23,5 % arriba contra 1,5 % abajo, o
    // sea 15,3 y 15,5 veces. El umbral en 5 deja sitio de sobra al ruido del
    // oleaje —que es lo único que se mueve abajo— y sigue muy por encima del 1
    // que daría una capa que no dibuja nada.
    [`y el suelo casi no (${(suelo * 100).toFixed(1)} %), razón ${razon.toFixed(1)}×`, razon > 5],
  ]

  let ok = true
  for (const [what, passed] of checks) {
    console.log(`${passed ? '  ok  ' : ' FALLA'}  ${what}`)
    if (!passed) ok = false
  }
  stopServer()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  stopServer?.()
  process.exit(1)
})
