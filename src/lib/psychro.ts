/**
 * Psicrometría: relación entre temperatura, humedad relativa y punto de rocío.
 *
 * Magnus-Tetens con los coeficientes de Bolton (1980), válidos entre −40 y
 * +50 °C con un error por debajo de 0,1 %. Contrastado con las estaciones que
 * publican las tres variables a la vez: la RH que implican su T y su Td se
 * desvía de la RH que ellas mismas declaran 0,99 % de media, 2,45 % como
 * máximo. La fórmula describe estos sensores, no es una aproximación de libro.
 */

const A = 17.67
const B = 243.5 // °C

/** Presión de vapor de saturación, hPa. */
export function saturationVapourPressure(tempC: number): number {
  return 6.112 * Math.exp((A * tempC) / (tempC + B))
}

/** Humedad relativa (%) a partir de temperatura y punto de rocío. */
export function relativeHumidityFrom(tempC: number, dewpointC: number): number {
  return 100 * (saturationVapourPressure(dewpointC) / saturationVapourPressure(tempC))
}

/**
 * Punto de rocío (°C) a partir de temperatura y humedad relativa.
 *
 * Se calcula, no se interpola. El motivo es de cobertura: solo 10 de las 52
 * estaciones publican `dewpoint`, contra 30 que publican humedad. Interpolar
 * un campo con diez muestras sobre una isla de 2426 m produce disparates en
 * cuanto el punto se aleja de esas diez — un punto a 1632 m con 99 % de
 * humedad llegó a dar un rocío de −7,9 °C, que es imposible.
 *
 * Derivarlo cuesta unos 0,2 °C de exactitud en las diez estaciones que sí lo
 * miden — y esas diez son justamente donde la red de rocío es densa, así que
 * ese contraste favorece al método directo. A cambio, el resultado es
 * coherente con la temperatura y la humedad en TODA la isla, que es la
 * propiedad que hace falta.
 */
export function dewpointFrom(tempC: number, relativeHumidity: number): number {
  const rh = clampHumidity(relativeHumidity)
  // Con RH = 0 el logaritmo diverge; el suelo de 0,5 % mantiene el resultado
  // en un rango físico sin fingir precisión que no hay.
  const gamma = Math.log(Math.max(rh, 0.5) / 100) + (A * tempC) / (tempC + B)
  return (B * gamma) / (A - gamma)
}

/** La humedad relativa vive en [0, 100]. Un modelo lineal puede salirse. */
export function clampHumidity(value: number): number {
  return Math.min(100, Math.max(0, value))
}

// ---------------------------------------------------------------------------
// Presión: reducción al nivel del mar
// ---------------------------------------------------------------------------

/** Presión que tendría la atmósfera estándar a una altitud dada, en hPa. */
export function standardPressureAt(elevationM: number): number {
  return 1013.25 * (1 - 2.25577e-5 * elevationM) ** 5.25588
}

/**
 * Reduce una presión medida en la estación a su equivalente al nivel del mar,
 * usando la temperatura real de esa estación (fórmula hipsométrica).
 */
export function reduceToSeaLevel(
  pressureHpa: number,
  elevationM: number,
  tempC: number,
): number {
  const lapse = 0.0065
  const denom = tempC + lapse * elevationM + 273.15
  if (denom <= 0) return pressureHpa
  return pressureHpa * (1 - (lapse * elevationM) / denom) ** -5.257
}

/**
 * `atmosphericpressure` mezcla DOS convenciones distintas sin decirlo.
 *
 * Comprobado el 12 ago 2026 sobre las 25 estaciones que publican presión: la
 * familia `CABLPA-*` y similares dan presión ya reducida al nivel del mar
 * (~1015-1020 hPa a cualquier altitud), mientras que las `LaPalma WSAQPM *`
 * dan presión absoluta de estación, que sigue la curva barométrica. A 726 m la
 * diferencia entre ambas es de 86 hPa. Interpolar la columna tal cual mezcla
 * peras con manzanas y da un campo sin sentido: el ajuste sobre la altitud
 * salía con R² = 0,002 y un gradiente de +0,2 hPa/km, cuando la física exige
 * unos −125.
 *
 * El discriminante es holgado por encima de los 200 m y por debajo da igual,
 * porque ahí las dos convenciones convergen.
 */
export function looksLikeStationPressure(
  pressureHpa: number,
  elevationM: number,
): boolean {
  if (elevationM < 50) return false // indistinguible, y sin consecuencias
  return Math.abs(pressureHpa - standardPressureAt(elevationM)) < 15
}

/** Devuelve siempre presión al nivel del mar, venga como venga. */
export function normalizePressure(
  pressureHpa: number,
  elevationM: number,
  tempC: number,
): number {
  return looksLikeStationPressure(pressureHpa, elevationM)
    ? reduceToSeaLevel(pressureHpa, elevationM, tempC)
    : pressureHpa
}
