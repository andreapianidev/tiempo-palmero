/**
 * De un cielo de fondo a una lista de estrellas: qué se ve y con qué brillo.
 *
 * Dos conversiones, y las dos son el puente entre un número medido y un
 * dibujo. Es el sitio donde esta función deja de ser un planetario y pasa a ser
 * una función de esta aplicación: lo que se dibuja no es «el cielo», es **el
 * cielo que la red de fotómetros del Cabildo dice que hay esta noche**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 1. DEL BRILLO DE FONDO A LA MAGNITUD LÍMITE
 *
 * Schaefer 1990, *Telescopic Limiting Magnitudes*, PASP 102, 212, en la forma
 * invertida que publica Unihedron —la casa que fabrica los propios SQM— para
 * pasar de `mag/arcsec²` a magnitud a simple vista:
 *
 *     NELM = 7,93 − 5·log₁₀(10^(4,316 − B/5) + 1)
 *
 * Lo que esto significa en esta isla, con los brillos medidos por la red del
 * Cabildo el 17-18 de agosto de 2026 y contando cuántas estrellas del catálogo
 * quedan por encima de cada límite:
 *
 * | Sitio | Brillo medido | Magnitud límite | Estrellas visibles |
 * |---|---|---|---|
 * | SkyPalma (Garafía) | 21,52 | 6,39 | **7885** |
 * | Centro de Visitantes del Roque | 21,13 | 6,19 | 6180 |
 * | Mirador Las Toscas | 20,60 | 5,88 | 4420 |
 * | Colegio La Palmita | 19,50 | 5,14 | 1930 |
 * | Cementerio de Santa Cruz | 18,00 | 3,97 | 504 |
 * | CEIP Santo Domingo (Los Llanos) | 16,19 | 2,37 | **83** |
 *
 * De 7885 a 83 en 34 km. Esa tabla es la función: la contaminación lumínica no
 * se enseña como un mapa de colores sino como estrellas que desaparecen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 2. DE LA MAGNITUD DEL CATÁLOGO A LA QUE SE VE
 *
 * Una estrella baja se ve más débil que la misma estrella en el cenit, porque
 * su luz atraviesa más aire. La cuenta es `m_vista = m + k·X`, con X la masa de
 * aire —la de Kasten y Young que ya usa el resto de la aplicación, en
 * `shadow/depth.ts`— y k el coeficiente de extinción.
 *
 * **k no es una constante de gusto.** Se descompone en tres:
 *
 *  - *Rayleigh*, la dispersión del aire mismo: 0,1005 mag por masa de aire al
 *    nivel del mar en la banda V, y proporcional a la presión, o sea a cuánta
 *    atmósfera queda por encima. En el Roque, a 2387 m y 762 hPa, son 0,0756.
 *  - *Ozono*: 0,016, y no depende de la altitud porque la capa está mucho más
 *    arriba que cualquier cumbre.
 *  - *Aerosol*, la parte variable y la única discutible: en el Roque es
 *    pequeña, y con la mediana de 20 años del Carlsberg Meridian Telescope
 *    —**k_V = 0,13**, arXiv:1009.4056— queda en 0,038. A nivel del mar el
 *    aerosol marino la sube mucho: el total ronda 0,25.
 *
 * QUÉ NO SE HACE, y es una decisión que costó comprobarla: **no se estima k a
 * partir del PM10 que miden las estaciones del Cabildo.** Parecía la conexión
 * evidente —la app ya mide la calima— y la literatura del propio observatorio
 * dice que no vale: los episodios de polvo medidos a nivel del suelo se quedan
 * casi siempre por debajo del umbral de noche polvorienta en la escala de
 * extinción, «meaning that the presence of calima affects low altitudes, and
 * that only in a few cases do reach the ORM». Es decir que el polvo que mide una
 * estación de costa está por debajo de la inversión y no dice nada del aire que
 * atraviesa la luz de una estrella. Inventar aquí una relación lineal entre
 * PM10 y k habría sido un número con pinta de medido y sin nada detrás.
 */

import { airMass } from '../shadow/depth'

/** Extinción Rayleigh en banda V al nivel del mar, mag por masa de aire. */
const RAYLEIGH_SEA_LEVEL = 0.1005
/** Extinción por ozono, mag por masa de aire. No depende de la altitud. */
const OZONE = 0.016
/**
 * Aerosol en el Roque de los Muchachos, mag por masa de aire.
 *
 * Es lo que queda de restarle a la mediana de 20 años del CMT —0,13— el
 * Rayleigh a 762 hPa y el ozono: 0,13 − 0,0756 − 0,016 = 0,038.
 */
const AEROSOL_SUMMIT = 0.038
/**
 * Aerosol al nivel del mar. Es la parte marina, mucho mayor que la de la
 * cumbre, y decae con la altura.
 */
