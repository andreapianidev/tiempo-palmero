/**
 * LA PORTADA, MEDIDA CON LA ISLA ENCENDIDA
 *
 * Dos cosas que no se pueden comprobar mirando:
 *
 * 1. EL CONTRASTE DE CADA TEXTO CONTRA EL FONDO QUE DE VERDAD TIENE DEBAJO.
 *    No contra el color declarado en el CSS: contra los píxeles. Se fotografía
 *    la página dos veces —una normal y otra con las letras en transparente— y se
 *    comparan: los píxeles que cambian SON los glifos, y el fondo que importa es
 *    el de la segunda foto exactamente en esos píxeles. Es la única forma de
 *    saber si un párrafo se lee cuando por detrás le pasa una ladera a plena luz.
 *
 *    POR QUÉ NO VALE EL RECTÁNGULO DEL TEXTO A SECAS. Porque el peor píxel del
 *    rectángulo casi nunca está debajo de una letra. Medido así, este mismo
 *    script daba 1,16:1 en seis paradas y el culpable era siempre rgb(226,180,92)
 *    —`--amber` clavado—: el punto del `.hero-rot`, la marca del hito encendido
 *    del altímetro o el filete de la etiqueta, adornos que comparten caja con el
 *    texto pero no se le ponen detrás. Seis falsos positivos de seis.
 *
 *    Y POR QUÉ HAY UNA TERCERA FOTO. Porque en esta página se mueven cosas: el
 *    punto que late en `.hero-rot`, el «en marcha» de las capturas, y sobre todo
 *    el relieve, que sigue girando con sus nubes y su lluvia entre una foto y la
 *    siguiente. Todo eso cambia de píxel sin que haya ninguna letra, y con dos
 *    fotos se colaba como glifo. La tercera se hace igual que la segunda un
 *    momento después: lo que cambie entre esas dos es movimiento, no texto, y se
 *    descuenta. Un glifo es lo que cambia al apagar el color Y se queda quieto.
 *
 *    Hace falta CADA VEZ que se toca el brillo de la atmósfera, y este cambio lo
 *    toca: los cuatro regímenes traen sus propias luces —la calima sube el ámbar,
 *    la lluvia añade rayas claras, las luces de los pueblos meten ámbar en la
 *    costa—. Lo pide `web/css/base.css` donde fija `--fg-dim` y `--fg-faint`.
 *
 * 2. EL COSTE. Se mide el hueco entre fotogramas mientras la página rueda, que es
 *    lo que vigila el freno de `isla3d.js`. Si la mediana se acerca a sus límites
 *    —38 ms para bajar la resolución, 55 para rendirse— es que los regímenes han
 *    salido caros y hay que quitarles trabajo.
 *
 * Uso:
 *   cd web && python3 -m http.server 4173 &
 *   npx tsx scripts/checks/portada-regimenes.ts http://127.0.0.1:4173/index.html
 *
 * Playwright NO es dependencia de este proyecto: por eso este fichero está en la
 * lista de exclusiones de `tsconfig.json`, como los otros tres que abren un
 * navegador de verdad.
 */

