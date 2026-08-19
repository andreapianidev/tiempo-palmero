/**
 * De dónde a dónde va una estrella: del catálogo al horizonte de La Palma.
 *
 * QUÉ RESUELVE. El catálogo da direcciones en ICRS, que es un sistema fijo a
 * las galaxias lejanas y no se mueve nunca. Lo que hay que dibujar es dónde
 * está esa dirección VISTA DESDE AQUÍ ahora mismo: sobre qué punto del horizonte
 * y a qué altura. Entre las dos cosas hay cuatro efectos, y este fichero los
 * pone en una sola matriz de 3 × 3 para que el sombreador no tenga que saber
 * nada de astronomía: multiplica y ya está.
 *
 * POR QUÉ UNA MATRIZ Y NO UNA FUNCIÓN POR ESTRELLA. Son 8920 estrellas a 60
 * fotogramas: medio millón de conversiones por segundo. Todo lo que no depende
 * de QUÉ estrella es —la precesión, la nutación, la hora sidérea, la latitud—
 * se calcula una vez por fotograma en la CPU y viaja como uniforme. Lo único
 * que queda por estrella es un producto matriz-vector, que es lo que una GPU
 * hace sin despeinarse. La alternativa —llamar a una biblioteca de efemérides
 * por estrella y por fotograma— es la solución que se escribe en diez minutos y
 * no llega a los 60 Hz en un teléfono.
 *
 * LOS CUATRO EFECTOS, con lo que vale cada uno, porque la decisión de incluir o
 * no incluir cada uno tiene que ser una cifra y no una intuición:
 *
 * | Efecto | Cuánto mueve | ¿Entra? |
 * |---|---|---|
 * | Precesión J2000 → hoy | **22 minutos de arco** en 26 años | Sí, es el grande |
 * | Nutación | 17 segundos de arco | Sí, sale gratis |
 * | Aberración anual | 20,5 segundos de arco | Sí, son tres líneas |
 * | Refracción atmosférica | **34 minutos de arco** en el horizonte | Sí, en `refraction.ts` |
 *
 * La precesión y la refracción son las dos que se ven: 22' es dos tercios de la
 * luna llena, y en el horizonte la refracción levanta un astro un diámetro
 * lunar entero. Las otras dos están por debajo de un píxel a cualquier zoom
 * razonable, y entran porque cuestan poco y porque la prueba las mide.
 *
 * ESCALAS DE TIEMPO. Se usa UTC como si fuera TT y como si fuera UT1, y las dos
 * cosas están medidas. TT − UTC son hoy 69,2 s, que en la precesión valen
 * 0,004" —dos órdenes de magnitud por debajo de la nutación—. UT1 − UTC se
 * mantiene por debajo de 0,9 s por convenio, que en la rotación de la Tierra son
 * 13,5", el mismo orden que la nutación y muy por debajo de un píxel. Pedir el
 * boletín A del IERS para corregirlo habría metido una dependencia de red en
 * una función que hoy es aritmética pura.
 *
 * FUENTES. Precesión y oblicuidad: modelo IAU 2006 (Capitaine, Wallace &
 * Chapront 2003, A&A 412, 567), en la forma ζ_A / z_A / θ_A que ya lleva dentro
 * el sesgo de marco entre ICRS y el ecuador medio. Nutación: los cuatro
 * términos principales de la serie IAU 1980 tal y como los publica Meeus,
 * *Astronomical Algorithms*, cap. 22, con 0,5" de error declarado. Tiempo
 * sidéreo: la expresión del mismo capítulo. Aberración: la velocidad orbital
 * media de la Tierra sobre la eclíptica, sin excentricidad, que deja 0,34" de
 * residuo.
 *
 * TODO ESTO CORRE EN NODE. Este fichero no toca el DOM ni importa
 * `maplibre-gl`: es la regla de `src/lib`, y es lo que permite que la prueba lo
 * compare contra `astronomy-engine` sin navegador.
 */

