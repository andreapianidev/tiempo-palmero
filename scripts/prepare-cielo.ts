/**
 * El catálogo de estrellas de la escena nocturna, congelado en build.
 *
 *   npm run prepare-cielo
 *
 * DE DÓNDE SALE. La base HYG v4.4 de Astronomy Nexus, que funde en un solo
 * fichero «every identifiable star in the HIPPARCOS, Yale Bright Star, and
 * Gliese catalogs». Licencia **CC BY-SA 4.0**, declarada en el propio
 * repositorio: la atribución viaja en el manifiesto y se enseña en la pantalla
 * de fuentes, y el fichero derivado que este script escribe hereda esa licencia.
 *
 * POR QUÉ HYG Y NO EL YALE BRIGHT STAR DIRECTAMENTE. El BSC5 se sirve desde
 * VizieR (V/50) sin licencia explícita: el CDS dice que sus datos «are free of
 * usage in a scientific context» y que «the commercial usage is subject to
 * rules depending of the origin». Eso no es un permiso, es una indeterminación,
 * y una aplicación pública no se apoya en una indeterminación. HYG resuelve las
 * dos cosas a la vez: licencia explícita y **las 9040 estrellas con número HR
 * dentro** —el BSC entero, sus 9110 entradas menos las que no son estrellas—
 * con la astrometría de Hipparcos en vez de la del catálogo de 1908.
 *
 * DÓNDE SE CORTA EL CATÁLOGO: magnitud 6,5. No es la cifra de manual, está
 * medida contra esta isla y por dos caminos que dan lo mismo:
 *
 *   - **Por el cielo real.** La lectura más oscura de la red de fotómetros del
 *     Cabildo en el archivo del 17-18 ago 2026 son 22,43 mag/arcsec² (Mirador
 *     de La Cumbrecita) y 22,07 (SkyPalma); la mejor sostenida, 21,5-21,6. Por
 *     Schaefer 1990 eso da una magnitud límite a simple vista de 6,4-6,8. Un
 *     corte en 6,5 cubre la noche típica del sitio con margen y se queda corto
 *     solo en el percentil altísimo, donde ya no hay ojo humano que llegue.
 *   - **Por las figuras.** La estrella más débil que usa una línea de
 *     constelación es de magnitud 6,47. Cortar en 6,0 habría dejado figuras
 *     rotas.
 *
 * Medido: 8920 estrellas hasta 6,5, que son 107 KB de binario y 96 KB por el
 * cable. Subir a 7,5 son 25 790 y 310 KB para dibujar estrellas que nadie ve.
 *
 * ORDENADAS POR MAGNITUD, de la más brillante a la más débil, y es la decisión
 * de formato que importa: la magnitud límite de esta noche —que sale del
 * fotómetro— se convierte en «dibuja las primeras k» con una búsqueda binaria.
 * Sin ese orden habría que recorrer las 8920 cada fotograma para descartar las
 * que no se ven.
 *
 * EL MOVIMIENTO PROPIO SE APLICA AQUÍ, no en el navegador. Las posiciones se
 * llevan de la época del catálogo a la del build y se guarda esa época en la
 * cabecera. La estrella más rápida de esta muestra —Groombridge 1830, magnitud
 * 6,4— se mueve 7,06 arcsec al año: en los dos años que un despliegue puede
 * llegar a vivir son 14 arcsec, cuando el punto más pequeño que dibuja la capa
 * ya mide varios minutos de arco en pantalla. Guardar el movimiento propio por
 * estrella habría costado un 33 % del fichero para corregir algo invisible. Lo
 * que sí hay es una prueba que falla cuando la época del fichero se queda vieja,
 * para que la decisión no se pudra en silencio.
 *
 * LAS FIGURAS DE LAS CONSTELACIONES vienen de d3-celestial (Olaf Frohn),
 * repositorio BSD-3-Clause, y NO se guardan como coordenadas sino como
 * **parejas de índices al catálogo**. Comprobado al convertirlas: los 893
 * vértices caen sobre una estrella del catálogo con una mediana de 0,16 arcsec
 * y un peor caso de 30,6 —y los peores son justo α Cen, β Hyi y ξ UMa, que son
 * dobles o de movimiento propio grande, o sea que el residuo es real y no un
 * error de conversión—. Guardarlas por índice tiene dos ventajas sobre guardar
 * los grados: las líneas precesan y se mueven con sus estrellas sin código
 * extra, y una figura no puede quedar colgando de un punto vacío.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import path from 'node:path'
import { PUBLIC, UA, log, warn } from './shared.js'

/** Descarga directa del LFS de Codeberg. La rama `main` es la única publicada. */
const HYG_URL =
  'https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz'
