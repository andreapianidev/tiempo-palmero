/**
 * La capa del océano: una capa personalizada de MapLibre que dibuja el mar.
 *
 * DÓNDE SE DIBUJA. En `renderingMode: '3d'`, que es lo que hace que MapLibre le
 * dé la prueba de profundidad con el terreno ya escrito. Gracias a eso, con la
 * vista 3D encendida la isla TAPA el mar que queda detrás de ella sin que aquí
 * haya que saber nada del relieve: el agua entra por los barrancos y se corta
 * contra los acantilados sola. Lo único que se cambia es que NO se escribe
 * profundidad (`depthMask(false)`), porque el mar es una superficie
 * semitransparente y lo que pase por delante de él —una etiqueta, el viento— no
 * puede quedar recortado por el agua.
 *
 * EL ORIGEN LOCAL, y por qué existe. La matriz del mapa trabaja en Mercator
 * normalizado, donde la isla entera ocupa 0,0026 unidades. Mandarle esas
 * coordenadas a la GPU tal cual, en `float` de 32 bits, deja el mar temblando al
 * máximo acercamiento. Aquí se resta un origen fijo —el centro del recuadro del
 * mapa— antes de subir nada, así que la GPU trabaja con números pequeños y
 * conserva toda su precisión. Es FIJO y no se mueve con la cámara a propósito:
 * un origen que cambiara al arrastrar el mapa movería la fase de todas las olas
 * a la vez, y el mar entero daría un salto.
 *
 * QUÉ NO HACE. No pide datos, no sabe qué hora es y no decide nada: recibe los
 * campos ya interpolados, la marea, el polvo del aire y la radiación medida, y
 * dibuja. Quien reúne todo eso es `hooks/useOcean.ts`.
 */

import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl'
import { MAP_BBOX } from '../../lib/geo'
import { mercatorBox, metersPerMercatorUnit } from '../../lib/ocean/mercator'
import { cameraPosition, invert, multiply, translation } from '../../lib/ocean/mat4'
import { oceanLight, waterColors, type LightInputs } from '../../lib/ocean/light'
import { QUALITY, type OceanQuality } from '../../lib/ocean/quality'
import type { OceanField } from '../../lib/ocean/field'
import type { ShorelineMap } from '../../lib/ocean/land-mask'
import {
  buildGrid,
  buildProgram,
  buildTextures,
  disposeTextures,
  uploadBathymetry,
  uploadField,
  uploadShoreline,
  type GridResources,
  type OceanProgram,
  type OceanTextures,
} from './OceanResources'

export const OCEAN_LAYER_ID = 'ocean-surface'

type Gl = WebGLRenderingContext | WebGL2RenderingContext

/** Hasta dónde se dibuja mar, en metros. Más allá, horizonte. */
const MAX_RANGE_M = 300_000

/**
 * Cuánto se levanta el plano del agua sobre el cero, en metros. Dos.
 *
 * NO ES UN AJUSTE FINO: sin esto, en la vista 3D no se ve el mar. Con el
 * terreno encendido MapLibre dibuja una malla que cubre TODA la pantalla —donde
 * no hay teselas de relieve la pone a cero— y esa malla escribe profundidad.
 * El fondo marino está aplanado a cero (ver `prepare-data.ts`), así que el mar
 * de MapLibre y el nuestro quedan exactamente en el mismo plano, y con la marea
 * baja el nuestro queda por DEBAJO: la prueba de profundidad lo descarta entero
 * y lo que se ve es la lámina plana de siempre.
 *
 * Dos metros es lo mínimo que gana esa carrera con holgura y sigue siendo
 * invisible: al máximo acercamiento del mapa (1 m por píxel) son dos píxeles de
 * desplazamiento sobre una costa cuyo trazado no lo pone este plano, sino el
 * mapa de orilla. Y el desnivel de la marea se sigue viendo, porque lo que
 * cambia con ella es la posición del agua RESPECTO A ESE CERO, no el cero.
 *
 * Va acompañado de un sesgo de polígono, porque a 100 km de distancia la
 * precisión del búfer de profundidad ya no distingue dos metros.
 */
const SEA_LIFT_M = 2

/** Lo que tarda el mar en aparecer y en irse, en milisegundos. */
const FADE_MS = 700

