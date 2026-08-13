/**
 * La cumbre DENTRO del motor: la estación del TNG como una muestra más, a
 * 2387 m.
 *
 * POR QUÉ EXISTE ESTE FICHERO, Y POR QUÉ ANTES NO. `roque.ts` decía que esta
 * estación no entraba en el motor a propósito, por ser de un tercero sin
 * compromiso de disponibilidad. La objeción sigue siendo buena y aquí se
 * respeta entera —abajo, en «FALLA EN ABIERTO»—, pero la conclusión era
 * equivocada, y lo que la desmonta es una cifra:
 *
 * **La red del Cabildo no llega.** Medido el 13 ago 2026 a las 11:48 UTC sobre
 * las 34 estaciones frescas: el techo estaba en 1561 m y por encima de 1500 m
 * publicaba UNA sola estación. Entre ella y la cumbre hay 826 m de isla que
 * nadie mide. Extrapolando la recta altitudinal del Cabildo a 2387 m salía:
 *
 *   - temperatura **27,3 °C** contra los **23,5 °C** medidos → **+3,8 K**;
 *   - humedad relativa **−9,5 %** contra el **15 %** medido → un número que no
 *     es que se equivoque 24 puntos, es que **no existe**: no hay humedad
 *     relativa negativa.
 *
 * El motor ya no extrapola a pelo —las anclas del perfil vertical tapan ese
 * agujero desde el 12 ago, y contra esta misma estación se equivocan 1,34 K
 * (ver `profile.ts`)—, así que lo que este fichero cambia no es un desastre por
 * un acierto: es **un valor de modelo de 1,34 K de error por una medida**. Es
 * el único termómetro real que hay por encima de 1561 m, y estaba encendido
 * mientras la aplicación decidía qué hacía a 2000 m preguntándole a un modelo.
 *
 * FALLA EN ABIERTO, y esa es la parte que hace que se pueda usar. Si el TNG no
 * contesta, si el campo llega marcado `outdated`, o si la lectura tiene más de
 * `MAX_AGE_H`, esto devuelve `null` y el motor se comporta EXACTAMENTE como
 * antes: anclas de modelo por encima del techo, y nada más. La disponibilidad
 * del observatorio nunca es una condición para que el mapa de la isla se
 * pinte.
 *
 * TAMPOCO ENTRA EN EL AJUSTE. Igual que las anclas, esta muestra vive por
 * encima del techo de la red: no toca el gradiente, ni el R², ni la σ, ni la
 * validación leave-one-out, que siguen siendo los de la red del Cabildo. Solo
 * se suma al campo de residuos allí donde la red no mide. Ver `buildModel`.
 */

import { BOUNDS, MAX_AGE_H, type Station } from './quality'
import { normalizePressure } from './psychro'
import {
  ROQUE_ELEVATION_M,
  ROQUE_LAT,
  ROQUE_LON,
  type RoqueKey,
  type RoqueStatus,
} from './roque'
import { MIN_HUMIDITY_DROP_PP, STABLE_GRADIENT_K_PER_100M } from './profile'

/**
 * Identidad de la estación dentro del motor.
 *
 * Lleva prefijo de red a propósito: los `entityId` del Cabildo son opacos
 * (`CABLPA-CUMBRENUEVA`, `MTD3016CP (SN: 0408)`) y una colisión aquí haría que
 * el diagnóstico de avería de una estación se le aplicara a la otra.
 */
export const SUMMIT_ENTITY_ID = 'tng:roque'
export const SUMMIT_NAME = 'Roque de los Muchachos'

/**
 * Lee un campo del parte del TNG SOLO si se puede defender.
 *
 * Tres filtros, y los tres son de la fuente, no inventados aquí:
 *
 *  1. `outdated` — lo declara el propio origen, campo a campo. Es lo mejor que
 *     tiene esta fuente y respetarlo es la razón de que se pueda usar.
 *  2. La edad, contra el MISMO `MAX_AGE_H` que se le exige a cualquier
 *     estación del Cabildo. Un dato de cumbre no vale más por ser de cumbre.
 *  3. `BOUNDS`, el mismo guardarraíl de plausibilidad de `quality.ts`.
 */