const HYG_VERSION = 'HYG v4.4'

const FIGURES_URL =
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json'

/** Ver la cabecera: medido contra los fotómetros y contra las figuras. */
const MAG_LIMIT = 6.5

/**
 * Separación máxima que se acepta al enganchar un vértice de figura a una
 * estrella, en segundos de arco.
 *
 * Medido sobre los 893 vértices: mediana 0,16", p99 3,8", peor caso 30,6"
 * (α Cen, que es una binaria y el fichero de origen apunta a la componente que
 * no es). Ninguno pasa de 31, así que 60 deja el doble de margen sobre el peor
 * caso real y sigue cazando un vértice que apunte a cielo vacío, que estaría a
 * grados y no a segundos. Los dos lados de la prueba: no descarta ninguno de
 * los buenos que hay, y no dejaría pasar uno malo.
 */
const SNAP_LIMIT_ARCSEC = 60

const OUT_DIR = path.join(PUBLIC, 'cielo')

const RAD = Math.PI / 180
const ARCSEC = RAD / 3600

interface HygStar {
  raRad: number
  decRad: number
  mag: number
  /** Índice de color B−V. `null` cuando el catálogo no lo trae. */
  bv: number | null
  /** Movimiento propio en ascensión recta, ya con cos δ dentro. rad/año. */
  pmRa: number
  /** Movimiento propio en declinación, rad/año. */
  pmDec: number
  proper: string
  bayer: string
  flam: string
  con: string
}

async function fetchText(url: string, gunzip: boolean): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!gunzip) return await res.text()
      const buf = Buffer.from(await res.arrayBuffer())
      return await new Promise<string>((resolve, reject) => {
        const gz = createGunzip()
        const chunks: Buffer[] = []
        gz.on('data', (c: Buffer) => chunks.push(c))
        gz.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        gz.on('error', reject)
        gz.end(buf)
      })
    } catch (e) {
      warn(`intento ${attempt + 1} de ${url}: ${e instanceof Error ? e.message : e}`)
      if (attempt === 2) throw e
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  throw new Error('inalcanzable')
}

/**
 * Lector de CSV con comillas. El de HYG las usa en los campos de texto y
 * algunos nombres propios llevan coma dentro («Alula Australis», no, pero
 * «41 G. Ari» y los designadores de Gliese sí traen espacios y puntos).
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (c !== '\r') field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const header = rows.shift()
  if (!header) throw new Error('CSV vacío')
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

/**
 * Aplica el movimiento propio como un vector en tres dimensiones.
 *
 * La forma directa —sumar μα/cos δ a la ascensión recta— se rompe cerca de los
 * polos: en Polaris, cos δ vale 0,0129 y divide por él una cantidad que ya es
 * pequeña, con el error que eso arrastra. En vectores no hay polo: se suma el
 * desplazamiento tangente y se renormaliza.
 */
function advance(s: HygStar, years: number): { raRad: number; decRad: number } {
  const cosD = Math.cos(s.decRad)
  const sinD = Math.sin(s.decRad)
  const cosA = Math.cos(s.raRad)
  const sinA = Math.sin(s.raRad)
  // Base local sobre la esfera: ê_α apunta al este, ê_δ al norte celeste.
  const p = [cosD * cosA, cosD * sinA, sinD]
  const eA = [-sinA, cosA, 0]
  const eD = [-sinD * cosA, -sinD * sinA, cosD]
  const q = p.map((v, i) => v + years * (s.pmRa * eA[i] + s.pmDec * eD[i]))
  const n = Math.hypot(q[0], q[1], q[2])
  return {
    // A [0, 2π), que es el rango en el que viene `rarad` y el que espera el
    // resto. `atan2` devuelve [−π, π] y dejarlo así ponía las estrellas de
    // ascensión recta pequeña a 360° de sí mismas en cuanto se restaban dos
    // posiciones: el primer intento midió un movimiento propio de 1 296 001".
    raRad: (Math.atan2(q[1] / n, q[0] / n) + 2 * Math.PI) % (2 * Math.PI),
    decRad: Math.asin(Math.max(-1, Math.min(1, q[2] / n))),
  }
}

/** Separación angular entre dos direcciones de la esfera, en radianes. */
function separation(
  ra1: number,
  dec1: number,
  ra2: number,
  dec2: number,
): number {
  const dot =
    Math.sin(dec1) * Math.sin(dec2) +
    Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2)
  return Math.acos(Math.min(1, Math.max(-1, dot)))
}

/** Días julianos de un instante epoch-ms. */
function julianDay(ms: number): number {
  return ms / 86_400_000 + 2_440_587.5
}

