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
 *   npx tsx scripts/checks/webcams.ts            # 5 lecturas en 3 h
 *   npx tsx scripts/checks/webcams.ts 3 600      # 3 lecturas cada 600 s
 *
 * QUÉ MIDE, Y POR QUÉ NO BASTA CON PEDIRLA UNA VEZ. Un `200 image/jpeg` no
 * distingue una cámara viva de una congelada: el servidor sirve tan
 * educadamente la foto de ahora como la de hace cinco horas. Lo que separa las
 * dos es que la imagen CAMBIE, así que esto pide cada URL varias veces
 * separadas en el tiempo y cuenta cuántas imágenes distintas salieron.
 *
 * LA VENTANA IMPORTA, Y MÁS DE LO QUE PARECE. La primera versión de esto usaba
 * quince minutos: seis de las doce cámaras del Cabildo parecían paradas y sólo
 * lo estaban dos. Se subió a cincuenta y cuatro minutos, y aun así marcaba como
 * parada la panorámica de Las Tricias — que resultó publicar **cada dos horas
 * exactas**: el 14 ago 2026 su reloj impreso pasó de `11:56:31` a `13:56:32`.
 *
 * Por eso el defecto son cinco lecturas repartidas en tres horas. Podar con una
 * ventana más corta que la cámara más lenta del catálogo es tirar cámaras vivas
 * creyendo que se limpia, que es el error caro de los dos: una cámara lenta
 * etiquetada como muerta desaparece y nadie vuelve a mirarla. Es lento a
 * propósito, y se ejecuta a mano justamente por eso.
 *
 * QUÉ NO USA: el reloj impreso en la imagen. Es el sello más fiable que tienen
 * las del Cabildo, pero no se puede leer sin OCR y además **no es homogéneo**:
 * unas escriben `DD-MM-AAAA` y otras `MM-DD-AAAA`, y unas van en hora insular y
 * otras en UTC. Comprobado el 14 ago 2026 comparando cuatro cámaras contra el
 * reloj de pared. Interpretarlo a ciegas daría desfases de una hora y de meses.
 *
 * SALE CON CÓDIGO 1 si alguna aparece muerta, para poder encadenarlo.
 */

import { createHash } from 'node:crypto'
import { WEBCAM_SITES, type WebcamSite, type WebcamView } from '../../src/lib/webcams/catalog'

const ROUNDS = Number(process.argv[2] ?? 5)
/** 45 min × 4 esperas = 3 h de ventana. Ver «la ventana importa», arriba. */
const GAP_S = Number(process.argv[3] ?? 2700)

interface Reading {
  status: number | string
  bytes: number
  digest: string | null
  lastModified: number | null
}

async function read(url: string): Promise<Reading> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'tiempo-palmero/checks (webcams)' },
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) return { status: res.status, bytes: 0, digest: null, lastModified: null }
    const buf = Buffer.from(await res.arrayBuffer())
    const header = res.headers.get('last-modified')
    const parsed = header ? Date.parse(header) : NaN
    return {
      status: res.status,
      bytes: buf.byteLength,
      digest: createHash('md5').update(buf).digest('hex'),
      lastModified: Number.isNaN(parsed) ? null : parsed,
    }
  } catch (e) {
    // `UNABLE_TO_VERIFY_LEAF_SIGNATURE` es el caso del GTC, que sirve la cadena
    // TLS incompleta: Node la rechaza y un navegador que persiga la intermedia
    // por AIA no. Se distingue del resto para no confundirla con una caída.
    const code = (e as { cause?: { code?: string } }).cause?.code
    return { status: code ?? 'ERR', bytes: 0, digest: null, lastModified: null }
  }
}

interface Verdict {
  site: WebcamSite
  view: WebcamView
  distinct: number
  readings: Reading[]
}

function classify(v: Verdict): 'viva' | 'congelada' | 'tls' | 'caida' {
  const ok = v.readings.filter((r) => r.digest !== null)
  if (ok.length === 0) {
    return v.readings.some((r) => String(r.status).includes('VERIFY_LEAF')) ? 'tls' : 'caida'
  }
  return v.distinct > 1 ? 'viva' : 'congelada'
}

const targets = WEBCAM_SITES.flatMap((site) => site.views.map((view) => ({ site, view })))
const digests = new Map<string, Set<string>>()
const last = new Map<string, Reading[]>()

console.log(
  `${targets.length} ángulos · ${ROUNDS} lecturas cada ${GAP_S} s ` +
    `(~${Math.round(((ROUNDS - 1) * GAP_S) / 60)} min en total)\n`,
)

for (let round = 1; round <= ROUNDS; round++) {
  const at = new Date().toISOString().slice(11, 19)
  const results = await Promise.all(targets.map((t) => read(t.view.url)))
  results.forEach((r, i) => {
    const id = targets[i].view.id
    if (!digests.has(id)) digests.set(id, new Set())
    if (r.digest) digests.get(id)!.add(r.digest)
    last.set(id, [...(last.get(id) ?? []), r])
  })
  const live = results.filter((r) => r.digest !== null).length
  console.log(`  lectura ${round}/${ROUNDS} a las ${at} UTC · ${live}/${targets.length} con imagen`)
  if (round < ROUNDS) await new Promise((r) => setTimeout(r, GAP_S * 1000))
}

const verdicts: Verdict[] = targets.map(({ site, view }) => ({
  site,
  view,
  distinct: digests.get(view.id)?.size ?? 0,
  readings: last.get(view.id) ?? [],
}))

console.log('\n%s  %s  %s  %s', 'estado'.padEnd(11), 'imágenes'.padEnd(9), 'ángulo'.padEnd(14), 'sitio')
const bad: Verdict[] = []
for (const v of verdicts) {
  const state = classify(v)
  if (state !== 'viva') bad.push(v)
  const lm = v.readings.at(-1)?.lastModified
  console.log(
    '%s  %s  %s  %s',
    state.padEnd(11),
    `${v.distinct}/${ROUNDS}`.padEnd(9),
    v.view.id.padEnd(14),
    `${v.site.name}${v.view.label ? ` — ${v.view.label}` : ''}` +
      (lm ? ` · last-modified ${new Date(lm).toISOString().slice(11, 16)}Z` : ''),
  )
}

if (bad.length === 0) {
  console.log('\nNinguna muerta. El catálogo se sostiene.')
  process.exit(0)
}

console.log(`\n${bad.length} para revisar:`)
for (const v of bad) {
  const state = classify(v)
  const why =
    state === 'congelada'
      ? `misma imagen en las ${ROUNDS} lecturas (${Math.round(((ROUNDS - 1) * GAP_S) / 60)} min)`
      : state === 'tls'
        ? 'cadena TLS incompleta: Node la rechaza, un navegador con AIA puede cargarla'
        : `sin imagen (${v.readings.map((r) => r.status).join(', ')})`
  console.log(`  · ${v.site.name} / ${v.view.id}: ${why}`)
}
// Una congelada no es necesariamente para tirar —puede publicar cada dos
// horas—, pero sí para mirarla antes de seguir fiándose de ella.
process.exit(1)
