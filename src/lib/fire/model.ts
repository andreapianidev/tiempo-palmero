/**
 * El clasificador entrenado, aplicado en el navegador.
 *
 * NO HAY BIBLIOTECA DE APRENDIZAJE AUTOMÁTICO AQUÍ, y no es una limitación: el
 * ajuste, la validación y las cuatro descargas de cartografía pasan una vez en
 * `scripts/ml/` con scikit-learn, y lo que llega al navegador son 150 árboles de
 * profundidad 2 —1.050 nodos— que se recorren con dos comparaciones cada uno.
 * Puntuar las 17.545 celdas de la isla cuesta menos que dibujarlas.
 *
 * QUÉ SIGNIFICA EL NÚMERO QUE DEVUELVE, con precisión, porque es lo único que
 * evita que se lea como lo que no es:
 *
 *   **Dado que en La Palma se declara un gran incendio, ¿qué probabilidad hay
 *   de que llegue a este punto?**
 *
 * No es la probabilidad de que hoy arda ahí. No es la probabilidad de que arda
 * este verano. Es la geografía de lo ya quemado —cinco incendios entre 2009 y
 * 2023, 15.957 ha, el 18,3 % de la isla— proyectada sobre el resto. Lo que
 * convierte eso en algo del día de hoy es el peligro meteorológico
 * (`danger.ts`), que va aparte y se multiplica aparte, porque con cinco
 * episodios no se puede ajustar la parte del tiempo sin engañarse.
 *
 * POR QUÉ ÁRBOLES Y NO UNA RECTA. Porque se midió: con el protocolo duro
 * —esconder un incendio entero— la regresión logística da 0,513 de AUC en el
 * peor pliegue, que es no distinguir nada, y estos árboles dan 0,653. La razón
 * se ve en el mapa: arde la banda del pinar, entre unos 800 y 1.500 m, y no
 * arde ni la costa regada ni la cumbre pelada. «Cuanto más alto, más» y
 * «cuanto más alto, menos» son las dos falsas a la vez, y una recta solo sabe
 * decir una de las dos.
 */

import { FUEL_UNKNOWN } from './fuel'

/** Un árbol, en cinco arrays paralelos. Una hoja tiene `f = -1`. */
export interface Tree {
  f: number[]
  t: number[]
  l: number[]
  r: number[]
  v: number[]
}

export interface FeatureSpec {
  name: string
  center: number
  scale: number
  /** La mediana de la isla, ya tipificada. La usa `contributions`. */
  median: number
}

export interface FireModelSpec {
  generated: string
  grid: {
    cols: number
    rows: number
    cellMeters: number
    zoom: number
    originX: number
    originY: number
    step: number
  }
  distanceStepM: number
  model: {
    kind: string
    init: number
    features: FeatureSpec[]
    trees: Tree[]
  }
  importances: { name: string; importance: number }[]
  baseline: { median: number; p90: number; max: number }
  validation: {
    method: string
    folds: { fire: string; heldCells: number; auc: number }[]
    aucMean: number
    aucWorst: number
    aucBest: number
    aucShuffled: number
    families: { family: string; aucMean: number; aucWorst: number }[]
  }
  training: {
    cells: number
    burnedCells: number
    burnedShare: number
    fires: { year: number; label: string; date: string | null; declaredHa: number; source: string }[]
  }
  danger: {
    climateDays: number
    climateFrom: string
    climateTo: string
    climateCells: number
    fireDays: {
      fire: string
      day: string
      fosberg: number
      fosbergPercentile: number
      daysSinceRain: number | null
      drynessPercentile: number | null
    }[]
    fosbergCurve: number[]
    drynessCurve: number[]
    lowestFireDayPercentile: number
  }
  sources: string[]
}

/** Lo que hace falta saber de una celda para puntuarla. */
export interface CellInputs {
  /** Modelo NFFL, o `FUEL_UNKNOWN`. */
  fuel: number
  /** Metros a la vía más cercana. */
  distanceM: number
  /** Grados. */
  slopeDeg: number
  southness: number
  westness: number
  elevationM: number
}

/**
 * El valor crudo de un predictor, antes de tipificar.
 *
 * Devuelve `null` para un nombre que no reconoce, y quien llama lo trata como
 * un modelo incompatible. Es deliberado: un predictor desconocido significa que
 * el JSON viene de un entrenamiento que esta versión del código no sabe
 * aplicar, y aplicarlo a medias —con ese predictor a cero— daría un número que
 * parece una probabilidad y no lo es.
 */
