/**
 * La escena de nubes: cuántas hay, dónde, de qué tamaño, y hacia dónde van.
 *
 * QUÉ ES DATO Y QUÉ ES DIBUJO. Esta distinción es la que sostiene todo el
 * fichero, porque aquí se juntan las dos cosas y mezclarlas sería justo lo que
 * esta aplicación no hace:
 *
 *   **Es dato** —y no se toca— la nubosidad de cada estrato, la lluvia, el
 *   viento que arrastra cada capa y la cota a la que se dibuja cada una. Todo
 *   eso viene medido o modelado, con su fuente y su hora, de `model.ts`,
 *   `field.ts` y `decks.ts`.
 *
 *   **Es dibujo** la FORMA de cada nube: cuántas motas tiene, cómo se reparten
 *   en la cúpula, qué radio tiene cada una. El modelo dice que hay un 40 % de
 *   cielo cubierto a 1200 m; no dice —ni puede— que haya un cúmulo concreto en
 *   un punto concreto con esta silueta. Esa parte es una representación
 *   plausible de una cifra real, y las constantes de forma llevan escrito que
 *   lo son, sin fingir que se han medido contra nada.
 *
 * LO QUE SÍ ESTÁ ATADO AL DATO ES CUÁNTAS NUBES HAY, y no por una constante
 * elegida a ojo sino por el **modelo booleano de discos**: repartiendo discos
 * de radio R al azar sobre un área A con densidad λ, la fracción cubierta es
 * `1 − exp(−λ·πR²)`. Despejando, para tapar una fracción `c` hacen falta
 * `N = −(A/πR²)·ln(1−c)` discos. Así, cuando el modelo dice 40 %, lo que se
 * dibuja tapa un 40 % del cielo —contando el solape, que es lo que hace que la
 * regla ingenua `N ∝ c` se quede corta en cuanto la cobertura pasa de la mitad.
 *
 * Y EL RADIO CRECE CON LA COBERTURA, que es la otra mitad de la idea. Un cielo
 * al 10 % son cúmulos sueltos de buen tiempo; un cielo al 95 % no son mil
 * cúmulos apretados sino una MANTA, que es exactamente lo que se ve desde la
 * Cumbre cuando el alisio aprieta. Hacer crecer el radio con `c` convierte una
 * cosa en la otra de forma continua, y de paso acota la cuenta: sin eso, el
 * cielo cubierto pedía miles de nubes.
 */

import { MAP_BBOX } from '../geo'
import { deckFor, type Deck, type Etage } from './decks'
import { RAIN_MIN_MM, skyAt, windAt } from './field'
import type { SkySample } from './model'

/** Una mota de nube, en coordenadas relativas al centro de su nube. */
export interface Puff {
  /** Desplazamiento hacia el este, m. */
  dx: number
  /** Desplazamiento hacia el norte, m. */
  dy: number
  /** Altura dentro de la nube: 0 en la base, 1 en la cima. */
  h: number
  /** Radio de la mota, m. */
  radiusM: number
  /** Semilla estable, 0-1. Rompe la regularidad en el sombreado. */
  seed: number
}

export interface Cloud {
  /** Centro actual. Se mueve con el viento de su estrato. */
  lon: number
  lat: number
  etage: Etage
  /** Cota de la base y de la cima, m. De `decks.ts`. */
  base: number
  top: number
  puffs: Puff[]
  /** Lluvia bajo esta nube, mm/h. Solo el estrato bajo puede tenerla. */
  precipMm: number
  /** Opacidad de la nube, 0-1. */
  density: number
  /** Viento que la arrastra, m/s. Componentes este y norte. */
  u: number
  v: number
}

/**
 * Radio base de una nube, en metros, ANTES de crecer con la cobertura.
 *
 * Constantes de DIBUJO, no medidas: dan la escala de la celda convectiva que se
 * representa. Están en el orden de magnitud de lo real —una célula de
 * estratocúmulo marítimo es de kilómetros, un cirro se extiende mucho más— pero
 * nadie ha medido el tamaño de las nubes de hoy sobre La Palma, y esto no
 * pretende que sí.
 */
const BASE_RADIUS_M: Record<Etage, number> = { low: 2600, mid: 3400, high: 5200 }

/**
 * Cuánto crece el radio con la cobertura: `R = R₀·(1 + GROWTH·c)`.
 *
 * Con 2, un cielo despejado-con-nubes (c = 0,1) da celdas de ~3 km y un cielo
 * tapado (c = 0,97) da masas de ~7,6 km, que ya no se leen como nubes sueltas
 * sino como la manta que son.
 */
const RADIUS_GROWTH = 2

/** Motas por nube. Dibujo: más motas es una silueta más rica y más coste. */
const PUFFS_PER_CLOUD: Record<Etage, number> = { low: 22, mid: 16, high: 12 }

