/**
 * Qué enseñar donde hay una estación averiada.
 *
 * LA REGLA. Una avería no puede dejar un hueco mudo en el mapa, pero tampoco
 * puede inventarse una medida. Lo que se enseña es la ESTIMACIÓN DEL MODELO en
 * el punto de esa estación —la misma malla que ya está pintada debajo, hecha
 * con las estaciones sanas de alrededor y las anclas de Open-Meteo—, marcada
 * como estimación y con su banda de incertidumbre.
 *
 * POR QUÉ NO UNA MEDIA HISTÓRICA. Era la otra opción evidente y es la
 * equivocada. Una climatología acierta los días normales, que son justo los
 * días en los que a nadie le hace falta. La madrugada del 13 de agosto de 2026
 * entró aire sahariano y la cumbre de Garafía estaba a unos 25 °C; la media de
 * agosto en ese punto ronda los 18. El «respaldo» habría separado la cifra de
 * la realidad casi ocho grados, y precisamente durante el episodio extremo que
 * es cuando la gente abre la aplicación. El modelo, en cambio, usa lo que está
 * pasando HOY en las estaciones vecinas.
 *
 * Y hay un motivo estructural además del meteorológico: la estación averiada
 * está fuera del ajuste (ver `soundStations` en `useIslandData`), así que la
 * estimación en su punto NO está contaminada por ella. Con una media histórica
 * daría igual, pero con el modelo es lo que hace que la cifra valga algo.
 */

import { estimateBundle, type DisplayVariable, type Estimate, type Model } from './interpolate'
import type { InterpolableVariable } from './interpolate'
import type { Station } from './quality'

export interface FallbackReading {
  value: number
  /** ±, en unidades de la variable. */
  uncertainty: number
  /** Siempre true. Existe para que quien pinte no pueda olvidarse de decirlo. */
  estimated: true
  /** El punto queda fuera del rango de altitudes que la red mide de verdad. */
  elevationExtrapolated: boolean
}

/**
 * La estimación del modelo en el punto de una estación en la que no se cree.
 *
 * Devuelve `null` si el modelo tampoco puede decir nada ahí —red demasiado
 * pequeña, o punto sin vecinas dentro del radio de corte—, y entonces el pin
 * se queda sin cifra, que es la respuesta honesta.
 */
export function fallbackReading(
  models: Record<InterpolableVariable, Model | null>,
  station: Station,
  variable: DisplayVariable,
): FallbackReading | null {
  // El VPD no se estima aquí: no lo interpola ningún modelo, se deriva de T y
  // HR, y esa derivación vive en `estimateBundle`. Si algún día entra en este
  // camino, entra por ahí y no con una rama nueva.
  const bundle = estimateBundle(models, station.lon, station.lat, station.elevation)
  const picked: Estimate | null =
    variable === 'temperature'
      ? bundle.temperature
      : variable === 'relativehumidity'
        ? bundle.relativehumidity
        : variable === 'dewpoint'
          ? bundle.dewpoint
          : null
  if (!picked) return null
  return {
    value: picked.value,
    uncertainty: picked.uncertainty,
    estimated: true,
    elevationExtrapolated: picked.elevationExtrapolated,
  }
}
