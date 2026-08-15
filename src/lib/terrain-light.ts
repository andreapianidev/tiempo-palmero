/**
 * La isla iluminada por el sol que hay, no por uno de catálogo.
 *
 * QUÉ ESTABA MAL. El sombreado del relieve lleva desde el principio una luz
 * **fija en el 315°**, o sea el noroeste. Es la convención cartográfica de
 * siempre —se ilumina desde arriba a la izquierda porque el ojo humano
 * interpreta al revés el relieve iluminado desde abajo—, y como convención está
 * bien. El problema es que esta aplicación dibuja además un mar con el reflejo
 * del sol en su sitio real y unas nubes encendidas por la cara que les da la
 * luz: a las ocho de la mañana el mar brillaba por el este, las nubes se
 * iluminaban por el este, y la isla que había en medio seguía iluminada desde
 * el noroeste. Tres fuentes de luz distintas en la misma pantalla.
 *
 * QUÉ PUEDE Y QUÉ NO PUEDE MAPLIBRE. Su capa `hillshade` acepta exactamente
 * cinco cosas: la dirección de la luz, una exageración de 0 a 1, y los colores
 * de luz, sombra y acento. **No acepta la ALTURA del sol**, que es justo la
 * mitad de la información. Así que la altura se traduce a lo que sí hay:
 *
 *   - a la **exageración**, porque un sol bajo alarga las sombras y marca cada
 *     barranco, y un sol en lo alto aplana el relieve hasta casi borrarlo. Eso
 *     es literalmente lo que hace el coseno de la elevación en un sombreado
 *     Lambert, así que la exageración va con el coseno y no con una rampa
 *     inventada;
 *   - a los **colores**, porque un sol a 5° es naranja y uno a 70° es blanco.
 *
 * NO ES UN MODELO DE SOMBRAS ARROJADAS. `hillshade` solo sabe de pendientes:
 * ilumina una ladera según hacia dónde mira, pero no sabe que la pared de la
 * Caldera le tapa el sol al barranco de al lado. Eso es otra cosa —un mapa de
 * horizonte por posición solar— y no está aquí. Lo que hay es la dirección
 * correcta, que ya es la diferencia entre una isla iluminada y una isla con un
 * relieve grabado.
 *
 * DE NOCHE MANDA LA LUNA, y es de verdad: sale de las mismas efemérides de
 * `sun.ts` —posición y fase de Meeus— que ya usa el mar. Una luna llena alta
 * ilumina la isla desde donde está, con luz fría y sombras suaves; una luna
 * nueva no ilumina nada y queda un relieve apenas insinuado por la luz del
 * cielo. Es el mismo criterio que el océano lleva usando desde que existe.
 */

import { dayFactor, type SkyPosition } from './sun'

/** Lo que la capa `hillshade` de MapLibre sabe recibir. */
export interface TerrainLight {
  /** Grados desde el norte, hacia el este. De dónde viene la luz. */
  direction: number
  /** 0 a 1. Cuánto marca el relieve. */
  exaggeration: number
  highlight: string
  shadow: string
  accent: string
}

/**
 * Los valores fijos del estilo, para poder volver a ellos.
 *
 * Están aquí y no escritos a mano en dos sitios porque el estilo los pone al
 * arrancar y esta función los tiene que restituir al apagar el interruptor. Con
 * dos copias, cambiar el sombreado por defecto dejaría el «apagado» devolviendo
 * a un sombreado que ya no es el de nadie.
 */
export const HILLSHADE_DEFAULT: TerrainLight = {
  direction: 315,
  exaggeration: 0.5,
  highlight: '#8a8274',
  shadow: '#000000',
  accent: '#2a2622',
}

/**
 * Exageración por altura del sol.
 *
 * Con el sol en el horizonte el contraste es máximo y con el sol en la vertical
 * el relieve se aplana; entre medias va el coseno, que es lo que hace un
 * sombreado Lambert de verdad. Los dos extremos están acotados por legibilidad,
 * no por física: a 0,80 el mapa se vuelve un grabado que compite con la malla
 * de color que lleva encima, y por debajo de 0,18 la isla deja de tener forma.
 *
 * El valor fijo del estilo, 0,50, cae en esta escala a unos 54° de elevación
 * solar — o sea que la convención de siempre venía a ser un mediodía de
 * primavera permanente.
 */
const EXAGGERATION_FLAT = 0.18
const EXAGGERATION_GRAZING = 0.8

/**
 * Suelo de iluminación nocturna.
 *
 * Sin él, una noche de luna nueva dejaría el relieve completamente liso y la
 * isla se convertiría en una mancha. Esto NO es la aplicación mintiendo sobre
 * la luz que hay: es que el mapa se sigue usando de noche para leer la
 * temperatura, y un relieve sin forma se lee peor. Es la misma decisión que el
 * océano ya toma con su `LIT_FLOOR`.
 */