const RAD = Math.PI / 180
const ARCSEC = RAD / 3600

/** Días julianos desde J2000.0 de un instante epoch-ms. */
export function julianCenturies(at: number): number {
  return (at / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525
}

/** Matriz 3 × 3 por filas: `m[fila][columna]`. */
export type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
]

function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
  return out as Mat3
}

/** Rotación alrededor del eje x, ángulo en radianes, sentido directo. */
function rotX(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c],
  ]
}

function rotY(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [c, 0, -s],
    [0, 1, 0],
    [s, 0, c],
  ]
}

function rotZ(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ]
}

/**
 * Oblicuidad media de la eclíptica, en radianes. Modelo IAU 2006.
 *
 * Vale 23,4366° hoy y baja unos 47" por siglo. Es el ángulo entre el ecuador y
 * la eclíptica, o sea el que decide dónde sale el sol en junio.
 */
export function meanObliquity(T: number): number {
  return (
    (84381.406 +
      T * (-46.836769 + T * (-0.0001831 + T * (0.0020034 + T * (-0.000000576 + T * -0.0000000434))))) *
    ARCSEC
  )
}

/**
 * Nutación en longitud y en oblicuidad, en radianes.
 *
 * Cuatro términos de los 106 de la serie. El primero —el de Ω, el nodo de la
 * órbita lunar, con periodo de 18,6 años— vale 17,2" y se lleva el 93 % del
 * efecto; los otros tres bajan el residuo a los 0,5" que declara Meeus. Los 102
 * restantes suman menos de eso y son, todos juntos, una centésima de píxel.
 */
export function nutation(T: number): { dPsi: number; dEps: number } {
  const omega = (125.04452 - 1934.136261 * T) * RAD
  const l = (280.4665 + 36000.7698 * T) * RAD
  const lp = (218.3165 + 481267.8813 * T) * RAD
  const dPsi =
    (-17.2 * Math.sin(omega) -
      1.32 * Math.sin(2 * l) -
      0.23 * Math.sin(2 * lp) +
      0.21 * Math.sin(2 * omega)) *
    ARCSEC
  const dEps =
    (9.2 * Math.cos(omega) +
      0.57 * Math.cos(2 * l) +
      0.1 * Math.cos(2 * lp) -
      0.09 * Math.cos(2 * omega)) *
    ARCSEC
  return { dPsi, dEps }
}

/**
 * Matriz de precesión ICRS → ecuador medio de la fecha, modelo IAU 2006.
 *
 * Los términos constantes de ζ_A y z_A —±2,650545"— no son un error de copia:
 * son el sesgo de marco entre el ICRS y el ecuador medio de J2000, que no son
 * exactamente el mismo plano. Quitarlos deja 0,0053" de error, que da igual,
 * pero dejarlos es gratis y es lo que dice el modelo.
 */
export function precessionMatrix(T: number): Mat3 {
  const zeta =
    (2.650545 +
      T * (2306.083227 + T * (0.2988499 + T * (0.01801828 + T * (-0.000005971 + T * -0.0000003173))))) *
    ARCSEC
  const z =
    (-2.650545 +
      T * (2306.077181 + T * (1.0927348 + T * (0.01826837 + T * (-0.000028596 + T * -0.0000002904))))) *
    ARCSEC
  const theta =
    (T * (2004.191903 + T * (-0.4294934 + T * (-0.04182264 + T * (-0.000007089 + T * -0.0000001274))))) *
    ARCSEC
  return mul(rotZ(-z), mul(rotY(theta), rotZ(-zeta)))
}

/** Matriz de nutación: ecuador medio de la fecha → ecuador verdadero. */
export function nutationMatrix(T: number): Mat3 {
  const eps = meanObliquity(T)
  const { dPsi, dEps } = nutation(T)
  return mul(rotX(-(eps + dEps)), mul(rotZ(-dPsi), rotX(eps)))
}