/**
 * Tope de nubes por estrato.
 *
 * Es un tope de COSTE, no de física, y por eso está donde no llega a morder: con
 * el radio creciendo, el cielo totalmente cubierto pide ~200 nubes bajas y este
 * tope está en 320. Existe para que un dato absurdo —una cobertura corrupta,
 * un `NaN` que se cuele— no pueda pedir cien mil motas y colgar la pestaña.
 *
 * En el peor caso los tres estratos suman 12 480 motas, del orden de las 14 000
 * partículas que ya mueve la capa de vapor sin despeinarse.
 */
const MAX_CLOUDS: Record<Etage, number> = { low: 320, mid: 220, high: 160 }

/**
 * Cobertura máxima que se le pasa al modelo booleano.
 *
 * `−ln(1−c)` se va a infinito en c = 1, así que el 100 % de cobertura pediría
 * infinitas nubes. Se corta en 0,97: por encima, el cielo ya está tapado y
 * añadir nubes no cambia un píxel de lo que se ve, solo gasta.
 */
const COVER_CAP = 0.97

/**
 * Opacidad por estrato. Dibujo, pero no arbitrario: refleja el espesor óptico
 * típico de cada piso. Un estratocúmulo tapa el sol; un cirro deja verlo.
 */
const DENSITY: Record<Etage, number> = { low: 0.95, mid: 0.72, high: 0.34 }

/** Metros por grado. Constantes, a esta latitud sobran los refinamientos. */
const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LON = 111_320

/**
 * Generador pseudoaleatorio determinista (mulberry32).
 *
 * TIENE QUE SER DETERMINISTA. Sin semilla, cada `render` de React reconstruiría
 * la escena con otras formas y las nubes parpadearían de una silueta a otra
 * varias veces por segundo. Con semilla, la misma pasada del modelo da siempre
 * la misma escena, y solo cambia cuando cambia el dato.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** El rectángulo donde viven las nubes: el del mapa, no el de la isla. */
const DOMAIN = MAP_BBOX

/** Área del dominio en m², para el modelo booleano. */
function domainAreaM2(): number {
  const midLat = (DOMAIN.south + DOMAIN.north) / 2
  const w = (DOMAIN.east - DOMAIN.west) * M_PER_DEG_LON * Math.cos((midLat * Math.PI) / 180)
  const h = (DOMAIN.north - DOMAIN.south) * M_PER_DEG_LAT
  return w * h
}

/** La cobertura media del estrato sobre el dominio, 0-1. */
function meanCover(samples: readonly SkySample[], etage: Etage): number {
  if (!samples.length) return 0
  let sum = 0
  for (const s of samples) sum += s[etage]
  return Math.min(COVER_CAP, sum / samples.length / 100)
}

/** La cobertura local de un estrato en un punto, 0-1. */
function coverAt(samples: readonly SkySample[], etage: Etage, lon: number, lat: number): number {
  return Math.min(COVER_CAP, skyAt(samples, lon, lat)[etage] / 100)
}

/**
 * Las motas de una nube: una cúpula, más aplanada cuanto más tapado el cielo.
 *
 * Todo lo de aquí es forma, o sea dibujo. La cúpula sale de repartir las motas
 * en un disco y darle a cada una una altura máxima que cae hacia el borde
 * —`√(1 − (r/R)²)`, media esfera—, que es la silueta de coliflor del cúmulo. El
 * aplanado la va convirtiendo en una lámina a medida que sube la cobertura,
 * porque una manta de estratocúmulo no tiene torres: tiene un techo.
 */
function buildPuffs(etage: Etage, radiusM: number, flat: number, rand: () => number): Puff[] {
  const count = PUFFS_PER_CLOUD[etage]
  const puffs: Puff[] = []
  for (let i = 0; i < count; i++) {
    // `^0.7` en vez de `√`: concentra un poco hacia el centro, que es donde el
    // cúmulo tiene cuerpo. Con raíz cuadrada el reparto es uniforme en área y
    // la nube sale igual de densa en el borde que en el medio, como una galleta.
    const r = radiusM * Math.pow(rand(), 0.7)
    const theta = rand() * Math.PI * 2
    const rel = r / radiusM
    const dome = Math.sqrt(Math.max(0, 1 - rel * rel))
    // Aplanada, la cúpula se vuelve un techo: la altura deja de depender de lo
    // lejos que esté la mota del centro.
    const shape = dome * (1 - flat) + 0.4 * flat
    puffs.push({
      dx: Math.cos(theta) * r,
      dy: Math.sin(theta) * r,
      h: Math.min(1, 0.12 + 0.88 * rand() * shape),
      // Las motas engordan con el aplanado para que la manta cierre sin huecos.
      radiusM: radiusM * (0.26 + 0.2 * rand()) * (1 + 0.45 * flat),
      seed: rand(),
    })
  }
  return puffs
}

/**
 * Coloca las nubes de un estrato.
 *
 * El reparto NO es uniforme: se propone un punto al azar y se acepta con
 * probabilidad proporcional a la cobertura local. Así la nube se acumula donde
 * el modelo dice que hay nube —contra la vertiente noreste, casi siempre— en
 * vez de espolvorearse por igual sobre una isla que casi nunca está igual de
 * tapada por los dos lados. El cupo total sigue saliendo de la cobertura media,
 * así que se reparte lo que hay, no más.
 */
