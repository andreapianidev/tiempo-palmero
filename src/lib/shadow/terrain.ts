/**
 * Las sombras que la isla se echa encima de sí misma.
 *
 * QUÉ AÑADE, Y POR QUÉ NO LO PODÍA HACER EL SOMBREADO DE SIEMPRE. La capa
 * `hillshade` de MapLibre ilumina cada ladera según hacia dónde mira, y con
 * `terrain-light.ts` lo hace además desde donde está el sol de verdad. Pero
 * `hillshade` es un cálculo LOCAL: mira la pendiente del píxel y nada más. No
 * sabe que a las siete de la tarde la pared de la Caldera le está tapando el
 * sol al barranco de al lado, ni que el Roque se proyecta kilómetros hacia el
 * este al amanecer. Una ladera que mira al sol pero que tiene una montaña
 * delante sale iluminada, y es la mitad de la escena de un día real.
 *
 * Eso es otra pregunta —¿hay relieve entre este punto y el sol?— y se contesta
 * con el mismo modelo de elevación que ya está en memoria.
 *
 * CÓMO. No hace falta lanzar un rayo por píxel, que sería 4,1 millones de
 * marchas. Recorriendo la malla EN CONTRA de la dirección del sol, el horizonte
 * que un píxel tiene delante se deduce del que tenía su vecino con una sola
 * resta. Si `H(t)` es la altura mínima que hay que tener en el paso `t` para
 * que el sol se vea:
 *
 *     H(t) = max( z(t+1), H(t+1) ) − s · tan(elevación)
 *
 * donde `s` son los metros de suelo que mide un paso. O sea: o te tapa el
 * vecino de al lado, o te tapa lo que ya tapaba al vecino, y en los dos casos
 * la exigencia baja lo que el rayo desciende en un paso. Un pase por la malla,
 * sin marchas y sin tabla precalculada.
 *
 * NO ES UN MAPA DE HORIZONTE. La idea de partida era precalcular, para cada
 * celda, el ángulo de horizonte en N acimutes y guardarlo como textura. Sale a
 * 33 MB para 32 acimutes a media resolución, y con este barrido no hace falta
 * ninguno: la malla entera se resuelve en un pase por posición solar, y el sol
 * se mueve despacio. Se descartó antes de escribirlo.
 *
 * LO QUE ESTA SOMBRA SÍ ES, ADEMÁS DE BONITA. Es geometría medida sobre el DEM,
 * igual que las cotas: no hay ningún número elegido a ojo en todo el fichero
 * salvo el suavizado del borde, y ése sale de la resolución de la propia malla.
 * El mismo barrido, repetido por las horas de un día, son las horas de sol
 * reales de cada punto — que es un dato agronómico, no un efecto.
 *
 * ESTE FICHERO NO DIBUJA NADA. Devuelve una malla de valores; quien la convierte
 * en píxeles y se la da a MapLibre es `components/shadow/ShadowLayer.ts`.
 */

import type { Dem } from '../dem'
import type { SkyPosition } from '../sun'

const RAD = Math.PI / 180

export interface ShadowMask {
  /** 0 = a pleno sol, 255 = sombra cerrada. Fila mayor, esquina noroeste. */
  data: Uint8Array
  width: number
  height: number
  /** Cada cuántos píxeles del DEM se ha resuelto una celda. */
  step: number
  /** Metros de suelo por celda de esta malla. */
  metersPerCell: number
}

/**
 * Por debajo de esta altura el sol no proyecta nada que merezca dibujarse.
 *
 * A 0° geométricos medio disco sigue asomando y la refracción levanta la imagen
 * otro medio grado largo, así que cortar en cero dejaría la isla entera en
 * sombra mientras todavía hay luz rasante en las cumbres. Se corta por debajo
 * del horizonte, y de ahí a la noche manda `dayFactor` como en todo lo demás.
 */
export const MIN_SUN_ELEVATION = -0.833

/**
 * La sombra propia del relieve para una posición del sol.
 *
 * Devuelve `null` con el sol bajo el horizonte: entonces no hay sombras
 * arrojadas que dibujar —lo que hay es noche— y quien llame se ahorra el pase.
 *
 * `step` submuestrea la malla del DEM. Se muestrea por punto y no por máximo
 * del bloque: el máximo engordaría cada cresta hasta el tamaño del bloque y las
 * sombras saldrían más largas de lo que son, que es peor que perder una arista.
 */
