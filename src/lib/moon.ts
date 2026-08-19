/**
 * Dónde está la luna, de verdad y vista desde aquí.
 *
 * POR QUÉ ESTE FICHERO EXISTE Y POR QUÉ SALIÓ DE `sun.ts`. Allí había una luna
 * de serie truncada —un solo término de longitud, el 6,289° de la ecuación del
 * centro— que llevaba desde el principio moviendo el reflejo sobre el agua. Para
 * eso servía: un brillo especular no se entera de un grado. Pero en cuanto hay
 * que DIBUJAR el disco al lado de 8920 estrellas colocadas con 0,31" de error,
 * ese grado deja de ser un detalle.
 *
 * MEDIDO contra `astronomy-engine`, dos años cada tres horas desde el Roque
 * (5840 comparaciones), la luna vieja se equivocaba así:
 *
 * | | mediana | p95 | peor |
 * |---|---:|---:|---:|
 * | serie de un término, geocéntrica | 70,7' | 152,1' | 216,3' |
 * | **esta**, topocéntrica | **0,06'** | **0,13'** | **0,17'** |
 *
 * O sea: de 70' a 3,4 segundos de arco de mediana. El diámetro de la luna llena
 * son 31'. La vieja la ponía a **más de dos diámetros de distancia la mitad de
 * las noches** y a siete en el peor caso: dibujarla así habría sido poner una
 * luna plausible en el sitio equivocado, que es el peor error posible porque
 * nadie lo nota y todo el mundo se lo cree.
 *
 * LOS ERRORES ERAN TRES, y hacía falta arreglar los tres:
 *
 *  - **La serie.** Un término de longitud se deja fuera la evección (1,27°), la
 *    variación (0,66°) y la ecuación anual (0,19°). Aquí entran las tablas 47.A
 *    y 47.B de Meeus enteras —60 términos de longitud y distancia, 60 de
 *    latitud— más los aditivos de Venus, Júpiter y el achatamiento. Meeus
 *    declara 10" en longitud y 4" en latitud.
 *  - **La paralaje.** La luna está a 60 radios terrestres: mirarla desde la
 *    superficie y no desde el centro de la Tierra la desplaza hasta 57' en el
 *    horizonte —casi dos diámetros—, y sobre La Palma vale 22,8' de mediana.
 *    Es el único astro de esta aplicación donde eso importa: para el sol son
 *    8,8" y para una estrella, cero.
 *  - **El reloj.** Las efemérides van en Tiempo Terrestre y la aplicación en
 *    UTC. Son 69 s, y la luna corre 0,55" por segundo: 38". Ver
 *    `TT_MINUS_UTC_MS`, que es el único sitio de todo el repositorio donde esa
 *    diferencia deja de ser despreciable.
 *
 * LA DISTANCIA TAMBIÉN ES TOPOCÉNTRICA, y de ahí sale el tamaño del disco. La
 * luna en el cenit está un radio terrestre más cerca que la luna en el
 * horizonte: 1,7 % más grande. Es la única parte de la «ilusión lunar» que es
 * de verdad, y va en sentido CONTRARIO a lo que la gente cree ver.
 *
 * CORRE EN NODE. Como todo `src/lib`: no toca el DOM ni importa `maplibre-gl`,
 * y por eso la prueba lo puede comparar contra `astronomy-engine` sin navegador.
 *
 * FUENTE. Meeus, *Astronomical Algorithms*, 2ª ed., cap. 47 (posición) y cap. 48
 * (fase e iluminación). Las tablas son las suyas, sin recortar.
 */