/**
 * Lo que tarda el mar en pasar de un estado a otro cuando llegan datos nuevos.
 *
 * Dos segundos y medio. Un refresco cada cinco minutos con el oleaje cambiando
 * de golpe se ve como un parpadeo del mapa entero; interpolado, no se nota que
 * ha pasado nada, que es exactamente lo que tiene que pasar cuando el mar de
 * verdad tampoco ha cambiado de golpe.
 */
const BLEND_MS = 2500

/** Cada cuánto se rehace la mezcla de campos mientras dura. */
const BLEND_STEP_MS = 90

/**
 * Cada cuánto se copia el fondo para refractarlo, con la cámara quieta.
 *
 * Con la cámara quieta lo que hay debajo del agua no cambia nunca, así que
 * bastaría una copia; se refresca cada 250 ms por si el mapa ha terminado de
 * cargar una tesela. En movimiento se copia en cada fotograma, porque ahí sí
 * cambia y un fondo viejo se ve como un arrastre.
 */
const BACKGROUND_IDLE_MS = 250

export interface OceanInputs {
  /** Marea sobre el nivel medio, m. */
  tideM: number
  /** Viento medio sobre el mar, m/s. Fija la escala del rizado fino. */
  windMs: number
  light: LightInputs
}

export class OceanLayer implements CustomLayerInterface {
  readonly id = OCEAN_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private gl: Gl | null = null
  private program: OceanProgram | null = null
  private grid: GridResources | null = null
  private textures: OceanTextures | null = null

  private quality: OceanQuality = 'equilibrada'
  private visible = false
  private fade = 0
  private readonly started = performance.now()
  private lastFrame = 0

  private field: OceanField | null = null
  private previousField: OceanField | null = null
  private blendStart = 0
  private blendedAt = 0
  private blendBuffers: [Uint8Array, Uint8Array, Uint8Array] | null = null

  private shoreline: ShorelineMap | null = null
  private bathymetry: TexImageSource | null = null
  private bathyMaxDepth = 4100

  private inputs: OceanInputs = {
    tideM: 0,
    windMs: 6,
    light: { pm10: null, solarWm2: null },
  }
  /** La marea se persigue en vez de saltar: el agua sube despacio. */
  private tideNow = 0

  private backgroundW = 0
  private backgroundH = 0
  private backgroundAt = 0
  private backgroundKey = ''

  /** El origen local. Fijo desde la construcción. Ver la cabecera. */
  private readonly origin = {
    x: mercatorBox(MAP_BBOX).x0 + mercatorBox(MAP_BBOX).width / 2,
    y: mercatorBox(MAP_BBOX).y0 + mercatorBox(MAP_BBOX).height / 2,
  }

  // --- lo que le llega de fuera -------------------------------------------

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  setQuality(quality: OceanQuality): void {
    if (quality === this.quality) return
    this.quality = quality
    const gl = this.gl
    if (!gl) return
    // Recompilar y rehacer la rejilla es lo ÚNICO que se recrea en toda la
    // capa, y solo pasa cuando alguien toca el selector de calidad.
    if (this.program) gl.deleteProgram(this.program.program)
    if (this.grid) {
      gl.deleteBuffer(this.grid.vertexBuffer)
      gl.deleteBuffer(this.grid.indexBuffer)
    }
    this.program = buildProgram(gl, quality)
    this.grid = buildGrid(gl, quality)
    this.map?.triggerRepaint()
  }

  /** Campos nuevos: se funden con los anteriores en vez de sustituirlos. */
  setField(field: OceanField | null): void {
    if (!field) {
      this.field = null
      this.previousField = null
      return
    }
    if (this.field && this.field.size === field.size) {
      this.previousField = this.field
      this.blendStart = performance.now()
      this.blendedAt = 0
      if (!this.blendBuffers) {
        this.blendBuffers = [
          new Uint8Array(field.swell.length),
          new Uint8Array(field.windSea.length),
          new Uint8Array(field.wind.length),
        ]
      }
    } else {
      this.previousField = null
    }
    this.field = field
    if (this.gl && this.textures && !this.previousField) {
      uploadField(this.gl, this.textures, field)
    }
    this.map?.triggerRepaint()
  }

  setShoreline(shoreline: ShorelineMap | null): void {
    this.shoreline = shoreline
    if (shoreline && this.gl && this.textures) {
      uploadShoreline(this.gl, this.textures, shoreline)
    }
    this.map?.triggerRepaint()
  }