/**
 * Tiempo sidéreo aparente de Greenwich, en radianes.
 *
 * El medio más la ecuación de los equinoccios, Δψ·cos ε. Sin ese término la
 * hora sidérea se va hasta 1,1 s, que son 16" de rotación: el mismo orden que
 * la nutación que se acaba de aplicar, y sería absurdo corregir una y no la
 * otra.
 */
export function apparentSiderealTime(at: number): number {
  const jd = at / 86_400_000 + 2_440_587.5
  const T = (jd - 2_451_545) / 36_525
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2_451_545) +
    0.000387933 * T * T -
    (T * T * T) / 38_710_000
  const { dPsi, dEps } = nutation(T)
  const eps = meanObliquity(T) + dEps
  return (((gmst * RAD) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) + dPsi * Math.cos(eps)
}

/**
 * Desplazamiento por aberración anual, como vector que se SUMA a la dirección
 * antes de renormalizar.
 *
 * La aberración no es una rotación del cielo: es que la luz llega inclinada
 * porque el observador se mueve. Sumar β = v/c y renormalizar es exactamente
 * la fórmula de primer orden, y da el máximo de 20,5" donde toca —a 90° del
 * ápex— y cero donde toca —mirando al ápex—. Escribirlo como rotación habría
 * necesitado un eje distinto para cada estrella.
 *
 * Se desprecia la excentricidad de la órbita (0,0167): deja 0,34" de residuo.
 */
export function aberrationVector(at: number): [number, number, number] {
  const T = julianCenturies(at)
  // Longitud eclíptica media del Sol. La Tierra va 90° por detrás en su
  // recorrido, o sea su velocidad apunta a λ_sol − 90°.
  const l = (280.46646 + 36000.76983 * T) * RAD
  const g = (357.52911 + 35999.05029 * T) * RAD
  const lambdaSun = l + (1.914602 - 0.004817 * T) * RAD * Math.sin(g) + 0.019993 * RAD * Math.sin(2 * g)
  const apex = lambdaSun - Math.PI / 2
  // 29,7859 km/s / 299 792,458 km/s. En radianes son 20,50", la constante de
  // aberración clásica (20,4955" en la definición del IAU, con excentricidad).
  const beta = 9.9355e-5
  const eps = meanObliquity(T)
  // De eclíptica a ecuatorial. La velocidad está en el plano de la eclíptica,
  // así que su componente z eclíptica es cero.
  const x = beta * Math.cos(apex)
  const yEcl = beta * Math.sin(apex)
  return [x, yEcl * Math.cos(eps), yEcl * Math.sin(eps)]
}

export interface SkyFrame {
  /**
   * ICRS → base local (este, norte, arriba), ya con precesión, nutación y
   * rotación de la Tierra dentro. La aberración va aparte porque es una suma.
   * Es la que usan las estrellas, que vienen del catálogo en ICRS.
   */
  matrix: Mat3
  /**
   * Ecuador VERDADERO DE LA FECHA → base local. Sin precesión ni nutación,
   * porque quien entra por aquí ya las trae puestas.
   *
   * La usan los planetas y la luna: una efeméride no da coordenadas J2000, da
   * las de hoy. Pasarlas por `matrix` las precesaría dos veces —22' de más, dos
   * tercios de luna llena— y el error tendría la forma más traicionera posible:
   * todos los planetas desplazados igual, o sea un cielo coherente y mal.
   */
  ofDate: Mat3
  /** Se suma a la dirección ICRS antes de multiplicar por la matriz. */
  aberration: [number, number, number]
  /** Tiempo sidéreo local aparente, radianes. Para el panel, no para dibujar. */
  localSiderealTime: number
}