import { julianCenturies, meanObliquity, nutation, skyFrame, applyOfDate, horizontal } from './stars/frame'
import { refractionDeg } from './stars/refraction'
import { skyVector, solarGeometry, sunPosition, type SkyPosition } from './sun'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/**
 * TT − UTC en milisegundos, y por qué la luna es el único sitio donde aparece.
 *
 * Las efemérides van en Tiempo Terrestre y los relojes en UTC. `frame.ts` usa
 * uno por el otro con la cuenta hecha: en la precesión valen 0,004", dos
 * órdenes de magnitud por debajo de la nutación, y no compensa arrastrar la
 * corrección por toda la cadena.
 *
 * CON LA LUNA NO SALE ESA CUENTA, y se vio midiendo. La luna corre 0,55" por
 * segundo —trece grados al día, el astro más rápido del cielo—, así que 69 s de
 * desfase son **38" de longitud eclíptica**. Comparada contra `astronomy-engine`
 * sin esta corrección, la serie daba un sesgo sistemático de −41" en longitud
 * con la latitud y la distancia clavadas: la firma inconfundible de un error de
 * reloj y no de un término que falte.
 *
 * VALE 32,184 s + 37 s de segundos intercalares, la cifra desde el 1 de enero
 * de 2017. Va escrita como constante y no como modelo de ΔT porque un modelo
 * para el futuro es una extrapolación con la misma incertidumbre: si el IERS
 * añadiera un intercalar, esto se quedaría 0,55" corto, que es la sexta parte
 * del residuo que ya tiene la serie. La resolución de la CGPM de 2022 dice
 * además que no habrá más hasta 2035.
 */
const TT_MINUS_UTC_MS = 69_184

/** Radio ecuatorial de la Tierra, km. WGS84. */
const EARTH_RADIUS_KM = 6378.137
/** Achatamiento de la Tierra, WGS84. Sin él la paralaje se va 11'. */
const FLATTENING = 1 / 298.257223563
/** Radio medio de la luna, km. IAU 2015. */
const MOON_RADIUS_KM = 1737.4
/** Distancia media Tierra-Sol, km. Solo para el ángulo de fase. */
const SUN_DISTANCE_KM = 149_597_870

/**
 * Tabla 47.A de Meeus: los 60 términos periódicos de la longitud y la distancia.
 *
 * Cada fila es `[D, M, M', F, Σl, Σr]`, con Σl en millonésimas de grado y Σr en
 * metros. El primero —el de M', la ecuación del centro— vale 6,29° y es el que
 * tenía la versión vieja; el segundo, la evección, vale 1,27° y es el que más
 * falta hacía.
 */
const LONGITUDE_DISTANCE: readonly (readonly number[])[] = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
]

/**
 * Tabla 47.B: los 60 términos de la latitud eclíptica, en millonésimas de grado.
 *
 * Cada fila es `[D, M, M', F, Σb]`. El primero, el de F, vale 5,13° y es la
 * inclinación de la órbita: es lo que hace que no haya un eclipse cada mes.
 */
const LATITUDE: readonly (readonly number[])[] = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
]

/** Los argumentos fundamentales de Meeus 47.1 a 47.5, en grados. */
interface Arguments {
  /** Longitud media de la luna, L'. */
  meanLongitude: number
  /** Elongación media, D. */
  elongation: number
  /** Anomalía media del sol, M. */
  sunAnomaly: number
  /** Anomalía media de la luna, M'. */
  moonAnomaly: number
  /** Argumento de la latitud, F. */
  latitudeArgument: number
  /** Corrección de excentricidad de la órbita terrestre, e. */
  eccentricity: number
  a1: number
  a2: number
  a3: number
}

function fundamentals(T: number): Arguments {
  return {
    meanLongitude:
      218.3164477 +
      T * (481267.88123421 + T * (-0.0015786 + T * (1 / 538841 + T * (-1 / 65194000)))),
    elongation:
      297.8501921 +
      T * (445267.1114034 + T * (-0.0018819 + T * (1 / 545868 + T * (-1 / 113065000)))),
    sunAnomaly: 357.5291092 + T * (35999.0502909 + T * (-0.0001536 + T * (1 / 24490000))),
    moonAnomaly:
      134.9633964 +
      T * (477198.8675055 + T * (0.0087414 + T * (1 / 69699 + T * (-1 / 14712000)))),
    latitudeArgument:
      93.272095 +
      T * (483202.0175233 + T * (-0.0036539 + T * (-1 / 3526000 + T * (1 / 863310000)))),
    // La excentricidad de la órbita de la TIERRA, que baja despacio. Multiplica
    // a los términos que llevan la anomalía del sol: son los que dependen de
    // dónde esté la Tierra en su órbita, y no los demás.
    eccentricity: 1 - T * (0.002516 + T * 0.0000074),
    a1: 119.75 + 131.849 * T,
    a2: 53.09 + 479264.29 * T,
    a3: 313.45 + 481266.484 * T,
  }
}

