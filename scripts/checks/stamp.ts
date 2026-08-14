/**
 * Lee el reloj que las cámaras del Cabildo llevan impreso dentro del JPEG.
 *
 * POR QUÉ HACE FALTA. Son las únicas doce cámaras del catálogo sin
 * `Last-Modified`: su nginx sirve con `no-store` y sin ninguna cabecera de
 * fecha. Sin leer el rótulo, la única forma de saber si una está viva es pedirle
 * la imagen muchas veces y ver si cambia — y como tres de ellas publican **cada
 * dos horas**, eso obliga a una ventana de tres horas para no matar cámaras
 * vivas. Leyendo el rótulo, la misma pregunta se contesta con UNA petición:
 * dice la hora dentro de la foto, y la resta con el reloj de pared es la edad.
 *
 * POR QUÉ NO ES UN OCR DE VERDAD. No hace falta y sería peor. El rótulo no es
 * texto renderizado con antialias: es una **fuente de mapa de bits de 7×10
 * escalada ×4**, siempre la misma, siempre en la misma rejilla. Cada glifo sale
 * idéntico píxel a píxel en todas las capturas, así que comparar contra
 * plantillas es exacto donde un OCR estadístico sería aproximado. Y no añade
 * ninguna dependencia: la única pieza no trivial es Otsu, quince líneas.
 *
 * LOS TRES PROBLEMAS REALES, Y CÓMO SE RESUELVEN:
 *
 *  1. **El umbral no puede ser fijo.** El texto no es blanco puro: entre la
 *     compresión JPEG y el fondo, sus píxeles caen entre 200 y 245 sobre hierba
 *     en sombra y bastante más abajo contra un cielo quemado. Un umbral fijo
 *     acierta en una cámara y ciega otra. Otsu sobre el propio recuadro separa
 *     los dos cúmulos sin que nadie elija nada.
 *  2. **El rótulo no está siempre en el mismo sitio.** Unas lo ponen abajo a la
 *     izquierda, otras abajo a la derecha, San Antonio del Monte arriba. Se
 *     BUSCA: se recorren las franjas de arriba y de abajo y se queda la que dé
 *     una hilera de bloques a paso constante, que es la firma de un rótulo.
 *  3. **El formato no es homogéneo.** Unas escriben `DD-MM-AAAA` y otras
 *     `MM-DD-AAAA`; unas van en hora insular y otras en UTC. No se adivina: se
 *     leen los caracteres y se prueban los dos órdenes, y se descarta el que dé
 *     una fecha imposible (`14` no es un mes) o futura. Cuando los dos son
 *     válidos —del día 1 al 12— se dice que es ambiguo en vez de elegir.
 *
 * La zona horaria SÍ hay que declararla por cámara: `14:09` no lleva escrito si
 * es insular o UTC, y entre las dos hay una hora. Se deduce una vez, comparando
 * una lectura contra el reloj de pared, y se anota en `CLOCKS`.
 */

import { PNG } from 'pngjs'
import { STAMP_FONT } from './stamp-font'

export interface Glyph {
  x0: number
  x1: number
  /** Mapa de bits normalizado a `GW`×`GH`, listo para comparar. */
  bits: Uint8Array
}

/** Rejilla de comparación. El glifo se estira a ella, así que el tamaño real
 *  de la fuente da igual: lo que se compara es la forma. */
export const GW = 12
export const GH = 20

export interface Strip {
  y0: number
  y1: number
  /** Mitad de la imagen en la que se buscó. Ver el porqué en el deduplicado. */
  side: 'izquierda' | 'derecha' | 'entera'
  threshold: number
  glyphs: Glyph[]
}

function luminance(png: PNG, x: number, y: number): number {
  const i = (y * png.width + x) * 4
  return Math.round(0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2])
}

/**
 * Umbral de Otsu sobre un recuadro: el valor que mejor separa dos cúmulos de
 * luminancia. Aquí esos dos cúmulos son el rótulo y todo lo demás.
 */
