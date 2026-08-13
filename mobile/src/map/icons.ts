/**
 * Los iconos de sitios y de puntos de interés, dibujados para el mapa nativo.
 *
 * La web los registra como SVG: `new Image()`, `img.src = 'data:image/svg+xml…'`
 * y `map.addImage()`. Aquí no hay navegador que decodifique un SVG, y el
 * cargador de imágenes de React Native tampoco sabe. Así que se dibujan con
 * Skia —que ya está en el proyecto por la malla— y se escriben como PNG en el
 * directorio de caché: `<Images>` de MapLibre quiere una URL.
 *
 * El trazo y el color salen de `@core/lib/places` y `@core/lib/poi`, los mismos
 * que usa la web. Un icono redibujado a mano aquí sería otro icono.
 *
 * Los 24×24 del diseño se rasterizan a ×3. MapLibre nativo trata cada píxel del
 * PNG como un punto de pantalla, así que un bitmap de 24 px se vería borroso en
 * cualquier teléfono moderno: se generan 72 px y las capas piden un tercio del
 * tamaño que pide la web, con lo que el resultado ocupa lo mismo y le sobra
 * resolución.
 */

import { Skia, PaintStyle, StrokeCap, StrokeJoin } from '@shopify/react-native-skia'
import { Directory, File, Paths } from 'expo-file-system'
import { PLACES, placeImageId } from '@core/lib/places'
import { POI_ICONS, imageId, poiColor, poiGlyph } from '@core/lib/poi'

/** Cuántos píxeles de bitmap por punto del diseño. Ver la cabecera. */
export const ICON_SCALE = 3

/** Lado del icono en el diseño, el mismo que la web. */
const ICON_SIZE = 24

/** El disco de fondo, en las coordenadas del viewBox de 24×24. */
const DISC = { cx: 12, cy: 12, r: 10.2, fill: 'rgba(14,13,11,0.86)', stroke: 1.4 }

const GLYPH_STROKE = 1.5

function drawIcon(glyph: string, tint: string): Uint8Array | null {
  const side = ICON_SIZE * ICON_SCALE
  // `Make` y no `MakeOffscreen`: la primera es una superficie en memoria y la
  // segunda pide contexto de GPU. Son 43 bitmaps de 72×72 que se dibujan una
  // vez al arrancar y no se vuelven a componer nunca; levantar Metal o Vulkan
  // para eso es pedir un fallo en el peor momento —el arranque— a cambio de
  // nada.
  const surface = Skia.Surface.Make(side, side)
  if (!surface) return null
  const canvas = surface.getCanvas()
  canvas.scale(ICON_SCALE, ICON_SCALE)

  const fill = Skia.Paint()
  fill.setAntiAlias(true)
  fill.setColor(Skia.Color(DISC.fill))
  canvas.drawCircle(DISC.cx, DISC.cy, DISC.r, fill)

  const ring = Skia.Paint()
  ring.setAntiAlias(true)
  ring.setStyle(PaintStyle.Stroke)
  ring.setStrokeWidth(DISC.stroke)
  ring.setColor(Skia.Color(tint))
  canvas.drawCircle(DISC.cx, DISC.cy, DISC.r, ring)

  const path = Skia.Path.MakeFromSVGString(glyph)
  if (path) {
    const stroke = Skia.Paint()
    stroke.setAntiAlias(true)
    stroke.setStyle(PaintStyle.Stroke)
    stroke.setStrokeWidth(GLYPH_STROKE)
    stroke.setStrokeCap(StrokeCap.Round)
    stroke.setStrokeJoin(StrokeJoin.Round)
    stroke.setColor(Skia.Color(tint))
    canvas.drawPath(path, stroke)
  }

  const image = surface.makeImageSnapshot()
  const png = image.encodeToBytes()
  image.dispose()
  return png
}

/**
 * Genera los iconos una sola vez y devuelve el mapa `nombre → URL`, listo para
 * `<Images images={…}>`.
 *
 * Si alguno falla se queda fuera del mapa en vez de tumbar la carga entera: una
 * capa de símbolos a la que le falta una imagen dibuja los demás puntos y se
 * calla el que no puede, que es mucho mejor que quedarse sin senderos.
 */
export function buildMapIcons(): Record<string, string> {
  const dir = new Directory(Paths.cache, 'iconos')
  if (!dir.exists) dir.create({ intermediates: true })

  const out: Record<string, string> = {}
  const write = (name: string, png: Uint8Array | null) => {
    if (!png) return
    const file = new File(dir, `${name}.png`)
    if (file.exists) file.delete()
    file.create()
    file.write(png)
    out[name] = file.uri
  }

  for (const spec of PLACES) {
    try {
      write(placeImageId(spec.kind), drawIcon(spec.glyph, spec.color))
    } catch {
      // Ver arriba: un icono menos, no una capa menos.
    }
  }

  for (const icon of POI_ICONS) {
    try {
      write(imageId(icon), drawIcon(poiGlyph(icon), poiColor(icon)))
    } catch {
      // Idem.
    }
  }

  return out
}