export interface MoonGeocentric {
  /** Longitud eclíptica aparente, grados. */
  longitudeDeg: number
  /** Latitud eclíptica, grados. */
  latitudeDeg: number
  /** Distancia al centro de la Tierra, km. */
  distanceKm: number
  /** Ascensión recta aparente, ecuador VERDADERO de la fecha, grados. */
  raDeg: number
  /** Declinación aparente, grados. */
  decDeg: number
}

/**
 * La luna vista desde el centro de la Tierra.
 *
 * Se queda pública porque es la mitad que se puede comparar contra una
 * efeméride sin tener que ponerse de acuerdo en dónde está el observador, y
 * porque la fase se calcula con ella: la fase es geocéntrica por definición.
 */
export function moonGeocentric(at: number): MoonGeocentric {
  // En Tiempo Terrestre, que es la escala en la que están escritos los
  // coeficientes. Ver `TT_MINUS_UTC_MS`: aquí son 38" y no se pueden ignorar.
  const T = julianCenturies(at + TT_MINUS_UTC_MS)
  const a = fundamentals(T)
  const d = a.elongation * RAD
  const m = a.sunAnomaly * RAD
  const mp = a.moonAnomaly * RAD
  const f = a.latitudeArgument * RAD

  let sumL = 0
  let sumR = 0
  for (const [cd, cm, cmp, cf, cl, cr] of LONGITUDE_DISTANCE) {
    const arg = cd * d + cm * m + cmp * mp + cf * f
    const e = cm === 0 ? 1 : cm === 1 || cm === -1 ? a.eccentricity : a.eccentricity ** 2
    sumL += cl * e * Math.sin(arg)
    sumR += cr * e * Math.cos(arg)
  }
  let sumB = 0
  for (const [cd, cm, cmp, cf, cb] of LATITUDE) {
    const arg = cd * d + cm * m + cmp * mp + cf * f
    const e = cm === 0 ? 1 : cm === 1 || cm === -1 ? a.eccentricity : a.eccentricity ** 2
    sumB += cb * e * Math.sin(arg)
  }

  // Los aditivos: Venus (A1), Júpiter (A2) y el achatamiento de la Tierra. No
  // salen de la serie principal porque no son perturbaciones del propio
  // movimiento lunar. Juntos valen 0,004°, o sea 14".
  const a1 = a.a1 * RAD
  const a2 = a.a2 * RAD
  const a3 = a.a3 * RAD
  const lp = a.meanLongitude * RAD
  sumL += 3958 * Math.sin(a1) + 1962 * Math.sin(lp - f) + 318 * Math.sin(a2)
  sumB +=
    -2235 * Math.sin(lp) +
    382 * Math.sin(a3) +
    175 * Math.sin(a1 - f) +
    175 * Math.sin(a1 + f) +
    127 * Math.sin(lp - mp) -
    115 * Math.sin(lp + mp)

  const { dPsi, dEps } = nutation(T)
  // La longitud APARENTE lleva la nutación en longitud; la latitud no la
  // necesita, y la oblicuidad verdadera es la media más la nutación en
  // oblicuidad. Mezclar una media con otra verdadera es el error que deja 17"
  // sueltos, justo lo que la nutación acaba de corregir.
  const longitude = a.meanLongitude + sumL / 1e6 + dPsi * DEG
  const latitude = sumB / 1e6
  const distance = 385000.56 + sumR / 1000

  const eps = meanObliquity(T) + dEps
  const lam = longitude * RAD
  const bet = latitude * RAD
  const ra = Math.atan2(
    Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps),
    Math.cos(lam),
  )
  const dec = Math.asin(
    Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam),
  )
  return {
    longitudeDeg: ((longitude % 360) + 360) % 360,
    latitudeDeg: latitude,
    distanceKm: distance,
    raDeg: ((ra * DEG % 360) + 360) % 360,
    decDeg: dec * DEG,
  }
}

