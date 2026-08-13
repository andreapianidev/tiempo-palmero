/**
 * Niveles y color de los fondos de GRAFCAN, con las propiedades que MapLibre
 * ya tiene.
 *
 * NO HAY SHADER PROPIO AQUÍ, Y ESO ES UN RESULTADO, NO UNA RENUNCIA. La idea
 * de partida era pasar cada tesela por una máscara de enfoque antes de
 * enseñarla. Se implementó, se midió contra la cartografía de verdad y **se
 * tiró**, porque la medida dice que hace daño. Queda escrito aquí para que
 * nadie lo vuelva a intentar sin volver a medirlo.
 *
 * EL ENSAYO. La pregunta buena no es «¿se ve más nítido?» —una máscara de
 * enfoque siempre se ve más nítida— sino «¿se parece más a lo que el servicio
 * dibuja cuando se le pide de verdad esa escala?». Así que se compara la
 * tesela realzada contra la que GRAFCAN devuelve al doble de resolución,
 * reducida. Error cuadrático medio (×1000), promedio de dos teselas z16 sobre
 * Los Llanos y Tazacorte, 13 de agosto de 2026:
 *
 *   enfoque      0,00    0,35    0,65    1,00
 *   topográfico  41,1    45,3    49,6    55,2
 *   ortofoto     61,4    68,9    76,8    87,2
 *
 * Sube siempre. No hay mínimo: **cero enfoque es lo más parecido a la verdad
 * que se puede estar.** Y se repitió el ensayo en el caso donde el enfoque
 * tendría algo que recuperar —una tesela ampliada, que es lo que se ve entre
 * dos niveles de zoom—, comparándola contra la nativa de ese tamaño:
 *
 *   enfoque      0,00    0,50    1,00    1,50
 *   topográfico  77,7    79,6    82,3    85,7
 *   ortofoto     72,3    74,2    76,8    80,2
 *
 * También sube siempre. La conclusión es que el enfoque añade contraste que la
 * cartografía real no tiene: la nitidez que faltaba no se recupera inventando
 * bordes, se recupera **pidiendo los píxeles que hacen falta**, que es lo que
 * hace `density.ts`.
 *
 * LO QUE SÍ SE HACE es repartir los tonos que ya están, y para eso las
 * propiedades `raster-*` de MapLibre llegan de sobra: son uniformes de su
 * propio shader, así que cuestan cero y se pueden cambiar en caliente.
 *
 * EL PRESUPUESTO DE DAÑO ES 0,5 %. Un estirado de niveles pega contra el 0 o
 * contra el 1 a los píxeles de los extremos, y esos pierden información que
 * antes tenían. Se cuenta exactamente eso —píxeles que NO estaban pegados y
 * acaban pegados, canal a canal— y el tope es el 0,5 %, que es el mismo margen
 * que se acepta al recortar por los percentiles.
 *
 * TOPOGRÁFICO: NADA. Medido canal a canal sobre cuatro teselas de 1024, su
 * negro está en 0,004 y su blanco en 1,000 — la carta YA ocupa todo el
 * recorrido, no hay nada que estirar. Y subirle color sale caro enseguida,
 * porque su papel ya está pegado al blanco: +0,10 de saturación daña el 0,90 %
 * de los píxeles, el doble del presupuesto, a cambio de 0,013 de croma. Su
 * problema nunca fue el color; era la resolución, y eso lo arregla `density`.
 *
 * ORTOFOTO: LA CALIMA. Ahí sí hay veo que quitar. Percentiles por canal:
 *
 *   recorte    negro    blanco   daño
 *   0,1 %      0,024    0,973    0,14 %
 *   0,2 %      0,039    0,953    0,35 %   ← el elegido
 *   0,5 %      0,059    0,914    0,92 %   — se pasa del presupuesto
 *
 * Ese negro en 0,039 en vez de en 0 es la calima del Atlántico: un velo que se
 * suma a todo por igual. Quitarlo no es maquillar, es deshacer algo que el
 * sensor sí metió — y de paso devuelve el color que el velo se llevaba, porque
 * el croma medio pasa de 0,149 a 0,173 sin tocar la saturación.
 *
 * La saturación se queda en +0,10 (daño 0,34 %, croma 0,189). Cabía más —con
 * +0,30 el daño sigue siendo 0,43 %, por debajo del presupuesto, y el croma
 * llega a 0,233—, pero ahí ya no se está recuperando lo que la calima quitó,
 * se está pintando encima. La regla de la casa es la misma que con los datos:
 * corregir lo que se puede justificar, y parar.
 */

/** Lo que se le pasa a las propiedades `raster-*` de una capa. */
export interface RasterAdjust {
  contrast: number
  brightnessMin: number
  brightnessMax: number
  saturation: number
  /**
   * Luminancia típica del fondo YA realzado, medida sobre teselas reales. Es
   * lo que usa el contraste de las líneas de encima para decidir su color.
   */
  luma: number
  /**
   * Y cuánto varía de un píxel a otro (desviación típica local mediana, en
   * ventana de 5 × 5). Un fondo liso no necesita que las líneas lleven halo;
   * uno moteado —una ortofoto— no se resuelve con ningún color.
   */
  variation: number
}

/**
 * El estirado `(x − negro) / (blanco − negro)` escrito con las tres
 * propiedades que MapLibre ofrece.
 *
 * Su shader hace, en este orden: `rgb = (rgb − 0,5) · C + 0,5` y luego
 * `mix(min, max, rgb)`. Encadenando las dos sale una recta, así que se puede
 * igualar término a término con el estirado que se quiere:
 *
 *     (max − min) · C = 1 / (blanco − negro)
 *     min + (max − min) · (1 − C) / 2 = −negro / (blanco − negro)
 *
 * Son dos ecuaciones y tres incógnitas: sobra un grado de libertad, y se gasta
 * en coger el mayor recorrido `max − min` que deje las tres dentro de sus
 * rangos legales (`min` y `max` en 0–1, y `C ≥ 1`, que es lo que la propiedad
 * `raster-contrast` puede expresar).
 */
export function levelsToRaster(black: number, white: number): {
  contrast: number
  brightnessMin: number
  brightnessMax: number
} {
  const scale = 1 / (white - black)
  const span = Math.min(scale, scale * (1 - 2 * black), 2 - scale * (1 - 2 * black))
  const c = scale / span
  const min = 0.5 * scale - black * scale - 0.5 * span
  return {
    // `raster-contrast` guarda C como 1 − 1/C, que es lo que su shader deshace.
    contrast: 1 - 1 / c,
    brightnessMin: min,
    brightnessMax: min + span,
  }
}

const NEUTRAL = { contrast: 0, brightnessMin: 0, brightnessMax: 1 }

export const BASEMAP_LEVELS: Record<'relieve' | 'topografico' | 'satelite', RasterAdjust> = {
  /**
   * El relieve no pasa por aquí —se dibuja en casa y ya sale como tiene que
   * salir—, pero sus dos cifras sí hacen falta: son las que dicen sobre qué
   * fondo se van a pintar las carreteras. Medidas sobre el sombreado final,
   * solo en tierra emergida.
   */
  relieve: { ...NEUTRAL, saturation: 0, luma: 0.292, variation: 0.0131 },

  topografico: { ...NEUTRAL, saturation: 0, luma: 0.808, variation: 0.0788 },

  satelite: {
    ...levelsToRaster(0.0392, 0.9529),
    saturation: 0.1,
    luma: 0.343,
    variation: 0.0695,
  },
}