const AEROSOL_SEA_LEVEL = 0.135
/**
 * Altura de escala del aerosol, m. **Es el único parámetro ajustado de este
 * fichero y conviene decirlo**: no sale de medir un perfil de aerosol sobre La
 * Palma —eso no está publicado— sino de obligar al modelo a pasar por los dos
 * anclajes que sí lo están: k_V = 0,13 en el Roque (mediana de 20 años del CMT)
 * y k_V ≈ 0,25 al nivel del mar. Con 520 m da 0,130 arriba y 0,252 abajo.
 *
 * Que salga tan corta —los 1500 m habituales de una capa marina abierta darían
 * 0,149 en la cumbre, un 15 % de más— es coherente con lo que esta isla tiene:
 * el aerosol está atrapado **debajo de la inversión del alisio**, entre los 1000
 * y los 1600 m que mide el mar de nubes, y por encima de ella el aire es otro.
 * Una exponencial no es la forma correcta de eso; es la forma más simple que
 * pasa por los dos puntos conocidos, y aquí queda escrito para que nadie la lea
 * como un perfil medido.
 */
const AEROSOL_SCALE_HEIGHT_M = 520

/** Presión estándar al nivel del mar, hPa. */
const SEA_LEVEL_HPA = 1013.25

/**
 * Coeficiente de extinción en la banda visual, mag por masa de aire.
 *
 * Comprobación de que los números pegan: a 2387 m con 762 hPa da 0,130, que es
 * exactamente la mediana publicada del Roque; al nivel del mar da 0,252.
 */
export function extinctionCoefficient(
  elevationM: number,
  pressureHpa?: number,
): number {
  // Sin presión medida, la atmósfera estándar. El exponente 5,255 es el de la
  // troposfera estándar, la misma que ya usa `psychro.ts`.
  const p =
    pressureHpa ?? SEA_LEVEL_HPA * Math.pow(1 - 2.25577e-5 * Math.max(0, elevationM), 5.25588)
  const rayleigh = RAYLEIGH_SEA_LEVEL * (p / SEA_LEVEL_HPA)
  const aerosol =
    AEROSOL_SUMMIT +
    (AEROSOL_SEA_LEVEL - AEROSOL_SUMMIT) *
      Math.exp(-Math.max(0, elevationM) / AEROSOL_SCALE_HEIGHT_M)
  return rayleigh + OZONE + aerosol
}

/**
 * Magnitud límite a simple vista para un brillo de fondo dado, en el cenit.
 *
 * Schaefer 1990. Ver la tabla de la cabecera.
 */
export function limitingMagnitude(skyMagArcsec2: number): number {
  return 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - skyMagArcsec2 / 5) + 1)
}

/**
 * La magnitud con la que una estrella llega al ojo: la del catálogo más lo que
 * se come el aire por el camino.
 *
 * Por debajo del horizonte devuelve infinito en vez de una cifra grande: una
 * estrella puesta no es una estrella muy débil, es una estrella que no está, y
 * la diferencia importa cuando el resultado se compara con un umbral.
 */
export function extinguishedMagnitude(
  catalogMag: number,
  elevationDeg: number,
  extinctionK: number,
): number {
  if (elevationDeg < -2) return Number.POSITIVE_INFINITY
  return catalogMag + extinctionK * airMass(Math.max(-2, elevationDeg))
}

/**
 * Cuántas estrellas de un catálogo ORDENADO POR MAGNITUD quedan por encima de
 * un límite. Búsqueda binaria sobre el prefijo.
 *
 * Es el motivo por el que `prepare-cielo.ts` ordena el fichero: convierte
 * «¿cuáles se ven esta noche?» en un índice, y la capa dibuja `[0, k)` sin
 * mirar ni una vez las que sobran.
 *
 * OJO A LO QUE **NO** HACE: el corte es por magnitud de catálogo, o sea sin
 * extinción. La extinción depende de dónde esté cada estrella en el cielo y
 * cambia cada minuto, así que se aplica por estrella en el sombreador
 * apagándolas suavemente. Si se aplicara aquí habría que reordenar el catálogo
 * entero cada fotograma.
 */
export function visibleCount(magnitudes: Int16Array, limitMag: number): number {
  // EL LÍMITE NO SE REDONDEA. Las magnitudes del catálogo vienen en
  // centésimas, y la primera versión redondeaba también el límite para
  // compararlas como enteros. Con un límite de 6,1882 eso daba 6,19 y colaba
  // **63 estrellas** que están justo en 6,19 y no se ven: medido contra el
  // catálogo servido, 6243 en vez de 6180. Comparar el entero contra el
  // límite en coma flotante es exacto y cuesta lo mismo.
  const target = limitMag * 100
  let lo = 0
  let hi = magnitudes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (magnitudes[mid] <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}
