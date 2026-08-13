/**
 * El campo que se pinta: susceptibilidad del sitio por peligro del día.
 *
 * AQUÍ SE JUNTAN LAS DOS MITADES, y cada una está medida de una forma distinta:
 *
 *  - **Dónde** — un conjunto de árboles entrenado con los cinco incendios con
 *    perímetro publicado, validado escondiendo un incendio entero (`model.ts`).
 *    No cambia de un día para otro, así que se calcula una vez al cargar la
 *    capa y se guarda.
 *  - **Cuándo** — el percentil del día dentro de veinticuatro años de archivo
 *    (`danger.ts`), a partir de la humedad del combustible fino y del viento
 *    que salen de las estaciones del Cabildo, y de la sequía que sale de un
 *    modelo. Esto sí cambia, y con la hora.
 *
 * EL RESULTADO NO ES UNA PROBABILIDAD Y NO SE LLAMA ASÍ EN NINGÚN SITIO. Es un
 * índice relativo de 0 a 1 que sirve para ordenar sitios entre sí y días entre
 * sí. Leer un 0,4 como «un 40 % de posibilidades» sería leerlo mal, y por eso
 * la ficha del punto separa siempre los dos factores en vez de dar solo el
 * producto.
 *
 * LO QUE NO CONTESTA se dibuja como nada, nunca como cero. Las 1.268 celdas sin
 * combustible clasificado —el 7,2 % de la isla, casi todo en el borde de la
 * costa— se quedan transparentes. Un cero pintado de verde donde no se sabe es
 * el error que más caro sale en una capa de incendios.
 */

import type { Dem } from '../dem'
import { elevationAt } from '../dem'
import { pixelXToLon, pixelYToLat } from '../geo'
import { estimateBundle, type Model } from '../interpolate'
import { sampleField, speedOf, type WindField } from '../wind/field'
import { dangerOf, fireIndex, type Danger } from './danger'
import type { DroughtField } from './fetch'
import { drynessAt } from './fetch'
import { fosbergIndex } from './moisture'
import { susceptibility, type CellInputs } from './model'
import { cellAt, type FireStatic } from './static'
import { reliefAt } from './terrain'

export interface FireSample {
  /** El índice que se pinta, de 0 a 1. */
  index: number
  /** Susceptibilidad del sitio, de 0 a 1. */
  susceptibility: number
  danger: Danger
  inputs: CellInputs
  /** Humedad del combustible fino y el índice de Fosberg que salen de ella. */
  fosberg: number
  /** Días desde la última lluvia apreciable, del modelo. `null` si no se sabe. */
  daysSinceRain: number | null
  /** Cuánto de la velocidad de viento la ponen estaciones y no el modelo, de 0 a 1. */
  windFromStations: number
}

export interface FireFieldInput {
  statics: FireStatic
  dem: Dem
  models: Record<'temperature' | 'relativehumidity', Model | null>
  wind: WindField | null
  drought: DroughtField | null
}

/**
 * Puntúa un punto cualquiera de la isla.
 *
 * Devuelve `null` en cuanto le falta algo con lo que no puede responder: fuera
 * de la malla, sin combustible clasificado, sin altitud, o sin temperatura y
 * humedad interpoladas. No hay valores por defecto en ninguno de los cuatro
 * casos.
 */
export function sampleFire(input: FireFieldInput, lon: number, lat: number): FireSample | null {
  const cell = cellAt(input.statics, lon, lat)
  if (!cell) return null

  const elevation = elevationAt(input.dem, lon, lat)
  if (elevation === null) return null

  const relief = reliefAt(input.dem, lon, lat)
  const inputs: CellInputs = {
    fuel: cell.fuel,
    distanceM: cell.distanceM,
    slopeDeg: cell.slopeDeg,
    southness: relief.southness,
    westness: relief.westness,
    elevationM: elevation,
  }

  const site = susceptibility(input.statics.spec, inputs)
  if (site === null) return null

  const bundle = estimateBundle(input.models, lon, lat, elevation)
  const t = bundle.temperature?.value
  const rh = bundle.relativehumidity?.value
  if (t === undefined || rh === undefined) return null

  // El viento del campo mixto: donde hay estación manda ella, donde no, el
  // modelo. `station` dice cuánto de la cifra es medido, y eso se declara.
  const reading = input.wind ? sampleField(input.wind, lon, lat) : null
  const windMs = reading ? speedOf(reading.u, reading.v) : 0
  const fos = fosbergIndex(t, rh, windMs)
  if (fos === null) return null

  const dry = input.drought ? drynessAt(input.drought, lon, lat) : null
  const danger = dangerOf(input.statics.spec, {
    fosberg: fos,
    daysSinceRain: dry?.daysSinceRain ?? null,
  })
  const index = fireIndex(site, danger)
  if (index === null || danger === null) return null

  return {
    index,
    susceptibility: site,
    danger,
    inputs,
    fosberg: fos,
    daysSinceRain: dry?.daysSinceRain ?? null,
    windFromStations: reading?.station ?? 0,
  }
}

/**
 * El cierre que `rasterizeGrid` recorre celda a celda.
 *
 * Se devuelve una función y no una malla ya calculada porque es exactamente lo
 * que el resto del mapa hace con la temperatura: quien decide el paso y el
 * recorte es el rasterizador, no esto.
 */
export function fireValueAt(
  input: FireFieldInput,
): (lon: number, lat: number, elevation: number) => number | null {
  // De 0 a 100, que es la escala en la que están la paleta y todo lo que se
  // enseña. Internamente el índice es de 0 a 1 porque sale de multiplicar dos
  // cosas de 0 a 1, y el sitio de convertirlo es éste: la frontera con lo que
  // se dibuja.
  return (lon, lat) => {
    const s = sampleFire(input, lon, lat)
    return s ? s.index * 100 : null
  }
}

/**
 * Reparto del índice sobre la isla, para que el panel diga en qué está hoy.
 *
 * Se recorre la malla con un paso más grueso que la del mapa —una de cada
 * cuatro celdas— porque una mediana no necesita 17.545 muestras y esto se
 * recalcula cada vez que llega una lectura nueva.
 */
export function fireStats(
  input: FireFieldInput,
): { median: number; p90: number; max: number; cells: number } | null {
  const g = input.statics.spec.grid
  const values: number[] = []
  for (let row = 0; row < g.rows; row += 2) {
    const lat = pixelYToLat(g.originY + row * g.step + g.step / 2, g.zoom)
    for (let col = 0; col < g.cols; col += 2) {
      const lon = pixelXToLon(g.originX + col * g.step + g.step / 2, g.zoom)
      const s = sampleFire(input, lon, lat)
      if (s) values.push(s.index)
    }
  }
  if (!values.length) return null
  values.sort((a, b) => a - b)
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]
  return { median: at(0.5), p90: at(0.9), max: values[values.length - 1], cells: values.length }
}
