/**
 * Las partículas de vapor: nacen en el suelo, suben, y mueren al condensar.
 *
 * QUÉ SE SIMULA Y CON QUÉ. Cada partícula lleva longitud, latitud y **altitud
 * en metros**, y se le pregunta el suelo al modelo de elevación en cada paso
 * para que no quede nunca por debajo de él. Es la misma disciplina que
 * `lib/wind/altitude.ts` le puso a la capa de viento —que hasta hace poco se
 * apagaba en 3D precisamente por calcularse a cota cero y atravesar la montaña
 * por dentro—, aplicada a un fenómeno distinto: el viento acompaña al terreno a
 * una altura fija sobre él, y esto sube desde el suelo hasta que condensa.
 *
 * DE DÓNDE SALE CADA MOVIMIENTO:
 *
 *  - **arriba o abajo** lo decide la respiración de la isla (`breath.ts`), que
 *    es la brisa de ladera con el reloj del sol de verdad;
 *  - **cuánto vapor hay** lo decide la demanda evaporativa (`field.ts`), que es
 *    el VPD que estiman las estaciones del Cabildo;
 *  - **hacia dónde deriva** lo decide el campo de viento que la aplicación ya
 *    construye (`wind/field.ts`), el mismo que dibuja la capa de viento;
 *  - **dónde se acaba** lo decide el nivel de condensación: ahí el vapor deja
 *    de ser invisible y pasa a ser nube, y esta capa deja de dibujarlo.
 *
 * LO QUE NO ES. No es un modelo de capa límite. Las velocidades de abajo son de
 * manual —rangos publicados para brisas de ladera— y no están medidas en esta
 * isla, porque para medirlas haría falta una red de anemómetros de ladera que
 * no existe. Lo que sí está atado al dato es **cuándo** sube y baja, **dónde**
 * hay vapor y **hasta dónde** llega. La interfaz lo dice donde se enciende.
 */

import { elevationAt, SEA_LEVEL_M, type Dem } from '../dem'
import { demandAt, type VaporField } from './field'
import type { WindField } from '../wind/field'
import type { Breath } from './breath'

/**
 * Velocidad vertical máxima de la brisa de ladera, en m/s.
 *
 * Las corrientes anabáticas sobre laderas soleadas se miden habitualmente entre
 * 1 y 5 m/s de componente a lo largo de la pendiente, con la componente
 * vertical bastante menor. 1,2 m/s es el techo con el que una partícula tarda
 * ~20 minutos simulados en subir de 200 a 1.600 m, que es el orden de lo que
 * tarda la manta en trepar la vertiente noreste una tarde de alisio.
 */
export const MAX_UPDRAFT_MS = 1.2

/**
 * La bajada es más lenta que la subida, y no por gusto: la corriente catabática
 * es una capa delgada y fría pegada al suelo, sin la convección que empuja a la
 * anabática. La proporción de 0,45 está en el orden de lo publicado.
 */
export const KATABATIC_RATIO = 0.45

/**
 * Cuánto arrastra el viento sinóptico a una partícula de bruma, de 0 a 1.
 *
 * No es 1: el vapor que sube pegado a una ladera está dentro de la capa
 * rugosa, donde el viento vale una fracción del que mide un anemómetro a 10 m.
 * 0,35 y no 0,55: con el acoplamiento alto las columnas salían tan tumbadas que
 * en pantalla se leían como arañazos diagonales y no como algo que sube. Sigue
 * bastando para que se note de qué lado sopla el alisio, que es lo que esta
 * componente tiene que comunicar.
 */
export const WIND_COUPLING = 0.35

/** Cuánto se pega la partícula a la línea de máxima pendiente, en m/s. */
export const SLOPE_DRIFT_MS = 1.6

/** Vida máxima de una partícula, en segundos simulados. */
export const MAX_LIFE_S = 55

/** Altura sobre el suelo a la que nace. Cero la dejaría enterrada al primer paso. */
const SPAWN_ABOVE_GROUND_M = 8