function otsu(png: PNG, x0: number, x1: number, y0: number, y1: number): number {
  const hist = new Array(256).fill(0)
  let total = 0
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      hist[luminance(png, x, y)]++
      total++
    }
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let weightB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    weightB += hist[t]
    if (!weightB) continue
    const weightF = total - weightB
    if (!weightF) break
    sumB += t * hist[t]
    const between = weightB * weightF * (sumB / weightB - (sum - sumB) / weightF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/**
 * El valor de luminancia que deja por encima una fracción `q` del recuadro.
 *
 * Es la red de seguridad de Otsu, y hace falta más de lo que parece. Otsu busca
 * el corte que mejor separa DOS cúmulos de tamaño comparable; cuando el rótulo
 * ocupa el tres por ciento del recuadro y el resto es monte oscuro, el corte
 * que maximiza la varianza separa el monte en sombra del monte al sol y deja el
 * texto del lado equivocado. Le pasa a San Bartolo, cuyo rótulo cae sobre una
 * ladera de laurisilva: con Otsu salían dos bloques de tinta en toda la franja.
 * Pedir directamente «el 4 % más claro» no se deja engañar por esa asimetría.
 */
function percentile(png: PNG, x0: number, x1: number, y0: number, y1: number, q: number): number {
  const hist = new Array(256).fill(0)
  let total = 0
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      hist[luminance(png, x, y)]++
      total++
    }
  let seen = 0
  for (let v = 255; v >= 0; v--) {
    seen += hist[v]
    if (seen >= total * q) return Math.max(v - 1, 0)
  }
  return 0
}

/** Los tramos de columnas con tinta: cada uno es un carácter. */
function columnRuns(
  png: PNG,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  threshold: number,
): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  for (let x = x0; x <= x1 + 1; x++) {
    let inked = false
    if (x <= x1) {
      for (let y = y0; y <= y1; y++)
        if (luminance(png, x, y) > threshold) {
          inked = true
          break
        }
    }
    if (inked && start < 0) start = x
    else if (!inked && start >= 0) {
      runs.push([start, x - 1])
      start = -1
    }
  }
  return runs
}

/** La primera y la última fila con tinta dentro de un recuadro. */
function inkRows(
  png: PNG,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  threshold: number,
): [number, number] | null {
  let top = -1
  let bottom = -1
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (luminance(png, x, y) > threshold) {
        if (top < 0) top = y
        bottom = y
        break
      }
  return top < 0 ? null : [top, bottom]
}

/**
 * Estira un carácter a la rejilla de comparación.
 *
 * EL ANCHO se normaliza por el recuadro del propio glifo. Un `1` es más
 * estrecho que un `8` y estirarlo lo deforma, pero lo deforma IGUAL en la
 * plantilla y en la consulta, así que la comparación sigue valiendo — y a
 * cambio el lector deja de depender del tamaño de la fuente.
 *
 * EL ALTO NO, y esto costó un intento. Normalizando también el alto por el
 * recuadro propio, un guion —dos filas de tinta— se estiraba hasta llenar la
 * rejilla entera y salía un bloque macizo, indistinguible de un punto o de dos
 * puntos. La altura se toma de la BANDA COMÚN de la franja, la que marcan los
 * dígitos, y entonces el guion queda donde está: una barra en el tercio central.
 */
function normalize(
  png: PNG,
  x0: number,
  x1: number,
  bandTop: number,
  bandBottom: number,
  threshold: number,
): Uint8Array {
  const w = x1 - x0 + 1
  const h = bandBottom - bandTop + 1
  const bits = new Uint8Array(GW * GH)
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      const sx = x0 + Math.min(w - 1, Math.floor(((gx + 0.5) * w) / GW))
      const sy = bandTop + Math.min(h - 1, Math.floor(((gy + 0.5) * h) / GH))
      bits[gy * GW + gx] = luminance(png, sx, sy) > threshold ? 1 : 0
    }
  return bits
}

/**
 * Busca las franjas que parecen un rótulo.
 *
 * La firma es una hilera de bloques de tinta a PASO CONSTANTE: eso lo produce
 * una fuente monoespaciada y no lo produce ni una cresta ni un tejado. Se
 * miran solo el 10 % de arriba y el 16 % de abajo, que es donde los grabadores
 * ponen la sobreimpresión.
 */
