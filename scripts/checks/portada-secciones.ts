/**
 * DÓNDE CAE CADA SECCIÓN DE LA PORTADA, en unidades de `--asc`.
 *
 * `--asc` va de 0 en el mar a 1 en el Roque y es una FRACCIÓN DE LA PÁGINA
 * ENTERA, no una posición absoluta. De ella cuelgan tres cosas que están
 * calibradas a mano contra secciones concretas:
 *
 *   · los cuatro regímenes de la isla que gira  (`LIMITES` en
 *     `web/js/isla3d/regimenes.js`)
 *   · el punto por el que se cruza el mar de nubes (`.c-nubes` en
 *     `web/css/atmosfera.css`)
 *   · las seis paradas en las que se mide el contraste
 *     (`PARADAS` en `portada-regimenes.ts`)
 *
 * Así que AÑADIR O QUITAR UNA SECCIÓN LAS DESCALIBRA LAS TRES: alargar la
 * página empuja todo lo de abajo hacia arriba en `--asc`. Pasó en agosto de
 * 2026, al entrar cuatro secciones de golpe —para quién es, los aforos, la isla
 * en 3D y el cielo—: la noche empezaba en 0,79 y la sección del cielo se quedó
 * entera en el crepúsculo, la nube cruzaba por detrás del panel del modelo, que
 * es opaco, y las paradas del medidor de contraste medían la calima en pleno
 * alisio. Nada de eso da error por sí solo; solo se ve mirando, o midiendo.
 *
 * Este script mide. Para cada sección da el `--asc` en el que entra por el
 * canto inferior de la ventana, en el que queda CENTRADA —que es el criterio
 * con el que `revelar.js` enciende su hito del raíl— y en el que se va. Y
 * propone unos `LIMITES` que dejan cada cruce en una costura entre secciones y
 * no en mitad de una.
 *
 * Uso — CON `servir.py`, NO CON `python3 -m http.server`. Aquel habla HTTP/1.0 y
 * bajo la ráfaga de peticiones de la portada suelta conexiones: las últimas
 * hojas de estilo no cargan y la isla no arranca, y esto lo denuncia como si
 * fuera un fallo del sitio. Está contado entero en `servir.py`.
 *
 *   python3 scripts/checks/servir.py 4173 web &
 *   npx tsx scripts/checks/portada-secciones.ts http://127.0.0.1:4173/index.html
 *
 * Playwright NO es dependencia de este proyecto: por eso este fichero está en
 * la lista de exclusiones de `tsconfig.json`, como los otros que abren un
 * navegador de verdad.
 */

import { chromium } from 'playwright'
// Los límites de verdad, leídos del fichero que los usa. Importarlos en vez de
// copiarlos es lo que separa una comprobación de un folleto: si alguien los
// cambia a mano y se le va la mano, esto lo dice.
import { LIMITES, CRUCE } from '../../web/js/isla3d/regimenes.js'

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:4173/index.html'

/** Los dos anchos en los que se comprueba todo lo demás de la portada. */
const PANTALLAS = [
  { w: 1440, h: 900, nombre: '1440' },
  { w: 390, h: 844, nombre: '390' },
]

/**
 * Qué sección le toca a cada régimen. Es la única parte de esto que es una
 * decisión y no una medida, así que está escrita aquí y no deducida: la calima
 * es la costa, el alisio el tramo de los senderos, el temporal el sitio donde
 * la página habla de acertar —porque es el régimen en el que una recta
 * acierta— y la noche empieza con la sección del cielo.
 */
const REPARTO = [
  { regimen: 'calima', hasta: 'publico' },
  { regimen: 'alisio', hasta: 'aforos' },
  { regimen: 'temporal', hasta: 'tresd' },
  { regimen: 'noche', hasta: null },
]

interface Tramo {
  id: string
  entra: number
  centro: number
  sale: number
}

async function medir(w: number, h: number): Promise<Tramo[]> {
  const nav = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  })
  try {
    const pag = await nav.newPage({ viewport: { width: w, height: h } })
    await pag.goto(URL_BASE, { waitUntil: 'networkidle' })
    // La isla y las tipografías mueven la altura de la página al asentarse.
    await pag.waitForTimeout(1500)
    return await pag.evaluate(() => {
      const alto = document.documentElement.scrollHeight - window.innerHeight
      const vh = window.innerHeight
      return [...document.querySelectorAll('main section[id]')].map((s) => {
        const el = s as HTMLElement
        const top = el.getBoundingClientRect().top + window.scrollY
        return {
          id: el.id,
          entra: (top - vh) / alto,
          centro: (top + el.offsetHeight / 2 - vh / 2) / alto,
          sale: (top + el.offsetHeight - vh / 2) / alto,
        }
      })
    })
  } finally {
    await nav.close()
  }
}

