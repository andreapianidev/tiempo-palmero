/**
 * Los avisos de los 49 senderos, recalculados cuando cambia el modelo.
 *
 * NO DESCARGA NADA. El trazado ya está en `island.trails` y el campo ya está
 * calculado; esto es aritmética sobre lo que hay. Por eso es un `useMemo` y no
 * un `useEffect` con estado: no hay nada asíncrono que esperar.
 *
 * EL COSTE, MEDIDO EN LO QUE CUESTA. Muestrear las 49 rutas a 200 m son unos
 * 3.200 puntos, y cada punto llama a `estimateBundle`, que es lo mismo que
 * hace la malla del mapa en cada uno de sus ~12.000 píxeles. O sea: una cuarta
 * parte de lo que la aplicación ya hace en cada refresco. Se recalcula sólo
 * cuando cambia el modelo, el DEM o el campo de viento, y no en cada render.
 *
 * Va detrás de `enabled` de todas formas: si nadie ha abierto la sección, ni
 * siquiera esa cuarta parte hace falta gastarla.
 */

import { useMemo } from 'react'
import type { Dem } from '../lib/dem'
import type { NamedArea } from '../lib/geo'
import type { InterpolableVariable, Model } from '../lib/interpolate'
import type { WindField } from '../lib/wind/field'
import type { CloudDeck } from '../lib/clouds'
import { parseTrails, sampleTrail } from '../lib/trails/sample'
import { rankReports, trailAlerts, type TrailReport } from '../lib/trails/alerts'

export function useTrailReports(
  trails: unknown | null,
  dem: Dem | null,
  models: Record<InterpolableVariable, Model | null>,
  wind: WindField | null,
  municipalities: NamedArea[],
  deck: CloudDeck | null,
  enabled: boolean,
): TrailReport[] {
  const parsed = useMemo(() => (trails ? parseTrails(trails) : []), [trails])

  return useMemo(() => {
    if (!enabled || !dem || !parsed.length) return []
    if (!models.temperature) return []

    const reports: TrailReport[] = []
    for (const trail of parsed) {
      const profile = sampleTrail(trail, dem, models, wind, municipalities)
      if (profile) reports.push(trailAlerts(profile, deck))
    }
    return rankReports(reports)
  }, [parsed, dem, models, wind, municipalities, deck, enabled])
}
