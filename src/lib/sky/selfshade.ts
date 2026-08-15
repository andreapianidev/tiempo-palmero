/**
 * Cuánta luz le llega a cada mota, después de atravesar su propia nube.
 *
 * QUÉ SUSTITUYE. Había una constante por estrato —0,45 la manta baja, 0,32 la
 * media, 0,10 el cirro— y una rampa con la altura dentro de la nube: la panza
 * oscura, la cima encendida, siempre igual y siempre en la misma dirección.
 * Eso es cierto con el sol en lo alto y falso el resto del día. Con el sol
 * rasante, una nube no tiene la panza oscura: tiene oscuro **el lado contrario
 * al sol**, y eso es lo que hace que un cúmulo de las ocho de la tarde se lea
 * como un objeto con volumen y no como un algodón con sombra pintada abajo.
 *
 * QUÉ HACE. Desde el centro de cada mota, marcha hacia el sol y cuenta cuánta
 * nube tiene delante: por cada otra mota que el rayo atraviesa, la longitud de
 * la cuerda dentro de esa esfera. Con eso sale un espesor óptico y, de ahí, la
 * transmitancia. Es un solo evento de dispersión —el haz directo— y a eso hay
 * que sumarle lo que la nube se reparte por dentro, que es lo que impide que su
 * base sea negra; ver `MULTIPLE_SCATTERING`.
 *
 * DE DÓNDE SALE LA EXTINCIÓN, que es la parte que podría haber sido una
 * corazonada y no lo es. **No hay ninguna constante nueva.** Un rayo que cruza
 * una mota por su centro tiene que apagarse exactamente lo que esa mota tapa al
 * dibujarse, que es `puffAlpha` —la opacidad que `EFFECTIVE_OVERLAP` reparte
 * entre las motas apiladas—. O sea que el espesor óptico de una cuerda que pasa
 * por el centro es −ln(1 − puffAlpha), y el de una cuerda cualquiera, esa cifra
 * por su longitud relativa. La nube se sombrea con la misma opacidad con la que
 * se dibuja; si algún día cambia una, cambia la otra sola.
 *
 * NO ES POR FOTOGRAMA. Cuesta n² por nube —900 operaciones con las 30 motas de
 * una nube baja— y solo cambia cuando se mueve el sol. La deriva no la cambia:
 * una nube se traslada rígida, y las motas conservan sus posiciones relativas.
 * El hervido tampoco entra: mueve cada mota un 9 % de su radio, y recalcular
 * 900 cuerdas para eso sería pagar un barrido por fotograma para no ver nada.
 *
 * LA DIRECCIÓN DE LA LUZ, de noche. Con el sol bajo el horizonte no hay haz que
 * seguir: lo que ilumina una nube es la cúpula del cielo, que viene de arriba.
 * Así que la dirección va rotando del sol al cenit con `dayFactor`, la misma
 * rampa de crepúsculo que apaga la escena. No se conmuta: girar de golpe la
 * iluminación de todas las nubes en el instante del ocaso se ve, y es
 * exactamente el tipo de rama que este repositorio ya ha pagado dos veces.
 */

import { dayFactor, skyVector, type SkyPosition } from '../sun'
import { EFFECTIVE_OVERLAP, type Cloud } from './scene'

/**
 * Cuánta de la luz de una mota NO viene del haz directo.
 *
 * Una nube dispersa la luz muchísimas veces por dentro: a su interior no le
 * llega el sol —eso es lo que calcula el barrido de aquí— pero sí le llega lo
 * que el resto de la nube va repartiendo, y por eso la panza de un cúmulo de
 * buen tiempo es gris claro y no negra. Este número es esa parte, la que un
 * modelo de un solo evento de dispersión no puede dar.
 *
 * CUÁNTO VALE NO SE PUEDE SACAR DE NINGÚN DATO DE ESTE REPOSITORIO, así que se
 * acota por las dos orillas. Medido con `scripts/checks/cloud-selfshade.ts`
 * sobre una escena de tres estratos con el sol a 12°, que es donde el barrido
 * más manda:
 *
 *   dispersión   lo más oscuro que se ve   cara al sol − contraria
 *   0,00         0,012                     0,780
 *   0,10         0,111                     0,702
 *   0,22         0,230                     0,609   ← el elegido
 *   0,30         0,309                     0,546
 *   0,55         0,556                     0,351
 *
 * LA ORILLA DE ABAJO ES NO DEJAR AGUJEROS. El sombreador multiplica el color de
 * la mota por esto, así que con 0 la cara en sombra de una nube se dibuja negra
 * y se lee como un agujero recortado en el cielo, no como una nube. Es
 * literalmente el argumento con el que el mar se puso su `LIT_FLOOR` —«un mar
 * absolutamente negro se ve como un agujero recortado, no como agua»— y da el
 * mismo número, 0,22, porque es el mismo problema.
 *
 * LA DE ARRIBA ES QUE CADA PUNTO DE SUELO SE COME EL CONTRASTE que es la razón
 * de ser de todo esto: de 0 a 0,55 la diferencia entre la cara al sol y la
 * contraria cae a menos de la mitad. Con 0,22 se conserva el 78 % de la que
 * habría sin suelo ninguno.
 *
 * NO ESTÁ CALIBRADO CONTRA LA CONSTANTE QUE SUSTITUYE, y hay que decirlo: con
 * este modelo la escena de mediodía sale MÁS CLARA que antes —0,96 contra 0,81
 * de media, pesando cada mota por lo que se la ve—. No es una deriva: la
 * constante oscurecía la base de todas las nubes estuviera o no a la vista, y
 * ésta solo oscurece lo que de verdad está enterrado. Una manta de mediodía
 * vista desde arriba es blanca.
 */