export function rawFeature(name: string, c: CellInputs): number | null {
  if (name.startsWith('fuel')) {
    const model = Number(name.slice(4))
    if (!Number.isInteger(model)) return null
    return c.fuel === model ? 1 : 0
  }
  switch (name) {
    case 'slope':
      return c.slopeDeg
    case 'southness':
      return c.southness
    case 'westness':
      return c.westness
    case 'elevation_km':
      return c.elevationM / 1000
    case 'log_distance':
      return Math.log1p(c.distanceM)
    default:
      return null
  }
}

/** El vector de entrada ya tipificado, o `null` si algo no encaja. */
export function vectorFor(spec: FireModelSpec, c: CellInputs): Float64Array | null {
  if (c.fuel === FUEL_UNKNOWN || !Number.isFinite(c.elevationM)) return null
  const out = new Float64Array(spec.model.features.length)
  for (let k = 0; k < spec.model.features.length; k++) {
    const f = spec.model.features[k]
    const raw = rawFeature(f.name, c)
    if (raw === null) return null
    out[k] = (raw - f.center) / (f.scale || 1)
  }
  return out
}

/**
 * Recorre un árbol y devuelve el valor de la hoja a la que llega.
 *
 * **La comparación es `<=` y no `<`**, que es como parte scikit-learn
 * (`X[:, feature] <= threshold` va al hijo izquierdo). Con `<` el resultado
 * solo cambiaría en las celdas que caen justo sobre un umbral —pocas, y nunca
 * las mismas—, o sea el peor error posible: uno que casi nunca se manifiesta y
 * que no rompe nada cuando lo hace.
 */
function evaluate(tree: Tree, x: Float64Array): number {
  let node = 0
  // Cota de seguridad: un árbol mal formado no puede colgar la pestaña.
  for (let guard = 0; guard < 64; guard++) {
    const feature = tree.f[node]
    if (feature < 0) return tree.v[node]
    node = x[feature] <= tree.t[node] ? tree.l[node] : tree.r[node]
    if (node < 0 || node >= tree.f.length) return 0
  }
  return 0
}

/** La suma en log-odds: el punto de partida más lo que aporta cada árbol. */
export function logitOf(spec: FireModelSpec, x: Float64Array): number {
  let sum = spec.model.init
  for (const tree of spec.model.trees) sum += evaluate(tree, x)
  return sum
}

/**
 * La susceptibilidad de una celda, de 0 a 1.
 *
 * `null` donde el combustible no está clasificado —el 7,2 % de la isla, casi
 * todo en el borde de la costa—. Ahí el modelo no se entrenó y no puede
 * responder, y devolver el valor de la clase de referencia sería contestar
 * «roca desnuda» a «no lo sé», que es la confusión con la que empieza casi todo
 * mapa de riesgo que engaña.
 */
export function susceptibility(spec: FireModelSpec, c: CellInputs): number | null {
  const x = vectorFor(spec, c)
  if (x === null) return null
  return 1 / (1 + Math.exp(-logitOf(spec, x)))
}

/**
 * Qué predictor está subiendo o bajando la cifra de esta celda.
 *
 * UN CONJUNTO DE ÁRBOLES NO TIENE COEFICIENTES QUE LEER, así que la explicación
 * se mide en vez de leerse: para cada predictor se vuelve a puntuar la celda
 * con **ese** valor sustituido por el de una celda corriente de la isla —la
 * mediana— y se enseña cuánto se mueve el resultado. «Si esta ladera mirase
 * como mira la isla de media, la cifra bajaría 12 puntos.»
 *
 * Es un efecto marginal, no un reparto exacto: los efectos de dos predictores
 * no tienen por qué sumar el total, porque el modelo los combina de dos en dos.
 * La interfaz lo dice donde lo usa. La alternativa exacta —valores de Shapley—
 * costaría recorrer los 150 árboles 2^13 veces por celda, y para contestar «por
 * qué aquí» no hace falta.
 *
 * Los predictores de combustible que valen cero —los ocho modelos que esta
 * celda no es— no se devuelven: no explican nada.
 */
export function contributions(
  spec: FireModelSpec,
  c: CellInputs,
): { name: string; delta: number }[] {
  const x = vectorFor(spec, c)
  if (x === null) return []
  const base = 1 / (1 + Math.exp(-logitOf(spec, x)))

  const out: { name: string; delta: number }[] = []
  for (let k = 0; k < spec.model.features.length; k++) {
    const f = spec.model.features[k]
    if (f.name.startsWith('fuel') && x[k] === (0 - f.center) / (f.scale || 1)) continue

    const keep = x[k]
    x[k] = f.median
    const without = 1 / (1 + Math.exp(-logitOf(spec, x)))
    x[k] = keep
    if (Math.abs(base - without) > 1e-4) out.push({ name: f.name, delta: base - without })
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return out
}
