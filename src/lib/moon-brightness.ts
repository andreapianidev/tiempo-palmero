/**
 * Cuánta luz echa la luna según la fase, que no es la fracción iluminada.
 *
 * EL ERROR QUE ESTE FICHERO EXISTE PARA NO VOLVER A COMETER. Parece de cajón
 * que media luna alumbre la mitad que la llena: el disco está iluminado a la
 * mitad. Es falso, y no por poco. La luna en cuarto da el **9 %** de la luz de
 * la llena, no el 50 %, y una luna de tres días da el 0,6 %.
 *
 * | Fracción iluminada | Ángulo de fase | Luz que echa | Veces menos que lo lineal |
 * |---:|---:|---:|---:|
 * | 1,00 | 0° | 100 % | — |
 * | 0,90 | 37° | 41,1 % | 2,2 |
 * | 0,75 | 60° | 22,7 % | 3,3 |
 * | 0,50 | 90° | **9,1 %** | **5,5** |
 * | 0,25 | 120° | 2,6 % | 9,5 |
 * | 0,10 | 143° | 0,7 % | 14,5 |
 *
 * SON DOS COSAS A LA VEZ, y las dos van en la misma dirección. Una, que la
 * superficie iluminada que se ve de perfil está escorzada. Y dos, el **pico de
 * oposición**: el regolito lunar es un polvo de sombras propias, y con el sol
 * justo detrás del observador cada grano tapa su propia sombra y el suelo se
 * enciende de golpe. Por eso la curva no es suave alrededor de la llena sino
 * que tiene un pico, y por eso el término en α⁴ de Krisciunas y Schaefer no es
 * un ajuste sino física del suelo.
 *
 * DÓNDE SE NOTA EN ESTA APLICACIÓN. En el mar, que es donde se ve el reflejo:
 * antes de esto la columna de luna se dibujaba proporcional a la fracción
 * iluminada, o sea **cinco veces y media más brillante de la cuenta en cuarto
 * creciente**. Y en el modelo de brillo del cielo, que ya usaba la fórmula
 * buena metida dentro de `skyglow.ts`: ahora la usan los dos desde aquí, que
 * era la única forma de que el mar y el cielo no se contradijeran en la misma
 * pantalla.
 *
 * FUENTE. Krisciunas, K. & Schaefer, B. E. (1991), «A model of the brightness
 * of moonlight», PASP 103, ec. 20. Es el mismo trabajo del que sale el
 * resplandor lunar del cielo, y usarlo entero en vez de a trozos es la razón
 * de que esto sea un fichero y no dos funciones sueltas.
 */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/**
 * Ángulo de fase a partir de la fracción iluminada: 0° es llena y 180° nueva.
 *
 * Es la inversa exacta de `k = (1 + cos α) / 2`, y no una tabla.
 */
export function phaseAngleFromIllumination(illumination: number): number {
  return Math.acos(Math.max(-1, Math.min(1, 2 * illumination - 1))) * DEG
}

/**
 * Iluminancia de la luna fuera de la atmósfera, en las unidades de Krisciunas
 * y Schaefer (ec. 20). No tiene sentido leerla sola: sirve para el cálculo del
 * resplandor del cielo, que la multiplica por la función de dispersión.
 */
export function moonIlluminance(phaseAngleDeg: number): number {
  const a = Math.abs(phaseAngleDeg)
  return Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * Math.pow(a, 4)))
}

/**
 * Iluminancia de la luna llena, la misma fórmula en α = 0. Es el denominador
 * de `relativeMoonlight`, y está aquí con nombre para que la división se lea.
 */
export const FULL_MOON_ILLUMINANCE = moonIlluminance(0)

/**
 * Luz que echa la luna, de 0 a 1, tomando la llena como 1.
 *
 * Entra la FRACCIÓN ILUMINADA y no el ángulo de fase porque es lo que tienen a
 * mano quienes la llaman —el mar y el disco—, y porque pedir el ángulo invitaba
 * a pasarle la fracción por error, que es justo el fallo que esto corrige.
 *
 * CON LA LUNA NUEVA NO DEVUELVE CERO sino 3·10⁻⁴, que es lo que dice la
 * fórmula: la luna nueva no es negra, es que su luz es tres diezmilésimas de
 * la llena y no la ve nadie. Truncarlo a cero habría sido escribir una física
 * distinta de la que se cita.
 */
export function relativeMoonlight(illumination: number): number {
  const alpha = phaseAngleFromIllumination(illumination)
  return moonIlluminance(alpha) / FULL_MOON_ILLUMINANCE
}

/**
 * Camino óptico relativo de Krisciunas y Schaefer, ec. 3.
 *
 * NO es la masa de aire de Kasten y Young que usa el resto de la aplicación: es
 * la que ese modelo lleva dentro, y cambiarla por otra descalibraría sus
 * coeficientes. Vive aquí, con el resto del modelo, y no en `skyglow.ts`.
 */
export function opticalPath(zenithDeg: number): number {
  const s = Math.sin(zenithDeg * RAD)
  return Math.pow(Math.max(0.04, 1 - 0.96 * s * s), -0.5)
}
