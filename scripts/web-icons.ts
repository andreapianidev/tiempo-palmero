/**
 * El icono de Tiempo Palmero, dibujado desde el DEM.
 *
 *     npm run web:icons
 *
 * Escribe nueve ficheros y ninguno se toca a mano:
 *
 *   public/favicon.svg              la pestaña, a cualquier tamaño
 *   public/favicon-32.png           la pestaña, para quien no lea SVG
 *   public/icon-192.png             manifiesto: el tamaño que pide Android
 *   public/icon-512.png             manifiesto: la ficha de instalación
 *   public/icon-maskable-512.png    manifiesto: recortable, sin esquinas
 *   public/apple-touch-icon.png     pantalla de inicio de iOS, 180 px
 *   web/favicon.svg                 el sitio, que es otro despliegue
 *   web/favicon-32.png              ídem
 *   web/apple-touch-icon.png        ídem, por si alguien lo ancla
 *
 * POR QUÉ NO ES UN DIBUJO. El icono anterior era una montaña genérica con un
 * sol: valía igual para una aplicación del tiempo de Oslo. Éste es La Palma
 * medida —la isohipsa de 1,5 m del DEM del motor, con sus propias alturas
 * dentro— y no se puede confundir con ninguna otra isla porque no es un símbolo
 * de isla: es ésta, con la Caldera y con Cumbre Vieja.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { coarsen, isoSegments, simplify, smooth, stitch, type Pt } from './contour.js'
import { loadDem, REPO_ROOT } from './dem-node.js'
import { layout, type IconArt } from './icon/art.js'
import { render } from './icon/raster.js'
import { sampler } from './icon/relief.js'
import { toSvg } from './icon/svg.js'

/** La cota que separa el mar de la tierra, la misma que traza la portada. */
const COAST_M = 1.5

/**
 * Reducción del DEM para sacar la costa.
 *
 * La portada usa 3 —100 m de paso— porque tiene que leerse la Caldera. Aquí la
 * Caldera la dibuja el sombreado, no el contorno: solo hace falta la línea de
 * costa. Medido: a STEP 3 el anillo crudo son 1.554 puntos; a 4, 1.160; a 6,
 * 768. Con 4 cada celda son 134 m, que a 512 px es un píxel del icono.
 */
const COAST_STEP = 4

/** Pasadas del suavizado 3×3 sobre la malla de la costa. Las de la portada. */
const COAST_SMOOTH = 2

/**
 * Tolerancia del simplificado, en celdas de la malla reducida —a STEP 4, una
 * celda son 134 m—.
 *
 * Medido sobre este anillo, en puntos y en kB del SVG que sale: sin simplificar
 * 1.160 y 14,1 kB; con 0,15, 324 y 4,5 kB; con 0,3, 206 y 3,2 kB; con 0,5, 147
 * y 2,5 kB; con 0,7, 118 y 2,2 kB; con 1,2, 74 y 1,7 kB; con 2, 39 y 1,3 kB.
 * El corte está en 0,5: lo que quita son 67 m, medio píxel del icono grande.
 */
const TOLERANCE = 0.5

/**
 * Reducción del DEM para el relieve de dentro.
 *
 * Aquí no se reduce por peso sino por ruido: el DEM en crudo a 33,54 m tiene
 * grano de muestreo que el sombreado amplifica. Con 2 —67 m— y una pasada de
 * suavizado, los barrancos que quedan son los que se ven a 512 px.
 */
const RELIEF_STEP = 2
const RELIEF_SMOOTH = 1

/** Altura de la isla dentro del icono con tarjeta, en fracción del lado. */
const CONTENT = 0.8

/**
 * Y dentro del recortable, que es otra cosa: Android puede recortarlo con un
 * círculo del 80 % del lado, o sea que todo lo que quede a más de 0,4 del
 * centro se pierde. Lo que manda es la punta de Fuencaliente, y este script
 * dice a cuánto queda; `src/pwa/icons.test.ts` lo vuelve a medir sobre el PNG.
 */
const CONTENT_MASKABLE = 0.66

/**
 * Y en el de iOS, que no lleva tarjeta porque la esquina la redondea el sistema
 * con su propio superelipse. Un poco menos que el normal, que ahí no hay borde
 * visible que sujete la silueta.
 */
const CONTENT_APPLE = 0.76

/** Radio de la esquina de la tarjeta, en fracción del lado. El de iOS es ~0,22. */
const CORNER = 0.22

function write(rel: string, data: string | Buffer): void {
  const path = join(REPO_ROOT, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  console.log(`  ${rel.padEnd(30)} ${(Buffer.byteLength(data as Buffer) / 1024).toFixed(1).padStart(7)} kB`)
}

/** Área con signo, para quedarse con la isla y no con un islote de dos celdas. */
function area(ring: Pt[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % ring.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) / 2
}

/** La punta de la silueta más lejana del centro, en fracción del lado. */
function reach(art: IconArt): number {
  let far = 0
  for (const [x, y] of art.island) far = Math.max(far, Math.hypot(x - 0.5, y - 0.5))
  return far
}

function main(): void {
  const dem = loadDem()
  const { metersPerPixel } = dem.manifest

  const coastGrid = smooth(coarsen(dem, COAST_STEP), COAST_SMOOTH)
  const rings = stitch(isoSegments(coastGrid, COAST_M)).filter((r) => r.length >= 12)
  const biggest = rings.sort((a, b) => area(b) - area(a))[0]
  if (!biggest) throw new Error('El DEM no ha devuelto ninguna línea de costa')

  // El anillo viene cerrado con el primer punto repetido al final: el relleno
  // ya cierra solo, y el punto de más sale como un lado de longitud cero.
  const closed = biggest.slice(0, -1)
  // De celdas de la malla reducida a píxeles del DEM, que es donde vive el
  // relieve: a partir de aquí todo habla el mismo idioma.
  const coast = simplify(closed, TOLERANCE).map(([x, y]) => [x * COAST_STEP, y * COAST_STEP] as Pt)

  const reliefGrid = smooth(coarsen(dem, RELIEF_STEP), RELIEF_SMOOTH)

  const card = layout(coast, CONTENT, CORNER, metersPerPixel)
  const maskable = layout(coast, CONTENT_MASKABLE, 0, metersPerPixel)
  const apple = layout(coast, CONTENT_APPLE, 0, metersPerPixel)

  const height = (art: IconArt) => sampler(reliefGrid, RELIEF_STEP, art)

  console.log(
    `costa: ${closed.length} puntos → ${coast.length} tras simplificar\n` +
      `recortable: la punta más lejana queda a ${reach(maskable).toFixed(3)} del centro ` +
      `(el círculo de Android corta en 0,400)`,
  )

  const svg = toSvg(card)
  write('public/favicon.svg', svg)
  write('web/favicon.svg', svg)
  write('public/favicon-32.png', render(card, 32, height(card)))
  write('web/favicon-32.png', render(card, 32, height(card)))
  write('public/icon-192.png', render(card, 192, height(card)))
  write('public/icon-512.png', render(card, 512, height(card)))
  write('public/icon-maskable-512.png', render(maskable, 512, height(maskable)))
  write('public/apple-touch-icon.png', render(apple, 180, height(apple)))
  write('web/apple-touch-icon.png', render(apple, 180, height(apple)))
}

main()
