/**
 * Simulación de partículas del viento. Sin WebGL ni MapLibre: solo posiciones.
 *
 * Se separa del dibujo para poder probarla. Lo que se puede afirmar de un
 * sistema de partículas —que no se salen del campo, que las de zonas sin viento
 * se reciclan en vez de quedarse clavadas, que la estela sigue al punto— se
 * comprueba aquí con números, no mirando la pantalla.
 *
 * LA VELOCIDAD EN PANTALLA ES EL VIENTO MEDIDO, ACELERADO. Un viento real de
 * 5 m/s tarda dos horas y media en cruzar los 45 km de la isla: a escala real
 * el mapa parecería congelado, así que el tiempo corre más deprisa —cuánto lo
 * dice `timeAcceleration`— pero corre igual para todas las partículas. Eso es
 * lo único que hay que respetar para que el dibujo no mienta: **el doble de
 * viento son el doble de píxeles por segundo y el doble de estela**, en el
 * mismo fotograma y en cualquier sitio del mapa.
 *
 * Hasta el 13 de agosto de 2026 no era así: el desplazamiento pasaba por una
 * compresión `v^0.6` que subía un 90 % el viento flojo y dejaba quieto el
 * fuerte, para que la calma del interior no se viera parada. Con eso, dos
 * estelas que corrían igual podían ser 4 y 9 m/s, y la animación —que es lo
 * primero que se mira— decía algo que los datos no dicen. La legibilidad del
 * viento flojo se resuelve ahora donde toca: alargando la EXPOSICIÓN de la
 * estela (`TAIL_INTERVAL_S`), que no toca la velocidad de nadie.
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

/**
 * Cada cuánto se apunta una posición en la estela, en segundos. Con
 * `TAIL_LENGTH` posiciones, la estela es la EXPOSICIÓN de los últimos
 * `TAIL_LENGTH * TAIL_INTERVAL_S` = 0,56 s de trayectoria.
 *
 * Antes se apuntaba una por fotograma, así que la exposición la fijaba la tasa
 * de refresco: 0,22 s a 60 Hz y 0,11 s en una pantalla de 120, o sea que la
 * misma racha salía con la mitad de estela en un portátil más nuevo. Ahora la
 * estela mide lo mismo en todas.
 *
 * El 0,04 está medido contra las dos orillas, a la escala de la isla en una
 * ventana de 900 px de alto, donde cada m/s son 9 px/s:
 *
 *   - viento flojo del interior, 2 m/s → 10 px de estela. Con la exposición de
 *     fotograma y la compresión antigua eran 7,4 px, y de esos el halo se comía
 *     la mitad: por eso el interior parecía vacío.
 *   - racha fuerte, 14 m/s → 71 px, frente a los 25 de antes. Es larga, y tiene
 *     que serlo: son exactamente siete veces la del flojo, que es la proporción
 *     que miden los anemómetros.
 */
