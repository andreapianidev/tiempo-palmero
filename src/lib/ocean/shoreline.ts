/**
 * El mapa de la orilla: a qué distancia está la costa desde cada punto del mar,
 * hacia dónde mira y cuánto sube la tierra justo detrás.
 *
 * ES LO QUE HACE QUE LA OLA SEPA DÓNDE ROMPER. La batimetría dice cuánta agua
 * hay debajo, pero no dónde está el borde: entre dos metros de fondo en mitad
 * de una bahía y dos metros de fondo a diez metros de un acantilado hay toda la
 * diferencia del mundo, y es justamente la que se ve. Con la distancia a la
 * orilla y su dirección, el sombreador puede poner la espuma donde revienta,
 * mojar la roca hasta donde sube la ola y girar el oleaje para que entre de
 * frente a la playa, que es lo que hace el de verdad.
 *
 * DE DÓNDE SALE LA LÍNEA DE COSTA. Del `limite-insular` del Cabildo —el mismo
 * fichero que el mapa ya dibuja como contorno de la isla— y no del DEM. Son
 * 73.605 vértices a un paso medio de 2,2 m: la línea oficial, con sus puntas y
 * sus calas. El DEM, a 33,5 m por píxel, redondearía cada punta. Y usar la
 * misma fuente que el contorno pintado tiene una consecuencia que se ve: el
 * agua no puede quedar desalineada con la costa del mapa, porque son la misma
 * línea.
 *
 * ESTE FICHERO NO TOCA EL NAVEGADOR. Recibe una máscara de tierra ya
 * rasterizada y devuelve números. Quien convierte el polígono en máscara es
 * `land-mask.ts`, que sí necesita un `<canvas>` y por eso vive aparte.
 */

/**
 * Hasta dónde se mide la distancia a la orilla, en metros.
 *
 * 2 km. Más allá el mar ya no sabe que hay costa: con un oleaje de 12 s —el más
 * largo que llega aquí— la ola empieza a notar el fondo a 112 m de profundidad,
 * y en esta isla esa isóbata está a menos de 2 km de la orilla por todas
 * partes (el talud cae 4 km en 20). O sea que 2 km cubre entera la zona donde
 * el mar y la tierra se hablan, y todo lo de fuera es «lejos».
 */
export const SHORE_MAX_M = 2000

/**
 * Techo de la cota que se guarda, en metros. 64 m.
 *
 * No es la altura de la isla: es hasta dónde puede llegar a importar para el
 * agua. La ola más grande que rompe aquí no moja por encima de los 15 m, y el
 * resto del rango sirve para que el sombreador distinga un acantilado de una
 * playa —contra una pared de 60 m el agua rebota y salpica; sobre una rampa de
 * dos metros, se desliza—. Guardar los 2426 m enteros habría dejado la playa,
 * que es donde pasa todo, en el primer escalón de la escala.
 */
export const SHORE_MAX_ELEVATION_M = 64

export interface ShorelineGrid {
  width: number
  height: number
  /** Metros por texel en cada eje: la malla no es cuadrada sobre el terreno. */
  metersX: number
  metersY: number
}

/**
 * Distancia con signo a la costa, en metros: positiva en el mar, negativa en
 * tierra.
 *
 * Es una transformada de distancia por *chamfer* de dos pasadas (adelante y
 * atrás), con los pesos exactos de cada paso —el lado del texel en cada eje y
 * su diagonal— en vez de los 3-4-5 clásicos, porque aquí la malla no es
 * cuadrada sobre el terreno: un texel mide 34 m en longitud y 54 m en latitud.
 * El error del chamfer frente a la distancia euclídea exacta se queda por
 * debajo del 4 % en las diagonales, que sobre una franja de rompiente de 60 m
 * son dos metros: por debajo del tamaño del propio texel.
 *
 * La alternativa exacta —Felzenszwalb— cuesta cuatro barridos y un vector de
 * parábolas por fila para ganar ese 4 % en un dato que después se dibuja
 * suavizado. No compensa.
 */
export function signedShoreDistance(
  land: Uint8Array,
  grid: ShorelineGrid,
): Float32Array {
  const { width, height } = grid
  const toLand = chamfer(land, grid, 1)
  const toSea = chamfer(land, grid, 0)
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) {
    // El cero cae entre dos texeles de clase distinta, así que se descuenta
    // medio texel a cada lado: sin eso la orilla quedaría medio texel adentro
    // del mar y la espuma se despegaría de la costa.
    const half = grid.metersX / 2
    out[i] = land[i] ? -(toSea[i] - half) : toLand[i] - half
  }
  return out
}