export interface MoonObserver {
  lon: number
  lat: number
  /** Altitud sobre el elipsoide, m. Entra en la paralaje y en la refracción. */
  elevationM: number
  /** Presión medida, hPa. Sin ella, la de referencia de `refraction.ts`. */
  pressureHpa?: number
  /** Temperatura medida, °C. */
  temperatureC?: number
}

export interface MoonSight extends MoonGeocentric {
  /** Distancia al OBSERVADOR, km. Un radio terrestre menos en el cenit. */
  topocentricKm: number
  /** Altura geométrica topocéntrica, sin refracción, grados. */
  elevationDeg: number
  /** Altura aparente: la de arriba más lo que el aire la levante. */
  apparentElevationDeg: number
  azimuthDeg: number
  /** Diámetro angular visto desde aquí, grados. Entre 0,49° y 0,56°. */
  angularDiameterDeg: number
  /** Fracción iluminada del disco, 0 nueva a 1 llena. */
  illumination: number
  /** Ángulo de fase, grados: 0 es llena y 180 es nueva. */
  phaseAngleDeg: number
  /** Creciente: el disco se llena noche a noche. */
  waxing: boolean
  /** Vector unitario topocéntrico en la base local: este, norte, arriba. */
  direction: [number, number, number]
  /**
   * Hacia dónde apunta el cuerno brillante, unitario y perpendicular a
   * `direction`. Es la dirección al sol proyectada sobre el plano del cielo, o
   * sea la que decide de qué lado está la parte iluminada.
   */
  brightLimb: [number, number, number]
}

/**
 * La luna vista desde un sitio concreto de la isla.
 *
 * LA PARALAJE SE HACE CON VECTORES y no con las fórmulas clásicas de ρsinφ' y
 * ρcosφ' aplicadas a la ascensión recta. Es el mismo resultado y tiene la
 * ventaja de que no hay que volver a entrar en el sistema ecuatorial: la
 * posición geocéntrica ya está girada a la base local por `applyOfDate`, y el
 * observador en esa misma base es un vector que solo tiene componente norte y
 * arriba —está en el plano de su propio meridiano—, inclinado respecto a la
 * vertical justo lo que separa la latitud geodésica de la geocéntrica.
 */
