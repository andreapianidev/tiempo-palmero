/**
 * La capa estática del modelo: lo que no cambia de un día para otro.
 *
 * Son las dos cosas que el navegador no puede deducir del DEM que ya tiene
 * cargado —el modelo de combustible y la distancia a la vía más cercana— más la
 * pendiente, que sí puede, y que viaja igualmente para poder comprobar que el
 * relieve con el que se entrenó y el que se dibuja son el mismo.
 *
 * VIENE EN UN PNG DE 26 KB, no en un GeoJSON de varios megas. Un píxel por
 * celda de 201 m, 298 × 384, en el mismo retículo que la malla del mapa. Es
 * exactamente el trato que este proyecto ya le da al modelo de elevación: la
 * cartografía pesada se rasteriza en compilación y lo que se descarga es una
 * imagen. Los 217.137 polígonos de cultivos y los 14.153 de modelos de
 * combustible que hay detrás no llegan a salir del `scripts/ml/`.
 *
 * SE LEE OPACO Y ESO IMPORTA. El canal alfa parece el sitio natural para un
 * cuarto dato y no lo es: al leer un PNG por `<canvas>` el navegador puede
 * devolver el color premultiplicado, y con alfa < 255 los otros tres canales
 * vuelven alterados. Con alfa 255 la lectura es byte a byte.
 */

import { dataUrl } from '../endpoints'
import { lonToPixelX, latToPixelY } from '../geo'
import { FUEL_UNKNOWN } from './fuel'
import type { FireModelSpec } from './model'

export interface FireStatic {
  cols: number
  rows: number
  /** Modelo NFFL por celda, `FUEL_UNKNOWN` donde no se sabe. */
  fuel: Uint8Array
  /** Metros a la vía más cercana. */
  distanceM: Uint16Array
  /** Grados de pendiente, tal como los vio el entrenamiento. */
  slopeDeg: Uint8Array
  spec: FireModelSpec
}

/** Lo que hay en una celda, o `null` si el punto cae fuera de la malla. */
export interface StaticCell {
  fuel: number
  distanceM: number
  slopeDeg: number
  col: number
  row: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`capa de incendios: ${src}`))
    img.src = src
  })
}

export async function loadFireStatic(): Promise<FireStatic> {
  const spec: FireModelSpec = await fetch(dataUrl('/fire/model.json')).then((r) => {
    if (!r.ok) throw new Error('falta /fire/model.json — ejecuta scripts/ml/run.py')
    return r.json()
  })

  const img = await loadImage(dataUrl('/fire/static.png'))
  const { cols, rows } = spec.grid
  if (img.width !== cols || img.height !== rows) {
    // El PNG y el JSON salen de la misma pasada de `run.py`, así que discrepar
    // significa que alguien ha desplegado uno sin el otro. Vale más no pintar
    // nada que pintar la isla desplazada media celda.
    throw new Error(`la capa de incendios no cuadra: ${img.width}×${img.height} contra ${cols}×${rows}`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin contexto 2D para la capa de incendios')
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, cols, rows).data

  const fuel = new Uint8Array(cols * rows)
  const distanceM = new Uint16Array(cols * rows)
  const slopeDeg = new Uint8Array(cols * rows)
  for (let i = 0; i < cols * rows; i++) {
    fuel[i] = px[i * 4]
    distanceM[i] = px[i * 4 + 1] * spec.distanceStepM
    slopeDeg[i] = px[i * 4 + 2]
  }

  return { cols, rows, fuel, distanceM, slopeDeg, spec }
}

/**
 * La celda que contiene un punto.
 *
 * Sin interpolar entre celdas vecinas, y a propósito: el modelo de combustible
 * es una categoría, no una magnitud. La media entre «pinar» y «urbano» no es
 * medio pinar, no es nada. Es la misma regla por la que el CO₂ y la cobertura
 * móvil se pintan al vecino más cercano y no se promedian.
 */
export function cellAt(s: FireStatic, lon: number, lat: number): StaticCell | null {
  const g = s.spec.grid
  const col = Math.floor((lonToPixelX(lon, g.zoom) - g.originX) / g.step)
  const row = Math.floor((latToPixelY(lat, g.zoom) - g.originY) / g.step)
  if (col < 0 || row < 0 || col >= s.cols || row >= s.rows) return null
  const i = row * s.cols + col
  return { fuel: s.fuel[i], distanceM: s.distanceM[i], slopeDeg: s.slopeDeg[i], col, row }
}

/** Si esa celda tiene combustible clasificado. Donde no, el modelo no contesta. */
export function isScorable(cell: StaticCell | null): boolean {
  return cell !== null && cell.fuel !== FUEL_UNKNOWN
}
