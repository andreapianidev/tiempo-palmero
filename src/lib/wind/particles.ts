/**
 * Simulación de partículas del viento. Sin WebGL ni MapLibre: solo posiciones.
 *
 * Se separa del dibujo para poder probarla. Lo que se puede afirmar de un
 * sistema de partículas —que no se salen del campo, que las de zonas sin viento
 * se reciclan en vez de quedarse clavadas, que la estela sigue al punto— se
 * comprueba aquí con números, no mirando la pantalla.
 *
 * LA VELOCIDAD EN PANTALLA ES UNA CONVENCIÓN, NO UNA MEDIDA. Un viento real de
 * 5 m/s tarda dos horas y media en cruzar los 45 km de la isla: dibujado a
 * escala, el mapa parecería congelado. Las partículas van exageradas para que
 * el movimiento se lea, y por eso la velocidad de verdad se comunica por el
 * COLOR y por la cifra del panel, nunca por lo rápido que corre el dibujo.
 */

import { sampleField, speedOf, type WindField } from './field'

export interface ParticleBounds {
  west: number
  south: number
  east: number
  north: number
}

/** Cuántas posiciones antiguas guarda cada partícula para dibujar la estela. */
export const TAIL_LENGTH = 14

/** Por debajo de esto la partícula no se mueve y ocupa sitio sin decir nada.
 *  0,05 y no 0,15: con el umbral alto, las zonas resguardadas del interior se
 *  quedaban sin una sola partícula —un agujero en el mapa que parecía un fallo
 *  de datos— cuando lo que hay ahí es calma, que también es información. */
const MIN_SPEED_MS = 0.05

export interface StepOptions {
  /** Dónde pueden nacer las partículas: normalmente la vista actual. */
  spawn: ParticleBounds
  /**
   * Cuántos grados de latitud recorre por segundo una partícula por cada m/s
   * de viento. Lo calcula quien dibuja, a partir del zoom, para que el
   * movimiento en pantalla sea parecido a cualquier escala.
   */
  degPerSecondPerMs: number
  /** Segundos transcurridos desde el paso anterior. */
  dt: number
}

export class ParticleSystem {
  readonly count: number
  /** Posición actual, `[lon, lat]` por partícula. */
  readonly lon: Float32Array
  readonly lat: Float32Array
  /** Velocidad de la última lectura del campo, m/s. Sirve para el color. */
  readonly speed: Float32Array
  /** Cuánto de la última lectura lo sostienen estaciones reales, 0–1. */
  readonly station: Float32Array
  /** Estela: `TAIL_LENGTH` posiciones por partícula, la 0 es la más reciente. */
  readonly tailLon: Float32Array
  readonly tailLat: Float32Array
  /** Cuántas posiciones válidas tiene la estela ahora mismo. */
  readonly tailFill: Uint8Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly random: () => number

  constructor(count: number, random: () => number = Math.random) {
    this.count = count
    this.lon = new Float32Array(count)
    this.lat = new Float32Array(count)
    this.speed = new Float32Array(count)
    this.station = new Float32Array(count)
    this.tailLon = new Float32Array(count * TAIL_LENGTH)
    this.tailLat = new Float32Array(count * TAIL_LENGTH)
    this.tailFill = new Uint8Array(count)
    this.age = new Float32Array(count)
    this.life = new Float32Array(count)
    this.random = random
  }

  /**
   * Coloca una partícula en un punto al azar de `spawn` y le da una vida nueva.
   *
   * Las vidas son distintas entre sí a propósito: con una vida común todas
   * desaparecerían a la vez y el mapa parpadearía entero cada pocos segundos.
   */
  respawn(index: number, spawn: ParticleBounds): void {
    this.lon[index] = spawn.west + this.random() * (spawn.east - spawn.west)
    this.lat[index] = spawn.south + this.random() * (spawn.north - spawn.south)
    this.age[index] = 0
    this.life[index] = 1.5 + this.random() * 2.5
    this.tailFill[index] = 0
    this.speed[index] = 0
    this.station[index] = 0
  }

  reset(spawn: ParticleBounds): void {
    for (let i = 0; i < this.count; i++) {
      this.respawn(i, spawn)
      // Se reparten las edades para que el reciclaje no venga en oleadas.
      this.age[i] = this.random() * this.life[i]
    }
  }