export function findStrips(png: PNG): Strip[] {
  const { width: W, height: H } = png
  const halves: [number, number, Strip['side']][] = [
    [0, Math.floor(W / 2), 'izquierda'],
    [Math.floor(W / 2), W - 1, 'derecha'],
    [0, W - 1, 'entera'],
  ]
  const out: Strip[] = []
  const tops: number[] = []
  /*
   * La ventana es MÁS ALTA que el rótulo (56 contra los ~40 que mide) a
   * propósito: hace falta margen por arriba y por abajo para comprobar que el
   * texto cabe entero dentro. Con una ventana justa, la fila de tinta de abajo
   * tocaba el borde en todas las posiciones y no había forma de distinguir un
   * rótulo completo de uno cortado por la mitad.
   */
  const WINDOW = 56
  for (let y = 0; y < H * 0.1; y += 3) tops.push(y)
  for (let y = Math.floor(H * 0.82); y < H - WINDOW - 2; y += 3) tops.push(y)

  for (const y of tops) {
    const y1 = y + WINDOW - 1
    for (const [x0, x1, side] of halves) {
      // Los dos umbrales, no uno: cuál acierta depende de cuánto ocupe el
      // rótulo dentro del recuadro, y eso cambia con cada cámara y cada hora.
      /*
       * VARIOS umbrales, no uno. Cuál acierta depende de qué fracción del
       * recuadro ocupa el rótulo, y eso cambia con la cámara, con el encuadre y
       * con la hora: el mismo texto es el 2 % de una franja de cielo abierto y
       * el 10 % de una franja recortada. Probar tres percentiles y Otsu cuesta
       * cuatro pasadas sobre una tira de píxeles —nada— y es la diferencia
       * entre leer nueve cámaras y leerlas todas.
       */
      for (const threshold of [otsu(png, x0, x1, y, y1), percentile(png, x0, x1, y, y1, 0.04)]) {
      const runs = columnRuns(png, x0, x1, y, y1, threshold).filter(
        ([a, b]) => b - a + 1 >= 4 && b - a + 1 <= 130,
      )
      if (runs.length < 8) continue
      /*
       * El tramo más largo a paso constante. Ocho caracteres seguidos ya no se
       * dan por casualidad en un paisaje.
       *
       * El paso se mide contra la MEDIANA de los saltos, no contra el salto
       * anterior. Los bloques empiezan donde empieza la tinta, no donde empieza
       * la celda, y un `1` —que lleva la tinta corrida a la derecha— desplaza su
       * bloque cuatro píxeles. Comparando cada salto con el anterior, ese `1`
       * partía la hilera en dos y el rótulo entero se perdía; contra la mediana,
       * es una desviación pequeña dentro de una rejilla que sigue siendo obvia.
       */
      const steps = runs.slice(1).map((r, i) => r[0] - runs[i][0])
      const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)]
      if (median < 8 || median > 90) continue
      const slack = Math.max(4, median * 0.3)
      let best = 1
      let run = 1
      for (const step of steps) {
        if (Math.abs(step - median) <= slack) {
          run++
          best = Math.max(best, run)
        } else run = 1
      }
      /*
       * Cinco, no ocho. Esta primera pasada solo LOCALIZA: puede permitirse ser
       * generosa porque detrás vienen la segunda pasada, que exige ocho bloques
       * limpios, y el análisis, que exige que lo leído sea una fecha de verdad.
       * Con ocho aquí, el rótulo de arriba de San Antonio del Monte no llegaba
       * nunca a la segunda pasada: dos cifras pegadas por el cielo quemado le
       * dejaban la hilera en seis y se descartaba antes de poder arreglarse.
       */
      if (best < 5) continue
      // La banda común la marcan los bloques ALTOS, que son los dígitos. Si se
      // midiera sobre todos, un guion suelto en el borde la ensancharía.
      const heights = runs
        .map(([a, b]) => inkRows(png, a, b, y, y1, threshold))
        .filter((r): r is [number, number] => r !== null)
      if (!heights.length) continue
      /*
       * MEDIANA, no mínimo y máximo. Los dígitos coinciden exactamente —los
       * veintidós bloques de un rótulo dan la misma pareja de filas— pero
       * siempre se cuela algún bloque de fondo que llega más abajo, y con
       * `Math.min`/`Math.max` uno solo de ésos estiraba la banda seis píxeles
       * y tiraba el rótulo entero por «recortado».
       */
      const maxHeight = Math.max(...heights.map(([t, b]) => b - t))
      const tall = heights.filter(([t, b]) => b - t >= 0.5 * maxHeight)
      const mid = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
      const bandTop = mid(tall.map(([t]) => t))
      const bandBottom = mid(tall.map(([, b]) => b))
      // Un rótulo recortado por el borde de la ventana no vale: sus glifos
      // saldrían a medias y se parecerían a cualquier cosa. Y una banda que
      // ocupe casi toda la ventana no es un rótulo, es un tejado iluminado.
      const bandHeight = bandBottom - bandTop + 1
      if (bandTop <= y || bandBottom >= y1) continue
      if (bandHeight < 10 || bandHeight > WINDOW - 8) continue

      /*
       * SEGUNDA PASADA, sobre la banda y no sobre la ventana.
       *
       * La ventana lleva dieciséis filas de más, y en el rótulo de arriba de
       * San Antonio del Monte esas filas son cielo quemado. Otsu, que solo ve
       * un histograma, subía el umbral para separar el cielo del resto y de
       * paso dejaba pasar el cielo que hay ENTRE dos cifras: el `2` y el `0` de
       * `2026` salían pegados en un bloque de 61 píxeles, la hilera se partía y
       * el rótulo entero se perdía. Recalculado solo sobre las filas del texto,
       * los dos cúmulos vuelven a ser el rótulo y su fondo inmediato.
       */
      // La segunda pasada también prueba los dos, y se queda con el que más
      // caracteres limpios devuelva. Subir el umbral a la fuerza —el máximo de
      // los dos— se comía la tinta de casi todas: el percentil bueno para una
      // franja de monte no vale para una franja que ya es casi toda texto.
      const fineCandidates = [
        otsu(png, x0, x1, bandTop, bandBottom),
        percentile(png, x0, x1, bandTop, bandBottom, 0.1),
      ]
      /*
       * Y aun así hay bloques pegados. Contra un cielo quemado, el `2` y el `0`
       * de `2026` se unen por el fondo que queda entre ellos y salen como un
       * único bloque de 61 píxeles donde debería haber dos de 28.
       *
       * Se parten por el PASO, que a estas alturas ya se conoce y es de fiar:
       * un bloque que mide dos pasos son dos caracteres, y cortarlo por la
       * mitad devuelve dos celdas donde cada carácter cabe entero. No hace
       * falta acertar el corte al píxel —la normalización recorta por la tinta
       * de cada trozo— solo hace falta que el corte caiga en el hueco.
       */
      let fine = fineCandidates[0]
      let fineRuns: [number, number][] = []
      for (const candidate of fineCandidates) {
      const attempt: [number, number][] = []
      for (const [a, b] of columnRuns(png, x0, x1, bandTop, bandBottom, candidate)) {
        const w = b - a + 1
        if (w < 4) continue
        const cells = Math.round(w / median)
        if (cells <= 1) {
          if (w <= median * 1.4) attempt.push([a, b])
          continue
        }
        if (cells > 4) continue // un bloque de cinco pasos ya no es texto
        for (let k = 0; k < cells; k++) {
          const from = a + Math.round((k * w) / cells)
          const to = a + Math.round(((k + 1) * w) / cells) - 1
          if (to > from) attempt.push([from, to])
        }
      }
      if (attempt.length > fineRuns.length) {
        fineRuns = attempt
        fine = candidate
      }
      }
      if (fineRuns.length < 8) continue

      const glyphs: Glyph[] = fineRuns.map(([a, b]) => ({
        x0: a,
        x1: b,
        bits: normalize(png, a, b, bandTop, bandBottom, fine),
      }))
      out.push({ y0: bandTop, y1: bandBottom, side, threshold: fine, glyphs })
      }
    }
  }
  /*
   * Se ordenan por número de caracteres y se recortan, pero NO se deja una
   * sola por banda.
   *
   * Ese fue el intento anterior y quitaba lecturas buenas. La misma banda
   * produce una variante por cada umbral probado, y la que más bloques de tinta
   * saca no es necesariamente la que se deja leer: un umbral bajo parte los
   * glifos en trocitos y devuelve cuarenta bloques ilegibles, mientras el
   * umbral bueno devuelve veinte que se leen enteros. Quien decide es
   * `readStamp`, que se las prueba en orden y se queda con la primera que
   * resulte ser una fecha de verdad.
   *
   * El recorte a cuarenta es solo un tope: pasada la primera decena ya se han
   * probado todas las bandas reales y lo que queda son repeticiones.
   */
  return out
}

