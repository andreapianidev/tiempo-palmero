/**
 * Cómo se llama la luna que hay esta noche.
 *
 * ESTO NO ES UN UMBRAL MEDIDO Y NO PRETENDE SERLO: los nombres de las fases son
 * una convención, no un dato. Lo que sí se puede hacer —y es lo que se hace
 * aquí— es elegir los cortes en la unidad en la que la gente los usa, que son
 * DÍAS y no fracciones de disco:
 *
 *  - **Llena y nueva** duran ±1 día alrededor del instante exacto. En fracción
 *    iluminada eso es 0,98 y 0,02, porque la luna se llena muy deprisa al final:
 *    veinticuatro horas antes de la llena todavía marca 0,987.
 *  - **Los cuartos** duran ±0,75 días, o sea ±0,04 de fracción. Ahí la curva va
 *    al revés de rápida —cerca de la cuadratura la fracción cambia a toda
 *    velocidad—, y por eso el margen en fracción parece pequeño y en días no lo
 *    es.
 *
 * Los cortes están escritos en fracción y no en días porque es lo que la
 * efeméride da sin volver a integrar el mes, pero la cifra que los justifica es
 * la de días. Cambiar uno es cambiar una convención, no corregir un error.
 */

export type MoonPhaseName =
  | 'nueva'
  | 'crecienteFina'
  | 'cuartoCreciente'
  | 'gibosaCreciente'
  | 'llena'
  | 'gibosaMenguante'
  | 'cuartoMenguante'
  | 'menguanteFina'

/** ±1 día alrededor de la llena y de la nueva. */
const EXTREME = 0.02
/** ±0,75 días alrededor de cada cuarto. */
const QUARTER = 0.04

export function moonPhaseName(illumination: number, waxing: boolean): MoonPhaseName {
  if (illumination >= 1 - EXTREME) return 'llena'
  if (illumination <= EXTREME) return 'nueva'
  if (Math.abs(illumination - 0.5) <= QUARTER) {
    return waxing ? 'cuartoCreciente' : 'cuartoMenguante'
  }
  if (illumination < 0.5) return waxing ? 'crecienteFina' : 'menguanteFina'
  return waxing ? 'gibosaCreciente' : 'gibosaMenguante'
}