function n3(x: number): string {
  return x.toFixed(3).replace('.', ',').padStart(6)
}

async function main(): Promise<void> {
  const porPantalla: Array<{ nombre: string; tramos: Tramo[] }> = []

  for (const p of PANTALLAS) {
    const tramos = await medir(p.w, p.h)
    porPantalla.push({ nombre: p.nombre, tramos })
    console.log(`\n── ${p.nombre} px ──`)
    console.log('   sección       entra   centro    sale')
    for (const t of tramos) {
      console.log(`   ${t.id.padEnd(12)} ${n3(t.entra)}  ${n3(t.centro)}  ${n3(t.sale)}`)
    }
  }

  /* ── los límites que tocan ──────────────────────────────────────────────
     El cruce se centra en la costura entre la última sección de un régimen y
     la primera del siguiente, así que `LIMITES[k]` —que es donde EMPIEZA el
     cruce— es esa costura menos medio cruce. Se toma la costura más temprana
     de las dos pantallas: si en una el cruce cae dentro de una sección, cae
     dentro en esa y en la otra no, y de las dos posibilidades la que se ve
     peor es la de empezar tarde.                                           */
  const costuras: number[] = []
  for (const { hasta } of REPARTO) {
    if (!hasta) continue
    const finales = porPantalla.map(({ tramos }) => {
      const t = tramos.find((x) => x.id === hasta)
      if (!t) throw new Error(`la portada no tiene una sección «${hasta}»`)
      return t.sale
    })
    costuras.push(Math.min(...finales))
  }

  const sugeridos = costuras.map((c) => +(c - CRUCE / 2).toFixed(2))
  console.log(`\nLIMITES puestos ahora:  [${LIMITES.join(', ')}]   (CRUCE ${CRUCE})`)
  console.log(`LIMITES que centrarían cada cruce en su costura: [${sugeridos.join(', ')}]`)

  /* ── y las paradas del medidor de contraste ─────────────────────────────
     Una por régimen, en mitad de su tramo, más los dos cruces que importan.
     Van en `PARADAS` de `portada-regimenes.ts`.                            */
  const bordes = [0, ...LIMITES.map((l: number) => l + CRUCE), 1]
  const centros = bordes.slice(0, -1).map((a, i) => (a + Math.min(bordes[i + 1], LIMITES[i] ?? 1)) / 2)
  console.log('\nPARADAS sugeridas para portada-regimenes.ts:')
  REPARTO.forEach((r, i) => {
    console.log(`  { asc: ${centros[i].toFixed(3)}, nombre: '${r.regimen}' },`)
    if (i < LIMITES.length) {
      console.log(`  { asc: ${(LIMITES[i] + CRUCE / 2).toFixed(3)}, nombre: 'cruce-${r.regimen}-${REPARTO[i + 1].regimen}' },`)
    }
  })

  /* ── comprobación: ¿manda el régimen que toca en cada sección? ────────── */
  let fallos = 0
  for (const { nombre, tramos } of porPantalla) {
    for (const t of tramos) {
      // De qué régimen es el centro de esta sección con los límites de arriba.
      let i = 0
      for (const l of LIMITES) if (t.centro >= l + CRUCE) i++
      // Dentro de un cruce manda el que más pesa, que es de qué mitad del cruce
      // se trate: eso es lo que hace `regimenEn()` con la etiqueta.
      const enCruce = LIMITES.some((l: number) => t.centro > l && t.centro < l + CRUCE)
      if (enCruce) {
        const k = LIMITES.findIndex((l: number) => t.centro > l && t.centro < l + CRUCE)
        i = t.centro < LIMITES[k] + CRUCE / 2 ? k : k + 1
      }
      // A qué régimen DEBERÍA pertenecer según el reparto.
      let esperado = REPARTO.length - 1
      for (let k = 0; k < REPARTO.length - 1; k++) {
        const hasta = REPARTO[k].hasta!
        const idx = tramos.findIndex((x) => x.id === hasta)
        if (tramos.findIndex((x) => x.id === t.id) <= idx) {
          esperado = k
          break
        }
      }
      if (i !== esperado) {
        fallos++
        console.log(
          `\n✗ ${nombre} px · «${t.id}» queda en el régimen «${REPARTO[i].regimen}» ` +
            `y le tocaba «${REPARTO[esperado].regimen}» (centro en ${n3(t.centro).trim()})`,
        )
      }
    }
  }

  if (fallos) {
    console.log(
      `\n✗ ${fallos} secciones con el régimen cambiado. Pon los LIMITES sugeridos ` +
        `arriba en web/js/isla3d/regimenes.js — y de paso las PARADAS en portada-regimenes.ts.`,
    )
    process.exitCode = 1
  } else {
    console.log('\n✓ cada sección cae en el régimen que le toca, en las dos pantallas')
  }
}

await main()
