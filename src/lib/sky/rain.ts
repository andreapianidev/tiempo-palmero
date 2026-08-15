/**
 * La lluvia: hilos que caen de las nubes que llueven, hasta el suelo que hay.
 *
 * DE DÓNDE SALE CADA COSA. La lluvia es dato —`precipitation` del modelo, mm en
 * la última hora, interpolada al sitio de cada nube en `scene.ts`—; el número de
 * hilos y su grosor son dibujo. Un milímetro de lluvia en una hora son del orden
 * de mil gotas por metro cúbico: dibujarlas de verdad no cabe en ninguna tarjeta
 * y tampoco se parecería a nada, porque a diez kilómetros de distancia la lluvia
 * no se ve como gotas sino como un VELO. Eso es lo que se dibuja, y la
 * intensidad del velo es lo que va atado a los milímetros.
 *
 * LA VELOCIDAD DE CAÍDA SÍ ES REAL: 7 m/s, que es la velocidad terminal de una
 * gota de lluvia de 2 mm a nivel del mar. No se ha acelerado para que «se note
 * más». Desde una base de nube a 1200 m sobre un suelo a 400, un hilo tarda unos
 * dos minutos en llegar, y eso es exactamente lo que hace que la lluvia se lea
 * como una cortina que cuelga y no como una lluvia de videojuego.
 *
 * Y SE INCLINA CON EL VIENTO, porque la gota va dentro del aire: cada hilo se
 * desplaza con el mismo viento de su estrato que arrastra la nube de la que
 * cae. Es lo que hace que la cortina salga sesgada bajo el alisio en vez de
 * caer a plomo, que es como no cae nunca en esta isla.
 *
 * PARA CUANDO TOCA EL SUELO. Cada hilo conoce la cota del terreno bajo él —el
 * mismo DEM que ya sombrea el mapa— y desaparece al alcanzarla. Sin eso, la
 * lluvia atravesaría la Cumbre y se vería llover por dentro de la montaña, que
 * es el mismo fallo que la capa de viento tuvo que arreglar en su día.
 */

import { elevationAt, type Dem } from '../dem'
import { RAIN_HEAVY_MM } from './field'
import type { Cloud } from './scene'

/**
 * Velocidad terminal de una gota de lluvia, m/s.
 *
 * 7 m/s corresponde a una gota de ~2 mm de diámetro a nivel del mar, que es el
 * tamaño típico de la lluvia (la llovizna cae a 1-2 m/s, el chubasco fuerte con
 * gotas de 5 mm llega a 9). Un solo valor para toda la lluvia es una
 * simplificación, pero es una simplificación dentro del rango real.
 */
const FALL_SPEED_MS = 7

/**
 * Cuántos hilos como mucho. Tope de coste, igual que el de las nubes.
 *
 * 6000 segmentos son 12 000 vértices: la mitad de lo que ya dibuja la capa de
 * viento con sus estelas.
 */
export const RAIN_CAPACITY = 6000

/**
 * Largo de un hilo, m. Dibujo puro.
 *
 * 140 m. A zoom 12 sobre esta latitud son 33,5 m por píxel, así que un hilo mide
 * unos 4 px: se lee como un trazo y no como un punto, y al acercarse crece con
 * el resto de la escena. Más largo empieza a parecer granizo con estelas.
 */
const STREAK_M = 140

/**
 * Milímetros a partir de los cuales la cortina va a su densidad máxima.
 *
 * Se reutiliza el umbral de lluvia intensa —3,5 mm/h, medido sobre dos años de
 * archivo en `field.ts`— en vez de inventar otro número aquí. Es la misma
 * frontera contando lo mismo: por encima de ella, en esta isla, ya no queda casi
 * nada, así que es donde el dibujo tiene que estar al máximo.
 */
const FULL_INTENSITY_MM = RAIN_HEAVY_MM

/** Fracción de la cortina que se reparte por cada nube que llueve. */
interface RainSource {
  cloud: Cloud
  /** Radio del área bajo la que cae, m. */
  radiusM: number
  /** Cuota de hilos que le tocan. */
  share: number
}

export class RainDrops {
  readonly capacity: number
  /** Posición de la cabeza del hilo. La cola va `STREAK_M` por encima. */
  readonly lon: Float32Array
  readonly lat: Float32Array
  readonly alt: Float32Array
  /** Cota del terreno bajo el hilo, m. Donde muere. */
  readonly ground: Float32Array
  /** Opacidad, 0-1. Cero = hilo apagado. */
  readonly alpha: Float32Array
  /** Viento que lo inclina, m/s. */
  readonly u: Float32Array
  readonly v: Float32Array

  private sources: RainSource[] = []
  private totalShare = 0