/**
 * Cuántos focos de emisión. LA DIFERENCIA ENTRE COLUMNAS Y POLVO.
 *
 * El primer intento sembraba cada partícula en un sitio al azar de la vista,
 * ponderado por la demanda. Está bien de estadística y es horrible de mirar:
 * sale una nube de puntos repartida por igual, como la nieve de un televisor
 * mal sintonizado, porque no hay dos motas que compartan origen. Y en una isla
 * el vapor no sale de todas partes a la vez: sale de las cabeceras de barranco
 * y de las umbrías húmedas, en penachos.
 *
 * Con 150 focos y 14.000 motas salen ~93 motas por columna, y ese cociente es
 * lo que importa, no ninguno de los dos números por separado. Se probó con 110
 * focos y 5.200 motas —47 por columna— y no llegaba: repartidas por toda la
 * vida del penacho, en cada instante hay dos docenas en el aire y lo que se ve
 * son arañazos sueltos. Bajando a 55 focos las columnas se compactaron pero
 * quedaron ocho por ladera. La salida era subir las dos cosas manteniendo el
 * cociente cerca de 90.
 */
const VENT_COUNT = 150

/**
 * Radio alrededor del foco donde nacen sus motas, en metros.
 *
 * 160 y no 260: una columna que nace repartida por medio kilómetro no es una
 * columna, es una mancha. El penacho tiene que salir estrecho de abajo y
 * abrirse al subir, que es lo que hace de verdad y lo que hace el tamaño de la
 * mota al crecer con la altura.
 */
const VENT_RADIUS_M = 160

/**
 * Probabilidad de que un foco se mude al reciclar una partícula.
 *
 * Los focos no son eternos ni fijos: si lo fueran, las columnas se quedarían
 * clavadas en el mismo sitio para siempre y la isla parecería una maqueta con
 * las máquinas de humo atornilladas. Con 2 % por renacimiento, un foco dura del
 * orden de un minuto y las columnas van migrando por la ladera.
 */
const VENT_DRIFT = 0.02

/** Techo del paso de integración: volver de una pestaña dormida no teletransporta. */
const MAX_DT = 0.05

/** Metros por grado de latitud. En longitud se corrige por el coseno. */
const M_PER_DEG_LAT = 111_320

export interface SpawnBounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * La pendiente del terreno en un punto: hacia dónde sube y cuánto.
 *
 * Diferencias centradas sobre el propio DEM, con un paso de ~34 m que es un
 * píxel del modelo. Devuelve el vector unitario que apunta ladera ARRIBA y la
 * tangente de la pendiente.
 */
export function slopeAt(
  dem: Dem,
  lon: number,
  lat: number,
): { ux: number; uy: number; grade: number } {
  // Un píxel del DEM, expresado en grados a esta latitud.
  const dLat = dem.manifest.metersPerPixel / M_PER_DEG_LAT
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))

  const e = elevationAt(dem, lon + dLon, lat)
  const w = elevationAt(dem, lon - dLon, lat)
  const n = elevationAt(dem, lon, lat + dLat)
  const s = elevationAt(dem, lon, lat - dLat)
  if (e === null || w === null || n === null || s === null) return { ux: 0, uy: 0, grade: 0 }

  const stepM = dem.manifest.metersPerPixel * 2
  const gx = (e - w) / stepM
  const gy = (n - s) / stepM
  const grade = Math.hypot(gx, gy)
  if (grade < 1e-6) return { ux: 0, uy: 0, grade: 0 }
  return { ux: gx / grade, uy: gy / grade, grade }
}

/** Viento del campo en un punto, en m/s. Fuera del campo, calma. */
function windAt(field: WindField | null, lon: number, lat: number): { u: number; v: number } {
  if (!field) return { u: 0, v: 0 }
  const [w, s, e, n] = field.bounds
  const fx = ((lon - w) / (e - w)) * (field.width - 1)
  const fy = ((n - lat) / (n - s)) * (field.height - 1)
  if (!(fx >= 0 && fy >= 0 && fx <= field.width - 1 && fy <= field.height - 1)) {
    return { u: 0, v: 0 }
  }
  const x = Math.round(fx)
  const y = Math.round(fy)
  const k = y * field.width + x
  return { u: field.u[k], v: field.v[k] }
}