function reading(
  status: RoqueStatus,
  key: RoqueKey,
  /** Clave de `BOUNDS`, o `null` para los campos que la red tampoco acota. */
  bound: string | null,
  now: number,
): number | null {
  const f = status.fields[key]
  if (!f || f.outdated || !Number.isFinite(f.value)) return null
  if ((now - f.observedAt) / 3_600_000 > MAX_AGE_H) return null
  const limits = bound === null ? undefined : BOUNDS[bound]
  if (limits && (f.value < limits[0] || f.value > limits[1])) return null
  return f.value
}

/**
 * Convierte el parte de la cumbre en una estación del motor. `null` si no hay
 * nada defendible que ofrecer.
 *
 * SIN TEMPERATURA NO HAY ESTACIÓN, aunque lleguen los demás campos. Lo que
 * esta muestra viene a arreglar es la estructura vertical por encima del techo
 * de la red, y esa la sostiene la temperatura: una entrada con viento y presión
 * pero sin termómetro no aporta nada al motor y sí un pin en el mapa que
 * parecería una estación viva.
 *
 * El punto de rocío NO se lee del origen aunque venga: llega marcado
 * `outdated` casi siempre —comprobado el 13 ago 2026, cuatro horas de retraso
 * mientras T y humedad iban al minuto— y con T y humedad frescas queda
 * determinado. Se deja en `null` y lo deriva `stationReading`, que ya marca lo
 * calculado como calculado en toda la aplicación.
 */
export function summitStation(status: RoqueStatus | null, now: number): Station | null {
  if (!status) return null

  const temperature = reading(status, 'temperature', 'temperature', now)
  if (temperature === null) return null

  const relativehumidity = reading(status, 'humidity', 'relativehumidity', now)

  /**
   * UNIDADES DISTINTAS, y esto no lo avisa nadie. El TNG publica el viento en
   * **m/s** (`units: "m/s"`, comprobado el 13 ago 2026: 2,2) y `Station.windspeed`
   * es **km/h** en toda la aplicación —el `BOUNDS` de 200 y la etiqueta de
   * `StationHistory` lo fijan—. Sin este ×3,6 la cumbre saldría con un viento
   * flojo permanente, que es la clase de error que no se ve porque el número
   * parece razonable.
   *
   * El límite se comprueba DESPUÉS de convertir, contra el mismo `BOUNDS` que
   * el resto de la red.
   */
  const windMs = reading(status, 'windspeed', null, now)
  const windKmh = windMs === null ? null : windMs * 3.6
  const windspeed =
    windKmh !== null && windKmh >= BOUNDS.windspeed[0] && windKmh <= BOUNDS.windspeed[1]
      ? windKmh
      : null

  const winddirection = reading(status, 'winddir', null, now)
  const pressure = reading(status, 'pressure', 'atmosphericpressure', now)
  // Sin límite, igual que en la red del Cabildo: `BOUNDS` no tiene entrada para
  // la radiación y no se va a inventar una aquí solo para este punto.
  const solarradiation = reading(status, 'solarimeter', null, now)

  // La hora de la MEDIDA de temperatura, no la de la descarga ni la del campo
  // más fresco: es el valor que sostiene esta muestra y es su reloj el que
  // tiene que contar para la frescura que se enseña.
  const timeinstant = status.fields.temperature!.observedAt

  return {
    entityId: SUMMIT_ENTITY_ID,
    name: SUMMIT_NAME,
    network: 'tng',
    lon: ROQUE_LON,
    lat: ROQUE_LAT,
    // Del propio observatorio, NO del DEM. El DEM de terrarium a zoom 12 se
    // queda corto en la cumbre y aquí hay una cota publicada por quien puso la
    // estación, que es mejor dato que un ráster interpolado.
    elevation: ROQUE_ELEVATION_M,
    timeinstant,
    ageHours: (now - timeinstant) / 3_600_000,
    temperature,
    relativehumidity,
    dewpoint: null, // derivado por `stationReading`; ver la cabecera
    windspeed,
    winddirection,
    // El TNG no publica lluvia: es un observatorio, no una estación
    // agroclimática. `null` es la respuesta correcta, nunca 0.
    precipitation: null,
    dailyprecipitation: null,
    // A 2387 m no hay ninguna duda de convención: 779 hPa solo puede ser
    // presión de estación. El discriminante de `normalizePressure` la
    // clasifica por 32 hPa contra 234, así que no es una decisión ajustada.
    atmosphericpressure:
      pressure === null ? null : normalizePressure(pressure, ROQUE_ELEVATION_M, temperature),
    pressureWasReduced: pressure !== null,
    uv: null,
    solarradiation,
    dailyevapotranspiration: null,
    feellikestemperature: null,
    illuminance: null,
    visibility: null,
    raw: {
      entityid: SUMMIT_ENTITY_ID,
      name: SUMMIT_NAME,
      temperature,
      relativehumidity,
      windspeed,
      winddirection,
      atmosphericpressure: pressure,
      solarradiation,
    },
  }
}

