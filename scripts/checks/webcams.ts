/**
 * Comprueba que ninguna webcam del catálogo esté muerta.
 *
 * POR QUÉ HACE FALTA. `lib/webcams/catalog.ts` es una lista estática, y una
 * lista estática es exactamente el sitio donde una cámara que se apaga se
 * queda para siempre. El test de `catalog.test.ts` no puede cazarlo —no toca la
 * red a propósito, porque un test que dependa de que el Cabildo tenga el
 * servidor en pie fallaría diciendo algo del servidor y no del código—. Esto sí
 * toca la red, y por eso se ejecuta a mano:
 *
 *   npx tsx scripts/checks/webcams.ts
 *   npx tsx scripts/checks/webcams.ts 3 600   # 3 lecturas cada 600 s
 *
 * TRES FORMAS DE FECHAR UNA IMAGEN, de la más barata a la más cara. Cada cámara
 * usa la primera que le sirva, y por eso la mayoría se resuelven al instante:
 *
 *  1. **`Last-Modified`**, cuando el origen lo manda. Doce de las veintiséis
 *     vistas —observatorio y ayuntamiento— lo hacen, y ahí no hay nada que
 *     discutir: una petición y la hora exacta.
 *  2. **El reloj impreso dentro del JPEG**, para las del Cabildo, que no mandan
 *     ninguna cabecera de fecha. Lo lee `stamp.ts` comparando la fuente de mapa
 *     de bits contra plantillas. Nueve de las doce se dejan leer; en las otras
 *     tres el rótulo cae sobre hierba al sol o sobre laurisilva y el contraste
 *     no da. También una petición.
 *  3. **Ver si la imagen cambia**, para lo que quede. Es lo caro: hay que pedir
 *     la misma foto varias veces separadas en el tiempo, y como tres cámaras
 *     del Cabildo publican CADA DOS HORAS, la ventana tiene que pasar de eso o
 *     se declaran muertas cámaras vivas. De ahí las tres horas por defecto —
 *     que ahora solo las esperan las pocas que no se han podido fechar antes.
 *
 * Un `200 image/jpeg` no vale como prueba de vida por sí solo: el servidor
 * sirve con la misma puntualidad la foto de ahora y la de hace cinco horas. Eso
 * es literalmente lo que hacía el segundo ángulo de Las Tricias el día que se
 * escribió esto.
 *
 * NECESITA `sips` (macOS) para pasar los JPEG a PNG, porque el proyecto no
 * tiene decodificador de JPEG y no merece añadir uno para un script manual.
 * Donde no exista, el paso 2 se salta solo y esas cámaras caen al paso 3.
 *
 * SALE CON CÓDIGO 1 si alguna aparece muerta, para poder encadenarlo.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { WEBCAM_SITES, type WebcamSite, type WebcamView } from '../../src/lib/webcams/catalog'
import { readStamp } from './stamp'

const ROUNDS = Number(process.argv[2] ?? 5)
/** 45 min × 4 esperas = 3 h de ventana. Ver «tres formas de fechar», arriba. */
const GAP_S = Number(process.argv[3] ?? 2700)

/**
 * A partir de aquí una imagen ya no describe el tiempo que hace.
 *
 * Cuatro horas es el doble de la cadencia de la cámara más lenta que hay en el
 * catálogo (dos horas, medidas: Las Tricias, San Antonio del Monte y Tirimaga).
 * Ese factor 2 es el margen: por debajo se declararía muerta una cámara que solo
 * se ha saltado un turno, y por encima se dejaría pasar media mañana de retraso.
 */
const DEAD_AFTER_MS = 4 * 3_600_000

const scratch = mkdtempSync(join(tmpdir(), 'webcams-'))
let sipsWorks = true

interface Reading {
  status: number | string
  bytes: number
  digest: string | null
  lastModified: number | null
  /** Edad mínima según el reloj impreso, si se pudo leer. Ver `stamp.ts`. */
  stampMinAgeMs: number | null
  stampText: string | null
}

/** Convierte a PNG con `sips` y lee el reloj impreso. `null` si no se puede. */
function readClock(jpeg: Buffer, now: number): { minAgeMs: number; text: string } | null {
  if (!sipsWorks) return null
  try {
    const src = join(scratch, 'shot.jpg')
    const dst = join(scratch, 'shot.png')
    writeFileSync(src, jpeg)
    execFileSync('sips', ['-s', 'format', 'png', src, '--out', dst], { stdio: 'ignore' })
    const r = readStamp(PNG.sync.read(readFileSync(dst)), now)
    return r ? { minAgeMs: r.minAgeMs, text: r.text } : null
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') {
      console.log('  (sin `sips`: no se leerán los relojes impresos)')
      sipsWorks = false
    }
    return null
  }
}