/** Distancia de cada texel al texel más cercano cuyo valor de máscara sea `seed`. */
function chamfer(mask: Uint8Array, grid: ShorelineGrid, seed: number): Float32Array {
  const { width, height, metersX, metersY } = grid
  const diagonal = Math.hypot(metersX, metersY)
  const far = SHORE_MAX_M * 4
  const d = new Float32Array(width * height)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === seed ? 0 : far

  const relax = (i: number, j: number, w: number) => {
    const v = d[j] + w
    if (v < d[i]) d[i] = v
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (d[i] === 0) continue
      if (x > 0) relax(i, i - 1, metersX)
      if (y > 0) {
        relax(i, i - width, metersY)
        if (x > 0) relax(i, i - width - 1, diagonal)
        if (x < width - 1) relax(i, i - width + 1, diagonal)
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      if (d[i] === 0) continue
      if (x < width - 1) relax(i, i + 1, metersX)
      if (y < height - 1) {
        relax(i, i + width, metersY)
        if (x < width - 1) relax(i, i + width + 1, diagonal)
        if (x > 0) relax(i, i + width - 1, diagonal)
      }
    }
  }
  return d
}

/**
 * Empaqueta el mapa de orilla en RGBA de 8 bits, listo para subir a la GPU.
 *
 *   R  distancia con signo, por raíz cuadrada          0,5 = la orilla
 *   G  cota del terreno, lineal hasta 64 m             0 = nivel del mar
 *   B  componente este de la normal de costa           0,5 = cero
 *   A  componente norte de la normal de costa          0,5 = cero
 *
 * La raíz cuadrada en la distancia es la misma idea que en la batimetría: los
 * 256 valores se reparten donde se necesitan. Lineal sobre 2 km, cada escalón
 * serían 16 m y la línea de espuma —que mide entre 5 y 50 m— cabría en tres
 * valores. Con raíz, medido sobre esta misma función, el escalón es de 25 cm
 * pegado a la orilla, de 80 cm a veinte metros y de 16 m a dos kilómetros,
 * donde ya no hay nada que dibujar.
 *
 * La normal es el gradiente del campo de distancia, que apunta siempre de la
 * tierra hacia el mar. No se guarda como ángulo a propósito: interpolar
 * ángulos entre texeles cruza el corte de los 360° y deja una costura de
 * normales invertidas justo donde la costa cambia de rumbo.
 */
export function packShoreline(
  distance: Float32Array,
  elevation: Float32Array,
  grid: ShorelineGrid,
): Uint8Array {
  const { width, height } = grid
  const out = new Uint8Array(width * height * 4)
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const d = distance[i]
      const norm = Math.sqrt(Math.min(SHORE_MAX_M, Math.abs(d)) / SHORE_MAX_M)
      out[i * 4] = byte(0.5 + 0.5 * Math.sign(d) * norm)
      out[i * 4 + 1] = byte(elevation[i] / SHORE_MAX_ELEVATION_M)

      // Diferencias centradas, con el borde replicado. La escala del gradiente
      // da igual: se normaliza acto seguido.
      const xm = distance[y * width + Math.max(0, x - 1)]
      const xp = distance[y * width + Math.min(width - 1, x + 1)]
      const ym = distance[Math.max(0, y - 1) * width + x]
      const yp = distance[Math.min(height - 1, y + 1) * width + x]
      const gx = xp - xm
      // La `y` del texel crece hacia el sur y la del mapa hacia el norte.
      const gy = ym - yp
      const len = Math.hypot(gx, gy)
      const nx = len > 0 ? gx / len : 0
      const ny = len > 0 ? gy / len : 0
      out[i * 4 + 2] = byte(0.5 + 0.5 * nx)
      out[i * 4 + 3] = byte(0.5 + 0.5 * ny)
    }
  }
  return out
}

/** Decodifica el canal R. Existe para que el test compruebe lo que ve la GPU. */
export function decodeShoreDistance(byteValue: number): number {
  const v = (byteValue / 255 - 0.5) * 2
  return Math.sign(v) * v * v * SHORE_MAX_M
}