/** Distancia de Hamming entre dos mapas de bits normalizados. */
export function distance(a: Uint8Array, b: Uint8Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

/** Un carácter reconocido, con lo lejos que quedó de su plantilla. */
interface Match {
  char: string
  /** 0 = calcado; 1 = no se parece en nada. */
  error: number
}

const FONT_BITS: [string, Uint8Array][] = Object.entries(STAMP_FONT).map(([ch, hex]) => {
  const bits = new Uint8Array(GW * GH)
  for (let i = 0; i < hex.length; i++) {
    const nib = parseInt(hex[i], 16)
    bits[i * 4] = (nib >> 3) & 1
    bits[i * 4 + 1] = (nib >> 2) & 1
    bits[i * 4 + 2] = (nib >> 1) & 1
    bits[i * 4 + 3] = nib & 1
  }
  return [ch, bits]
})

/** El carácter cuya plantilla queda más cerca. `?` si ninguna se acerca. */
function recognise(bits: Uint8Array): Match {
  let bestChar = '?'
  let bestError = 1
  for (const [ch, tpl] of FONT_BITS) {
    const error = distance(bits, tpl) / (GW * GH)
    if (error < bestError) {
      bestError = error
      bestChar = ch
    }
  }
  // Por encima de un 12 % de píxeles distintos ya no es ese carácter: es una
  // letra del nombre del sitio, o una rama. Se marca y el análisis lo descarta.
  return bestError <= 0.12 ? { char: bestChar, error: bestError } : { char: '?', error: bestError }
}

export interface StampCandidate {
  at: Date
  zone: StampZone
  order: 'DD-MM' | 'MM-DD'
}

export interface StampReading {
  /** Lo leído, carácter a carácter. Los no reconocidos van como `?`. */
  text: string
  /**
   * Todas las lecturas posibles del mismo rótulo. Son varias porque hay dos
   * ambigüedades que NO se pueden resolver mirando una sola imagen: si `08-14`
   * es día-mes o mes-día, y si `16:09` es hora insular o UTC.
   */
  candidates: StampCandidate[]
  /** La edad más favorable, en ms: la que deja la imagen más reciente. */
  minAgeMs: number
  /** La menos favorable. La distancia entre las dos es la ambigüedad. */
  maxAgeMs: number
  /** Peor error de los caracteres de la fecha. Cuanto menor, mejor. */
  error: number
}

/** Zona horaria del reloj de una cámara. Ver `candidates`. */
export type StampZone = 'insular' | 'utc'

/** Canarias va en UTC+1 en verano y UTC+0 en invierno. */
function islandOffsetHours(year: number, month: number, day: number): number {
  const lastSunday = (m: number) => {
    const d = new Date(Date.UTC(year, m, 1))
    d.setUTCMonth(m + 1, 0)
    return d.getUTCDate() - d.getUTCDay()
  }
  const t = Date.UTC(year, month - 1, day)
  return t >= Date.UTC(year, 2, lastSunday(2)) && t < Date.UTC(year, 9, lastSunday(9)) ? 1 : 0
}

/**
 * Todas las interpretaciones posibles de lo leído, descartando las imposibles.
 *
 * Se prueban los dos órdenes de fecha y las dos zonas horarias, y se tira lo
 * que no puede ser: `14` no es un mes, y una foto no se toma en el futuro.
 * Lo que sobreviva se devuelve ENTERO, sin elegir.
 *
 * Elegir sería lo cómodo y sería mentir. Con una cámara que publica cada dos
 * horas, «hace 40 minutos» en UTC y «hace 100» en hora insular son las dos
 * plausibles y no hay en la imagen nada que las separe. Lo que sí se puede
 * afirmar sin inventar nada es el mínimo: hace AL MENOS cuarenta minutos. Para
 * decidir si una cámara está muerta, ese mínimo basta y no mata a ninguna viva.
 */
function interpret(digits: number[], now: number): StampCandidate[] {
  const [a, b, year, hh, mm, ss] = digits
  const out: StampCandidate[] = []
  for (const [month, day, order] of [
    [b, a, 'DD-MM'],
    [a, b, 'MM-DD'],
  ] as [number, number, StampCandidate['order']][]) {
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    if (year < 2020 || year > 2100 || hh > 23 || mm > 59 || ss > 59) continue
    for (const zone of ['insular', 'utc'] as StampZone[]) {
      const offset = zone === 'insular' ? islandOffsetHours(year, month, day) : 0
      const at = new Date(Date.UTC(year, month - 1, day, hh - offset, mm, ss))
      /*
       * MEDIA HORA de margen hacia el futuro. Estos relojes no están
       * sincronizados con nada: el del Mirador de El Time se leyó seis minutos
       * atrasado a las 13:37 UTC y nueve adelantado a las 16:36 del mismo día.
       * Con un margen corto, una cámara adelantada se declara ilegible en vez
       * de dar la información que sí tiene.
       */
      if (at.getTime() > now + 30 * 60_000) continue
      // Nada de hace más de una semana: sería un error de lectura, no una foto.
      if (now - at.getTime() > 7 * 24 * 3_600_000) continue
      if (!out.some((c) => c.at.getTime() === at.getTime())) out.push({ at, zone, order })
    }
  }
  return out
}

/**
 * Lee el reloj impreso en una captura.
 *
 * Recorre las franjas candidatas y devuelve la PRIMERA QUE PARSEA como fecha y
 * hora. Ese criterio hace de filtro solo: el nombre del sitio, que va en la
 * misma fila y suele ser más largo, se descarta porque `PANORAMICA TIRIMAGA` no
 * es una fecha. No hay que decirle a cada cámara dónde tiene el rótulo.
 */
export function readStamp(png: PNG, now = Date.now()): StampReading | null {
  /*
   * EL ORDEN EN QUE SE PRUEBAN IMPORTA, y ordenarlas por número de bloques de
   * tinta —que fue el primer intento— es justo el orden equivocado: un umbral
   * demasiado bajo parte cada cifra en tres trocitos y produce la franja con
   * más bloques de todas, ilegible entera. Se ordenan por cuántos caracteres se
   * RECONOCEN, que es lo que de verdad predice cuál va a parsear.
   */
  const read = findStrips(png).map((strip) => {
    const matches = strip.glyphs.map((g) => recognise(g.bits))
    return { matches, text: matches.map((m) => m.char).join('') }
  })
  read.sort(
    (a, b) =>
      b.matches.filter((m) => m.char !== '?').length -
      a.matches.filter((m) => m.char !== '?').length,
  )

  for (const { matches, text } of read) {
    const date = /(\d)(\d)-(\d)(\d)-(\d{4})/.exec(text)
    if (!date) continue
    /*
     * Los SEGUNDOS pueden faltar. Un carácter que caiga sobre una rama sale
     * como `?`, y exigir los seis dígitos tiraba la lectura entera de
     * Puntallana por culpa del último — que no le importa a nadie: lo que se
     * calcula con esto es una edad en minutos.
     */
    const time = /(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text.slice(date.index + date[0].length))
    if (!time) continue
    const candidates = interpret(
      [+(date[1] + date[2]), +(date[3] + date[4]), +date[5], +time[1], +time[2], +(time[3] ?? 0)],
      now,
    )
    if (!candidates.length) continue
    const ages = candidates.map((c) => now - c.at.getTime())
    const span = matches.slice(date.index, date.index + date[0].length)
    return {
      text,
      candidates,
      minAgeMs: Math.min(...ages),
      maxAgeMs: Math.max(...ages),
      error: Math.max(...span.map((m) => m.error)),
    }
  }
  return null
}