export function terrainShadow(
  dem: Dem,
  sun: SkyPosition,
  { step = 1 }: { step?: number } = {},
): ShadowMask | null {
  if (sun.elevationDeg <= MIN_SUN_ELEVATION) return null

  const width = Math.ceil(dem.width / step)
  const height = Math.ceil(dem.height / step)
  const data = new Uint8Array(width * height)

  // Dirección horizontal HACIA el sol, en celdas: x al este, y al SUR —que es
  // como crece el índice de fila del DEM, no al norte.
  const az = sun.azimuthDeg * RAD
  let dx = Math.sin(az)
  let dy = -Math.cos(az)

  // Se normaliza para que la componente dominante valga exactamente 1. Es lo
  // que garantiza que el vecino hacia el sol caiga siempre en la fila —o la
  // columna— de al lado, ya resuelta, y que la interpolación de la otra
  // coordenada solo pida celdas de esa misma línea.
  const dominant = Math.max(Math.abs(dx), Math.abs(dy))
  dx /= dominant
  dy /= dominant

  const alongX = Math.abs(dx) >= Math.abs(dy)
  const metersPerCell = dem.manifest.metersPerPixel * step
  // El paso mide más de una celda cuando va en diagonal.
  const strideM = metersPerCell * Math.hypot(dx, dy)
  const drop = strideM * Math.tan(sun.elevationDeg * RAD)

  // Tamaños en el eje que manda (`u`) y en el otro (`v`).
  const uCount = alongX ? width : height
  const vCount = alongX ? height : width
  // Fracción con la que la línea se desvía del eje dominante en cada paso.
  const slip = alongX ? dy : dx
  // Se recorre AL REVÉS que el sol, empezando por el borde que lo tiene de
  // frente: allí no hay nada delante que pueda tapar.
  const forward = (alongX ? dx : dy) > 0
  const uStart = forward ? uCount - 1 : 0
  const uEnd = forward ? -1 : uCount
  const uStep = forward ? -1 : 1

  // Se lee el CENTRO de cada bloque, no su esquina: la malla resultante se
  // estira sobre el mismo recuadro que el DEM, así que con la esquina la sombra
  // saldría corrida media celda respecto al relieve que la proyecta.
  const half = step >> 1
  const heightAt = (u: number, v: number): number => {
    const x = alongX ? u : v
    const y = alongX ? v : u
    const px = Math.min(dem.width - 1, x * step + half)
    const py = Math.min(dem.height - 1, y * step + half)
    return dem.heights[py * dem.width + px]
  }
  const write = (u: number, v: number, value: number): void => {
    const x = alongX ? u : v
    const y = alongX ? v : u
    data[y * width + x] = value
  }

  // El horizonte de la línea anterior. Solo hace falta esa: por eso esto ocupa
  // una columna y no dos mallas enteras (33 MB a resolución completa).
  let prev = new Float32Array(vCount)
  let cur = new Float32Array(vCount)
  prev.fill(-Infinity)

  for (let u = uStart; u !== uEnd; u += uStep) {
    const first = u === uStart
    for (let v = 0; v < vCount; v++) {
      const z = heightAt(u, v)
      let horizon = -Infinity
      if (!first) {
        // Dónde cae el vecino de la línea de al lado, hacia el sol.
        const fv = v + slip
        const v0 = Math.floor(fv)
        const t = fv - v0
        const v1 = v0 + 1
        const inside0 = v0 >= 0 && v0 < vCount
        const inside1 = v1 >= 0 && v1 < vCount
        // Fuera de la malla no hay relieve que tape: se deja pasar la luz en vez
        // de inventarse un muro en el borde del recuadro.
        const z0 = inside0 ? Math.max(heightAt(u - uStep, v0), prev[v0]) : -Infinity
        const z1 = inside1 ? Math.max(heightAt(u - uStep, v1), prev[v1]) : -Infinity
        if (z0 !== -Infinity && z1 !== -Infinity) horizon = z0 + (z1 - z0) * t
        else if (z0 !== -Infinity) horizon = z0
        else if (z1 !== -Infinity) horizon = z1
        if (horizon !== -Infinity) horizon -= drop
      }
      cur[v] = horizon
      // Cuánto le falta al punto para asomar por encima de lo que tiene delante.
      const deficit = horizon - z
      // EL BORDE SE DESHACE EN UNA CELDA, y `drop` es justo eso: lo que baja el
      // rayo en un paso, o sea el desnivel que separa estar dentro de la sombra
      // de estar fuera en la celda de al lado. Poner aquí una constante en
      // metros habría sido elegir un número; esto es la resolución de la malla
      // expresada en las unidades en que se mide el déficit, y se ajusta sola
      // al submuestreo y a la altura del sol.
      //
      // La penumbra de verdad tiene otra causa —el sol es un disco de 0,53°,
      // así que a 2 km del obstáculo el borde real ya mide 18 m y a 4 km, 37—,
      // y sale del mismo orden que la celda. Modelarla pediría arrastrar la
      // distancia al obstáculo, y no cambiaría lo que se ve.
      const shade = deficit <= 0 ? 0 : deficit >= drop ? 1 : deficit / drop
      write(u, v, Math.round(shade * 255))
    }
    const swap = prev
    prev = cur
    cur = swap
  }

  return { data, width, height, step, metersPerCell }
}

/**
 * Horas de sol de un punto a lo largo de un día, contadas sobre el relieve.
 *
 * Es el mismo barrido repetido, y es la razón por la que esto vive en `lib/` y
 * no dentro de la capa que lo dibuja: la sombra es un dato —cuánto sol le llega
 * de verdad a esta parcela, a este sendero, a este observatorio—, y el día que
 * haga falta publicarlo no habrá que reimplementar nada.
 *
 * `positions` son las posiciones solares del día, ya calculadas por quien llama;
 * `minutesPerSample` es cuánto vale cada una. No se calculan aquí para no atar
 * este fichero a un reloj ni a una fecha.
 */
export function sunHours(
  dem: Dem,
  positions: readonly SkyPosition[],
  minutesPerSample: number,
  opts: { step?: number } = {},
): { hours: Float32Array; width: number; height: number } | null {
  let acc: Float32Array | null = null
  let width = 0
  let height = 0
  const hoursPerSample = minutesPerSample / 60

  for (const position of positions) {
    const mask = terrainShadow(dem, position, opts)
    if (!mask) continue
    if (!acc) {
      width = mask.width
      height = mask.height
      acc = new Float32Array(width * height)
    }
    for (let i = 0; i < acc.length; i++) {
      // El borde suavizado cuenta como la fracción de sol que deja pasar.
      acc[i] += (1 - mask.data[i] / 255) * hoursPerSample
    }
  }

  return acc ? { hours: acc, width, height } : null
}