async function read(url: string): Promise<Reading> {
  const now = Date.now()
  const empty = { bytes: 0, digest: null, lastModified: null, stampMinAgeMs: null, stampText: null }
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'tiempo-palmero/checks (webcams)' },
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) return { status: res.status, ...empty }
    const buf = Buffer.from(await res.arrayBuffer())
    const header = res.headers.get('last-modified')
    const parsed = header ? Date.parse(header) : NaN
    const clock = readClock(buf, now)
    return {
      status: res.status,
      bytes: buf.byteLength,
      digest: createHash('md5').update(buf).digest('hex'),
      lastModified: Number.isNaN(parsed) ? null : parsed,
      stampMinAgeMs: clock?.minAgeMs ?? null,
      stampText: clock?.text ?? null,
    }
  } catch (e) {
    // `UNABLE_TO_VERIFY_LEAF_SIGNATURE` es el caso del GTC, que sirve la cadena
    // TLS incompleta: Node la rechaza y un navegador que persiga la intermedia
    // por AIA no. Se distingue del resto para no confundirla con una caída.
    const code = (e as { cause?: { code?: string } }).cause?.code
    return { status: code ?? 'ERR', ...empty }
  }
}

type State = 'viva' | 'muerta' | 'congelada' | 'tls' | 'caída'

interface Verdict {
  site: WebcamSite
  view: WebcamView
  state: State
  /** En qué se basa el veredicto, para que se pueda discutir. */
  why: string
}

const targets = WEBCAM_SITES.flatMap((site) => site.views.map((view) => ({ site, view })))
const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`

console.log(`${targets.length} ángulos de ${WEBCAM_SITES.length} emplazamientos\n`)

/* --- primera pasada: la que resuelve a casi todas -------------------------- */

const pending: typeof targets = []
const verdicts: Verdict[] = []
const digests = new Map<string, Set<string>>()

const first = await Promise.all(targets.map((t) => read(t.view.url)))
first.forEach((r, i) => {
  const { site, view } = targets[i]
  const age = r.lastModified === null ? null : Date.now() - r.lastModified
  digests.set(view.id, new Set(r.digest ? [r.digest] : []))

  if (r.digest === null) {
    verdicts.push({
      site,
      view,
      state: String(r.status).includes('VERIFY_LEAF') ? 'tls' : 'caída',
      why: `sin imagen (${r.status})`,
    })
  } else if (age !== null) {
    verdicts.push({
      site,
      view,
      state: age > DEAD_AFTER_MS ? 'muerta' : 'viva',
      why: `last-modified hace ${minutes(age)}`,
    })
  } else if (r.stampMinAgeMs !== null) {
    // La edad MÍNIMA, no la probable: el reloj impreso no dice si va en hora
    // insular o UTC, así que hay una hora de ambigüedad. Usando el mínimo,
    // ninguna cámara viva puede acabar declarada muerta por ese margen.
    verdicts.push({
      site,
      view,
      state: r.stampMinAgeMs > DEAD_AFTER_MS ? 'muerta' : 'viva',
      why:
        r.stampMinAgeMs < 0
          ? `reloj impreso, al día (va ${minutes(-r.stampMinAgeMs)} adelantado)`
          : `reloj impreso, hace ${minutes(r.stampMinAgeMs)} como poco`,
    })
  } else {
    pending.push(targets[i])
  }
})

for (const v of verdicts) {
  console.log(
    `  ${v.state.padEnd(10)} ${v.view.id.padEnd(14)} ${v.site.name}${v.view.label ? ` — ${v.view.label}` : ''}  ·  ${v.why}`,
  )
}

/* --- segunda pasada: solo las que no se han podido fechar ------------------ */

if (pending.length) {
  const windowMin = Math.round(((ROUNDS - 1) * GAP_S) / 60)
  console.log(
    `\n${pending.length} sin fechar: hay que verlas cambiar. ${ROUNDS} lecturas en ${windowMin} min.`,
  )
  for (let round = 2; round <= ROUNDS; round++) {
    await new Promise((r) => setTimeout(r, GAP_S * 1000))
    const results = await Promise.all(pending.map((t) => read(t.view.url)))
    results.forEach((r, i) => {
      if (r.digest) digests.get(pending[i].view.id)!.add(r.digest)
    })
    console.log(`  lectura ${round}/${ROUNDS} a las ${new Date().toISOString().slice(11, 19)} UTC`)
  }
  for (const { site, view } of pending) {
    const n = digests.get(view.id)!.size
    verdicts.push({
      site,
      view,
      state: n > 1 ? 'viva' : 'congelada',
      why: `${n} imagen${n === 1 ? '' : 'es'} distinta${n === 1 ? '' : 's'} en ${windowMin} min`,
    })
  }
}

rmSync(scratch, { recursive: true, force: true })

/* --- resumen --------------------------------------------------------------- */

const bad = verdicts.filter((v) => v.state !== 'viva')
console.log(`\n${verdicts.length - bad.length}/${verdicts.length} vivas.`)
if (!bad.length) {
  console.log('El catálogo se sostiene.')
  process.exit(0)
}
console.log(`\n${bad.length} para revisar:`)
for (const v of bad) console.log(`  · ${v.site.name} / ${v.view.id} — ${v.state}: ${v.why}`)
// Una congelada no es necesariamente para tirar —puede publicar cada dos
// horas—, pero sí para mirarla antes de seguir fiándose de ella.
process.exit(1)
