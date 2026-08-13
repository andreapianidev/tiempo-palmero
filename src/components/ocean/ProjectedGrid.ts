/**
 * La rejilla del mar: regular EN LA PANTALLA, no en el mundo.
 *
 * ES LA RESPUESTA AL PROBLEMA DEL NIVEL DE DETALLE, y consiste en no tenerlo.
 * Una malla de agua puesta sobre el mundo obliga a decidir cuánto se subdivide
 * cada trozo según lo lejos que esté, a coserlo con los vecinos para que no
 * aparezcan grietas y a rehacerlo entero cada vez que se mueve la cámara. Una
 * malla puesta sobre la PANTALLA no tiene nada de eso: cada vértice es un píxel
 * fijo por el que se lanza un rayo hasta el plano del agua, así que los
 * triángulos salen pequeños donde el mar está cerca y enormes donde está lejos,
 * exactamente en la proporción en que se ven. Y los búferes no se tocan nunca:
 * lo único que cambia entre fotogramas son dos matrices.
 *
 * Se conoce como *projected grid* y viene del artículo de Claes Johanson,
 * «Real-time water rendering — introducing the projected grid concept» (2004).
 *
 * EL MARGEN. La rejilla se dibuja algo más grande que la pantalla porque los
 * vértices se desplazan: una cresta puede empujar un vértice del borde hacia
 * dentro y dejar a la vista una cuña de nada justo en la esquina. Con un 6 % de
 * margen no pasa ni con la ola más alta que este mar puede tener.
 */

const MARGIN = 0.06

export interface GridBuffers {
  vertices: Float32Array
  indices: Uint16Array
  /** Cuántos índices hay que dibujar. */
  count: number
  divisions: number
}

/**
 * Construye la rejilla de `divisions` × `divisions` cuadros.
 *
 * Los vértices son coordenadas de recorte (de −1 a 1, más el margen) y NO se
 * vuelven a calcular jamás: la desproyección al plano del mar la hace el
 * sombreador de vértices con la matriz inversa. Aquí solo se dice dónde caen
 * los puntos en la pantalla.
 */
export function buildProjectedGrid(divisions: number): GridBuffers {
  const side = divisions + 1
  if (side * side > 65536) {
    throw new Error(
      `rejilla de ${divisions}: ${side * side} vértices no caben en índices de 16 bits`,
    )
  }

  const vertices = new Float32Array(side * side * 2)
  for (let j = 0; j < side; j++) {
    // La fila se reparte de forma uniforme en pantalla. Sale desigual sobre el
    // agua —arriba cada fila se come kilómetros y abajo, metros— y eso es
    // justamente lo que se busca.
    const y = -1 - MARGIN + (2 * (1 + MARGIN) * j) / divisions
    for (let i = 0; i < side; i++) {
      const x = -1 - MARGIN + (2 * (1 + MARGIN) * i) / divisions
      const k = (j * side + i) * 2
      vertices[k] = x
      vertices[k + 1] = y
    }
  }

  const indices = new Uint16Array(divisions * divisions * 6)
  let n = 0
  for (let j = 0; j < divisions; j++) {
    for (let i = 0; i < divisions; i++) {
      const a = j * side + i
      const b = a + 1
      const c = a + side
      const d = c + 1
      indices[n++] = a
      indices[n++] = c
      indices[n++] = b
      indices[n++] = b
      indices[n++] = c
      indices[n++] = d
    }
  }

  return { vertices, indices, count: n, divisions }
}