  step(field: WindField, opts: StepOptions): void {
    const { spawn, degPerSecondPerMs, dt } = opts

    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt
      if (this.age[i] > this.life[i]) {
        this.respawn(i, spawn)
        continue
      }

      const reading = sampleField(field, this.lon[i], this.lat[i])
      if (!reading) {
        // Se ha salido del campo: no se arrastra el último viento conocido.
        this.respawn(i, spawn)
        continue
      }

      const sp = speedOf(reading.u, reading.v)
      if (sp < MIN_SPEED_MS) {
        this.respawn(i, spawn)
        continue
      }
      this.speed[i] = sp
      this.station[i] = reading.station

      // La estela se desplaza antes de mover el punto: la posición 0 pasa a
      // ser la 1, y la nueva posición entra en la 0.
      const base = i * TAIL_LENGTH
      for (let k = TAIL_LENGTH - 1; k > 0; k--) {
        this.tailLon[base + k] = this.tailLon[base + k - 1]
        this.tailLat[base + k] = this.tailLat[base + k - 1]
      }
      this.tailLon[base] = this.lon[i]
      this.tailLat[base] = this.lat[i]
      if (this.tailFill[i] < TAIL_LENGTH) this.tailFill[i]++

      // Un grado de longitud mide menos que uno de latitud, y cada vez menos
      // según se sube: sin el coseno las partículas derivarían hacia el este.
      const cos = Math.max(0.2, Math.cos((this.lat[i] * Math.PI) / 180))
      const boost = speedBoost(sp)
      this.lon[i] += (reading.u * boost * degPerSecondPerMs * dt) / cos
      this.lat[i] += reading.v * boost * degPerSecondPerMs * dt

      // El salto puede haberla dejado fuera del campo. Se comprueba AQUÍ y no
      // al principio del paso siguiente: si no, la partícula se queda un
      // fotograma dibujada donde no hay dato, y a zoom alto ese fotograma es
      // una estela entera cruzando el borde.
      const [west, south, east, north] = field.bounds
      if (
        this.lon[i] < west ||
        this.lon[i] > east ||
        this.lat[i] < south ||
        this.lat[i] > north
      ) {
        this.respawn(i, spawn)
      }
    }
  }
}

/**
 * Cuánto debe correr una partícula para que el movimiento se lea igual a
 * cualquier zoom.
 *
 * Se ata al ALTO DE LA VISTA, no a una constante en grados: al acercarse, la
 * misma velocidad geográfica cruzaría la pantalla en un parpadeo. Con esto una
 * partícula de 10 m/s tarda aproximadamente `SECONDS_TO_CROSS` segundos en
 * recorrer la vista, se vea la isla entera o un solo barranco.
 */
// 10 s y no 14: la estela mide `TAIL_LENGTH` fotogramas de recorrido, así que
// el tiempo de travesía fija su longitud EN PÍXELES. Con 14 s, a zoom alto y
// con el viento flojo del interior la estela bajaba de cuatro píxeles y el
// halo se la comía; con 10 s son unos veinte a 10 m/s y nueve a 2 m/s.
const SECONDS_TO_CROSS = 10
const REFERENCE_SPEED_MS = 10

export function degPerSecondPerMs(viewportHeightDeg: number): number {
  return viewportHeightDeg / SECONDS_TO_CROSS / REFERENCE_SPEED_MS
}

/**
 * Compresión de la escala de velocidad, solo para el dibujo.
 *
 * Con el desplazamiento proporcional a la velocidad, los 2 m/s del interior de
 * la isla dejaban una estela de dos píxeles: sobre la malla interpolada eso no
 * es una estela, es ruido, y el mapa parecía tener viento solo en el mar. La
 * exageración pasa a ser `v^0.6`, que mantiene el orden —más viento sigue
 * corriendo más— y sube 1,9 veces el flojo sin tocar el fuerte.
 *
 * Se puede hacer porque la velocidad NO se comunica con la animación: la dicen
 * el color del trazo y la cifra del panel. Esto es solo legibilidad.
 */
const SPEED_EXPONENT = 0.6

export function speedBoost(speedMs: number): number {
  if (speedMs <= 0) return 0
  return (
    (REFERENCE_SPEED_MS * Math.pow(speedMs / REFERENCE_SPEED_MS, SPEED_EXPONENT)) / speedMs
  )
}