  setBathymetry(image: TexImageSource, maxDepthM: number): void {
    this.bathymetry = image
    this.bathyMaxDepth = maxDepthM
    if (this.gl && this.textures) uploadBathymetry(this.gl, this.textures, image)
    this.map?.triggerRepaint()
  }

  setInputs(inputs: OceanInputs): void {
    this.inputs = inputs
    this.map?.triggerRepaint()
  }

  /** Si la capa tiene ya con qué dibujar algo. Lo usa el panel. */
  get ready(): boolean {
    return !!(this.field && this.bathymetry)
  }

  // --- ciclo de vida -------------------------------------------------------

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    this.gl = gl
    this.program = buildProgram(gl, this.quality)
    this.grid = buildGrid(gl, this.quality)
    this.textures = buildTextures(gl)
    // Lo que hubiera llegado antes de que la capa existiera se sube ahora: el
    // orden en que responden la red y MapLibre no está garantizado.
    if (this.field) uploadField(gl, this.textures, this.field)
    if (this.shoreline) uploadShoreline(gl, this.textures, this.shoreline)
    if (this.bathymetry) uploadBathymetry(gl, this.textures, this.bathymetry)
    this.tideNow = this.inputs.tideM
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.program) gl.deleteProgram(this.program.program)
    if (this.grid) {
      gl.deleteBuffer(this.grid.vertexBuffer)
      gl.deleteBuffer(this.grid.indexBuffer)
    }
    if (this.textures) disposeTextures(gl, this.textures)
    this.program = null
    this.grid = null
    this.textures = null
    this.gl = null
    this.map = null
  }

  // --- dibujo --------------------------------------------------------------

  render(gl: Gl, matrix: ArrayLike<number>): void {
    const map = this.map
    const program = this.program
    const grid = this.grid
    const textures = this.textures
    if (!map || !program || !grid || !textures) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    // La aparición y la desaparición. Con la capa apagada y ya desvanecida no
    // se pide otro fotograma: el mapa vuelve a quedarse quieto de verdad.
    const target = this.visible && this.ready ? 1 : 0
    this.fade += Math.max(-1, Math.min(1, target - this.fade)) * Math.min(1, (dt * 1000) / FADE_MS)
    if (this.fade < 0.002) {
      this.fade = 0
      if (target === 0) return
    }

    const local = multiply(matrix, translation(this.origin.x, this.origin.y, 0))
    const inverse = invert(local)
    if (!inverse) return
    const camera = cameraPosition(inverse)
    if (!camera) return

    const center = map.getCenter()
    const metersPerMerc = metersPerMercatorUnit(center.lat)
    // MapLibre define el zoom sobre teselas de 512 px.
    const metersPerPixel = metersPerMerc / (512 * Math.pow(2, map.getZoom()))

    this.advanceBlend(gl, textures, now)
    // La marea persigue su valor con una constante de diez segundos: cuando
    // llega una lectura nueva, el agua sube sin que se vea un escalón.
    this.tideNow += (this.inputs.tideM - this.tideNow) * Math.min(1, dt / 10)

    const light = oceanLight(Date.now(), center.lng, center.lat, this.inputs.light)
    const water = waterColors(light)
    const settings = QUALITY[this.quality]

    if (settings.refraction) this.captureBackground(gl, textures, now, map)

    gl.useProgram(program.program)
    const u = program.uniforms
    const f32 = (m: Float64Array) => new Float32Array(m)

    if (u.u_matrix) gl.uniformMatrix4fv(u.u_matrix, false, f32(local))
    if (u.u_invMatrix) gl.uniformMatrix4fv(u.u_invMatrix, false, f32(inverse))
    if (u.u_time) gl.uniform1f(u.u_time, (now - this.started) / 1000)
    if (u.u_seaLevel) {
      gl.uniform1f(u.u_seaLevel, (this.tideNow + SEA_LIFT_M) / metersPerMerc)
    }
    if (u.u_metersPerMerc) gl.uniform1f(u.u_metersPerMerc, metersPerMerc)
    if (u.u_maxRange) gl.uniform1f(u.u_maxRange, MAX_RANGE_M / metersPerMerc)
    if (u.u_camera) gl.uniform3f(u.u_camera, camera[0], camera[1], camera[2])
    if (u.u_metersPerPixel) gl.uniform1f(u.u_metersPerPixel, metersPerPixel)
    if (u.u_resolution) {
      gl.uniform2f(
        u.u_resolution,
        Math.max(1, gl.drawingBufferWidth),
        Math.max(1, gl.drawingBufferHeight),
      )
    }

    const fieldBox = mercatorBox(MAP_BBOX)
    if (u.u_fieldBox) {
      gl.uniform4f(
        u.u_fieldBox,
        fieldBox.x0 - this.origin.x,
        fieldBox.y0 - this.origin.y,
        fieldBox.width,
        fieldBox.height,
      )
    }
    if (u.u_bathyBox) {
      // La batimetría cubre exactamente el mismo recuadro que el mapa deja
      // arrastrar: se preparó así en `scripts/prepare-ocean.ts`.
      gl.uniform4f(
        u.u_bathyBox,
        fieldBox.x0 - this.origin.x,
        fieldBox.y0 - this.origin.y,
        fieldBox.width,
        fieldBox.height,
      )
    }
    if (u.u_shoreBox && this.shoreline) {
      const b = this.shoreline.box
      gl.uniform4f(u.u_shoreBox, b.x0 - this.origin.x, b.y0 - this.origin.y, b.width, b.height)
    } else if (u.u_shoreBox) {
      // Sin mapa de costa, un recuadro degenerado fuera de la vista: el
      // sombreador lo lee como «aquí no hay costa» y dibuja mar abierto.
      gl.uniform4f(u.u_shoreBox, -10, -10, 1e-6, 1e-6)
    }
    if (u.u_maxDepth) gl.uniform1f(u.u_maxDepth, this.bathyMaxDepth)

    // Escala del rizado fino: con más viento, olas más largas y más marcadas.
    const wind = Math.max(0, this.inputs.windMs)
    if (u.u_detailMeters) gl.uniform1f(u.u_detailMeters, 22 + 2.8 * Math.min(wind, 16))
    if (u.u_detailAmp) gl.uniform1f(u.u_detailAmp, 0.85)
    // Cuánta pendiente queda por debajo del píxel a este zoom. Alimenta el
    // ensanchamiento del brillo del sol: es lo que convierte el destello
    // puntual de cerca en la alfombra de brillos que se ve de lejos.
    if (u.u_microVariance) {
      gl.uniform1f(u.u_microVariance, 0.02 * Math.min(1, Math.max(0, (metersPerPixel - 0.4) / 25)))
    }
    // Y cuánta ola se dibuja con geometría: por debajo de tres metros por píxel
    // la ola se ve, por encima de doce es ruido de menos de un píxel.
    if (u.u_geomScale) {
      const t = (12 - metersPerPixel) / 9
      gl.uniform1f(u.u_geomScale, Math.max(0, Math.min(1, t)))
    }

    if (u.u_sunDir) gl.uniform3fv(u.u_sunDir, light.sunDir)
    if (u.u_sunColor) gl.uniform3fv(u.u_sunColor, light.sunColor)
    if (u.u_sunIntensity) gl.uniform1f(u.u_sunIntensity, light.sunIntensity)
    if (u.u_moonDir) gl.uniform3fv(u.u_moonDir, light.moonDir)
    if (u.u_moonIntensity) gl.uniform1f(u.u_moonIntensity, light.moonIntensity)
    if (u.u_zenith) gl.uniform3fv(u.u_zenith, light.zenith)
    if (u.u_horizon) gl.uniform3fv(u.u_horizon, light.horizon)
    if (u.u_ambient) gl.uniform3fv(u.u_ambient, light.ambient)
    if (u.u_haze) gl.uniform1f(u.u_haze, light.haze)
    if (u.u_deepColor) gl.uniform3fv(u.u_deepColor, water.deep)
    if (u.u_shallowColor) gl.uniform3fv(u.u_shallowColor, water.shallow)
    if (u.u_foamColor) gl.uniform3fv(u.u_foamColor, water.foam)
    if (u.u_fade) gl.uniform1f(u.u_fade, this.fade)

    const bind = (unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (location) gl.uniform1i(location, unit)
    }
    bind(0, textures.swell, u.u_swellTex)
    bind(1, textures.windSea, u.u_windSeaTex)
    bind(2, textures.wind, u.u_windTex)
    bind(3, textures.bathymetry, u.u_bathyTex)
    bind(4, textures.shoreline, u.u_shoreTex)
    bind(5, textures.detail, u.u_detailTex)
    bind(6, textures.background, u.u_backgroundTex)

    gl.bindBuffer(gl.ARRAY_BUFFER, grid.vertexBuffer)
    gl.enableVertexAttribArray(program.aNdc)
    gl.vertexAttribPointer(program.aNdc, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, grid.indexBuffer)

    // Alfa premultiplicado, que es lo que espera el compositor de MapLibre.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    // La profundidad se LEE —para que la isla tape el mar de detrás cuando la
    // vista está inclinada— pero no se escribe: lo que se dibuje después del
    // agua no puede quedar recortado por ella.
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(false)
    gl.disable(gl.CULL_FACE)
    // El sesgo de profundidad, por lo mismo que los dos metros de arriba: cerca
    // de la cámara sobran, pero en el horizonte el agua y la malla del terreno
    // caen en el mismo valor del búfer y aparecería una banda parpadeante justo
    // donde el mar se junta con el cielo. Es el mismo mecanismo con el que se
    // pintan las marcas del suelo en cualquier motor 3D.
    gl.enable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(-1, -4)

    gl.drawElements(gl.TRIANGLES, grid.count, gl.UNSIGNED_SHORT, 0)

    gl.disableVertexAttribArray(program.aNdc)
    gl.depthMask(true)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(0, 0)

    // El mar se mueve, así que hay que pedir otro fotograma. Es la misma
    // decisión que en la capa de viento: lo pide el mapa, no un
    // `requestAnimationFrame` propio, para que el ciclo de dibujo siga siendo
    // suyo.
    map.triggerRepaint()
  }

  /**
   * Avanza la mezcla entre el campo anterior y el nuevo.
   *
   * Se interpolan los BYTES, no los valores decodificados, y eso es correcto
   * para los cuatro canales: las direcciones están guardadas como componentes
   * de un vector —interpolar componentes es interpolar el vector— y la altura y
   * el período son lineales. Con la dirección guardada como ángulo, esta misma
   * interpolación cruzaría el corte de los 360°.
   */
  private advanceBlend(gl: Gl, textures: OceanTextures, now: number): void {
    const from = this.previousField
    const to = this.field
    const buffers = this.blendBuffers
    if (!from || !to || !buffers) return

    const t = Math.min(1, (now - this.blendStart) / BLEND_MS)
    if (t < 1 && now - this.blendedAt < BLEND_STEP_MS) return
    this.blendedAt = now

    if (t >= 1) {
      uploadField(gl, textures, to)
      this.previousField = null
      return
    }

    const pairs: [Uint8Array, Uint8Array, Uint8Array][] = [
      [from.swell, to.swell, buffers[0]],
      [from.windSea, to.windSea, buffers[1]],
      [from.wind, to.wind, buffers[2]],
    ]
    for (const [a, b, out] of pairs) {
      for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t
    }
    uploadField(gl, textures, {
      size: to.size,
      box: to.box,
      swell: buffers[0],
      windSea: buffers[1],
      wind: buffers[2],
    })
  }

  /**
   * Copia lo que el mapa ya ha dibujado debajo del agua.
   *
   * Es la misma técnica que usa la capa de viento para decidir su contraste,
   * pero aquí sirve para otra cosa: para poder REFRACTARLO. Lo que hay debajo
   * del agua en el mapa es la ortofoto, la carta o el relieve, y verlo a través
   * de la ola —desviado por la propia pendiente de la superficie— es lo que
   * hace que el agua se vea encima de un fondo en vez de al lado de él.
   *
   * No hay realimentación posible: MapLibre repinta desde cero cada fotograma,
   * así que en el momento de la copia el agua del fotograma anterior no está.
   */
  private captureBackground(gl: Gl, textures: OceanTextures, now: number, map: MlMap): void {
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (w === 0 || h === 0) return

    const center = map.getCenter()
    const key = `${center.lng.toFixed(6)},${center.lat.toFixed(6)},${map.getZoom().toFixed(3)},${map.getBearing().toFixed(2)},${map.getPitch().toFixed(2)}`
    const moved = key !== this.backgroundKey
    const resized = w !== this.backgroundW || h !== this.backgroundH
    if (!moved && !resized && now - this.backgroundAt < BACKGROUND_IDLE_MS) return
    this.backgroundKey = key
    this.backgroundAt = now

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, textures.background)
    if (resized) {
      // RGB y no RGBA: en WebGL 1 no está garantizado que el framebuffer del
      // mapa lleve canal alfa, y pedir un canal que no está es un error que se
      // lleva por delante la capa entera. El color es lo único que hace falta.
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, w, h, 0)
      this.backgroundW = w
      this.backgroundH = h
    } else {
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h)
    }
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}
