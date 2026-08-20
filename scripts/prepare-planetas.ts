/**
 * La tabla de los planetas: Chebyshev sobre las posiciones heliocéntricas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN, QUE ERA LA PARTE DIFÍCIL. Para dibujar planetas había dos
 * caminos escritos y los dos tenían un pero:
 *
 *  1. **Una dependencia de efemérides en el navegador.** `astronomy-engine`
 *     implementa VSOP87 entero y da un segundo de arco, pero son 200 KB de
 *     JavaScript que se descargarían siempre, mire alguien el cielo o no. La
 *     escena nocturna ya pide 133 KB de catálogo, y esos al menos solo los paga
 *     quien la enciende.
 *  2. **Escribir a mano la serie VSOP87 truncada**, como se hizo con la luna.
 *     Con la luna eran 120 términos de dos tablas; con seis planetas y la
 *     Tierra son varios miles, y transcribirlos de memoria es exactamente la
 *     clase de trabajo donde un dígito equivocado pasa desapercibido.
 *
 * HAY UN TERCERO, y es el que hacen las efemérides de verdad: **ajustar
 * polinomios de Chebyshev a la posición y guardarlos**. Es lo que hay dentro de
 * un fichero SPK del JPL. Se calcula aquí, en Node, con `astronomy-engine` —que
 * ya es dependencia de desarrollo y no entra en el paquete— y lo que viaja al
 * navegador son 36 KB de coeficientes y veinte líneas para evaluarlos.
 *
 * POR QUÉ HELIOCÉNTRICAS Y NO GEOCÉNTRICAS. Una órbita alrededor del sol es
 * casi una elipse: un polinomio de grado 10 la sigue durante meses. Vista desde
 * la Tierra, la misma órbita hace lazos de retrogradación, y ajustar eso pide
 * intervalos cortos y grados altos. Restar la Tierra en el navegador cuesta
 * tres restas.
 *
 * LO QUE ESTO TIENE Y UNA SERIE NO: FECHA DE CADUCIDAD. La tabla vale del 1 de
 * enero de 2026 al 1 de enero de 2036 y fuera de ahí no vale nada. Eso no se
 * esconde: va en la cabecera del fichero, el cargador se niega a extrapolar y
 * hay una prueba que falla cuando queden menos de dos años. Regenerarla es
 * `npm run prepare-planetas`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS PARÁMETROS ESTÁN MEDIDOS, no elegidos. Para cada cuerpo se probaron
 * combinaciones de longitud de intervalo y grado, y se quedó la más pequeña que
 * mantiene el error por debajo de 100 km:
 *
 * | Cuerpo | Intervalo | Grado | Bloques | Peor error |
 * |---|---:|---:|---:|---:|
 * | Mercurio | 32 d | 12 | 115 | 53,2 km |
 * | Venus | 128 d | 10 | 29 | 14,0 km |
 * | Tierra | 64 d | 14 | 58 | 50,2 km |
 * | Marte | 192 d | 10 | 20 | 3,9 km |
 * | Júpiter | 512 d | 8 | 8 | 0,1 km |
 * | Saturno | 730 d | 8 | 6 | 0,0 km |
 * | Urano | 1024 d | 6 | 4 | 0,8 km |
 *
 * 100 km es el listón porque el peor caso los convierte en el ángulo más
 * pequeño que importa: Mercurio a 0,55 UA de la Tierra son 0,13 segundos de
 * arco. El ojo humano resuelve 60. Las estrellas de al lado están puestas con
 * 0,31 de error, así que los planetas no van a ser lo peor colocado del cielo.
 *
 * NO ESTÁN NEPTUNO NI PLUTÓN. Neptuno es de magnitud 7,8 y el catálogo de
 * estrellas corta en 6,5: dibujarlo sería enseñar algo que, por definición de
 * esta escena, no se ve. Urano sí está —5,7 en oposición— y es el único que
 * pide un cielo de reserva Starlight para verse, que es justo lo que hay aquí.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import * as A from 'astronomy-engine'

const DAY = 86_400_000
const OUT = 'public/cielo/planetas.bin'

/** Del 1 de enero de 2026 al 1 de enero de 2036. Ver la cabecera. */
const START = Date.UTC(2026, 0, 1)
const END = Date.UTC(2036, 0, 1)

/**
 * El orden de esta lista ES el formato: el binario guarda un identificador
 * numérico y el navegador lo resuelve con la misma lista. Cambiarlo de orden
 * renombra los planetas sin mover un dato.
 */
const BODIES: { id: number; name: string; body: A.Body; days: number; degree: number }[] = [
  { id: 0, name: 'Mercurio', body: A.Body.Mercury, days: 32, degree: 12 },
  { id: 1, name: 'Venus', body: A.Body.Venus, days: 128, degree: 10 },
  { id: 2, name: 'Tierra', body: A.Body.Earth, days: 64, degree: 14 },
  { id: 3, name: 'Marte', body: A.Body.Mars, days: 192, degree: 10 },
  { id: 4, name: 'Júpiter', body: A.Body.Jupiter, days: 512, degree: 8 },
  { id: 5, name: 'Saturno', body: A.Body.Saturn, days: 730, degree: 8 },
  { id: 6, name: 'Urano', body: A.Body.Uranus, days: 1024, degree: 6 },
]