/**
 * La orientación del cielo sobre un punto de la isla, en este instante.
 *
 * El orden de la cadena es el que dicta la física y no se puede permutar:
 * primero se lleva la dirección del catálogo al ecuador de la fecha (precesión
 * y nutación), después se gira lo que la Tierra lleve girado (hora sidérea) y
 * al final se inclina por la latitud. Cada paso es un cambio de base, y
 * multiplicarlos en otro orden da un cielo girado que parece plausible.
 */
export function skyFrame(at: number, lonDeg: number, latDeg: number): SkyFrame {
  const T = julianCenturies(at)
  const last = apparentSiderealTime(at) + lonDeg * RAD
  const phi = latDeg * RAD
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const cosT = Math.cos(last)
  const sinT = Math.sin(last)

  // Del ecuador verdadero al sistema de ángulo horario: x hacia el meridiano,
  // y hacia el oeste, z al polo norte celeste.
  const hourAngleFrame: Mat3 = [
    [cosT, sinT, 0],
    [sinT, -cosT, 0],
    [0, 0, 1],
  ]
  // Y de ahí a este/norte/arriba.
  const horizon: Mat3 = [
    [0, -1, 0],
    [-sinPhi, 0, cosPhi],
    [cosPhi, 0, sinPhi],
  ]

  const ofDate = mul(horizon, hourAngleFrame)
  const matrix = mul(ofDate, mul(nutationMatrix(T), precessionMatrix(T)))
  return {
    matrix,
    ofDate,
    aberration: aberrationVector(at),
    localSiderealTime: ((last % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
  }
}

/**
 * Como `applyFrame` pero para coordenadas que ya son de la fecha: sin
 * precesión, sin nutación y sin aberración. Es la puerta de los planetas.
 */
export function applyOfDate(
  frame: SkyFrame,
  raRad: number,
  decRad: number,
): [number, number, number] {
  const cd = Math.cos(decRad)
  const u: [number, number, number] = [
    cd * Math.cos(raRad),
    cd * Math.sin(raRad),
    Math.sin(decRad),
  ]
  const m = frame.ofDate
  return [
    m[0][0] * u[0] + m[0][1] * u[1] + m[0][2] * u[2],
    m[1][0] * u[0] + m[1][1] * u[1] + m[1][2] * u[2],
    m[2][0] * u[0] + m[2][1] * u[1] + m[2][2] * u[2],
  ]
}

/**
 * Aplica el marco a una dirección del catálogo. Devuelve el vector unitario en
 * la base local (este, norte, arriba).
 *
 * La usan la prueba y el panel —para decir a qué altura está una estrella
 * concreta—. La capa de dibujo NO la llama: hace lo mismo en el sombreador,
 * para las 8920 a la vez.
 */
export function applyFrame(
  frame: SkyFrame,
  raRad: number,
  decRad: number,
): [number, number, number] {
  const cd = Math.cos(decRad)
  const p: [number, number, number] = [
    cd * Math.cos(raRad) + frame.aberration[0],
    cd * Math.sin(raRad) + frame.aberration[1],
    Math.sin(decRad) + frame.aberration[2],
  ]
  const n = Math.hypot(p[0], p[1], p[2])
  const u: [number, number, number] = [p[0] / n, p[1] / n, p[2] / n]
  const m = frame.matrix
  return [
    m[0][0] * u[0] + m[0][1] * u[1] + m[0][2] * u[2],
    m[1][0] * u[0] + m[1][1] * u[1] + m[1][2] * u[2],
    m[2][0] * u[0] + m[2][1] * u[1] + m[2][2] * u[2],
  ]
}

/** Altura sobre el horizonte y acimut desde el norte hacia el este, grados. */
export function horizontal(v: [number, number, number]): {
  elevationDeg: number
  azimuthDeg: number
} {
  const [e, n, u] = v
  return {
    elevationDeg: (Math.asin(Math.max(-1, Math.min(1, u))) * 180) / Math.PI,
    azimuthDeg: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360,
  }
}