export interface StepOptions {
  dem: Dem
  field: VaporField
  wind: WindField | null
  breath: Breath
  spawn: SpawnBounds
  /** Segundos transcurridos. Se recorta a `MAX_DT`. */
  dt: number
  /** Multiplicador del tiempo. Lo usa la reproducción acelerada de 24 h. */
  timeScale?: number
  random?: () => number
}

/**
 * El sistema de partículas.
 *
 * Arreglos paralelos y no objetos, por lo mismo que en `wind/particles.ts`: son
 * varios miles y el recolector de basura se nota más que el dibujo.
 */
export class VaporParticles {
  readonly lon: Float32Array
  readonly lat: Float32Array
  /** Altitud en metros sobre el nivel del mar. */
  readonly alt: Float32Array
  /** Cota del suelo bajo la partícula, en metros. La necesita el dibujo. */
  readonly ground: Float32Array
  /** Cuánto lleva viva, en segundos simulados. */
  readonly age: Float32Array
  /** Cuánto va a vivir. */
  readonly life: Float32Array
  /** Demanda evaporativa del sitio donde nació, de 0 a 1. Decide su opacidad. */
  readonly weight: Float32Array
  /** Aleatorio fijo por partícula, para que no todas sean del mismo tamaño. */
  readonly seed: Float32Array
  /** Longitud y latitud del foco del que sale cada partícula. Ver `VENT_COUNT`. */
  private readonly ventLon: Float32Array
  private readonly ventLat: Float32Array
  /** Un foco sin estrenar vale NaN y se busca en el primer renacimiento. */
  /** Cuántas están vivas y dibujables. */
  count = 0

  constructor(readonly capacity: number) {
    this.lon = new Float32Array(capacity)
    this.lat = new Float32Array(capacity)
    this.alt = new Float32Array(capacity)
    this.ground = new Float32Array(capacity)
    this.age = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.weight = new Float32Array(capacity)
    this.seed = new Float32Array(capacity)
    this.ventLon = new Float32Array(VENT_COUNT).fill(NaN)
    this.ventLat = new Float32Array(VENT_COUNT).fill(NaN)
    // Nacen ya muertas: el primer paso las reparte por la vista actual, en vez
    // de sembrarlas en un rectángulo que a lo mejor no se está mirando.
    this.age.fill(Infinity)
    this.life.fill(1)
  }

  /**
   * Un paso de simulación.
   *
   * Recorre TODAS las partículas del cupo, no solo las vivas: una que muere en
   * este paso vuelve a nacer en el mismo, así que la capa no adelgaza al
   * atravesar una zona sin demanda y volver a otra que sí la tiene.
   */
  step(opts: StepOptions): void {
    const { dem, field, wind, breath, spawn } = opts
    const rnd = opts.random ?? Math.random
    const dt = Math.min(MAX_DT, Math.max(0, opts.dt)) * (opts.timeScale ?? 1)
    // La subida es más rápida que la bajada; el signo lo pone la respiración.
    const vertical =
      breath.flow >= 0
        ? breath.flow * MAX_UPDRAFT_MS
        : breath.flow * MAX_UPDRAFT_MS * KATABATIC_RATIO

    let alive = 0
    for (let i = 0; i < this.capacity; i++) {
      this.age[i] += dt

      const dead =
        this.age[i] >= this.life[i] ||
        this.alt[i] > field.ceilingM ||
        this.weight[i] <= 0
      if (dead) {
        if (!this.respawn(i, dem, field, spawn, rnd)) continue
      }

      const lon = this.lon[i]
      const lat = this.lat[i]
      const ground = elevationAt(dem, lon, lat)
      if (ground === null || ground <= SEA_LEVEL_M) {
        // Se ha salido al mar: se la da por consumida y renacerá en el próximo
        // paso. Dibujar bruma sobre el océano sería inventar lo que estas
        // estaciones no miden.
        this.age[i] = Infinity
        continue
      }
      this.ground[i] = ground

      const slope = slopeAt(dem, lon, lat)
      // Una ladera tumbada apenas canaliza; una pared lo hace del todo. La
      // tangente se satura a 0,5 (~27°), que en esta isla es pendiente de
      // ladera normal y no de acantilado.
      const channel = Math.min(1, slope.grade / 0.5)

      const w = windAt(wind, lon, lat)
      // Anabática sube por la pendiente; catabática baja por ella. El signo de
      // la respiración se encarga de las dos.
      const drift = SLOPE_DRIFT_MS * channel * breath.flow
      const uMs = w.u * WIND_COUPLING + slope.ux * drift
      const vMs = w.v * WIND_COUPLING + slope.uy * drift

      const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180))
      this.lon[i] = lon + ((uMs * dt) / (M_PER_DEG_LAT * cos))
      this.lat[i] = lat + (vMs * dt) / M_PER_DEG_LAT

