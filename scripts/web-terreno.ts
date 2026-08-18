/**
 * El relieve de La Palma que la portada levanta en tres dimensiones.
 *
 * Escribe `web/img/relieve.png`: una imagen en la que cada píxel NO es un color
 * sino una cota. Es el mismo truco que usan las teselas terrarium de las que
 * sale —`public/dem/`, el modelo con el que la aplicación corrige la
 * temperatura por altitud—, reducido a la malla que cabe en una portada.
 *
 *     npm run web:terreno
 *
 * ── EL CONTRATO CON `web/js/isla3d.js` ─────────────────────────────────────
 *
 * Ese fichero decodifica la imagen y no tiene forma de preguntarle nada a este
 * script, así que las tres constantes de abajo son un contrato y están escritas
 * igual en los dos sitios. Si se toca una, se toca en ambos.
 *
 *     cota_m = (R · 256 + G) / 10 − 500
 *     lado de cada muestra = 140 m sobre el terreno
 *     el norte de la isla es la fila 0
 *
 * El desplazamiento de 500 m y el factor 10 dan un margen de −500 a 6.053 m con
 * precisión de 10 cm: sobra por los dos lados para una isla cuya cota máxima
 * son 2.426 m y cuyo fondo marino, que aquí no entra, se recorta a cero.
 *
 * Por qué una imagen y no un JSON: la CSP del sitio es `default-src 'none'` y
 * `img-src 'self'`. Una imagen se puede cargar y leer con un `<canvas>` sin
 * abrir `connect-src`, y encima la comprime PNG sin pérdida —el relieve es
 * suave, así que el filtro de PNG lo aprovecha entero—.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { loadDem, REPO_ROOT } from './dem-node.js'
import { SEA_LEVEL_M, type Dem } from '../src/lib/dem.js'

/** Lado de cada muestra sobre el terreno. El contrato con `isla3d.js`. */
const LADO_M = 140

/** Desplazamiento y factor de la codificación. El contrato con `isla3d.js`. */
const OFFSET_M = 500
const PASOS_POR_METRO = 10

/** Margen de mar alrededor de la isla, para que no acabe en un corte seco. */
const MARGEN_MUESTRAS = 6

interface Recorte {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** El rectángulo de DEM que contiene tierra emergida. */
function recorteDeTierra(dem: Dem): Recorte {
  let x0 = dem.width
  let y0 = dem.height
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < dem.height; y++) {
    const fila = y * dem.width
    for (let x = 0; x < dem.width; x++) {
      if (dem.heights[fila + x] <= SEA_LEVEL_M) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, x1, y1 }
}

function main(): void {
  const dem = loadDem()
  const paso = LADO_M / dem.manifest.metersPerPixel // píxeles de DEM por muestra
  const tierra = recorteDeTierra(dem)

  const margen = Math.round(MARGEN_MUESTRAS * paso)
  const x0 = Math.max(0, tierra.x0 - margen)
  const y0 = Math.max(0, tierra.y0 - margen)
  const x1 = Math.min(dem.width, tierra.x1 + margen)
  const y1 = Math.min(dem.height, tierra.y1 + margen)

  const ancho = Math.floor((x1 - x0) / paso)
  const alto = Math.floor((y1 - y0) / paso)

  const png = new PNG({ width: ancho, height: alto, colorType: 2 })
  let cima = -Infinity
  let fondo = Infinity

  for (let j = 0; j < alto; j++) {
    for (let i = 0; i < ancho; i++) {
      // Media del bloque de DEM que cae dentro de esta muestra: quedarse con el
      // píxel central deja el relieve con el ruido del muestreo a 33 m, y en
      // una malla iluminada eso se ve como una lija sobre toda la ladera.
      const px0 = Math.floor(x0 + i * paso)
      const py0 = Math.floor(y0 + j * paso)
      const px1 = Math.min(dem.width, Math.max(px0 + 1, Math.floor(x0 + (i + 1) * paso)))
      const py1 = Math.min(dem.height, Math.max(py0 + 1, Math.floor(y0 + (j + 1) * paso)))

      let suma = 0
      let n = 0
      for (let py = py0; py < py1; py++) {
        const fila = py * dem.width
        for (let px = px0; px < px1; px++) {
          suma += dem.heights[fila + px]
          n++
        }
      }
      // El fondo marino no se dibuja: el mar es un plano a cota cero, y dejar
      // la batimetría convertiría la costa en un acantilado hacia dentro.
      const h = Math.max(0, suma / n)
      if (h > cima) cima = h
      if (h < fondo) fondo = h

      const u = Math.round((h + OFFSET_M) * PASOS_POR_METRO)
      if (u < 0 || u > 0xffff) {
        throw new Error(`Cota fuera del rango codificable: ${h.toFixed(1)} m`)
      }
      const p = (j * ancho + i) << 2
      png.data[p] = u >> 8
      png.data[p + 1] = u & 0xff
      png.data[p + 2] = 0
      png.data[p + 3] = 255
    }
  }

  const salida = join(REPO_ROOT, 'web/img/relieve.png')
  const buf = PNG.sync.write(png, { colorType: 2, deflateLevel: 9 })
  writeFileSync(salida, buf)

  console.log(
    `web/img/relieve.png ← ${ancho}×${alto} muestras de ${LADO_M} m ` +
      `(${((ancho * LADO_M) / 1000).toFixed(1)}×${((alto * LADO_M) / 1000).toFixed(1)} km), ` +
      `cota ${fondo.toFixed(0)}–${cima.toFixed(0)} m, ${(buf.length / 1024).toFixed(1)} kB`,
  )
}

main()