function placeEtage(
  samples: readonly SkySample[],
  etage: Etage,
  deck: Deck,
  rand: () => number,
): Cloud[] {
  const cover = meanCover(samples, etage)
  if (cover <= 0.005) return []

  const radiusM = BASE_RADIUS_M[etage] * (1 + RADIUS_GROWTH * cover)
  const discArea = Math.PI * radiusM * radiusM
  const target = Math.min(
    MAX_CLOUDS[etage],
    Math.round((domainAreaM2() / discArea) * -Math.log(1 - cover)),
  )
  if (target <= 0) return []

  const clouds: Cloud[] = []
  // Tope de intentos: con cobertura muy desigual, la mayoría de los puntos
  // propuestos caen donde no hay nube y se rechazan. Sin tope, un cielo con una
  // única celda nubosa en una esquina daría vueltas para siempre.
  const maxTries = target * 40
  for (let tries = 0; tries < maxTries && clouds.length < target; tries++) {
    const lon = DOMAIN.west + rand() * (DOMAIN.east - DOMAIN.west)
    const lat = DOMAIN.south + rand() * (DOMAIN.north - DOMAIN.south)
    const local = coverAt(samples, etage, lon, lat)
    // Se acepta contra el TOPE, no contra la media: así el sitio más tapado se
    // acepta casi siempre y el despejado casi nunca, con la proporción correcta
    // entre ellos.
    if (rand() > local / COVER_CAP) continue

    const wind = windAt(samples, etage, lon, lat)
    // La lluvia se mira UNA vez, al colocar la nube, y no en cada fotograma.
    // Entre dos refrescos del modelo —cinco minutos— una nube a 5 m/s recorre
    // 1,5 km, menos de un tercio de la celda de 5 km del propio modelo: volver
    // a preguntar a cada paso costaría setenta distancias por nube y por
    // fotograma para devolver, casi siempre, la misma cifra.
    const precipMm =
      etage === 'low' ? skyAt(samples, lon, lat).precipMm : 0

    clouds.push({
      lon,
      lat,
      etage,
      base: deck.base,
      top: deck.top,
      puffs: buildPuffs(etage, radiusM, local, rand),
      precipMm: precipMm >= RAIN_MIN_MM ? precipMm : 0,
      // La nube que llueve es más densa y más oscura por debajo: no es un
      // efecto, es que para llover hay que tener agua dentro.
      density: Math.min(1, DENSITY[etage] * (precipMm >= RAIN_MIN_MM ? 1.15 : 1)),
      u: wind.u,
      v: wind.v,
    })
  }
  return clouds
}

/**
 * Construye la escena entera a partir de la rejilla y la banda baja del día.
 *
 * `seed` fija las formas. Se le pasa la hora de la pasada del modelo, así que
 * la escena solo se rebaraja cuando llega dato nuevo —no en cada repintado— y
 * dos personas mirando la misma pasada ven exactamente la misma isla.
 */
export function buildCloudScene(
  samples: readonly SkySample[],
  lowBand: Deck,
  seed: number,
): Cloud[] {
  if (!samples.length) return []
  const rand = mulberry32(seed || 1)
  const etages: Etage[] = ['low', 'mid', 'high']
  return etages.flatMap((e) => placeEtage(samples, e, deckFor(e, lowBand), rand))
}

/**
 * Mueve las nubes con su viento, `dt` segundos.
 *
 * Cuando una sale del dominio reaparece por el lado contrario. El salto es
 * visible si a uno le da por seguir una nube concreta hasta el borde, y se
 * acepta a cambio de lo que evita: sin él, la escena se vaciaría por sotavento
 * en unas horas y habría que inventarse nubes nuevas entrando por barlovento
 * —que es peor, porque esas sí serían invención pura, sin ninguna cifra detrás.
 *
 * Reaparecer por el otro lado equivale a suponer que el cielo se repite fuera
 * del rectángulo, que a 90 km de escala y con el mismo régimen sinóptico no es
 * una suposición descabellada.
 */
export function driftClouds(clouds: Cloud[], dt: number): void {
  if (dt <= 0) return
  const w = DOMAIN.east - DOMAIN.west
  const h = DOMAIN.north - DOMAIN.south
  for (const c of clouds) {
    const mPerDegLon = M_PER_DEG_LON * Math.cos((c.lat * Math.PI) / 180)
    c.lon += (c.u * dt) / mPerDegLon
    c.lat += (c.v * dt) / M_PER_DEG_LAT
    // Módulo con signo: `%` en JavaScript devuelve negativo para entradas
    // negativas, y una nube que salga por el oeste acabaría fuera del mapa.
    c.lon = DOMAIN.west + (((c.lon - DOMAIN.west) % w) + w) % w
    c.lat = DOMAIN.south + (((c.lat - DOMAIN.south) % h) + h) % h
  }
}

/** Cuántas motas tiene la escena. Para dimensionar el búfer de la capa. */
export function puffCount(clouds: readonly Cloud[]): number {
  let n = 0
  for (const c of clouds) n += c.puffs.length
  return n
}
