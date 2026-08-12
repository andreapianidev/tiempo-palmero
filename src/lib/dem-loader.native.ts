/**
 * Descarga del DEM en iOS y Android.
 *
 * Mismo manifiesto, mismas teselas y misma decodificación terrarium que en el
 * navegador: lo único que cambia es quién sabe abrir un PNG. Aquí es Skia, que
 * decodifica en nativo; hacerlo en JavaScript puro serían 4,1 millones de
 * píxeles inflados a mano en el hilo de la interfaz.
 *
 * Y una diferencia que el navegador no necesita: **las teselas se guardan en
 * disco**. Son 63 ficheros y casi 5 MB, y en la web los cachea el CDN con
 * `immutable`, pero aquí no hay caché de navegador que valga: sin esto, cada
 * arranque en frío vuelve a descargar el modelo de elevación entero antes de
 * poder enseñar nada. El relieve de una isla no cambia, así que se baja una vez
 * y se lee de disco para siempre; si una tesela cacheada está corrupta, se
 * vuelve a pedir a la red y se sigue.
 *
 * Las teselas se vuelcan sobre la malla según llegan: un lienzo de 1792 × 2304
 * en memoria antes de decodificar no aporta nada cuando ya se tiene el bitmap
 * de cada tesela por separado.
 */

import { Skia } from '@shopify/react-native-skia'
import { Directory, File, Paths } from 'expo-file-system'
import { blitTerrarium, demTilePath, demTiles, emptyDem, type Dem, type DemManifest } from './dem'
import { dataUrl } from './endpoints'

/** Cuántas teselas se piden a la vez. Son 63 y el móvil no es un servidor. */
const CONCURRENCY = 6

function pixelsOf(bytes: Uint8Array, source: string): Uint8Array {
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes))
  if (!image) throw new Error(`tesela DEM ilegible: ${source}`)
  // `readPixels()` sin argumentos devuelve la imagen entera en RGBA de 8 bits,
  // que es exactamente lo que espera `blitTerrarium`.
  const pixels = image.readPixels()
  image.dispose()
  if (!pixels) throw new Error(`tesela DEM sin píxeles: ${source}`)
  return pixels as Uint8Array
}

export async function loadDem(
  onProgress?: (done: number, total: number) => void,
): Promise<Dem> {
  const res = await fetch(dataUrl('/dem/manifest.json'))
  if (!res.ok) throw new Error('el servidor no sirve /dem/manifest.json')
  const manifest: DemManifest = await res.json()

  const dem = emptyDem(manifest)
  const { tileSize, x0, y0, zoom } = manifest
  const tiles = demTiles(manifest)

  // Un directorio por zoom: si algún día el manifiesto cambia de nivel, las
  // teselas viejas dejan de encontrarse solas en vez de mezclarse con las nuevas.
  const cache = new Directory(Paths.cache, 'dem', String(zoom))
  if (!cache.exists) cache.create({ intermediates: true })

  let next = 0
  let done = 0
  const worker = async () => {
    for (let k = next++; k < tiles.length; k = next++) {
      const { tx, ty } = tiles[k]
      const url = dataUrl(demTilePath(manifest, tx, ty))
      const file = new File(cache, `${tx}-${ty}.png`)

      let pixels: Uint8Array | null = null
      if (file.exists) {
        try {
          pixels = pixelsOf(new Uint8Array(await file.arrayBuffer()), file.uri)
        } catch {
          // Descarga a medias o fichero corrupto: se tira y se vuelve a la red.
          file.delete()
        }
      }
      if (!pixels) {
        const tile = await fetch(url)
        if (!tile.ok) throw new Error(`tesela DEM: HTTP ${tile.status} en ${url}`)
        const bytes = new Uint8Array(await tile.arrayBuffer())
        pixels = pixelsOf(bytes, url)
        // Se guarda DESPUÉS de decodificar bien: así en la caché no acaba
        // nunca un fichero que no se pueda abrir.
        try {
          file.create({ overwrite: true })
          file.write(bytes)
        } catch {
          // Sin disco la app sigue: solo pierde la caché.
        }
      }

      blitTerrarium(dem, pixels, {
        x: (tx - x0) * tileSize,
        y: (ty - y0) * tileSize,
        width: tileSize,
        height: tileSize,
      })
      onProgress?.(++done, tiles.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return dem
}