// ---------------------------------------------------------------------------
// La capa que nadie medía
// ---------------------------------------------------------------------------

export interface SummitLayer {
  /** Estación real más alta de la red, la base de la capa. */
  fromName: string
  fromElevation: number
  /** Espesor de la capa, en metros. */
  spanM: number
  /** Gradiente MEDIDO, en K/100 m. Positivo = la temperatura sube al subir. */
  gradient: number
  /** Puntos de humedad relativa ganados al subir. Negativo = el aire se seca. */
  deltaRh: number | null
  /**
   * La capa cumple, CON DATOS MEDIDOS, el criterio de capa subsidente que
   * `detectInversion` aplica sobre el modelo: estable y secándose.
   */
  subsident: boolean
}

/**
 * Mide la capa entre la estación real más alta de la red y la cumbre.
 *
 * QUÉ CONTESTA, Y QUÉ NO. No localiza la inversión del alisio: su base está
 * entre ~800 y ~1500 m, casi siempre POR DEBAJO del techo de la red, y dos
 * puntos no dan una base. Lo que da es lo otro —si el tramo que el motor
 * rellena con modelo está estable y seco o bien mezclado— y lo da con dos
 * termómetros en vez de con un sondeo. El 13 ago 2026 a las 11:48 UTC ese
 * tramo iba de 29,1 °C a 1561 m a 23,5 °C a 2387 m: **−0,68 K/100 m**, con la
 * humedad subiendo 3 puntos. Bien mezclado, ninguna capa subsidente ahí
 * arriba, y el modelo diciendo lo mismo por su cuenta.
 *
 * Se usa el MISMO criterio y los MISMOS umbrales que `detectInversion`
 * —importados, no copiados— para que las dos respuestas sean comparables. Si
 * se retocan allí, aquí cambian solos.
 *
 * Devuelve `null` si falta cualquiera de los dos extremos, que también es una
 * respuesta: sin cumbre no hay capa que medir.
 */
export function summitLayer(
  stations: readonly Station[],
  summit: Station | null,
): SummitLayer | null {
  if (!summit || summit.temperature === null) return null

  const base = stations
    .filter((s) => s.temperature !== null && s.elevation < summit.elevation)
    .sort((a, b) => b.elevation - a.elevation)[0]
  if (!base || base.temperature === null) return null

  const spanM = summit.elevation - base.elevation
  if (spanM <= 0) return null

  const gradient = ((summit.temperature - base.temperature) / spanM) * 100
  const deltaRh =
    summit.relativehumidity !== null && base.relativehumidity !== null
      ? summit.relativehumidity - base.relativehumidity
      : null

  return {
    fromName: base.name,
    fromElevation: base.elevation,
    spanM,
    gradient,
    deltaRh,
    subsident:
      gradient >= STABLE_GRADIENT_K_PER_100M &&
      deltaRh !== null &&
      deltaRh <= MIN_HUMIDITY_DROP_PP,
  }
}