import { chromium, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:4173/index.html'
const SALIDA = join(import.meta.dirname, '../../.tmp/portada')

/** Las cinco paradas: cada régimen en su tramo, más los dos cruces que importan. */
const PARADAS = [
  { asc: 0.04, nombre: 'calima' },
  { asc: 0.26, nombre: 'cruce-calima-alisio' },
  { asc: 0.38, nombre: 'alisio' },
  { asc: 0.62, nombre: 'temporal' },
  { asc: 0.75, nombre: 'cruce-temporal-noche' },
  { asc: 0.9, nombre: 'noche' },
]

const PANTALLAS = [
  { w: 1440, h: 900, nombre: '1440' },
  { w: 390, h: 844, nombre: '390' },
]

/** Umbral por token de color, de `web/css/base.css`. */
const MINIMO: Record<string, number> = {
  '#f4f1ec': 4.5,
  '#b3ada4': 4.5,
  '#a49d92': 4.5,
  '#e2b45c': 4.5,
  '#c1873a': 3,
}

interface Medida {
  pantalla: string
  parada: string
  texto: string
  color: string
  contraste: number
  minimo: number
  fondo: [number, number, number]
}

function luminancia(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function razon(a: number, b: number): number {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

function hexDe(css: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css)
  if (!m) return css
  const h = (v: string) => Number(v).toString(16).padStart(2, '0')
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`
}

/** Los rectángulos de todos los textos visibles, con su color efectivo. */
async function textos(page: Page) {
  return await page.evaluate(() => {
    const salida: { x: number; y: number; w: number; h: number; color: string; texto: string }[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let nodo: Node | null
    while ((nodo = walker.nextNode())) {
      const txt = (nodo.textContent ?? '').trim()
      if (txt.length < 2) continue
      const padre = nodo.parentElement
      if (!padre) continue
      if (padre.closest('[aria-hidden="true"]')) continue
      const est = getComputedStyle(padre)
      if (est.visibility === 'hidden' || est.display === 'none' || Number(est.opacity) < 0.35) continue
      const rango = document.createRange()
      rango.selectNodeContents(nodo)
      for (const r of Array.from(rango.getClientRects())) {
        if (r.width < 6 || r.height < 6) continue
        if (r.bottom < 0 || r.top > window.innerHeight) continue
        if (r.right < 0 || r.left > window.innerWidth) continue
        // ¿SE VE DE VERDAD ESTA LÍNEA? Un renglón que ya ha pasado por debajo de
        // la cabecera fija sigue teniendo su rectángulo donde estaba, y sin
        // comprobarlo se le atribuían los píxeles de lo que hay encima: seis
        // fallos de contraste, los seis con el ámbar del botón «Abrir el mapa»
        // de la barra superior. Un texto tapado no necesita contraste ninguno.
        // El velo y el lienzo de la isla no estorban aquí: los dos son
        // `pointer-events:none` y el impacto los atraviesa.
        const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2))
        const cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2))
        const arriba = document.elementFromPoint(cx, cy)
        if (!arriba || !(arriba === padre || padre.contains(arriba) || arriba.contains(padre))) continue
        salida.push({
          x: Math.max(0, r.left),
          y: Math.max(0, r.top),
          w: Math.min(r.width, window.innerWidth - Math.max(0, r.left)),
          h: Math.min(r.height, window.innerHeight - Math.max(0, r.top)),
          color: est.color,
          texto: txt.slice(0, 48),
        })
      }
    }
    return salida
  })
}

async function main() {
  mkdirSync(SALIDA, { recursive: true })
  const navegador = await chromium.launch({
    // La isla necesita WebGL de verdad: sin esto Chromium headless cae al
    // rasterizador por software y el freno de `isla3d.js` la apaga, que es
    // justamente lo que NO hay que medir aquí.
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
  })

  const problemas: string[] = []
  const medidas: Medida[] = []
  const consola: string[] = []

  for (const pantalla of PANTALLAS) {
    const ctx = await navegador.newContext({
      viewport: { width: pantalla.w, height: pantalla.h },
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consola.push(`[${pantalla.nombre}] ${m.text()}`)
    })
    page.on('pageerror', (e) => consola.push(`[${pantalla.nombre}] pageerror: ${e.message}`))

    await page.goto(URL_BASE, { waitUntil: 'load' })
    // La malla se construye tras cargar `relieve.png`; la clase lo anuncia.
    const viva = await page
      .waitForFunction(() => document.documentElement.classList.contains('isla3d-ok'), null, {
        timeout: 15_000,
      })
      .then(() => true)
      .catch(() => false)
    console.log(`\n── ${pantalla.nombre} px · isla ${viva ? 'encendida' : 'APAGADA'} ──`)
    if (!viva && pantalla.nombre === '1440') {
      problemas.push('la isla no arrancó a 1440 px: sin relieve no hay nada que medir')
    }

    const alto = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

    for (const parada of PARADAS) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(parada.asc * alto))
      // Tiempo para que la cámara y los cruces de régimen se asienten.
      await page.waitForTimeout(1100)

      const asc = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--asc')),
      )
      const regimen = await page.evaluate(
        () => document.querySelector('[data-regimen]')?.getAttribute('data-regimen') ?? '—',
      )

      await page.screenshot({
        path: join(SALIDA, `${pantalla.nombre}-${parada.nombre}.png`),
      })

      const cajas = await textos(page)

      // Foto 1: la página tal cual.
      const conTexto = await page.screenshot()
      // Foto 2: las letras en transparente. `color:transparent` deja los paneles,
      // el velo, el cielo y el relieve donde estaban y solo se lleva los glifos.
      await page.addStyleTag({
        content:
          '*,*::before,*::after{color:transparent!important;text-shadow:none!important;' +
          '-webkit-text-stroke-color:transparent!important}',
      })
      await page.waitForTimeout(140)
      const sinTexto = await page.screenshot()
      await page.waitForTimeout(260)
      const sinTexto2 = await page.screenshot()
      await page.evaluate(() => {
        const hojas = Array.from(document.querySelectorAll('style'))
        const ultima = hojas[hojas.length - 1]
        if (ultima) ultima.remove()
      })

      const { PNG } = await import('pngjs')
      const pngCon = PNG.sync.read(conTexto)
      const pngSin = PNG.sync.read(sinTexto)
      const pngSin2 = PNG.sync.read(sinTexto2)

      let peor = Infinity
      let peorTexto = ''
      for (const caja of cajas) {
        const hex = hexDe(caja.color)
        const minimo = MINIMO[hex] ?? 4.5
        // El fondo más CLARO DEBAJO DE UN GLIFO, que es el caso peor real para
        // un texto claro. Un píxel que no cambia entre las dos fotos no tiene
        // ninguna letra encima y no cuenta.
        let maxLum = -1
        let maxRgb: [number, number, number] = [0, 0, 0]
        let maxEn: [number, number] = [0, 0]
        let glifos = 0
        const x0 = Math.round(caja.x)
        const y0 = Math.round(caja.y)
        const x1 = Math.min(pngSin.width, Math.round(caja.x + caja.w))
        const y1 = Math.min(pngSin.height, Math.round(caja.y + caja.h))
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * pngSin.width + x) * 4
            const d =
              Math.abs(pngCon.data[i] - pngSin.data[i]) +
              Math.abs(pngCon.data[i + 1] - pngSin.data[i + 1]) +
              Math.abs(pngCon.data[i + 2] - pngSin.data[i + 2])
            // 24 sobre 765: el borde antialiaseado de un glifo mueve poco, y por
            // debajo de eso lo que cambia es ruido de compresión del relieve.
            if (d < 24) continue
            // Lo que además se mueve entre las dos fotos sin texto no es una
            // letra: es el relieve girando, la lluvia cayendo o un punto latiendo.
            const mov =
              Math.abs(pngSin2.data[i] - pngSin.data[i]) +
              Math.abs(pngSin2.data[i + 1] - pngSin.data[i + 1]) +
              Math.abs(pngSin2.data[i + 2] - pngSin.data[i + 2])
            if (mov >= 12) continue
            glifos++
            const l = luminancia(pngSin.data[i], pngSin.data[i + 1], pngSin.data[i + 2])
            if (l > maxLum) {
              maxLum = l
              maxRgb = [pngSin.data[i], pngSin.data[i + 1], pngSin.data[i + 2]]
              maxEn = [x, y]
            }
          }
        }
        // Sin glifos detectados no hay nada que medir: texto tapado por un panel,
        // fuera de la ventana o del mismo color que su fondo.
        if (glifos < 12) continue
        if (maxLum < 0) continue

        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(caja.color)
        if (!m) continue
        const lumTexto = luminancia(Number(m[1]), Number(m[2]), Number(m[3]))
        const c = razon(lumTexto, maxLum)
        medidas.push({
          pantalla: pantalla.nombre,
          parada: parada.nombre,
          texto: caja.texto,
          color: hex,
          contraste: c,
          minimo,
          fondo: maxRgb,
        })
        if (c < peor) {
          peor = c
          peorTexto = `${caja.texto} (${hex}) sobre rgb(${maxRgb.join(',')})`
        }
        if (c < minimo) {
          // Quién hay en ese píxel exacto. Sin esto, un fallo de contraste es un
          // color sin dueño y no se sabe si el culpable es el relieve, un panel o
          // un adorno que ha caído dentro de la caja del texto.
          const quien = await page.evaluate(
            ([x, y]) =>
              document
                .elementsFromPoint(x, y)
                .slice(0, 3)
                .map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ').join('.') : ''))
                .join(' < '),
            maxEn,
          )
          problemas.push(
            `${pantalla.nombre} px · ${parada.nombre} · «${caja.texto}» ${hex} da ${c.toFixed(2)}:1 ` +
              `sobre rgb(${maxRgb.join(',')}) en (${maxEn.join(',')}) · ${quien}, mínimo ${minimo}`,
          )
        }
      }

      console.log(
        `  asc ${asc.toFixed(3)}  régimen ${String(regimen).padEnd(9)}  ` +
          `${String(cajas.length).padStart(3)} medidas  peor ${peor === Infinity ? '—' : peor.toFixed(2) + ':1'}  ${peorTexto}`,
      )
    }

    /* ── coste: el hueco entre fotogramas mientras rueda ── */
    // El cuerpo va como CADENA a propósito: `tsx` compila con esbuild, que
    // envuelve las funciones con nombre en un ayudante `__name` que no existe
    // dentro del navegador, y `page.evaluate` se cae con «__name is not defined».
    const huecos = (await page.evaluate(`
      new Promise((resolve) => {
        var t = [], ultimo = 0, i = 0
        var alto = document.documentElement.scrollHeight - window.innerHeight
        requestAnimationFrame(function paso(ms) {
          if (ultimo) t.push(ms - ultimo)
          ultimo = ms
          window.scrollTo(0, (i / 180) * alto)
          i++
          if (i < 180) requestAnimationFrame(paso)
          else resolve(t)
        })
      })
    `)) as number[]

    const orden = huecos.slice().sort((a, b) => a - b)
    const mediana = orden[orden.length >> 1]
    const p95 = orden[Math.floor(orden.length * 0.95)]
    console.log(
      `  coste: mediana ${mediana.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms ` +
        `(el freno baja la resolución a 38 y se rinde a 55)`,
    )
    if (mediana > 38) problemas.push(`${pantalla.nombre} px: mediana ${mediana.toFixed(1)} ms, el freno bajaría la resolución`)

    await ctx.close()
  }

  await navegador.close()

  writeFileSync(join(SALIDA, 'medidas.json'), JSON.stringify(medidas, null, 2))

  console.log(`\n${medidas.length} medidas de contraste en total. Capturas en .tmp/portada/`)
  if (consola.length) {
    console.log('\nCONSOLA DEL NAVEGADOR:')
    for (const c of [...new Set(consola)].slice(0, 20)) console.log(`  ${c}`)
  }
  if (problemas.length) {
    console.log(`\n✗ ${problemas.length} PROBLEMAS:`)
    for (const p of [...new Set(problemas)].slice(0, 40)) console.log(`  ${p}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ ninguna medida por debajo de su mínimo, y el coste cabe en el freno')
  }
}

await main()