export const MULTIPLE_SCATTERING = 0.22

/**
 * Cuánto oscurece la lluvia, por encima de lo que ya oscurece el espesor.
 *
 * Hereda el extremo que tenía la constante: una nube con lluvia fuerte pasaba de
 * 0,55 de luz en la base a 0,25, o sea al 45 % — de ahí este 0,55. No es la
 * misma cuenta que la extinción y no puede serlo, porque la gota que llueve ya
 * no está dentro de la nube: es la cortina de debajo, que le quita luz a la
 * panza sin ser parte de su volumen.
 */
export const RAIN_DARKEN = 0.55

/** Milímetros por hora a los que la cortina de lluvia oscurece del todo. */
const RAIN_FULL_MM = 4

/**
 * La luz que le llega a cada mota, de 0 a 1, en el orden de `cloud.puffs`.
 *
 * `out` se puede reutilizar entre llamadas: esto se recalcula para la escena
 * entera cada vez que el sol se mueve medio grado, y reservar un array por nube
 * y por barrido llenaría el recolector de basura para nada.
 */
export function selfShade(
  cloud: Cloud,
  sun: SkyPosition,
  out?: Float32Array,
  /** Solo lo mueve el script que lo calibra. En la aplicación es el de arriba. */
  multipleScattering = MULTIPLE_SCATTERING,
): Float32Array {
  const puffs = cloud.puffs
  const n = puffs.length
  const light = out && out.length >= n ? out : new Float32Array(n)

  // La dirección de la que viene la luz, en la base local (este, norte, arriba).
  // De día, el sol; de noche, el cenit; en el crepúsculo, girando entre los dos.
  const day = dayFactor(sun.elevationDeg)
  const [se, sn, su] = skyVector(sun)
  let dx = se * day
  let dy = sn * day
  let dz = su * day + (1 - day)
  const norm = Math.hypot(dx, dy, dz) || 1
  dx /= norm
  dy /= norm
  dz /= norm

  // Espesor óptico de una cuerda que pasa por el centro de una mota. Es la
  // opacidad con la que la mota se dibuja, leída como extinción.
  const puffAlpha = 1 - Math.pow(1 - Math.min(0.999, cloud.density), 1 / EFFECTIVE_OVERLAP)
  const tauCenter = -Math.log(Math.max(1e-6, 1 - puffAlpha))

  const thickness = cloud.top - cloud.base
  const rain =
    cloud.precipMm > 0 ? Math.min(1, cloud.precipMm / RAIN_FULL_MM) : 0
  const rainFactor = 1 - RAIN_DARKEN * rain

  for (let i = 0; i < n; i++) {
    const a = puffs[i]
    // EL RAYO SALE DE LA CARA, NO DEL CENTRO, y esto no es un ajuste fino: es
    // la diferencia entre que el modelo funcione y que no. Lo que hay que saber
    // es cuánta luz llega a la SUPERFICIE iluminada de la mota, que es lo que se
    // ve —de su centro no se ve nada—, y esa superficie está a un radio del
    // centro en la dirección del sol.
    //
    // Con el rayo saliendo del centro, cada mota se entierra a sí misma bajo la
    // mitad de sus vecinas y hasta la cima de una manta salía a media luz.
    // Medido con `scripts/checks/cloud-selfshade.ts`: la cima de la manta baja
    // pasaba de 0,41 a 0,93 solo con mover el origen a la cara.
    const ax = a.dx + dx * a.radiusM
    const ay = a.dy + dy * a.radiusM
    const az = a.h * thickness + dz * a.radiusM
    let tau = 0

    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const b = puffs[j]
      const lx = b.dx - ax
      const ly = b.dy - ay
      const lz = b.h * thickness - az
      // Proyección sobre el rayo y distancia al eje: la intersección esfera-rayo
      // de siempre, sin raíces hasta que hace falta.
      const tca = lx * dx + ly * dy + lz * dz
      const r = b.radiusM
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca
      const r2 = r * r
      if (d2 >= r2) continue
      const thc = Math.sqrt(r2 - d2)
      const far = tca + thc
      // Detrás del observador —o sea, del lado del sol contrario— no tapa nada.
      if (far <= 0) continue
      const near = tca - thc
      const chord = far - Math.max(0, near)
      tau += (tauCenter * chord) / (2 * r)
    }

    const beam = Math.exp(-tau)
    light[i] =
      (multipleScattering + (1 - multipleScattering) * beam) * rainFactor
  }

  return light
}
