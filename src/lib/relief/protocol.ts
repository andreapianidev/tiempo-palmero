/**
 * El protocolo `relieve://`, que es de dónde salen las teselas del sombreado.
 *
 * MapLibre deja registrar esquemas propios: cuando una fuente pide
 * `relieve://12/1845/1707`, en vez de irse a la red llama aquí y se queda con
 * lo que se le devuelva. Así el sombreado entra por la misma puerta que
 * cualquier otro fondo —con su caché de teselas, su descarte al alejarse y su
 * proyección sobre el terreno en la vista 3D— sin que el resto de la
 * aplicación tenga que saber que se está calculando en esta máquina.
 *
 * SI ALGO FALLA, NO SE ROMPE NADA. Cada camino de salida devuelve una tesela
 * transparente en vez de un error: por debajo sigue estando el `hillshade` de
 * MapLibre, que se deja puesto justo para eso. Sin WebGL2, sin las teselas del
 * modelo o con un shader que no compile, lo que se ve es el relieve de antes,
 * no un agujero negro.
 */

import maplibregl from 'maplibre-gl'
import type { DemManifest } from '../dem'
import { surface, upload } from './gl'
import { inTurn } from './queue'
import { metersPerPixel } from './coverage'
import { demMosaic, APRON } from './mosaic'
import { RELIEF_PARAMS, RELIEF_TILE_PX } from './params'
import { RELIEF_FRAG } from './shader'
import { RELIEF_SCHEME } from './source'
import { reliefWindow } from './window'

/** Un PNG de 1 × 1 transparente. La respuesta cuando no hay nada que dibujar. */
const EMPTY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const empty = () => ({ data: EMPTY_PNG.buffer.slice(0) as ArrayBuffer })

let manifest: DemManifest | null = null
let registered = false
let texture: WebGLTexture | null = null

/**
 * Deja el protocolo listo. Se llama al construir el estilo, que es cuando por
 * primera vez se sabe qué modelo hay. Volver a llamarlo solo actualiza el
 * manifiesto: registrar dos veces el mismo esquema es un aviso de MapLibre.
 */
export function registerRelief(dem: DemManifest): void {
  manifest = dem
  if (registered) return
  registered = true
  maplibregl.addProtocol(RELIEF_SCHEME, (params) => inTurn(() => render(params.url)))
}

async function render(url: string): Promise<{ data: ArrayBuffer | ImageBitmap }> {
  const m = /^relieve:\/\/(\d+)\/(\d+)\/(\d+)/.exec(url)
  if (!m || !manifest) return empty()

  const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const win = reliefWindow(manifest, z, x, y)
  if (!win) return empty()

  const gl2 = surface()
  const program = gl2?.program(RELIEF_FRAG)
  if (!gl2 || !program) return empty()

  const board = await demMosaic(manifest, win.demZoom, win.demX, win.demY)
  if (!board) return empty()

  const { gl } = gl2
  if (!texture) texture = gl2.texture()
  if (!texture) return empty()

  const mosaicPx = manifest.tileSize * (1 + 2 * APRON)
  const p = RELIEF_PARAMS

  const bitmap = await gl2.draw(program, RELIEF_TILE_PX, RELIEF_TILE_PX, () => {
    gl.activeTexture(gl.TEXTURE0)
    upload(gl, texture as WebGLTexture, board as unknown as ImageBitmap)
    const u = (name: string) => gl.getUniformLocation(program, name)
    gl.uniform1i(u('u_dem'), 0)
    gl.uniform2f(u('u_demSize'), mosaicPx, mosaicPx)
    gl.uniform3f(u('u_window'), win.originX, win.originY, win.side)
    gl.uniform1f(u('u_out'), RELIEF_TILE_PX)
    gl.uniform1f(u('u_mpp'), metersPerPixel(win.demZoom, win.demY, manifest!.tileSize))

    gl.uniform4fv(u('u_azimuth'), p.azimuths)
    gl.uniform4fv(u('u_weight'), p.weights)
    gl.uniform1f(u('u_altitude'), p.altitude)
    gl.uniform1f(u('u_sky'), p.sky)
    gl.uniform1f(u('u_texture'), p.texture)
    gl.uniform1f(u('u_textureScale'), p.textureScale)
    gl.uniform1f(u('u_accentAt'), p.accentAt)
    gl.uniform1f(u('u_accent'), p.accent)

    gl.uniform3fv(u('c_shadow'), p.shadow)
    gl.uniform3fv(u('c_highlight'), p.highlight)
    gl.uniform3fv(u('c_accent'), p.accentColor)
    gl.uniform3fv(u('c_warm'), p.warm)
    gl.uniform3fv(u('c_cool'), p.cool)
    gl.uniform1f(u('u_tint'), p.tint)
    gl.uniform1f(u('u_summit'), p.summit)
  })

  return bitmap ? { data: bitmap } : empty()
}
