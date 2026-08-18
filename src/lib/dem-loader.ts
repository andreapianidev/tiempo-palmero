/**
 * Descarga del DEM en el navegador.
 *
 * Las 63 teselas se pintan sobre un único `<canvas>` y se leen de una vez:
 * `getImageData` es la parte cara y hacerla 63 veces cuesta más que hacerla una.
 *
 * Este fichero es la mitad web de la descarga, y el `<canvas>` es lo único que
 * tiene de navegador. Tuvo un gemelo —`dem-loader.native.ts`, que hacía lo mismo
 * con Skia— hasta que la app de iOS y Android se mudó a su propio repositorio en
 * agosto de 2026. Lo que se conserva es el reparto, no el gemelo: aquí dentro no
 * hay un solo `if` de plataforma, y quien traiga los píxeles de otra manera —el
 * escritorio de UE5— pone su cargador al lado en vez de una rama aquí.
 */

import { blitTerrarium, demTilePath, demTiles, emptyDem, type Dem, type DemManifest } from './dem'
import { dataUrl } from './endpoints'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`tesela DEM: ${src}`))
    img.src = src
  })
}

export async function loadDem(
  onProgress?: (done: number, total: number) => void,
): Promise<Dem> {
  const manifest: DemManifest = await fetch(dataUrl('/dem/manifest.json')).then((r) => {
    if (!r.ok) throw new Error('falta /dem/manifest.json — ejecuta npm run prepare-data')
    return r.json()
  })

  const dem = emptyDem(manifest)
  const { tileSize, x0, y0 } = manifest

  const canvas = document.createElement('canvas')
  canvas.width = dem.width
  canvas.height = dem.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin contexto 2D para el DEM')

  const tiles = demTiles(manifest)
  let done = 0
  // Las teselas son locales y están cacheadas por el CDN con immutable, así
  // que en paralelo no hay a quién molestar.
  await Promise.all(
    tiles.map(async ({ tx, ty }) => {
      const img = await loadImage(dataUrl(demTilePath(manifest, tx, ty)))
      ctx.drawImage(img, (tx - x0) * tileSize, (ty - y0) * tileSize)
      onProgress?.(++done, tiles.length)
    }),
  )

  blitTerrarium(dem, ctx.getImageData(0, 0, dem.width, dem.height).data, {
    x: 0,
    y: 0,
    width: dem.width,
    height: dem.height,
  })

  return dem
}
