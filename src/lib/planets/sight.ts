/**
 * Dónde está un planeta, cuánto brilla y de qué color se ve.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA CADENA, Y LA PUERTA POR LA QUE ENTRA CADA UNO. Esto es lo que más fácil
 * sería equivocar, porque los tres astros de esta aplicación llegan al mismo
 * cielo por caminos distintos y cada uno tiene su puerta en `frame.ts`:
 *
 * | Astro | De dónde viene | Puerta | Por qué |
 * |---|---|---|---|
 * | Estrellas | catálogo ICRS J2000 | `applyFrame` | precesión + nutación + aberración |
 * | Luna | serie de Meeus | `applyOfDate` | ya viene con la fecha puesta |
 * | **Planetas** | VSOP87 J2000 | **`applyFrame`** | J2000, como el catálogo |
 *
 * Equivocarse de puerta no da un error: da un cielo. Pasar los planetas por
 * `applyOfDate` los dejaría sin precesar —22 minutos de arco, dos tercios de la
 * luna llena— y sin aberración, y todos desplazados IGUAL, que es la forma más
 * traicionera de estar mal: un cielo coherente y equivocado.
 *
 * EL TIEMPO DE LUZ NO ES UN DETALLE. Júpiter está a 40 minutos luz: se ve donde
 * estaba hace 40 minutos, y en ese rato se ha movido 25 segundos de arco. Se
 * corrige evaluando la tabla en `t − τ` con la Tierra en `t`, que es la
 * definición de posición astrométrica. Una iteración basta: la segunda cambia
 * la distancia en una parte entre diez mil.
 *
 * Y DESPUÉS SÍ VA LA ABERRACIÓN, encima del tiempo de luz. Son dos cosas
 * distintas aunque las dos vengan del movimiento: el tiempo de luz es que el
 * planeta se ha movido, la aberración es que el observador se mueve. `applyFrame`
 * pone la segunda; ésta pone la primera.
 *
 * LA PARALAJE TAMBIÉN, aunque sea pequeña: 33" para Venus en su acercamiento
 * máximo, medio segundo para Urano. Cuesta una resta y la comparte con la luna.
 *
 * FUENTE de las magnitudes: *Astronomical Almanac* 1984, tal y como las publica
 * Meeus en *Astronomical Algorithms* cap. 41. Comprobadas contra
 * `astronomy-engine` en la prueba, con el residuo escrito.
 */

import {
  applyFrame,
  horizontal,
  julianCenturies,
  meanObliquity,
  precessionMatrix,
  skyFrame,
} from '../stars/frame'
import { observerOffsetKm, toTopocentric } from '../stars/parallax'
import { refractionDeg } from '../stars/refraction'
import { starColor } from '../stars/color'
import { heliocentric, type PlanetId, type PlanetTable } from './table'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const KM_PER_AU = 1.495978707e8
/** Velocidad de la luz en UA por día. La usa la corrección de tiempo de luz. */
const AU_PER_DAY = 173.1446326847

/**
 * Índice de color B−V de cada planeta, y su radio ecuatorial en km.
 *
 * EL COLOR NO ES UNA PALETA: son los índices fotométricos publicados, y se
 * pasan por `starColor`, el mismo cuerpo negro con el que se colorean las 8920
 * estrellas. Así Marte sale del mismo naranja que una gigante roja del catálogo
 * porque tiene el mismo B−V, y no porque alguien haya elegido «rojo Marte».
 *
 * Urano es el único frío de la lista —0,56, más azul que el Sol— y eso es lo
 * que le da su verde grisáceo.
 */
const PHYSICAL: Record<PlanetId, { bv: number; radiusKm: number }> = {
  mercurio: { bv: 0.93, radiusKm: 2439.7 },
  venus: { bv: 0.82, radiusKm: 6051.8 },
  tierra: { bv: 0.0, radiusKm: 6378.1 },
  marte: { bv: 1.36, radiusKm: 3396.2 },
  jupiter: { bv: 0.83, radiusKm: 71492 },
  saturno: { bv: 1.04, radiusKm: 60268 },
  urano: { bv: 0.56, radiusKm: 25559 },
}

export interface PlanetObserver {
  lon: number
  lat: number
  elevationM: number
  pressureHpa?: number
  temperatureC?: number
}

/**
 * Lo que no depende de dónde esté quien mira: la dirección astrométrica en
 * ecuatorial J2000 y todo lo fotométrico.
 *
 * VA APARTE PORQUE ES LO QUE NECESITA LA CAPA. El sombreador de las estrellas
 * espera exactamente esto —ascensión recta y declinación J2000, magnitud y
 * color— y hace por su cuenta la aberración, la precesión, la nutación, la
 * refracción y la extinción. Pasarle a los planetas por la misma puerta que a
 * las 8920 estrellas es lo que garantiza que no puedan derivar unos respecto a
 * otras: comparten el cálculo, no una copia del cálculo.
 */
