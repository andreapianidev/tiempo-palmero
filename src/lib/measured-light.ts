/**
 * Cuánta luz y cuánto polvo hay ahora mismo, según lo que miden las estaciones.
 *
 * Son las dos entradas MEDIDAS del modelo de luz de `ocean/light.ts`: la
 * radiación solar de las estaciones del Cabildo, que dice cuánto tapan las
 * nubes, y el PM10 de las de calidad del aire, que dice cuánta calima hay. Todo
 * lo demás de esa luz es geometría.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE `useOcean`, que es donde estaba. Porque ya
 * no lo usa solo el agua: la cúpula del cielo de la vista 3D (`sky-dome.ts`)
 * pinta el mismo cielo que el mar refleja, y tiene que pintarlo con los mismos
 * números. Con la cuenta dentro del hook del océano había dos caminos posibles
 * y los dos malos: repetir las dos medianas —la duplicación que en este
 * repositorio ya ha mordido dos veces— o dejar el cielo sin dato cuando la capa
 * del mar está apagada, con lo que el mismo mediodía de calima saldría lechoso
 * con el océano encendido y limpio con el océano apagado.
 *
 * NO PIDE NADA. Las dos listas ya están descargadas para otras cosas.
 */

import type { LightInputs } from './ocean/light'
import type { Station } from './quality'

/** Lo que hace falta saber de una estación de calidad del aire. */
export interface AirValues {
  ageHours: number
  values: readonly { key: string; value: number }[]
}

/** Mediana, que aguanta un sensor disparado mejor que la media. */
function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Polvo en suspensión, µg/m³. Mediana de las estaciones frescas.
 *
 * SEIS HORAS de caducidad, contra las dos de la radiación, y la diferencia es
 * del fenómeno, no del sensor: una calima entra y se queda días, así que una
 * medida de hace cinco horas sigue describiendo el aire de ahora. La radiación
 * cambia con cada nube que pasa.
 */
export function pm10Now(air: readonly AirValues[]): number | null {
  const values: number[] = []
  for (const a of air) {
    if (a.ageHours > 6) continue
    const v = a.values.find((x) => x.key === 'pm10')
    if (v && Number.isFinite(v.value)) values.push(v.value)
  }
  return median(values)
}

/** Radiación solar, W/m². Mediana de las estaciones de menos de dos horas. */
export function solarNow(stations: readonly Station[]): number | null {
  const values = stations
    .filter((s) => s.ageHours <= 2 && s.solarradiation !== null)
    .map((s) => s.solarradiation as number)
    .filter((v) => Number.isFinite(v) && v >= 0)
  return median(values)
}

/** Las dos juntas, que es como las pide el modelo de luz. */
export function measuredLight(
  stations: readonly Station[],
  air: readonly AirValues[],
): LightInputs {
  return { pm10: pm10Now(air), solarWm2: solarNow(stations) }
}
