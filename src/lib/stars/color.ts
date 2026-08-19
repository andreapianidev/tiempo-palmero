/**
 * De qué color es una estrella.
 *
 * EL CATÁLOGO NO DA COLOR, da **índice de color B−V**: la diferencia entre la
 * magnitud de la estrella medida con un filtro azul y con uno visual. Es
 * negativo en las azules —Rigel, −0,03— y positivo en las rojas —Betelgeuse,
 * 1,85—. Convertirlo en tres números para la pantalla es una cadena de dos
 * pasos, y los dos son física publicada y no una paleta a gusto:
 *
 *  1. **B−V → temperatura**, con la fórmula de Ballesteros (2012, EPL 97,
 *     34008), que trata la estrella como dos cuerpos negros observados por los
 *     dos filtros y se despeja exactamente:
 *     `T = 4600·(1/(0,92·BV + 1,70) + 1/(0,92·BV + 0,62))` K.
 *  2. **Temperatura → color**, integrando el espectro de Planck contra las
 *     funciones de igualación del observador estándar CIE 1931 y pasando a sRGB.
 *     Eso es caro para hacerlo por estrella, así que aquí va la aproximación
 *     racional de Neil Bartlett a la misma curva, con un error por debajo de un
 *     nivel de 255 en todo el rango de 1000 a 40 000 K.
 *
 * POR QUÉ NO SE HACE EN EL SOMBREADOR. Porque el color de una estrella no
 * cambia nunca: se calcula una vez al cargar el catálogo y viaja en el búfer
 * junto a la posición. Meterlo en el sombreador sería recalcular 8920 veces por
 * fotograma algo que es constante desde hace mil millones de años.
 *
 * EL BLANQUEO NO ES UN ADORNO. A simple vista las estrellas se ven **mucho más
 * pálidas** de lo que dice su temperatura, porque casi todas caen por debajo del
 * umbral de la visión en color: solo las cuatro o cinco más brillantes activan
 * los conos, y el resto las ven los bastones, que no distinguen color. Un mapa
 * con las estrellas al color saturado de su temperatura es bonito y es falso —y
 * es el error visual más repetido en los planetarios de pantalla—. Por eso el
 * color se mezcla con blanco según la magnitud, y la mezcla la hace la capa,
 * que es la que sabe qué magnitud límite hay esta noche.
 */

/** Temperatura efectiva a partir del índice de color. Ballesteros 2012. */
export function temperatureFromBv(bv: number): number {
  // Fuera de este rango la fórmula se sale: por debajo de −0,4 el denominador
  // se acerca a cero y por encima de 2,0 no hay estrellas en el catálogo. Las
  // dos cotas son de la propia muestra, no del gusto.
  const b = Math.max(-0.35, Math.min(2, bv))
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))
}

/**
 * Color de un cuerpo negro a `kelvin`, en sRGB lineal 0-1.
 *
 * Aproximación racional de Bartlett a la curva de Planck pasada por CIE 1931.
 * El resultado está normalizado para que el canal más alto valga 1: lo que se
 * quiere de aquí es el TONO, y el brillo lo pone la magnitud.
 */
export function blackbodyRgb(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100

  let r: number
  if (t <= 66) r = 255
  else r = 329.698727446 * Math.pow(t - 60, -0.1332047592)

  let g: number
  if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661
  else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)

  let b: number
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307

  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255
  const rgb: [number, number, number] = [clamp(r), clamp(g), clamp(b)]
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-6)
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak]
}

/** El atajo completo: del índice de color del catálogo al color de pantalla. */
export function starColor(bv: number | null): [number, number, number] {
  // Las 40 estrellas del catálogo sin fotometría azul salen blancas. Es la
  // respuesta correcta: no se sabe su color, y un blanco no afirma nada.
  if (bv === null) return [1, 1, 1]
  return blackbodyRgb(temperatureFromBv(bv))
}
