/**
 * La fuente del rótulo, aprendida una vez y guardada aquí.
 *
 * Cada entrada es un mapa de bits de 12×20 en hexadecimal, cuatro píxeles por
 * dígito hexadecimal, en el orden en que los deja `normalize()`. Se generaron
 * a partir de cuatro capturas del 14 de agosto de 2026 cuyo reloj se leyó a
 * ojo, tomando de cada una los caracteres que las otras no traían.
 *
 * VAN EN EL CÓDIGO Y NO EN UN FICHERO DE IMÁGENES DE REFERENCIA a propósito.
 * Son doce mapas de bits de treinta bytes: ocupan menos que el JPEG más pequeño
 * del que salieron, se leen en una revisión, y no obligan a guardar en el
 * repositorio medio megabyte de fotos de una tarde concreta que además
 * envejecerían. Si el Cabildo cambia de grabadores y con ellos de fuente, esto
 * se vuelve a generar; mientras tanto, es una constante.
 */

/** Carácter → mapa de bits de 12×20, en hexadecimal. */
export const STAMP_FONT: Record<string, string> = {
  '-': '000000000000000000000000000000ffffff000000000000000000000000',
  '0': '1f81f839c39ce07e07e07e07e67e67e67e67e07e07e07e0739c39c1f81f8',
  '1': '0f00f03f03f0ff0ff00f00f00f00f00f00f00f00f00f00f00f00f0ffffff',
  '2': '3fc3fce07e0700700701c01c0780781e01e0380380e00e00e07e07ffffff',
  '3': '3fc3fce07e070070070070071fc1fc007007007007007007e07e073fc3fc',
  '4': '01c01c07c07c1fc1fc39c39ce1ce1cffffff01c01c01c01c01c01c07f07f',
  '5': 'ffffffe00e00e00e00e00e00ffcffc007007007007007007e07e073fc3fc',
  '6': '1f81f8380380e00e00e00e00ffcffce07e07e07e07e07e07e07e073fc3fc',
  '7': 'ffffffe07e0700700700700701c01c0780781e01e01e01e01e01e01e01e0',
  '8': '3fc3fce07e07e07e07e07e073fc3fce07e07e07e07e07e07e07e073fc3fc',
  '9': '3fc3fce07e07e07e07e07e073ff3ff00700700700700700701c01c3f83f8',
  ':': '000000000000ffffffffffff000000000000000000ffffffffffff000000',
}