export const TAIL_INTERVAL_S = 0.04

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
  /**
   * Cota del terreno en metros, si hace falta saberla.
   *
   * Solo la pasa quien dibuja en tres dimensiones. Se apunta AQUÍ y no en el
   * dibujo porque un punto de estela no se mueve nunca después de apuntado: su
   * cota se lee una vez y sirve para todos los fotogramas en los que esa estela
   * siga viva. Al revés —leyéndola al dibujar— serían 42.000 consultas al
   * modelo de elevación por fotograma en vez de 4.200.
   */
  elevationAt?: (lon: number, lat: number) => number
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
  /** Cota del terreno bajo la posición actual, en metros. Cero sin muestreador. */
  readonly elevation: Float32Array
  /** Estela: `TAIL_LENGTH` posiciones por partícula, la 0 es la más reciente. */
  readonly tailLon: Float32Array
  readonly tailLat: Float32Array
  /** La cota de cada punto de la estela, apuntada con él. */
  readonly tailElevation: Float32Array
  /** Cuántas posiciones válidas tiene la estela ahora mismo. */
  readonly tailFill: Uint8Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly random: () => number
  /** Segundos acumulados desde la última posición apuntada en las estelas. */
  private sinceTail = 0

  constructor(count: number, random: () => number = Math.random) {
    this.count = count
    this.lon = new Float32Array(count)
    this.lat = new Float32Array(count)
    this.speed = new Float32Array(count)
    this.station = new Float32Array(count)
    this.elevation = new Float32Array(count)
    this.tailLon = new Float32Array(count * TAIL_LENGTH)
    this.tailLat = new Float32Array(count * TAIL_LENGTH)
    this.tailElevation = new Float32Array(count * TAIL_LENGTH)
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
  respawn(
    index: number,
    spawn: ParticleBounds,
    elevationAt?: (lon: number, lat: number) => number,
  ): void {
    this.lon[index] = spawn.west + this.random() * (spawn.east - spawn.west)
    this.lat[index] = spawn.south + this.random() * (spawn.north - spawn.south)
    this.age[index] = 0
    this.life[index] = 1.5 + this.random() * 2.5
    this.tailFill[index] = 0
    this.speed[index] = 0
    this.station[index] = 0
    // La cota se lee YA, en el mismo sitio donde se pone la partícula. Dejarla
    // a cero «porque todavía no se dibuja» funcionaba —una partícula sin estela
    // no se pinta— pero dejaba el sistema en un estado que no se cumple a sí
    // mismo, y eso es una trampa esperando a que alguien lea `elevation` un
    // fotograma antes de lo previsto.
    this.elevation[index] = elevationAt ? elevationAt(this.lon[index], this.lat[index]) : 0
  }

  reset(spawn: ParticleBounds, elevationAt?: (lon: number, lat: number) => number): void {
    for (let i = 0; i < this.count; i++) {
      this.respawn(i, spawn, elevationAt)
      // Se reparten las edades para que el reciclaje no venga en oleadas.
      this.age[i] = this.random() * this.life[i]
    }
  }

  step(field: WindField, opts: StepOptions): void {
    const { spawn, degPerSecondPerMs, dt, elevationAt } = opts

    // La estela se apunta por reloj, no por fotograma: así mide lo mismo en una
    // pantalla de 60 Hz que en una de 120. Se resta el intervalo en vez de
    // poner el acumulador a cero para que la cadencia media no derive.
    this.sinceTail += dt
    const record = this.sinceTail >= TAIL_INTERVAL_S
    if (record) this.sinceTail = Math.max(0, this.sinceTail - TAIL_INTERVAL_S)

    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt
      if (this.age[i] > this.life[i]) {
        this.respawn(i, spawn, elevationAt)
        continue
      }

      const reading = sampleField(field, this.lon[i], this.lat[i])
      if (!reading) {
        // Se ha salido del campo: no se arrastra el último viento conocido.
        this.respawn(i, spawn, elevationAt)
        continue
      }

      const sp = speedOf(reading.u, reading.v)
      if (sp < MIN_SPEED_MS) {
        this.respawn(i, spawn, elevationAt)
        continue
      }
      this.speed[i] = sp
      this.station[i] = reading.station
      // La cota se lee DOS veces por partícula y fotograma, y no es un
      // descuido: la estela apunta la posición de ANTES de moverse, así que
      // necesita la cota de ese punto; y la cabeza se dibuja en la posición de
      // DESPUÉS. Con una sola lectura, la cabeza iba a la altura del sitio del
      // que venía, y a 600 aumentos eso son 100 m de terreno por fotograma:
      // sobre una ladera de Cumbre Nueva, 50 m de error vertical.
      if (elevationAt) this.elevation[i] = elevationAt(this.lon[i], this.lat[i])

      // La estela se desplaza antes de mover el punto: la posición 0 pasa a
      // ser la 1, y la nueva posición entra en la 0.
      if (record) {
        const base = i * TAIL_LENGTH
        for (let k = TAIL_LENGTH - 1; k > 0; k--) {
          this.tailLon[base + k] = this.tailLon[base + k - 1]
          this.tailLat[base + k] = this.tailLat[base + k - 1]
          this.tailElevation[base + k] = this.tailElevation[base + k - 1]
        }
        this.tailLon[base] = this.lon[i]
        this.tailLat[base] = this.lat[i]
        this.tailElevation[base] = this.elevation[i]
        if (this.tailFill[i] < TAIL_LENGTH) this.tailFill[i]++
      }

      // Un grado de longitud mide menos que uno de latitud, y cada vez menos
      // según se sube: sin el coseno las partículas derivarían hacia el este.
      // El desplazamiento es PROPORCIONAL a `reading`, sin retocar: la única
      // constante que entra aquí es `degPerSecondPerMs`, y es la misma para
      // todas las partículas del fotograma.
      const cos = Math.max(0.2, Math.cos((this.lat[i] * Math.PI) / 180))
      this.lon[i] += (reading.u * degPerSecondPerMs * dt) / cos
      this.lat[i] += reading.v * degPerSecondPerMs * dt

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
        this.respawn(i, spawn, elevationAt)
        continue
      }

      if (elevationAt) this.elevation[i] = elevationAt(this.lon[i], this.lat[i])
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
// 10 s y no 14: la estela mide `TAIL_LENGTH * TAIL_INTERVAL_S` de recorrido,
// así que el tiempo de travesía fija su longitud EN PÍXELES. Con 14 s, a zoom
// alto y con el viento flojo del interior la estela bajaba de cuatro píxeles y
// el halo se la comía; con 10 s son 71 px a 14 m/s y 10 px a 2 m/s.
const SECONDS_TO_CROSS = 10
const REFERENCE_SPEED_MS = 10

export function degPerSecondPerMs(viewportHeightDeg: number): number {
  return viewportHeightDeg / SECONDS_TO_CROSS / REFERENCE_SPEED_MS
}

/** Metros que mide un grado de latitud. El mismo que usa `field.ts`. */
const METERS_PER_DEG_LAT = 110_574

/**
 * Cuántas veces más deprisa que el reloj corre la animación en una vista de
 * `viewportHeightDeg` de alto.
 *
 * ESTE ES EL NÚMERO QUE HACE HONESTO EL DIBUJO. Las partículas van a la
 * velocidad medida multiplicada por esta cifra —y solo por esta cifra—, así
 * que una estela que corre el doble que otra lleva el doble de viento. Como
 * depende del zoom, se dice en el panel en vez de dejarlo escrito en un
 * comentario: a la escala de la isla (0,55° de alto) son unas 600 veces, y
 * acercándose a un barranco (0,05°) unas 55.
 */
export function timeAcceleration(viewportHeightDeg: number): number {
  return degPerSecondPerMs(viewportHeightDeg) * METERS_PER_DEG_LAT
}