export interface PlanetAstrometric {
  id: PlanetId
  /** Ascensión recta y declinación astrométricas J2000, radianes. */
  raRad: number
  decRad: number
  /** Distancia geocéntrica, UA. */
  distanceAu: number
  sunDistanceAu: number
  phaseAngleDeg: number
  illumination: number
  magnitude: number
  angularDiameterArcsec: number
  elongationDeg: number
  color: [number, number, number]
}

export interface PlanetSight extends PlanetAstrometric {
  /** Distancia al OBSERVADOR, UA. Difiere de la geocéntrica en un radio. */
  topocentricAu: number
  /** Altura geométrica topocéntrica, sin refracción. */
  elevationDeg: number
  /** Altura aparente: la de arriba más lo que el aire la levante. */
  apparentElevationDeg: number
  azimuthDeg: number
}

/**
 * Magnitud aparente. *Astronomical Almanac* 1984 vía Meeus cap. 41.
 *
 * SATURNO SE LLEVA UN TÉRMINO QUE LOS DEMÁS NO: sus anillos aportan hasta 0,9
 * magnitudes según cómo estén inclinados, y en 2025 estuvieron de canto —el
 * planeta se vio casi una magnitud más flojo de lo normal—. Ignorarlo sería
 * dibujar un Saturno que en el peor año se equivoca casi el doble que la
 * diferencia entre una estrella de primera y una de segunda.
 *
 * `ringB` es la latitud saturnocéntrica de la Tierra en grados, o `null` si no
 * se sabe; con `null` se usa el término medio y se pierde medio punto en los
 * extremos.
 */
export function planetMagnitude(
  id: PlanetId,
  sunDistanceAu: number,
  distanceAu: number,
  phaseAngleDeg: number,
  ringB: number | null = null,
): number {
  const base = 5 * Math.log10(sunDistanceAu * distanceAu)
  const i = phaseAngleDeg
  switch (id) {
    case 'mercurio':
      return -0.42 + base + 0.038 * i - 0.000273 * i * i + 2e-6 * i * i * i
    case 'venus':
      return -4.4 + base + 0.0009 * i + 0.000239 * i * i - 6.5e-7 * i * i * i
    case 'marte':
      return -1.52 + base + 0.016 * i
    case 'jupiter':
      return -9.4 + base + 0.005 * i
    case 'saturno': {
      const b = (ringB ?? 0) * RAD
      return -8.88 + base + 0.044 * Math.abs(i) - 2.6 * Math.abs(Math.sin(b)) + 1.25 * Math.sin(b) ** 2
    }
    case 'urano':
      return -7.19 + base
    default:
      return 99
  }
}

/**
 * Latitud saturnocéntrica de la Tierra, grados. Meeus cap. 45.
 *
 * Es el ángulo con el que se ven los anillos: 0 cuando están de canto —y
 * entonces desaparecen, como en marzo de 2025— y hasta ±27° cuando están
 * abiertos del todo. De ahí salen las 0,9 magnitudes que Saturno gana o pierde
 * según el año, que es la diferencia entre una estrella de primera y una de
 * segunda.
 *
 * Entra el vector geocéntrico ecuatorial J2000, que es lo que hay a mano. Se
 * precesa al ecuador medio de la fecha y se pasa a la eclíptica de la fecha,
 * que es el sistema en el que Meeus escribe la fórmula.
 */