/**
 * Coeficientes de Chebyshev de grado `n` para una función en [a, b].
 *
 * Se evalúa en los nodos de Chebyshev —los ceros del polinomio de grado N— y no
 * en puntos equiespaciados: con equiespaciados el ajuste oscila en los extremos
 * del intervalo (fenómeno de Runge) y el error se multiplica por diez justo
 * donde dos bloques se tocan, que es donde más se nota.
 */
function chebyshev(f: (t: number) => number, a: number, b: number, n: number): number[] {
  const N = n + 1
  const samples: number[] = []
  for (let k = 0; k < N; k++) {
    const x = Math.cos((Math.PI * (k + 0.5)) / N)
    samples.push(f(a + ((x + 1) * (b - a)) / 2))
  }
  const c: number[] = []
  for (let j = 0; j < N; j++) {
    let s = 0
    for (let k = 0; k < N; k++) s += samples[k] * Math.cos((Math.PI * j * (k + 0.5)) / N)
    c.push((2 * s) / N)
  }
  return c
}

/** Clenshaw. El mismo bucle que corre en el navegador, para poder comprobar. */
function evaluate(c: number[], a: number, b: number, t: number): number {
  const x = (2 * t - a - b) / (b - a)
  let d = 0
  let dd = 0
  for (let j = c.length - 1; j > 0; j--) {
    const previous = d
    d = 2 * x * d - dd + c[j]
    dd = previous
  }
  return x * d - dd + c[0] / 2
}

interface Block {
  id: number
  degree: number
  blocks: number
  intervalMs: number
  coefficients: number[]
  worstKm: number
}

const KM_PER_AU = 1.495978707e8

function build(spec: (typeof BODIES)[number]): Block {
  const step = spec.days * DAY
  const blocks = Math.ceil((END - START) / step)
  const coefficients: number[] = []
  let worst = 0
  for (let i = 0; i < blocks; i++) {
    const a = START + i * step
    const b = a + step
    const axes = [0, 1, 2].map((k) =>
      chebyshev(
        (t) => {
          const v = A.HelioVector(spec.body, new Date(t))
          return [v.x, v.y, v.z][k]
        },
        a,
        b,
        spec.degree,
      ),
    )
    // Se comprueba cada bloque contra la efeméride en veinte puntos, incluidos
    // los dos extremos: si un bloque saliera mal, el error aparecería aquí y no
    // en el cielo de alguien.
    for (let s = 0; s <= 20; s++) {
      const t = a + ((b - a) * s) / 20
      const v = A.HelioVector(spec.body, new Date(t))
      const got = axes.map((c) => evaluate(c, a, b, t))
      worst = Math.max(worst, Math.hypot(got[0] - v.x, got[1] - v.y, got[2] - v.z))
    }
    for (const axis of axes) coefficients.push(...axis)
  }
  return {
    id: spec.id,
    degree: spec.degree,
    blocks,
    intervalMs: step,
    coefficients,
    worstKm: worst * KM_PER_AU,
  }
}

const MAGIC = 'TPPLAN1\0'
/** Cabecera: magia, número de cuerpos, y la ventana de validez. */
const HEADER = 8 + 4 + 4 + 8 + 8
/** Ficha por cuerpo: id, grado, bloques, desplazamiento y longitud del bloque. */
const RECORD = 1 + 1 + 2 + 4 + 8

const built = BODIES.map(build)
const totalCoefficients = built.reduce((n, b) => n + b.coefficients.length, 0)
const size = HEADER + RECORD * built.length + totalCoefficients * 4
const buffer = new ArrayBuffer(size)
const view = new DataView(buffer)

for (let i = 0; i < 8; i++) view.setUint8(i, MAGIC.charCodeAt(i))
view.setUint32(8, built.length, true)
view.setUint32(12, 0, true)
view.setFloat64(16, START, true)
view.setFloat64(24, END, true)

let offset = 0
let cursor = HEADER
for (const b of built) {
  view.setUint8(cursor, b.id)
  view.setUint8(cursor + 1, b.degree)
  view.setUint16(cursor + 2, b.blocks, true)
  view.setUint32(cursor + 4, offset, true)
  view.setFloat64(cursor + 8, b.intervalMs, true)
  cursor += RECORD
  offset += b.coefficients.length
}
const floats = new Float32Array(buffer, HEADER + RECORD * built.length, totalCoefficients)
let k = 0
for (const b of built) for (const c of b.coefficients) floats[k++] = c

mkdirSync('public/cielo', { recursive: true })
writeFileSync(OUT, Buffer.from(buffer))

console.log(`Tabla de planetas: ${new Date(START).toISOString().slice(0, 10)} → ${new Date(END).toISOString().slice(0, 10)}`)
console.log('| Cuerpo | Intervalo | Grado | Bloques | Coeficientes | Peor error |')
console.log('|---|---:|---:|---:|---:|---:|')
for (let i = 0; i < built.length; i++) {
  const b = built[i]
  console.log(
    `| ${BODIES[i].name} | ${BODIES[i].days} d | ${b.degree} | ${b.blocks} | ${b.coefficients.length} | ${b.worstKm.toFixed(1)} km |`,
  )
}
console.log(`\n${OUT}: ${(size / 1024).toFixed(1)} KB, ${totalCoefficients} coeficientes`)