  constructor(capacity = RAIN_CAPACITY) {
    this.capacity = capacity
    this.lon = new Float32Array(capacity)
    this.lat = new Float32Array(capacity)
    this.alt = new Float32Array(capacity)
    this.ground = new Float32Array(capacity)
    this.alpha = new Float32Array(capacity)
    this.u = new Float32Array(capacity)
    this.v = new Float32Array(capacity)
  }

  /**
   * Qué nubes llueven y cuánta cortina le toca a cada una.
   *
   * La cuota va con la intensidad, no a partes iguales: una nube que descarga
   * 3 mm/h tiene que verse más cargada que una que gotea 0,1, y si se repartiera
   * por igual las dos saldrían idénticas y la cifra no significaría nada.
   */
  setClouds(clouds: readonly Cloud[]): void {
    this.sources = []
    this.totalShare = 0
    for (const cloud of clouds) {
      if (cloud.precipMm <= 0) continue
      const share = Math.min(1, cloud.precipMm / FULL_INTENSITY_MM)
      // El radio bajo el que cae es el de la nube: la cortina tiene la anchura
      // de lo que hay encima, no una anchura de catálogo. Viene en la propia
      // nube; antes se deducía recorriendo las motas y buscando la más lejana,
      // que daba un radio distinto —el del reparto que le tocara— para nubes
      // que el modelo había hecho del mismo tamaño.
      this.sources.push({ cloud, radiusM: Math.max(300, cloud.radiusM), share })
      this.totalShare += share
    }
    // Las que ya estaban cayendo se apagan: pertenecían a nubes de la escena
    // anterior, que ya no existen. Reaparecen en el paso siguiente bajo las
    // nuevas, y como el reparto es aleatorio no se nota un corte.
    this.alpha.fill(0)
  }

  /** Cuántos hilos deberían estar encendidos ahora mismo. */
  private activeTarget(): number {
    if (!this.sources.length) return 0
    // La cortina total crece con la suma de intensidades, saturando: veinte
    // nubes lloviendo a la vez no pueden pedir más hilos de los que hay.
    return Math.min(this.capacity, Math.round(this.capacity * Math.min(1, this.totalShare / 6)))
  }

  /** Enciende un hilo bajo una de las nubes que llueven, elegida por su cuota. */
  private spawn(i: number, dem: Dem | null, rand: () => number): void {
    let pick = rand() * this.totalShare
    let source = this.sources[this.sources.length - 1]
    for (const s of this.sources) {
      pick -= s.share
      if (pick <= 0) {
        source = s
        break
      }
    }
    if (!source) return

    const { cloud, radiusM } = source
    // Reparto uniforme en el disco: `√u`, no `u`. Sin la raíz, la cortina se
    // apelotona en el centro y deja el borde de la nube seco.
    const r = radiusM * Math.sqrt(rand())
    const theta = rand() * Math.PI * 2
    const mPerDegLon = 111_320 * Math.cos((cloud.lat * Math.PI) / 180)
    const lon = cloud.lon + (Math.cos(theta) * r) / mPerDegLon
    const lat = cloud.lat + (Math.sin(theta) * r) / 110_574

    this.lon[i] = lon
    this.lat[i] = lat
    // Nace repartido por la altura de caída, no todos en la base a la vez: si
    // no, la cortina entera aparecería como una franja bajando en bloque.
    const ground = dem ? (elevationAt(dem, lon, lat) ?? 0) : 0
    this.ground[i] = ground
    this.alt[i] = ground + rand() * Math.max(50, cloud.base - ground)
    this.alpha[i] = 0.25 + 0.75 * source.share
    this.u[i] = cloud.u
    this.v[i] = cloud.v
  }

  /**
   * Un paso: caer, inclinarse con el viento, morir al tocar el suelo y volver a
   * nacer hasta llegar al cupo.
   */
  step(dt: number, dem: Dem | null, rand: () => number): void {
    const target = this.activeTarget()
    let alive = 0

    for (let i = 0; i < this.capacity; i++) {
      if (this.alpha[i] > 0) {
        this.alt[i] -= FALL_SPEED_MS * dt
        const mPerDegLon = 111_320 * Math.cos((this.lat[i] * Math.PI) / 180)
        this.lon[i] += (this.u[i] * dt) / mPerDegLon
        this.lat[i] += (this.v[i] * dt) / 110_574
        // El terreno se vuelve a mirar mientras cae: el hilo se ha movido, y
        // sobre una isla con paredes de 74° el suelo de al lado no es el mismo.
        if (dem) this.ground[i] = elevationAt(dem, this.lon[i], this.lat[i]) ?? 0
        if (this.alt[i] <= this.ground[i]) this.alpha[i] = 0
        else alive++
      }
    }

    for (let i = 0; i < this.capacity && alive < target; i++) {
      if (this.alpha[i] > 0) continue
      this.spawn(i, dem, rand)
      if (this.alpha[i] > 0) alive++
    }
  }
}

/** Largo del trazo, para que la capa dibuje la cola en el sitio. */
export const RAIN_STREAK_M = STREAK_M
