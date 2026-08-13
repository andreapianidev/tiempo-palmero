/**
 * Los tres niveles de calidad del océano, y qué significa cada uno.
 *
 * NO ES UN DESLIZADOR DE «CALIDAD» ABSTRACTO. Cada nivel dice exactamente qué
 * se dibuja y qué no, porque lo que cuesta el mar se reparte en tres sitios muy
 * distintos y no siempre en el mismo dispositivo:
 *
 *   - la REJILLA cuesta vértices, y eso lo paga la parte geométrica de la GPU;
 *   - las OCTAVAS de detalle cuestan lecturas de textura por píxel, y eso lo
 *     paga la parte de fragmentos, que es la que se ahoga a 4K;
 *   - la REFRACCIÓN cuesta una copia de la pantalla entera por fotograma, y eso
 *     lo paga el ancho de banda de memoria, que es justo donde los portátiles
 *     con gráfica integrada van más justos.
 *
 * Bajar de nivel apaga primero lo que más cuesta y menos se echa de menos.
 */

export const OCEAN_QUALITIES = ['alta', 'equilibrada', 'ligera'] as const
export type OceanQuality = (typeof OCEAN_QUALITIES)[number]

export interface QualitySettings {
  /**
   * Divisiones de la rejilla proyectada por lado. El número de vértices es
   * (n+1)², y tiene que quedar por debajo de 65.536 para poder indexarla con
   * enteros de 16 bits, que es lo único que WebGL 1 garantiza: 224 deja 50.625.
   */
  grid: number
  /** Escalas de la textura de detalle que se suman por fragmento. */
  octaves: number
  /**
   * Se copia lo que hay debajo del agua para refractarlo. Es lo que deja ver el
   * fondo de la ortofoto a través de la ola, y lo primero que se apaga.
   */
  refraction: boolean
  /** Espuma arrancada por el viento y regueros a sotavento de las crestas. */
  spindrift: boolean
  label: string
  note: string
}

export const QUALITY: Record<OceanQuality, QualitySettings> = {
  alta: {
    grid: 224,
    octaves: 3,
    refraction: true,
    spindrift: true,
    label: 'Alta',
    note: 'Rejilla de 50.625 vértices, tres escalas de rizado, refracción del fondo y espuma de viento. Es la que pide una pantalla 4K.',
  },
  equilibrada: {
    grid: 160,
    octaves: 2,
    refraction: true,
    spindrift: false,
    label: 'Equilibrada',
    note: 'La mitad de triángulos y dos escalas de rizado. Se mantiene la refracción, que es lo que más cambia el aspecto del agua.',
  },
  ligera: {
    grid: 96,
    octaves: 1,
    refraction: false,
    spindrift: false,
    label: 'Ligera',
    note: 'Sin refracción ni espuma de viento: el mar sigue moviéndose con los mismos datos, pero no copia la pantalla en cada fotograma.',
  },
}

/**
 * Qué nivel poner sin preguntar.
 *
 * La cuenta que importa no es «qué tarjeta hay» —que el navegador no dice— sino
 * cuántos píxeles hay que pintar: una pantalla retina de 15 pulgadas son 8,3
 * millones de fragmentos por fotograma, cuatro veces los de una pantalla
 * normal, y el mismo equipo va sobrado en una y justo en la otra.
 *
 * El número de núcleos entra como aproximación grosera a la gama del equipo, que
 * es lo único que `navigator` ofrece sin sondear la GPU.
 */
export function autoQuality(
  pixels: number,
  cores = 4,
  coarsePointer = false,
): OceanQuality {
  // En un teléfono nunca se arranca en alta: la pantalla es pequeña pero la GPU
  // también, y ahí el mar compite con el resto del mapa por la misma batería.
  if (coarsePointer) return pixels > 2_500_000 ? 'ligera' : 'equilibrada'
  if (cores <= 4) return pixels > 4_000_000 ? 'ligera' : 'equilibrada'
  return pixels > 9_000_000 ? 'equilibrada' : 'alta'
}
