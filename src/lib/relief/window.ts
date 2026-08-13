/**
 * Qué trozo del modelo le toca a cada tesela de relieve.
 *
 * El modelo llega hasta z12. Por encima de ahí MapLibre haría lo de siempre:
 * coger la imagen de z12 y AMPLIARLA, que es repartir el mismo píxel entre
 * cuatro. Aquí, en vez de eso, se vuelve a dibujar: la tesela de z13 se pinta
 * leyendo el cuarto que le corresponde de la tesela de z12 del modelo, con la
 * misma superficie bicúbica y los mismos 512 píxeles de salida.
 *
 * La diferencia entre las dos cosas no es un matiz. Ampliar una imagen de
 * sombreado reparte el sombreado; volver a sombrear una superficie
 * interpolada reparte la SUPERFICIE y calcula la luz otra vez, así que la
 * ladera sigue teniendo un degradado continuo en vez de escalones.
 *
 * Y sigue sin inventarse terreno: entre dos cotas medidas se dibuja la curva
 * que las une, que es exactamente lo que hace el motor de interpolación con la
 * temperatura. Por eso el margen es de dos niveles y no de cinco: a z14 un
 * píxel de pantalla son 4,2 m de suelo y el dato de partida mide 33,5. Más
 * allá, lo que se estaría enseñando ya no tiene nada que ver con lo que se
 * midió, y ahí es mejor que se note que se ha llegado al límite.
 */

import type { DemManifest } from '../dem'
import { APRON } from './mosaic'

/** Cuántos niveles se dibujan por encima del zoom del modelo. */
export const OVERZOOM = 2

export interface ReliefWindow {
  /** La tesela del modelo que hay que leer. */
  demZoom: number
  demX: number
  demY: number
  /** El trozo de ese mosaico que se pinta, en píxeles del modelo. */
  originX: number
  originY: number
  side: number
}

/**
 * `null` si el zoom pedido queda fuera de lo que se sabe dibujar — que no
 * debería pasar, porque la fuente declara sus límites, pero un protocolo que
 * se cree lo que le llega es un protocolo que un día pinta basura.
 */
export function reliefWindow(
  manifest: DemManifest,
  z: number,
  x: number,
  y: number,
): ReliefWindow | null {
  if (z < manifest.minZoom || z > manifest.zoom + OVERZOOM) return null

  const steps = Math.max(0, z - manifest.zoom)
  const scale = 2 ** steps
  const demX = Math.floor(x / scale)
  const demY = Math.floor(y / scale)
  const side = manifest.tileSize / scale

  return {
    demZoom: z - steps,
    demX,
    demY,
    // El mosaico lleva una tesela de margen por cada lado, así que la central
    // no empieza en cero.
    originX: APRON * manifest.tileSize + (x - demX * scale) * side,
    originY: APRON * manifest.tileSize + (y - demY * scale) * side,
    side,
  }
}