export function moonSight(at: number, observer: MoonObserver): MoonSight {
  const geo = moonGeocentric(at)
  const frame = skyFrame(at, observer.lon, observer.lat)
  const unit = applyOfDate(frame, geo.raDeg * RAD, geo.decDeg * RAD)

  // Posición del observador respecto al centro de la Tierra, en radios
  // ecuatoriales. La latitud geocéntrica se separa hasta 11,5' de la geodésica.
  const phi = observer.lat * RAD
  const u = Math.atan2((1 - FLATTENING) * Math.sin(phi), Math.cos(phi))
  const h = observer.elevationM / 1000 / EARTH_RADIUS_KM
  const rhoSin = (1 - FLATTENING) * Math.sin(u) + h * Math.sin(phi)
  const rhoCos = Math.cos(u) + h * Math.cos(phi)
  const rho = Math.hypot(rhoSin, rhoCos)
  const geocentricLat = Math.atan2(rhoSin, rhoCos)
  // En la base local el observador apunta casi hacia arriba, escorado hacia el
  // ecuador —al sur en el hemisferio norte— por la diferencia de latitudes.
  const tilt = phi - geocentricLat
  const observerKm = rho * EARTH_RADIUS_KM
  const ox = 0
  const oy = -observerKm * Math.sin(tilt)
  const oz = observerKm * Math.cos(tilt)

  const tx = geo.distanceKm * unit[0] - ox
  const ty = geo.distanceKm * unit[1] - oy
  const tz = geo.distanceKm * unit[2] - oz
  const topocentricKm = Math.hypot(tx, ty, tz)
  const direction: [number, number, number] = [
    tx / topocentricKm,
    ty / topocentricKm,
    tz / topocentricKm,
  ]

  const { elevationDeg, azimuthDeg } = horizontal(direction)
  const apparentElevationDeg =
    elevationDeg +
    refractionDeg(elevationDeg, observer.pressureHpa, observer.temperatureC)

  const angularDiameterDeg = 2 * Math.asin(MOON_RADIUS_KM / topocentricKm) * DEG

  // ------------------------------------------------------------------- fase
  // El ángulo de fase es geocéntrico: es el ángulo Sol-Luna-Tierra, y no
  // depende de en qué punto de la Tierra esté uno. La elongación sale de la
  // longitud y la latitud eclípticas, Meeus 48.2.
  const sun = solarGeometry(at)
  const sunRa = sun.rightAscensionDeg * RAD
  const sunDec = sun.declinationDeg * RAD
  const moonRa = geo.raDeg * RAD
  const moonDec = geo.decDeg * RAD
  const cosElongation = Math.max(
    -1,
    Math.min(
      1,
      Math.sin(sunDec) * Math.sin(moonDec) +
        Math.cos(sunDec) * Math.cos(moonDec) * Math.cos(sunRa - moonRa),
    ),
  )
  const elongation = Math.acos(cosElongation)
  // Meeus 48.3. La distancia al sol entra porque el sol no está infinitamente
  // lejos: sin ella la luna llena daría el 100 % exacto en vez del 99,x % que
  // es lo que de verdad se ve casi siempre.
  const phaseAngle = Math.atan2(
    SUN_DISTANCE_KM * Math.sin(elongation),
    geo.distanceKm - SUN_DISTANCE_KM * cosElongation,
  )
  const illumination = (1 + Math.cos(phaseAngle)) / 2

  // Creciente o menguante: si la luna va por delante del sol en ascensión
  // recta, cada noche se llena más.
  const waxing = (((moonRa - sunRa) * DEG + 360) % 360) < 180

  // El cuerno brillante apunta al sol, proyectado sobre el plano del cielo. Se
  // calcula con la dirección TOPOCÉNTRICA porque es lo que se dibuja, y con el
  // sol geométrico sin refractar porque la refracción de los dos astros ya está
  // puesta en sus alturas por separado.
  const s = skyVector(sunPosition(at, observer.lon, observer.lat))
  const dot = s[0] * direction[0] + s[1] * direction[1] + s[2] * direction[2]
  const px = s[0] - dot * direction[0]
  const py = s[1] - dot * direction[1]
  const pz = s[2] - dot * direction[2]
  const pn = Math.hypot(px, py, pz)
  // Con el sol exactamente detrás de la luna —un eclipse— no hay dirección de
  // cuerno que valga. Da igual: ahí el disco está lleno o vacío entero.
  const brightLimb: [number, number, number] =
    pn > 1e-9 ? [px / pn, py / pn, pz / pn] : [0, 0, 1]

  return {
    ...geo,
    topocentricKm,
    elevationDeg,
    apparentElevationDeg,
    azimuthDeg,
    angularDiameterDeg,
    illumination,
    phaseAngleDeg: phaseAngle * DEG,
    waxing,
    direction,
    brightLimb,
  }
}

/**
 * La luna como la pedía `sun.ts`: altura, acimut y fracción iluminada.
 *
 * Es la puerta que usan el mar y el modelo de brillo del cielo, que no
 * necesitan ni el disco ni el cuerno. Existe para que el cambio de efeméride no
 * obligara a tocar cinco sitios, y para que quede UNA sola luna en el
 * repositorio: la lección que `sun.ts` ya tenía escrita sobre el sol.
 *
 * Devuelve la altura APARENTE, con refracción de atmósfera de referencia. Para
 * el mar es lo correcto: el reflejo lo produce la luna que se ve, no la
 * geométrica, y en el horizonte hay medio grado entre las dos.
 */
export interface MoonState extends SkyPosition {
  /** Fracción iluminada del disco, de 0 (luna nueva) a 1 (llena). */
  illumination: number
}

export function moonState(at: number, lonDeg: number, latDeg: number): MoonState {
  const sight = moonSight(at, { lon: lonDeg, lat: latDeg, elevationM: 0 })
  return {
    elevationDeg: sight.apparentElevationDeg,
    azimuthDeg: sight.azimuthDeg,
    illumination: sight.illumination,
  }
}
