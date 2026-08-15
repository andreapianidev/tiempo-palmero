/**
 * La cota de la base de la nube baja cuando no hay manta diagnosticada.
 *
 * CUÁNDO HACE FALTA ESTO. `clouds.ts` da la banda de la manta a partir de los
 * sondeos, y cuando la da, manda ella. Pero `present` exige DOS cosas —que haya
 * inversión y que haya nubosidad baja debajo—, y hay una situación intermedia
 * que se da a menudo: el modelo dice que hay un 30 % de nubosidad baja sobre el
 * noreste y los sondeos no encuentran inversión, o la encuentran seca. Entonces
 * hay nube que dibujar y no hay cota medida para ponerla.
 *
 * LA FÍSICA NO SE REESCRIBE AQUÍ. El nivel de condensación por ascenso sale de
 * `condensationCeiling`, en `vapor/field.ts`, que es la que ya gobierna hasta
 * dónde sube la bruma. Que las dos capas usen la MISMA función es justo lo que
 * hace que la columna de vapor termine donde empieza la nube en vez de
 * atravesarla o quedarse corta. Lo único que se hace en este fichero es
 * conseguir la temperatura y el punto de rocío medios de la isla, que es la
 * entrada que esa función pide.
 *
 * SE MUESTREA MÁS BASTO QUE EL VAPOR —24 × 24 en vez de 48 × 48— y es
 * deliberado: allí la malla ES el producto, aquí solo se quiere su media. Una
 * media sobre 576 puntos de tierra y una sobre 2304 no se distinguen en la
 * cifra que sale, y esta cuesta la cuarta parte.
 */

import { elevationAt, SEA_LEVEL_M, type Dem } from '../dem'
import { ISLAND_BBOX } from '../geo'
import { estimateBundle, type InterpolableVariable, type Model } from '../interpolate'
import { condensationCeiling } from '../vapor/field'

/** Puntos por lado del muestreo. Ver la cabecera. */
const SAMPLE_SIDE = 24

/**
 * El nivel de condensación por ascenso medio de la isla, en metros.
 *
 * `null` si no hay con qué calcularlo —sin DEM o sin modelo de temperatura—, y
 * entonces `decks.ts` cae en su cota por defecto y lo DECLARA como tal. Es
 * preferible a devolver un número que parezca calculado.
 */
export function islandLcl(
  dem: Dem | null,
  models: Record<InterpolableVariable, Model | null>,
): number | null {
  if (!dem || !models.temperature) return null

  const { west, south, east, north } = ISLAND_BBOX
  let tempSum = 0
  let dewSum = 0
  let counted = 0

  for (let j = 0; j < SAMPLE_SIDE; j++) {
    const lat = north - ((north - south) * j) / (SAMPLE_SIDE - 1)
    for (let i = 0; i < SAMPLE_SIDE; i++) {
      const lon = west + ((east - west) * i) / (SAMPLE_SIDE - 1)
      const elevation = elevationAt(dem, lon, lat)
      // Solo tierra emergida. Sobre el mar estas estaciones no miden nada, y
      // meter el océano en la media movería la cota con la cantidad de agua que
      // quepa en el rectángulo, que no es una propiedad del tiempo.
      if (elevation === null || elevation <= SEA_LEVEL_M) continue

      const bundle = estimateBundle(models, lon, lat, elevation)
      const t = bundle.temperature?.value ?? null
      if (t === null) continue
      tempSum += t
      // Sin punto de rocío se usa la propia temperatura, que da un LCL de cero y
      // se descarta solo en `condensationCeiling`: es el caso saturado.
      dewSum += bundle.dewpoint?.value ?? t
      counted++
    }
  }

  if (!counted) return null
  // Se pide con `deck = null` a propósito: aquí solo se quiere la rama del
  // nivel de condensación. Quién manda entre la manta medida y esta cifra lo
  // decide `lowDeck`, que es donde está esa regla escrita una sola vez.
  const { ceilingM, from } = condensationCeiling(null, tempSum / counted, dewSum / counted)
  return from === 'lcl' ? ceilingM : null
}
