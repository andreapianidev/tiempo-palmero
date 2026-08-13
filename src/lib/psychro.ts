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

/**
 * Déficit de presión de vapor (kPa): cuánta sed tiene el aire.
 *
 * `VPD = es(T) − ea`, y como `ea = es(T)·RH/100`, sale `es(T)·(1 − RH/100)`.
 * Se devuelve en kilopascales porque es la unidad en la que están escritos
 * todos los umbrales agronómicos, incluido FAO-56; `saturationVapourPressure`
 * trabaja en hectopascales, de ahí el factor 10.
 *
 * POR QUÉ ESTA VARIABLE Y NO LA HUMEDAD RELATIVA. La humedad relativa no dice
 * lo que la planta siente, porque es una razón contra un denominador que se
 * mueve: 80 % a 12 °C y 80 % a 28 °C son 0,28 y 0,76 kPa de déficit, casi el
 * triple de demanda con el mismo número en pantalla. Sobre una isla que en la
 * misma hora tiene 26 °C en la costa y 12 °C en la cumbre, esa diferencia no
 * es un matiz. El VPD sí es lo que gobierna la transpiración y el cierre
 * estomático, y es además lo que usa la industria del invernadero para decidir
 * si ventila o si humidifica.
 *
 * Es una variable DERIVADA, como el rocío: se calcula a partir de las dos que
 * la red mide con cobertura suficiente, así que no puede contradecirlas.
 */
export function vapourPressureDeficit(tempC: number, relativeHumidity: number): number {
  const rh = clampHumidity(relativeHumidity)
  return (saturationVapourPressure(tempC) * (1 - rh / 100)) / 10
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
 * **Referencia de la isla, no atmósfera estándar.** La versión anterior
 * comparaba contra `standardPressureAt(z)` con una ventana fija de 15 hPa, y
 * eso deja márgenes peligrosamente finos: el audit del 12 ago 2026 encontró a
 * CABLPA-SANTODOMINGO (363 m) a 3,6 hPa de clasificarse al revés y a Ecofinca
 * Nogales (183 m) a 7,1. La atmósfera estándar es 1013,25 hPa al nivel del mar
 * y el día real casi nunca lo es: cuando la presión sinóptica baja a 1005, una
 * estación de 200 m que publica MSLP entra en la ventana, se «reduce» por
 * segunda vez y sube unos 25 hPa de golpe.
 *
 * La referencia correcta no es una tabla, es **lo que marca hoy la propia red
 * a nivel del mar**, donde las dos convenciones coinciden y no hay nada que
 * decidir. Con ese número, cada estación se clasifica por la hipótesis que la
 * deja más cerca del consenso insular, sin ventana fija que calibrar.
 */
export function looksLikeStationPressure(
  pressureHpa: number,
  elevationM: number,
  /** MSLP de consenso de la red. Sin ella se cae a la atmósfera estándar. */
  referenceMslp = 1013.25,
): boolean {
  if (elevationM < 50) return false // indistinguible, y sin consecuencias

  // Hipótesis A: ya viene reducida. Distancia al consenso, tal cual.
  const asMslp = Math.abs(pressureHpa - referenceMslp)
  // Hipótesis B: es absoluta de estación. Lo que implicaría al nivel del mar.
  const asStation = Math.abs(
    pressureHpa * (standardPressureAt(0) / standardPressureAt(elevationM)) - referenceMslp,
  )
  return asStation < asMslp
}

/**
 * MSLP de consenso de la red: mediana de las estaciones a menos de 50 m, que
 * es donde las dos convenciones dan el mismo número.
 *
 * Si no hay ninguna estación baja publicando presión, devuelve null y el
 * discriminante vuelve a la atmósfera estándar — peor, pero nunca peligroso,
 * porque sin costa tampoco hay con qué contrastar.
 */
export function seaLevelReference(
  readings: readonly { pressureHpa: number; elevationM: number }[],
): number | null {
  const low = readings
    .filter((r) => r.elevationM < 50 && Number.isFinite(r.pressureHpa))
    .map((r) => r.pressureHpa)
    .sort((a, b) => a - b)
  if (!low.length) return null
  const m = low.length >> 1
  return low.length % 2 ? low[m] : (low[m - 1] + low[m]) / 2
}

/** Devuelve siempre presión al nivel del mar, venga como venga. */
export function normalizePressure(
  pressureHpa: number,
  elevationM: number,
  tempC: number,
  referenceMslp?: number,
): number {
  return looksLikeStationPressure(pressureHpa, elevationM, referenceMslp)
    ? reduceToSeaLevel(pressureHpa, elevationM, tempC)
    : pressureHpa
}