const NIGHT_EXAGGERATION = 0.3

/**
 * Interpola dos RUMBOS, no dos números.
 *
 * La media aritmética de 350° y 10° es 180°: el rumbo contrario. Es la misma
 * trampa que obliga a interpolar el viento en componentes, y aquí muerde en el
 * amanecer —cuando la luz pasa de la luna, que puede estar poniéndose por el
 * oeste, al sol que sale por el este—. Se mezcla en vectores y se vuelve con
 * `atan2`, que es el único camino que no inventa direcciones intermedias.
 */
function mixAngle(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t))
  const ar = (a * Math.PI) / 180
  const br = (b * Math.PI) / 180
  const x = Math.cos(ar) * (1 - k) + Math.cos(br) * k
  const y = Math.sin(ar) * (1 - k) + Math.sin(br) * k
  // Los dos rumbos opuestos con peso 1/2 dan el vector nulo y `atan2(0,0)` es
  // cero: se elige uno de los dos en vez de un norte que no ha pedido nadie.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return k < 0.5 ? a : b
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

/** Interpola dos colores en hexadecimal. `t` de 0 a 1. */
function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Color de la luz según lo bajo que esté el sol.
 *
 * Los dos extremos son los MISMOS que usa el mar (`ocean/light.ts`): blanco
 * apenas cálido en lo alto, naranja fuerte rozando el horizonte. Que el reflejo
 * sobre el agua y la ladera iluminada compartan color no es un detalle — son la
 * misma luz, y verlas de dos colores distintos en la misma pantalla es
 * exactamente lo que este fichero viene a arreglar.
 *
 * La curva va al cuadrado: el enrojecimiento no es lineal con la altura, se
 * dispara en los últimos grados, que es cuando el rayo atraviesa más atmósfera.
 */
function sunTint(elevationDeg: number): string {
  const redness = Math.pow(1 - Math.min(1, Math.max(0, elevationDeg / 25)), 2)
  return mixHex('#fff7ea', '#ff8c3d', redness)
}

/**
 * Cómo iluminar el relieve ahora mismo.
 *
 * `moon` puede faltar —quien no la calcule pasa `null`— y entonces la noche se
 * resuelve solo con la luz del cielo.
 */
export function terrainLight(
  sun: SkyPosition,
  moon: SkyPosition | null,
  moonPhase = 0,
): TerrainLight {
  const day = dayFactor(sun.elevationDeg)

  // NO HAY DOS RAMAS, hay una mezcla, y es a propósito. La primera versión
  // resolvía el día por un lado y la noche por otro, y en el borde —cuando el
  // sol cruza los −6°— los dos caminos no daban lo mismo: la exageración
  // saltaba de 0,18 a 0,30 de un minuto al siguiente, un parpadeo del relieve
  // entero en mitad del amanecer. Lo cazó la prueba que recorre el orto minuto
  // a minuto. Calculando SIEMPRE las dos luces y mezclándolas con `day`, la
  // continuidad no hay que vigilarla: sale por construcción.

  // La luz de la luna. Su luz es la del sol reflejada, así que es fría y mucho
  // más floja: la llena alumbra unas 400.000 veces menos.
  const up = moon ? Math.min(1, Math.max(0, (moon.elevationDeg + 2) / 10)) : 0
  const moonlight = up * moonPhase
  const nightExaggeration = NIGHT_EXAGGERATION * (0.6 + 0.4 * moonlight)
  const nightDirection =
    moon && moonlight > 0 ? moon.azimuthDeg : HILLSHADE_DEFAULT.direction

  // La luz del sol. El coseno de su altura da el contraste: rasante marca cada
  // barranco, en la vertical aplana el relieve.
  const cos = Math.cos((Math.min(90, Math.max(0, sun.elevationDeg)) * Math.PI) / 180)
  const dayExaggeration =
    EXAGGERATION_FLAT + (EXAGGERATION_GRAZING - EXAGGERATION_FLAT) * cos

  return {
    direction: mixAngle(nightDirection, sun.azimuthDeg, day),
    exaggeration: nightExaggeration + (dayExaggeration - nightExaggeration) * day,
    highlight: mixHex(mixHex('#2b3450', '#8fa6d8', moonlight), sunTint(sun.elevationDeg), day),
    // La sombra NO es negra: es la parte del terreno que solo ve el cielo, y el
    // cielo es azul. De noche se hunde, pero nunca a negro puro.
    shadow: mixHex('#05070d', '#141a2b', day),
    accent: mixHex('#12172a', '#2a2622', day),
  }
}