      // La componente vertical crece con la pendiente y con la demanda: una
      // ladera llana y húmeda no levanta nada.
      this.alt[i] += vertical * dt * (0.35 + 0.65 * channel) * this.weight[i]
      // Nunca por debajo del suelo. Una partícula enterrada se dibujaría dentro
      // de la montaña, que es exactamente el defecto por el que la capa de
      // viento está apagada en 3D.
      if (this.alt[i] < ground + 1) this.alt[i] = ground + 1

      alive++
    }
    this.count = alive
  }

  /**
   * Busca un foco válido y pone la partícula a su alrededor.
   *
   * Muestreo por rechazo para elegir el foco: se prueban unos cuantos sitios y
   * se acepta el primero cuya demanda supere una tirada. Así los focos aparecen
   * donde más evapora, sin tener que construir una distribución acumulada en
   * cada refresco del modelo.
   */
  private respawn(
    i: number,
    dem: Dem,
    field: VaporField,
    spawn: SpawnBounds,
    rnd: () => number,
  ): boolean {
    const v = i % VENT_COUNT
    let lon = this.ventLon[v]
    let lat = this.ventLat[v]

    // Se busca foco nuevo si no tiene, si se ha quedado fuera de la vista, o de
    // vez en cuando porque sí: ver `VENT_DRIFT`.
    const outside =
      !(lon >= spawn.west && lon <= spawn.east && lat >= spawn.south && lat <= spawn.north)
    if (Number.isNaN(lon) || outside || rnd() < VENT_DRIFT) {
      let found = false
      for (let intento = 0; intento < 24; intento++) {
        const cLon = spawn.west + (spawn.east - spawn.west) * rnd()
        const cLat = spawn.south + (spawn.north - spawn.south) * rnd()
        const ground = elevationAt(dem, cLon, cLat)
        if (ground === null || ground <= SEA_LEVEL_M) continue
        // Por encima del techo de condensación no nace nada: ahí ya es nube.
        if (ground >= field.ceilingM) continue
        if (rnd() > demandAt(field, cLon, cLat)) continue
        lon = cLon
        lat = cLat
        found = true
        break
      }
      if (!found) {
        this.weight[i] = 0
        return false
      }
      this.ventLon[v] = lon
      this.ventLat[v] = lat
    }

    // Alrededor del foco, con más densidad en el centro: dos tiradas sumadas
    // dan una campana barata y la columna sale con el borde deshecho en vez de
    // con el canto de un disco.
    const jitterLat = (VENT_RADIUS_M * (rnd() + rnd() - 1)) / M_PER_DEG_LAT
    const jitterLon =
      jitterLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180)) * (rnd() < 0.5 ? -1 : 1)
    const pLon = lon + jitterLon
    const pLat = lat + jitterLat

    const ground = elevationAt(dem, pLon, pLat)
    if (ground === null || ground <= SEA_LEVEL_M || ground >= field.ceilingM) {
      this.weight[i] = 0
      return false
    }
    const demand = demandAt(field, pLon, pLat)
    if (demand <= 0.02) {
      this.weight[i] = 0
      return false
    }

    this.lon[i] = pLon
    this.lat[i] = pLat
    this.ground[i] = ground
    this.alt[i] = ground + SPAWN_ABOVE_GROUND_M
    this.age[i] = 0
    // Las que nacen donde más evapora viven más: la columna se ve más alta
    // justo donde el dato dice que hay más que evaporar.
    this.life[i] = MAX_LIFE_S * (0.35 + 0.65 * demand) * (0.6 + 0.8 * rnd())
    this.weight[i] = demand
    this.seed[i] = rnd()
    return true
  }
}
