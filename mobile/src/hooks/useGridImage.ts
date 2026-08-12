/**
 * La malla interpolada, convertida en algo que MapLibre nativo sepa poner sobre
 * el mapa.
 *
 * El cálculo es el compartido —`rasterizeGrid`, el mismo que pinta la web—; lo
 * único propio de aquí es el envoltorio: Skia monta los píxeles en un PNG y el
 * PNG se escribe en el directorio de caché, porque `ImageSource` de MapLibre
 * quiere una URL y una `data:` de 200 kB atravesando el puente nativo en cada
 * recálculo es justo lo que no queremos.
 *
 * El fichero alterna entre dos nombres. Reescribir siempre el mismo dejaba a
 * MapLibre enseñando la imagen anterior: la URL no cambiaba, así que para él no
 * había nada nuevo que cargar.
 */

import { useEffect, useRef, useState } from 'react'
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia'
import { Directory, File, Paths } from 'expo-file-system'
import { rasterizeGrid, type GridRaster } from '@core/lib/grid'
import { estimateBundle, type DisplayVariable, type InterpolableVariable, type Model } from '@core/lib/interpolate'
import type { Dem } from '@core/lib/dem'
import type { RgbStop } from '@core/lib/palette'
import { GRID_STEP } from '../config'

export interface GridImage {
  uri: string
  /** Esquinas en el orden que pide MapLibre: NO, NE, SE, SO. */
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ]
  landCells: number
  cellMeters: number
}

function writePng(raster: GridRaster, turn: number): string {
  const data = Skia.Data.fromBytes(new Uint8Array(raster.pixels.buffer))
  const image = Skia.Image.MakeImage(
    {
      width: raster.cols,
      height: raster.rows,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    },
    data,
    raster.cols * 4,
  )
  if (!image) throw new Error('la malla no se pudo montar como imagen')
  const png = image.encodeToBytes()
  image.dispose()

  const dir = new Directory(Paths.cache, 'malla')
  if (!dir.exists) dir.create({ intermediates: true })
  const file = new File(dir, `malla-${turn % 2}.png`)
  if (file.exists) file.delete()
  file.create()
  file.write(png)
  return file.uri
}

/**
 * Recalcula la malla cuando cambian el modelo, la variable o la paleta.
 *
 * Va detrás de un `setTimeout(0)` a propósito: son decenas de miles de
 * estimaciones seguidas y lanzarlas dentro del render deja la interfaz
 * congelada antes de que el mapa llegue siquiera a aparecer. Así entra el
 * primer fotograma con el relieve, y la malla cae encima cuando está.
 */
export function useGridImage(
  dem: Dem | null,
  models: Record<InterpolableVariable, Model | null>,
  variable: DisplayVariable,
  stops: RgbStop[],
  enabled: boolean,
): { image: GridImage | null; computing: boolean } {
  const [image, setImage] = useState<GridImage | null>(null)
  const [computing, setComputing] = useState(false)
  const turn = useRef(0)

  useEffect(() => {
    if (!dem || !enabled || !models.temperature) return
    let cancelled = false
    setComputing(true)

    const id = setTimeout(() => {
      try {
        const raster = rasterizeGrid(
          dem,
          (lon, lat, elevation) =>
            estimateBundle(models, lon, lat, elevation)[variable]?.value ?? null,
          stops,
          { step: GRID_STEP },
        )
        if (cancelled) return
        const uri = writePng(raster, turn.current++)
        const [[west, south], [east, north]] = raster.bounds
        setImage({
          uri,
          coordinates: [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
          ],
          landCells: raster.landCells,
          cellMeters: raster.cellMeters,
        })
      } catch {
        // Sin malla el mapa sigue siendo un mapa: relieve, pins y ficha. No se
        // tumba la pantalla porque falle una imagen decorativa.
        if (!cancelled) setImage(null)
      } finally {
        if (!cancelled) setComputing(false)
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [dem, models, variable, stops, enabled])

  return { image, computing }
}
