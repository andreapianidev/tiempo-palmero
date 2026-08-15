/**
 * Las manchas de las nubes, puestas sobre el mapa.
 *
 * VA APARTE DE `ShadowLayer` AUNQUE LAS DOS DIBUJEN SOMBRAS, y no es por
 * simetría con `CloudLayer` y `RainLayer` —aunque el motivo es el mismo—: es que
 * **sus entradas cambian a ritmos que no se parecen**. La sombra del relieve se
 * rehace cuando el sol se mueve medio grado, o sea unas cada dos minutos; ésta
 * tiene que seguir a unas nubes que se desplazan con el alisio. Metidas en una
 * sola capa, cada vez que una nube avanzara sesenta metros habría que volver a
 * codificar en PNG la malla entera del relieve para no cambiar en ella ni un
 * píxel.
 *
 * Separadas, cada una se rehace cuando cambia lo suyo. Y esta va a un cuarto de
 * la resolución de aquélla porque no tiene un solo borde duro que resolver: lo
 * más fino de una sombra de nube son los lóbulos de la propia nube, de 300 a
 * 800 m. Ver `lib/shadow/clouds.ts`.
 *
 * CUÁNDO SE REHACE, y por qué dos veces por segundo bastan de sobra. Con
 * alisio de 10 m/s una nube tarda **13,4 segundos** en recorrer una celda de
 * 134 m, así que refrescando cada medio segundo la mancha va como mucho cinco
 * metros por detrás de donde le toca — una vigésima parte de celda, y el raster
 * se interpola. Poner más sería pagar por un error que no se puede ver.
 *
 * Y solo si se han movido: se suman los centros y se compara. Con el reloj en
 * pausa la escena está quieta, y sin esto se recodificaría dos veces por segundo
 * una imagen idéntica.
 *
 * Lo que cuesta cada pase, medido sobre el DEM real con motas de 300 a 800 m
 * (MacBook Air M2): con 1.800 motas —60 nubes—, 4,0 ms con el sol a 70° y
 * 15,1 ms con el sol a 6°, que es cuando las manchas se estiran y cubren la
 * mitad del recuadro. Con 3.600 motas y el sol rasante, 24,9 ms, que es el peor
 * caso de un cielo tapado al atardecer.
 *
 * NO REPRODUCE EL HERVIDO de las motas. `CloudLayer` las mueve unos metros
 * alrededor de su sitio para que la nube no se lea como una calcomanía; aquí se
 * usa la posición base. A 134 m por celda, un lóbulo que se desplaza diez metros
 * no mueve un solo píxel de la sombra.
 *
 * DEPENDE DE QUE HAYA CIELO. Sin la escena atmosférica encendida no hay nubes
 * que proyecten nada, y entonces esta capa se apaga sola en vez de quedarse con
 * las últimas.
 */

import type { Map as MlMap, ImageSource } from 'maplibre-gl'
import type { Dem } from '../../lib/dem'
import { pixelXToLon, pixelYToLat } from '../../lib/geo'
import { cloudShadowMask } from '../../lib/shadow/clouds'
import { shadowDepth } from '../../lib/shadow/depth'
import type { Cloud } from '../../lib/sky/scene'
import type { SkyPosition } from '../../lib/sun'

export const CLOUD_SHADOW_SOURCE_ID = 'cloud-shadow'
export const CLOUD_SHADOW_LAYER_ID = 'cloud-shadow-raster'

/**
 * El mismo color que la sombra del relieve, y por la misma razón: lo que queda
 * dentro de una sombra es la luz del cielo. Que la sombra de una nube y la de
 * una cresta fueran de dos colores distintos las delataría como dos capas.
 */
const SHADOW_RGB = [0x14, 0x1a, 0x2b] as const

/** Cada cuánto se vuelve a mirar si las nubes se han movido. */
const REFRESH_MS = 500

export class CloudShadowLayer {
  private canvas: HTMLCanvasElement | null = null
  private enabled = false
  private timer: ReturnType<typeof setInterval> | null = null
  private clouds: readonly Cloud[] = []
  private sun: SkyPosition | null = null
  /** Suma de los centros de las nubes la última vez que se dibujó. */
  private drawnAt = Number.NaN
  private drawnSun = Number.NaN

  constructor(
    private readonly map: MlMap,
    private readonly dem: Dem,
  ) {}

  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (on) {
      this.timer ??= setInterval(() => this.tick(), REFRESH_MS)
      this.tick()
      return
    }
    this.stop()
    if (this.map.getLayer(CLOUD_SHADOW_LAYER_ID)) {
      this.map.setLayoutProperty(CLOUD_SHADOW_LAYER_ID, 'visibility', 'none')
    }
  }

  /** La escena de ahora. No dibuja: deja los datos y el reloj decide. */
  setScene(clouds: readonly Cloud[], sun: SkyPosition): void {
    this.clouds = clouds
    this.sun = sun
  }

  private stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
    this.drawnAt = Number.NaN
    this.drawnSun = Number.NaN
  }

  /**
   * Cuánto se han movido las nubes, en una sola cifra.
   *
   * Sumar los centros no distingue una nube que va al este de otra que va al
   * oeste la misma cantidad, y da igual: lo que se necesita saber no es cuánto
   * se han movido sino SI se han movido, para no recodificar una imagen que
   * saldría idéntica con el reloj en pausa.
   */
  private fingerprint(): number {
    let sum = 0
    for (const c of this.clouds) sum += c.lon + c.lat
    return sum
  }

  private tick(): void {
    if (!this.enabled || !this.sun) return
    const map = this.map
    if (!map.getLayer(CLOUD_SHADOW_LAYER_ID)) return

    const print = this.fingerprint()
    const sunPrint = this.sun.azimuthDeg + this.sun.elevationDeg
    if (print === this.drawnAt && sunPrint === this.drawnSun) return
    this.drawnAt = print
    this.drawnSun = sunPrint

    const source = map.getSource(CLOUD_SHADOW_SOURCE_ID) as ImageSource | undefined
    if (!source) return

    const mask = cloudShadowMask(this.dem, this.clouds, this.sun)
    if (!mask) {
      map.setLayoutProperty(CLOUD_SHADOW_LAYER_ID, 'visibility', 'none')
      return
    }

    const depth = shadowDepth(this.sun.elevationDeg)
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
    const west = pixelXToLon(this.dem.originX, zoom)
    const east = pixelXToLon(this.dem.originX + mask.width * mask.step, zoom)
    const north = pixelYToLat(this.dem.originY, zoom)
    const south = pixelYToLat(this.dem.originY + mask.height * mask.step, zoom)

    source.updateImage({
      url: canvas.toDataURL(),
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    })
    map.setLayoutProperty(CLOUD_SHADOW_LAYER_ID, 'visibility', 'visible')
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
    this.stop()
    this.canvas = null
  }
}