/** Año juliano (época tipo J2026,4) de un día juliano. */
function besselianYear(jd: number): number {
  return 2000 + (jd - 2_451_545) / 365.25
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  log(`descargando ${HYG_VERSION}…`)
  const csv = await fetchText(HYG_URL, true)
  const raw = parseCsv(csv)
  log(`  ${raw.length} filas`)

  const stars: HygStar[] = []
  for (const r of raw) {
    // `id` 0 es el Sol. Está en el catálogo por coherencia y no es una estrella
    // del cielo nocturno: dibujarlo en el cenit del sistema de coordenadas
    // sería una estrella de magnitud −26 en la constelación de nada.
    if (r.id === '0') continue
    const mag = Number(r.mag)
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue
    const raRad = Number(r.rarad)
    const decRad = Number(r.decrad)
    if (!Number.isFinite(raRad) || !Number.isFinite(decRad)) continue
    const ci = Number(r.ci)
    stars.push({
      raRad,
      decRad,
      mag,
      bv: Number.isFinite(ci) && r.ci !== '' ? ci : null,
      pmRa: Number(r.pmrarad) || 0,
      pmDec: Number(r.pmdecrad) || 0,
      proper: r.proper ?? '',
      bayer: r.bayer ?? '',
      flam: r.flam ?? '',
      con: r.con ?? '',
    })
  }
  log(`  ${stars.length} estrellas hasta magnitud ${MAG_LIMIT}`)

  // La época del catálogo es J2000: HYG publica posiciones ICRS en esa época y
  // el movimiento propio para moverlas. Se llevan a hoy.
  const now = Date.now()
  const epochJd = julianDay(now)
  const years = besselianYear(epochJd) - 2000
  log(`  movimiento propio: J2000 → J${besselianYear(epochJd).toFixed(2)} (${years.toFixed(2)} años)`)

  let maxShift = 0
  let fastest = ''
  const moved = stars.map((s) => {
    const p = advance(s, years)
    const shift = separation(s.raRad, s.decRad, p.raRad, p.decRad) / ARCSEC
    if (shift > maxShift) {
      maxShift = shift
      fastest = s.proper || `${s.bayer || s.flam} ${s.con}`.trim() || `mag ${s.mag}`
    }
    // Se conserva la posición J2000 al lado de la de hoy: las figuras de las
    // constelaciones vienen en J2000 y hay que engancharlas contra ESA época,
    // no contra la desplazada. Con 26,6 años de movimiento propio por medio, el
    // primer intento se pasó del límite de enganche por 0,4" en Bootes —el
    // error era mío, no del fichero de figuras.
    return { ...s, raRad: p.raRad, decRad: p.decRad, ra2000: s.raRad, dec2000: s.decRad }
  })
  log(`  desplazamiento máximo: ${maxShift.toFixed(1)}" (${fastest})`)

  // De más brillante a más débil. Ver la cabecera: convierte «hasta qué
  // magnitud se ve esta noche» en un prefijo del fichero.
  moved.sort((a, b) => a.mag - b.mag)

  // ---------------------------------------------------------------- binario
  const HEADER = 24
  const RECORD = 12
  const buf = Buffer.alloc(HEADER + moved.length * RECORD)
  buf.write('TPCIELO1', 0, 'ascii')
  buf.writeUInt32LE(moved.length, 8)
  buf.writeFloatLE(MAG_LIMIT, 12)
  buf.writeDoubleLE(epochJd, 16)
  moved.forEach((s, i) => {
    const o = HEADER + i * RECORD
    buf.writeFloatLE(s.raRad, o)
    buf.writeFloatLE(s.decRad, o + 4)
    buf.writeInt16LE(Math.round(s.mag * 100), o + 8)
    // −32768 es «sin índice de color», no un color. Los 40 casos de la muestra
    // son estrellas sin fotometría B, y la capa les pone el blanco neutro.
    buf.writeInt16LE(s.bv === null ? -32768 : Math.round(s.bv * 1000), o + 10)
  })
  await writeFile(path.join(OUT_DIR, 'estrellas.bin'), buf)
  log(`  estrellas.bin: ${(buf.length / 1024).toFixed(1)} KB`)

  // ---------------------------------------------------------------- figuras
  log('descargando las figuras de las constelaciones…')
  const figures = JSON.parse(await fetchText(FIGURES_URL, false)) as {
    features: { id: string; geometry: { coordinates: [number, number][][] } }[]
  }

  // Índice espacial mínimo: las estrellas ya están en memoria y son 8920, así
  // que una búsqueda lineal por vértice son 8 millones de productos escalares
  // en total. Se hace una vez en build y tarda menos que la descarga.
  const vec = moved.map((s) => {
    const cd = Math.cos(s.dec2000)
    return [cd * Math.cos(s.ra2000), cd * Math.sin(s.ra2000), Math.sin(s.dec2000)]
  })

  const segments: [number, number][] = []
  let worstSnap = 0
  let worstWhere = ''
  let vertices = 0
  for (const f of figures.features) {
    for (const line of f.geometry.coordinates) {
      const idx: number[] = []
      for (const [lonDeg, latDeg] of line) {
        vertices++
        const a = lonDeg * RAD
        const d = latDeg * RAD
        const cd = Math.cos(d)
        const x = cd * Math.cos(a)
        const y = cd * Math.sin(a)
        const z = Math.sin(d)
        let best = -2
        let bestI = -1
        for (let i = 0; i < vec.length; i++) {
          const dot = vec[i][0] * x + vec[i][1] * y + vec[i][2] * z
          if (dot > best) {
            best = dot
            bestI = i
          }
        }
        const sep = Math.acos(Math.min(1, Math.max(-1, best))) / ARCSEC
        if (sep > worstSnap) {
          worstSnap = sep
          worstWhere = `${f.id} (${lonDeg.toFixed(3)}, ${latDeg.toFixed(3)})`
        }
        if (sep > SNAP_LIMIT_ARCSEC) {
          throw new Error(
            `vértice de ${f.id} a ${sep.toFixed(1)}" de la estrella más cercana, ` +
              `por encima del límite de ${SNAP_LIMIT_ARCSEC}". O el catálogo ha ` +
              `cambiado de corte o el fichero de figuras ya no es el mismo.`,
          )
        }
        idx.push(bestI)
      }
      for (let i = 0; i + 1 < idx.length; i++) {
        if (idx[i] !== idx[i + 1]) segments.push([idx[i], idx[i + 1]])
      }
    }
  }
  log(`  ${vertices} vértices → ${segments.length} segmentos, peor enganche ${worstSnap.toFixed(1)}" en ${worstWhere}`)

  const FIG_HEADER = 12
  const fig = Buffer.alloc(FIG_HEADER + segments.length * 4)
  fig.write('TPFIGUR1', 0, 'ascii')
  fig.writeUInt32LE(segments.length, 8)
  segments.forEach(([a, b], i) => {
    fig.writeUInt16LE(a, FIG_HEADER + i * 4)
    fig.writeUInt16LE(b, FIG_HEADER + i * 4 + 2)
  })
  await writeFile(path.join(OUT_DIR, 'figuras.bin'), fig)
  log(`  figuras.bin: ${(fig.length / 1024).toFixed(1)} KB`)

  // ---------------------------------------------------------------- nombres
  //
  // Los nombres propios se dejan como los publica la UAI, en su forma
  // internacional. Traducirlos a mano habría metido 440 decisiones ortográficas
  // sin fuente —«Proción» o «Procyon», «Espiga» o «Spica»— en un fichero que
  // hoy no tiene ninguna. La designación de Bayer sí se compone aquí, porque es
  // notación y no idioma.
  const named = moved
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.proper || (s.bayer && s.mag <= 3.5))
    .map(({ s, i }) => ({
      i,
      n: s.proper || undefined,
      b: s.bayer ? `${s.bayer} ${s.con}` : undefined,
      m: Math.round(s.mag * 100) / 100,
    }))
  await writeFile(
    path.join(OUT_DIR, 'nombres.json'),
    JSON.stringify(named),
  )
  log(`  nombres.json: ${named.length} estrellas con nombre`)

  // --------------------------------------------------------------- manifest
  const manifest = {
    catalog: HYG_VERSION,
    catalogUrl: 'https://codeberg.org/astronexus/hyg',
    count: moved.length,
    magLimit: MAG_LIMIT,
    epochJd,
    epoch: `J${besselianYear(epochJd).toFixed(2)}`,
    figures: {
      segments: segments.length,
      vertices,
      worstSnapArcsec: Math.round(worstSnap * 10) / 10,
      source: 'https://github.com/ofrohn/d3-celestial',
      license: 'BSD-3-Clause',
    },
    measured: {
      properMotionMaxArcsec: Math.round(maxShift * 10) / 10,
      properMotionFastest: fastest,
      faintestFigureStar: Math.max(
        ...segments.flat().map((i) => moved[i].mag),
      ),
      withoutColorIndex: moved.filter((s) => s.bv === null).length,
    },
    attribution:
      'Estrellas: HYG v4.4, Astronomy Nexus (Hipparcos · Yale Bright Star · Gliese), CC BY-SA 4.0. ' +
      'Figuras de las constelaciones: d3-celestial, Olaf Frohn, BSD-3-Clause.',
    license: 'CC BY-SA 4.0',
    generated: new Date(now).toISOString(),
  }
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  )
  log(`  manifest.json escrito`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
