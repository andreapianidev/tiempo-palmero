/**
 * Humedad del combustible fino muerto, y el índice meteorológico que sale de
 * ella.
 *
 * ES LA PIEZA QUE MÁS SE APOYA EN LO QUE ESTA APLICACIÓN YA SABE HACER. La
 * hojarasca, la pinocha y la hierba seca —lo que prende— no guardan agua: se
 * equilibran con el aire que tienen encima en cuestión de una hora. Así que su
 * humedad no hay que medirla con un sensor que no existe, se calcula de la
 * temperatura y la humedad relativa, que es exactamente lo que el motor de
 * interpolación entrega en cualquier punto de la isla. Ni una petición más, ni
 * un modelo externo: sale de las estaciones del Cabildo.
 *
 * Y no es la humedad relativa con otro nombre. La relación entre las dos no es
 * una recta, y ahí está todo: calculado con estas fórmulas a 25 °C, bajar del
 * 90 % al 70 % de humedad relativa quita 7,6 puntos de humedad al combustible
 * —de 20,2 a 12,6— y bajar del 40 % al 20 % quita solo 3,2, de 7,5 a 4,3. En
 * puntos parece menos; en peligro es al revés, porque por debajo del 8 % la
 * hojarasca prende con cualquier cosa y por encima del 20 % cuesta hacerla
 * arder. El mismo salto de veinte puntos de humedad relativa significa dos
 * cosas distintas según de dónde se baje.
 *
 * La temperatura pesa mucho menos de lo que se supone: entre los 12 °C de la
 * cumbre y los 26 °C de la costa a la misma humedad relativa hay 0,37 puntos de
 * humedad de combustible (0,71 con aire húmedo, al 80 %). Manda la humedad. Se
 * deja escrito aquí porque la intuición dice lo contrario y porque el día que
 * alguien quiera simplificar esto conviene que sepa cuál de los dos términos
 * puede tocar.
 *
 * DE DÓNDE SALEN LAS FÓRMULAS, y qué se afirma de cada una:
 *
 *  - **Humedad de equilibrio**: Simard (1968), «An analysis of rainfall,
 *    fuel moisture and fire danger», USDA Forest Service. Son tres tramos por
 *    humedad relativa, y la temperatura entra en grados **Fahrenheit** — no es
 *    un capricho de traducción, es que los coeficientes están ajustados así y
 *    pasarlos a Celsius sin reajustarlos cambia el resultado. La conversión se
 *    hace aquí dentro y nadie más se entera.
 *  - **Índice de Fosberg** (FFWI): Fosberg (1978), «Weather in wildland fire
 *    management: the fire weather index». Combina esa humedad con el viento y
 *    está normalizado para que 100 sea el caso extremo (combustible seco del
 *    todo con 30 mph de viento).
 *
 * LO QUE ESTE FICHERO NO HACE. No dice si hay peligro de incendio. Da dos
 * números físicos; quién los convierte en una probabilidad es el modelo, y qué
 * se enseña de ellos lo decide la interfaz. Aquí no hay ni un umbral.
 *
 * Y la advertencia que acompaña al FFWI allá donde se use: está ajustado con
 * combustibles del oeste de Estados Unidos, no con el pinar canario ni con el
 * fayal-brezal. Sirve para ordenar días y sitios entre sí —hoy peor que ayer,
 * esta ladera peor que aquella—, no para afirmar en términos absolutos que un
 * valor concreto significa un peligro concreto.
 */

/**
 * Humedad de equilibrio del combustible fino muerto, en % de peso seco.
 *
 * `temperatureC` en grados Celsius y `relativeHumidity` de 0 a 100, que es como
 * viaja todo en esta aplicación. Devuelve `null` si alguno de los dos no es un
 * número utilizable: un combustible sin humedad calculable no es un combustible
 * seco.
 */
export function equilibriumMoisture(
  temperatureC: number,
  relativeHumidity: number,
): number | null {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(relativeHumidity)) return null
  const h = Math.min(100, Math.max(0, relativeHumidity))
  const t = temperatureC * 1.8 + 32 // Simard trabaja en Fahrenheit

  let m: number
  if (h < 10) {
    m = 0.03229 + 0.281073 * h - 0.000578 * h * t
  } else if (h <= 50) {
    m = 2.22749 + 0.160107 * h - 0.014784 * t
  } else {
    m = 21.0606 + 0.005565 * h * h - 0.00035 * h * t - 0.483199 * h
  }
  // Los tres tramos son ajustes empíricos y en los extremos pueden salirse por
  // abajo. Una humedad negativa no existe; el techo es el punto de saturación
  // de la fibra, que es donde la madera deja de admitir agua ligada.
  return Math.min(35, Math.max(0, m))
}

/** Metros por segundo a millas por hora, que es la unidad del índice. */
const MPH_PER_MS = 2.236936

/**
 * Índice meteorológico de incendios de Fosberg, de 0 a ~100.
 *
 * `windSpeedMs` en metros por segundo, que es como lo publica la red del
 * Cabildo y como lo guarda el campo de viento de esta aplicación.
 *
 * El viento entra como `√(1 + U²)`: no es que empuje el fuego —eso lo hace,
 * pero es propagación, no ignición— sino que renueva el aire sobre el
 * combustible y se lleva la capa húmeda que lo protege.
 */
export function fosbergIndex(
  temperatureC: number,
  relativeHumidity: number,
  windSpeedMs: number,
): number | null {
  const m = equilibriumMoisture(temperatureC, relativeHumidity)
  if (m === null || !Number.isFinite(windSpeedMs)) return null

  const x = m / 30
  const eta = 1 - 2 * x + 1.5 * x * x - 0.5 * x * x * x
  const u = Math.max(0, windSpeedMs) * MPH_PER_MS
  // El 0,3002 es lo que hace que el caso extremo del artículo —combustible a
  // cero con 30 mph— salga exactamente 100.
  return Math.min(100, (eta * Math.sqrt(1 + u * u)) / 0.3002)
}
