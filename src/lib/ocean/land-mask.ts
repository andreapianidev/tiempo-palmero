/**
 * De la línea de costa oficial a una textura que la GPU pueda leer.
 *
 * Aquí es donde entra el navegador: el límite insular del Cabildo son 73.605
 * vértices, y rasterizar un polígono de ese tamaño a mano en JavaScript es
 * escribir un algoritmo de relleno por barrido que el `<canvas>` ya trae
 * escrito, probado y acelerado. Se dibuja, se leen los píxeles y ya hay máscara
 * de tierra.
 *
 * VIVE APARTE DE `shoreline.ts` por lo mismo que `dem-loader.ts` vive aparte del
 * DEM: eso son cuentas y esto es plataforma. Las cuentas se prueban sin
 * navegador; esto necesita uno.
 *
 * CUÁNTO CUESTA. Sobre la malla de 1024 × 1024 que se usa: rasterizar y leer,
 * unas decenas de milisegundos; consultar la cota del DEM, otras tantas, y solo
 * en los texeles de tierra, que son poco más de un tercio del recuadro —708 km²
 * de isla en 1.891 km² de rectángulo—. Se hace UNA vez, la primera que se
 * enciende el océano, y en trozos, cediendo el hilo entre franjas para no
 * congelar el mapa mientras tanto.
 */

import { elevationAt, SEA_LEVEL_M, type Dem } from '../dem'
import { ISLAND_BBOX } from '../geo'
import { latFromMercatorY, lonFromMercatorX, mercatorBox, type MercatorBox } from './mercator'
import {
  packShoreline,
  signedShoreDistance,
  type ShorelineGrid,
} from './shoreline'

/**
 * Lado de la textura de costa. 1024 × 1024 sobre el recuadro insular.
 *
 * Son 34 m por texel en longitud y 54 m en latitud —el recuadro no es cuadrado
 * y la textura sí—, o sea del orden del propio DEM. Subir a 2048 daría 17 m
 * pero cuadruplicaría la memoria de vídeo (de 4 a 16 MB) y el tiempo de
 * construcción, y el detalle por debajo del texel no se pierde: lo repone el
 * sombreador con ruido, que es lo que hace que la línea de espuma se vea
 * dentada de cerca en vez de suave y falsa.
 */
export const SHORELINE_SIZE = 1024

export interface ShorelineMap {
  width: number
  height: number
  /** El recuadro que cubre, en Mercator normalizado. */
  box: MercatorBox
  /** RGBA listo para `texImage2D`. Ver `packShoreline`. */
  pixels: Uint8Array
}

type Ring = [number, number][]

function polygonsOf(geojson: GeoJSON.FeatureCollection): Ring[][] {
  const out: Ring[][] = []
  for (const f of geojson.features) {
    const g = f.geometry
    if (g.type === 'Polygon') out.push(g.coordinates as Ring[])
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(p as Ring[])
  }
  return out
}

/**
 * Pinta la isla en blanco sobre negro y devuelve qué texeles son tierra.
 *
 * `evenodd` y no el relleno por defecto: el límite insular trae los anillos
 * interiores —si algún día aparece un hueco— en el mismo sentido que el
 * exterior, y con la regla del no-cero un hueco así se rellenaría en vez de
 * quedarse vacío.
 */
function rasterizeLand(
  polygons: Ring[][],
  box: MercatorBox,
  width: number,
  height: number,
): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin contexto 2d para la máscara de costa')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i]
        const x = ((lon + 180) / 360 - box.x0) / box.width
        const rad = (lat * Math.PI) / 180
        const my =
          (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
        const y = (my - box.y0) / box.height
        if (i === 0) ctx.moveTo(x * width, y * height)
        else ctx.lineTo(x * width, y * height)
      }
      ctx.closePath()
    }
  }
  ctx.fill('evenodd')

  const data = ctx.getImageData(0, 0, width, height).data
  const land = new Uint8Array(width * height)
  // El canvas suaviza los bordes; por encima de medio píxel cubierto se cuenta
  // como tierra, que es la misma convención que el redondeo de cualquier
  // rasterización.
  for (let i = 0; i < land.length; i++) land[i] = data[i * 4] >= 128 ? 1 : 0
  return land
}

/**
 * Construye el mapa de orilla completo. Cede el hilo entre franjas.
 *
 * El `null` de `dem` no es un caso raro: al encender el océano antes de que el
 * modelo de elevación haya terminado de cargar, la cota se queda a cero y lo
 * único que se pierde es que el agua no distinga un acantilado de una playa.
 * La línea de costa —que es lo que de verdad importa— no depende del DEM.
 */
export async function buildShorelineMap(
  island: GeoJSON.FeatureCollection,
  dem: Dem | null,
  size = SHORELINE_SIZE,
): Promise<ShorelineMap> {
  const box = mercatorBox(ISLAND_BBOX)
  const land = rasterizeLand(polygonsOf(island), box, size, size)

  const elevation = new Float32Array(size * size)
  if (dem) {
    for (let y = 0; y < size; y++) {
      const lat = latFromMercatorY(box.y0 + ((y + 0.5) / size) * box.height)
      for (let x = 0; x < size; x++) {
        // EN EL MAR, CERO, y sin preguntarle al DEM. La cota se lee después
        // interpolando entre texeles de 34 × 54 m, así que un solo texel de mar
        // con cota se propaga hacia fuera media celda: frente a una pared de
        // 60 m eso secaba una franja de agua de hasta 43 m pegada a la costa
        // (medido en `coverage.test.ts`). El DEM, a 33,5 m por píxel, tiene su
        // propia costa y no es esta: la que manda es el límite insular que
        // acaba de rasterizarse, que es también la que dibuja el mapa.
        if (!land[y * size + x]) continue
        const lon = lonFromMercatorX(box.x0 + ((x + 0.5) / size) * box.width)
        const h = elevationAt(dem, lon, lat)
        elevation[y * size + x] = h === null || h < SEA_LEVEL_M ? 0 : h
      }
      // Cada 64 franjas se devuelve el hilo. Sin esto son 130 ms seguidos de
      // pantalla congelada justo cuando alguien acaba de pulsar un interruptor.
      if ((y & 63) === 63) await new Promise((r) => setTimeout(r, 0))
    }
  }

  // Metros por texel, medidos a la latitud del centro del recuadro: el recuadro
  // mide 0,35° de longitud y 0,5° de latitud, que a 28,65° son 34,2 m y 54,3 m.
  const midLat = (ISLAND_BBOX.north + ISLAND_BBOX.south) / 2
  const grid: ShorelineGrid = {
    width: size,
    height: size,
    metersX:
      ((ISLAND_BBOX.east - ISLAND_BBOX.west) * 111_320 * Math.cos((midLat * Math.PI) / 180)) /
      size,
    metersY: ((ISLAND_BBOX.north - ISLAND_BBOX.south) * 110_574) / size,
  }

  const distance = signedShoreDistance(land, grid)
  return { width: size, height: size, box, pixels: packShoreline(distance, elevation, grid) }
}
