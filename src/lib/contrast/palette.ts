/**
 * El color que le toca a cada línea según el fondo que tenga debajo.
 *
 * EL PROBLEMA, EN UNA FRASE: los colores de las líneas se eligieron mirando el
 * relieve —un fondo oscuro— y después se les puso encima una carta topográfica
 * que es papel casi blanco. Sobre ella, una carretera de `rgba(214,201,183)` al
 * 42 % es un gris claro sobre un blanco: existe, pero no se ve. Lo mismo con
 * el ámbar de los senderos y con el azul de las guaguas.
 *
 * LO QUE NO SE HACE: una segunda paleta escrita a mano para el fondo claro. Eso
 * son dos listas de nueve colores que hay que mantener sincronizadas a ojo, y
 * el día que se añada un fondo más, tres.
 *
 * LO QUE SE HACE: **se conserva el contraste que cada línea ya tenía.** Se mide
 * qué relación de contraste consigue cada tinta sobre el relieve —que es el
 * fondo para el que se diseñaron— y se busca, en cualquier otro fondo, el color
 * del mismo tono que consigue ESA MISMA relación. Así:
 *
 *  - sobre el relieve el resultado es el color de siempre, bit a bit, porque la
 *    cuenta se resuelve sola. Hay un test que lo comprueba;
 *  - sobre la carta topográfica, el gris cálido se vuelve oscuro en vez de
 *    desaparecer, y el ámbar se vuelve un ámbar tostado;
 *  - y la **jerarquía se mantiene**, que es lo que importa: si el viario de OSM
 *    estaba tres veces más apagado que las carreteras insulares, lo sigue
 *    estando en todos los fondos. No se sube todo a un mínimo legible; se
 *    traslada la escala entera.
 *
 * El contraste se calcula sobre la luminancia MEDIANA del fondo, medida sobre
 * teselas reales de cada uno (ver `realce/levels.ts`): ortofoto 0,343 y carta
 * topográfica 0,808. El del relieve —0,292— es el único que ya no es una
 * mediana sino un punto de calibración, y en `realce/levels.ts` está explicado
 * por qué, con lo que pasa si se pone la mediana de verdad.
 *
 * LO QUE ESTO NO ARREGLA, Y CONVIENE SABERLO. Una mediana describe un fondo
 * liso, y la ortofoto no lo es: de cerca, su variación local mediana es 0,0695,
 * y el relieve es el fondo más liso de los tres. Sobre un invernadero blanco y
 * un malpaís negro separados por diez metros no hay un solo color que funcione
 * en los dos —hace
 * falta que la línea lleve su propio halo debajo, que es una capa más por cada
 * capa de línea—. Eso queda pendiente y está medido para cuando se haga; lo que
 * este fichero resuelve es el fondo claro entero, que era el caso roto.
 */

import { BASEMAP_LEVELS } from '../realce/levels'
import { contrast, cssRgba, luminance, readableInk, type Ink } from './ratio'
import { ROLES, ROLE_IDS, type RoleId } from './roles'

/**
 * El fondo para el que se eligieron estos colores: el de casa, el que trae la
 * aplicación al abrirse y el único que no depende de nadie.
 *
 * Tiene que ser EXACTAMENTE `BASEMAP_LEVELS.relieve.luma` —no un número
 * parecido— porque es lo que hace que sobre el relieve la regla devuelva los
 * colores de partida bit a bit. Cuánto vale y por qué está ahí explicado.
 */
export const REFERENCE_LUMA = BASEMAP_LEVELS.relieve.luma

/** Lo que se ve de una tinta al pintarla sobre un fondo de esa luminancia. */
export function composited(ink: Ink, background: number): number {
  return ink.alpha * luminance(ink.rgb) + (1 - ink.alpha) * background
}

/**
 * La relación de contraste que esta tinta consigue sobre el fondo de
 * referencia. Es el objetivo que hay que reproducir en los demás.
 */
export function designRatio(ink: Ink): number {
  return contrast(composited(ink, REFERENCE_LUMA), REFERENCE_LUMA)
}

/** El color de una línea sobre un fondo cualquiera, en CSS. */
export function inkFor(id: RoleId, background: number): string {
  const ink = ROLES[id]
  return cssRgba(readableInk(ink, background, designRatio(ink)))
}

/** Los nueve de golpe, que es como los pide el mapa. */
export function palette(background: number): Record<RoleId, string> {
  return Object.fromEntries(ROLE_IDS.map((id) => [id, inkFor(id, background)])) as Record<
    RoleId,
    string
  >
}