function saturnRingLatitude(
  geocentricJ2000: [number, number, number],
  at: number,
): number {
  const T = julianCenturies(at)
  const m = precessionMatrix(T)
  const v = geocentricJ2000
  const eq: [number, number, number] = [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
  const eps = meanObliquity(T)
  const xe = eq[0]
  const ye = eq[1] * Math.cos(eps) + eq[2] * Math.sin(eps)
  const ze = -eq[1] * Math.sin(eps) + eq[2] * Math.cos(eps)
  const r = Math.hypot(xe, ye, ze)
  const lambda = Math.atan2(ye, xe)
  const beta = Math.asin(ze / r)

  const i = (28.075216 - 0.012998 * T + 0.000004 * T * T) * RAD
  const omega = (169.50847 + 1.394681 * T + 0.000412 * T * T) * RAD
  const sinB =
    Math.sin(i) * Math.cos(beta) * Math.sin(lambda - omega) - Math.cos(i) * Math.sin(beta)
  return Math.asin(Math.max(-1, Math.min(1, sinB))) * DEG
}

/**
 * Dónde se ve un planeta desde un punto de la isla, ahora.
 *
 * Devuelve `null` fuera de la ventana de la tabla, que es lo que hay que hacer:
 * ver `table.ts`.
 */
/**
 * La parte que no depende del observador: dirección astrométrica J2000,
 * magnitud, fase, tamaño y color.
 *
 * Devuelve `null` fuera de la ventana de la tabla, que es lo que hay que hacer:
 * ver `table.ts`.
 */
export function planetAstrometric(
  table: PlanetTable,
  id: PlanetId,
  at: number,
): PlanetAstrometric | null {
  const earth = heliocentric(table, 'tierra', at)
  if (!earth) return null

  // Tiempo de luz: el planeta se ve donde estaba cuando salió la luz. Se
  // resuelve iterando una vez sobre la distancia, que es lo que hace cualquier
  // efeméride; la segunda iteración cambia el resultado en una diezmilésima.
  let body = heliocentric(table, id, at)
  if (!body) return null
  let dx = body[0] - earth[0]
  let dy = body[1] - earth[1]
  let dz = body[2] - earth[2]
  let distance = Math.hypot(dx, dy, dz)
  const retarded = at - (distance / AU_PER_DAY) * 86_400_000
  const delayed = heliocentric(table, id, retarded)
  if (delayed) {
    body = delayed
    dx = body[0] - earth[0]
    dy = body[1] - earth[1]
    dz = body[2] - earth[2]
    distance = Math.hypot(dx, dy, dz)
  }

  // LA TABLA YA ESTÁ EN ECUATORIAL J2000, y aquí hubo un error que conviene
  // dejar escrito porque no se parecía a un error: `HelioVector` de
  // `astronomy-engine` devuelve el ecuador medio de J2000, no la eclíptica, y
  // este fichero le aplicaba la rotación de la oblicuidad «para pasarlo a
  // ecuatorial». El resultado era un cielo entero girado 23° —14° de error de
  // mediana— con los planetas en posiciones perfectamente plausibles, mientras
  // las distancias, las magnitudes y los diámetros salían EXACTOS, porque una
  // rotación no cambia el módulo. Lo cazó la comparación contra la efeméride;
  // mirando el mapa no se habría notado nunca.
  const eq: [number, number, number] = [dx, dy, dz]
  const raRad = Math.atan2(eq[1], eq[0])
  const decRad = Math.asin(eq[2] / distance)

  const sunDistance = Math.hypot(body[0], body[1], body[2])
  const earthSun = Math.hypot(earth[0], earth[1], earth[2])
  // Ángulo de fase: el que se ve desde el PLANETA entre el sol y la Tierra.
  // Sale del teorema del coseno con los tres lados del triángulo.
  const cosPhase = Math.max(
    -1,
    Math.min(
      1,
      (sunDistance * sunDistance + distance * distance - earthSun * earthSun) /
        (2 * sunDistance * distance),
    ),
  )
  const phaseAngleDeg = Math.acos(cosPhase) * DEG
  // Elongación: el que se ve desde AQUÍ entre el sol y el planeta. Es el otro
  // ángulo del mismo triángulo, y es el que decide si el planeta se puede ver o
  // se lo come el crepúsculo.
  const cosElongation = Math.max(
    -1,
    Math.min(
      1,
      (earthSun * earthSun + distance * distance - sunDistance * sunDistance) /
        (2 * earthSun * distance),
    ),
  )

  const physical = PHYSICAL[id]
  return {
    id,
    raRad,
    decRad,
    distanceAu: distance,
    sunDistanceAu: sunDistance,
    phaseAngleDeg,
    illumination: (1 + cosPhase) / 2,
    magnitude: planetMagnitude(
      id,
      sunDistance,
      distance,
      phaseAngleDeg,
      id === 'saturno' ? saturnRingLatitude(eq, at) : null,
    ),
    angularDiameterArcsec:
      2 * Math.atan(physical.radiusKm / (distance * KM_PER_AU)) * DEG * 3600,
    elongationDeg: Math.acos(cosElongation) * DEG,
    color: starColor(physical.bv),
  }
}

/**
 * Dónde se ve un planeta desde un punto de la isla, ahora: la astrométrica más
 * el marco del cielo, la paralaje y la refracción.
 *
 * LA CAPA NO USA ESTO, usa `planetAstrometric`: el sombreador de las estrellas
 * hace el marco y la refracción por su cuenta para las 8920 a la vez, y meter
 * los planetas por la misma puerta es lo que impide que deriven. Esto es para
 * el panel, que necesita decir a qué altura y en qué rumbo está cada uno.
 *
 * LA ÚNICA DIFERENCIA ENTRE LOS DOS CAMINOS ES LA PARALAJE, que aquí se aplica
 * y en el sombreador no: 33" para Venus en su acercamiento máximo. Con el campo
 * de visión de 36,87° repartido en unos 800 píxeles, un píxel son 166": esos
 * 33" son dos décimas de píxel, y meterlos en el sombreador habría costado un
 * uniforme más por un desplazamiento que no se puede dibujar.
 */
export function planetSight(
  table: PlanetTable,
  id: PlanetId,
  at: number,
  observer: PlanetObserver,
): PlanetSight | null {
  const astrometric = planetAstrometric(table, id, at)
  if (!astrometric) return null

  const frame = skyFrame(at, observer.lon, observer.lat)
  const geocentric = applyFrame(frame, astrometric.raRad, astrometric.decRad)
  const { direction, distanceKm } = toTopocentric(
    geocentric,
    astrometric.distanceAu * KM_PER_AU,
    observerOffsetKm(observer.lat, observer.elevationM),
  )
  const { elevationDeg, azimuthDeg } = horizontal(direction)

  return {
    ...astrometric,
    topocentricAu: distanceKm / KM_PER_AU,
    elevationDeg,
    apparentElevationDeg:
      elevationDeg + refractionDeg(elevationDeg, observer.pressureHpa, observer.temperatureC),
    azimuthDeg,
  }
}
