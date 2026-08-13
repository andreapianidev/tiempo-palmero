/**
 * Registrar en el mapa del navegador los iconos de sitios y de puntos de
 * interés.
 *
 * Vivían dentro de `lib/places.ts` y `lib/poi.ts`, junto a los catálogos. Eso
 * ataba dos ficheros compartidos —trazos, colores y taxonomía, que las tres
 * plataformas necesitan— a `maplibre-gl`, a `new Image()` y a `img.decode()`,
 * que solo existen aquí. La app nativa no puede ni importarlos, porque dibuja
 * los mismos iconos con Skia.
 *
 * Así que el catálogo se queda en `lib/` y el registro está aquí, que es donde
 * hay un navegador. Las dos plataformas dibujan los mismos trazos; cada una los
 * mete en su mapa como sabe.
 *
 * Hay que esperar a que las imágenes estén decodificadas ANTES de añadir la
 * capa que las usa: si no, MapLibre pinta la capa sin icono y avisa por consola
 * de cada imagen que le falta.
 */

import type { Map as MlMap } from 'maplibre-gl'
import { PLACES, placeIconDataUrl, placeImageId } from '../lib/places'
import { POI_ICONS, imageId, poiIconDataUrl } from '../lib/poi'

/** Lado del icono en píxeles CSS. El bitmap se genera al doble, para HiDPI. */
const ICON_SIZE = 24

async function addIcon(map: MlMap, id: string, src: string): Promise<void> {
  if (map.hasImage(id)) return
  const img = new Image(ICON_SIZE * 2, ICON_SIZE * 2)
  img.src = src
  await img.decode().catch(() => undefined)
  // El mapa puede haberse destruido mientras se decodificaban.
  if (!map.getStyle() || map.hasImage(id)) return
  map.addImage(id, img, { pixelRatio: 2 })
}

export async function addPlaceIcons(map: MlMap): Promise<void> {
  await Promise.all(
    PLACES.map(({ kind }) =>
      addIcon(map, placeImageId(kind), placeIconDataUrl(kind, ICON_SIZE * 2)),
    ),
  )
}

export async function addPoiIcons(map: MlMap): Promise<void> {
  await Promise.all(
    POI_ICONS.map((icon) => addIcon(map, imageId(icon), poiIconDataUrl(icon, ICON_SIZE * 2))),
  )
}
