/**
 * La sombra propia del relieve, puesta sobre el mapa.
 *
 * NO ES UNA CAPA PERSONALIZADA DE WEBGL, y es lo primero que hay que entender de
 * este fichero. El viento, las nubes, la lluvia y el mar se dibujan con shaders
 * propios porque son geometría en el aire; la sombra es una mancha pegada al
 * suelo, y una mancha pegada al suelo tiene que ir DRAPEADA sobre el relieve.
 * MapLibre proyecta sobre el terreno las capas `raster` y no las personalizadas
 * (ver la cabecera de `terrain/Terrain3D.ts`), así que esto es una fuente
 * `image` con una capa `raster` encima — el mismo camino que ya recorre la malla
 * interpolada, y por la misma razón.
 *
 * DÓNDE VA EN LA PILA, que no es un detalle. Va POR ENCIMA de los fondos de
 * GRAFCAN. La ortofoto es opaca y tapa el `hillshade` entero: medido el 15 de
 * agosto de 2026, con el fondo «Satélite» puesto, la luz solar de
 * `terrain-light.ts` no pinta un solo píxel. Esta capa es entonces la ÚNICA
 * iluminación que llega a la ortofoto, y por eso se inserta después de los
 * fondos y antes de la malla de color, que es dato y no se sombrea.
 *
 * CUÁNDO SE RECALCULA. El barrido cuesta 21 ms sobre la malla a mitad de
 * resolución (medido sobre el DEM real, 896 × 1152, MacBook Air M2), así que no
 * se puede hacer en cada fotograma pero sobra para hacerlo cuando el sol se
 * mueve de verdad. Se recalcula cuando el acimut cambia más de medio grado o la
 * altura más de un cuarto — unos dos minutos de reloj—, y siempre con un retardo
 * que absorbe el arrastre de la barra del tiempo: sin él, mover el reloj de las
 * ocho a las seis de la tarde dispararía cien barridos para enseñar uno.
 *
 * POR QUÉ MITAD DE RESOLUCIÓN Y NO ENTERA. A malla completa son 80,6 ms, y lo
 * que se gana no se ve: la sombra ya no puede ser más afilada que las celdas de
 * 33,54 m que la proyectan, y a 67 m el borde se corre como mucho una celda. Los
 * dos números están medidos, y el submuestreo es un parámetro por si el día de
 * mañana el DEM sube de resolución.
 */

import type { Map as MlMap, ImageSource } from 'maplibre-gl'
import type { Dem } from '../../lib/dem'
import { pixelXToLon, pixelYToLat } from '../../lib/geo'
import type { SkyPosition } from '../../lib/sun'
import { shadowDepth } from '../../lib/shadow/depth'
import { terrainShadow } from '../../lib/shadow/terrain'

export const SHADOW_SOURCE_ID = 'terrain-shadow'
export const SHADOW_LAYER_ID = 'terrain-shadow-raster'

/** Un píxel transparente, para crear la fuente antes de tener nada que enseñar. */
export const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * El color de lo que queda dentro de la sombra.
 *
 * No es negro ni gris: es el azul del cielo, porque eso es literalmente lo único
 * que ilumina un punto al que no le llega el sol. Es el mismo `shadow` que
 * `terrain-light.ts` le da al `hillshade` de día, y compartirlo no es economía —
 * es que las dos cosas son la misma sombra, una calculada por pendiente y otra
 * por obstáculo, y de dos colores distintos se verían como dos capas.
 */
const SHADOW_RGB = [0x14, 0x1a, 0x2b] as const

/** Submuestreo del DEM. 2 = una celda de sombra por cada 2 × 2 del modelo. */
const STEP = 2

/** Cuánto se tiene que mover el sol para que valga la pena rehacer el barrido. */
const AZIMUTH_STEP_DEG = 0.5
const ELEVATION_STEP_DEG = 0.25

/** Retardo que absorbe el arrastre de la barra del tiempo. */
const DEBOUNCE_MS = 120

