/**
 * El DEM de `public/dem/`, leído desde el disco en Node.
 *
 * `src/lib/dem-loader.ts` hace lo mismo en el navegador con un `<canvas>`. Esta
 * es la otra puerta al mismo modelo: la de los scripts, que no tienen DOM y sí
 * tienen sistema de ficheros.
 *
 * Existe como fichero propio porque la función estaba copiada literalmente en
 * los cuatro scripts de `scripts/checks/`. Mientras solo comprobaban cotas daba
 * igual; en cuanto un script empieza a medir pendientes, cuatro copias son
 * cuatro sitios donde arreglar el mismo borde.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { blitTerrarium, emptyDem, type Dem, type DemManifest } from '../src/lib/dem.js'

export const REPO_ROOT = join(import.meta.dirname, '..')

/** Lee el manifiesto y las 63 teselas y las cose en un único `Dem`. */
export function loadDem(root = REPO_ROOT): Dem {
  const manifest = JSON.parse(
    readFileSync(join(root, 'public/dem/manifest.json'), 'utf8'),
  ) as DemManifest
  const dem = emptyDem(manifest)
  for (let r = 0; r < manifest.rows; r++) {
    for (let c = 0; c < manifest.cols; c++) {
      const tx = manifest.x0 + c
      const ty = manifest.y0 + r
      const png = PNG.sync.read(
        readFileSync(join(root, `public/dem/${manifest.zoom}/${tx}/${ty}.png`)),
      )
      blitTerrarium(dem, new Uint8ClampedArray(png.data), {
        x: c * manifest.tileSize,
        y: r * manifest.tileSize,
        width: png.width,
        height: png.height,
      })
    }
  }
  return dem
}