export class ShadowLayer {
  private canvas: HTMLCanvasElement | null = null
  private enabled = false
  private pending: SkyPosition | null = null
  private drawn: SkyPosition | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly map: MlMap,
    private readonly dem: Dem,
  ) {}

  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (!this.map.getLayer(SHADOW_LAYER_ID)) return
    if (!on) {
      this.map.setLayoutProperty(SHADOW_LAYER_ID, 'visibility', 'none')
      this.cancel()
      // Se olvida lo dibujado: al volver a encender, la posición del sol puede
      // haber cambiado poco y sin esto no se redibujaría nada.
      this.drawn = null
      return
    }
    if (this.pending) this.schedule(this.pending)
  }

  /** La posición del sol de ahora. Decide sola si hay que rehacer el barrido. */
  update(sun: SkyPosition): void {
    this.pending = sun
    if (!this.enabled) return
    if (!this.moved(sun)) return
    this.schedule(sun)
  }

  private moved(sun: SkyPosition): boolean {
    const prev = this.drawn
    if (!prev) return true
    // El acimut es un rumbo: 359° y 1° distan dos grados, no 358.
    let dAz = Math.abs(sun.azimuthDeg - prev.azimuthDeg) % 360
    if (dAz > 180) dAz = 360 - dAz
    return dAz > AZIMUTH_STEP_DEG || Math.abs(sun.elevationDeg - prev.elevationDeg) > ELEVATION_STEP_DEG
  }

  private schedule(sun: SkyPosition): void {
    this.cancel()
    this.timer = setTimeout(() => {
      this.timer = null
      this.draw(sun)
    }, DEBOUNCE_MS)
  }

  private cancel(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private draw(sun: SkyPosition): void {
    const map = this.map
    if (!this.enabled || !map.getLayer(SHADOW_LAYER_ID)) return
    const source = map.getSource(SHADOW_SOURCE_ID) as ImageSource | undefined
    if (!source) return

    const mask = terrainShadow(this.dem, sun, { step: STEP })
    // Sol bajo el horizonte: no hay sombras arrojadas, hay noche. Se apaga la
    // capa en vez de dejar puesta la última del atardecer.
    if (!mask) {
      map.setLayoutProperty(SHADOW_LAYER_ID, 'visibility', 'none')
      this.drawn = sun
      return
    }

    const depth = shadowDepth(sun.elevationDeg)
    const canvas = this.ensureCanvas(mask.width, mask.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(mask.width, mask.height)
    const [r, g, b] = SHADOW_RGB
    for (let i = 0; i < mask.data.length; i++) {
      const p = i * 4
      image.data[p] = r
      image.data[p + 1] = g
      image.data[p + 2] = b
      image.data[p + 3] = Math.round(mask.data[i] * depth)
    }
    ctx.putImageData(image, 0, 0)

    const { zoom } = this.dem.manifest
    // El recuadro se calcula con `width * step` píxeles del DEM y no con el
    // ancho del DEM: si el submuestreo no cabe entero, la malla sobresale, y
    // estirar la imagen sobre el recuadro del modelo la desplazaría.
    const west = pixelXToLon(mask.originX, zoom)
    const east = pixelXToLon(mask.originX + mask.width * mask.step, zoom)
    const north = pixelYToLat(mask.originY, zoom)
    const south = pixelYToLat(mask.originY + mask.height * mask.step, zoom)

    source.updateImage({
      url: canvas.toDataURL(),
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    })
    map.setLayoutProperty(SHADOW_LAYER_ID, 'visibility', 'visible')
    this.drawn = sun
  }

  private ensureCanvas(width: number, height: number): HTMLCanvasElement {
    if (this.canvas && this.canvas.width === width && this.canvas.height === height) {
      return this.canvas
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    this.canvas = canvas
    return canvas
  }

  destroy(): void {
    this.cancel()
    this.canvas = null
  }
}
