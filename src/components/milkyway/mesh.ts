/**
 * La malla sobre la que se pega el mapa de la Vía Láctea.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA MALLA Y NO UN CUADRILÁTERO A PANTALLA COMPLETA. La otra opción
 * era dibujar dos triángulos que tapen la pantalla y deshacer la proyección en
 * el fragmento, píxel a píxel. Sale exacto y no hace falta ninguna geometría,
 * pero pide invertir la matriz de vista de MapLibre, que es la única cosa de
 * esta escena que no controla este repositorio y que cambia entre versiones.
 *
 * Con una malla, la Vía Láctea entra **por la misma puerta que las 8920
 * estrellas**: el mismo `u_sky`, la misma refracción de Bennett, el mismo
 * `u_view · vec4(dir.x, −dir.y, dir.z, 0)`. Si algún día ese camino cambia,
 * cambia para las dos a la vez y no pueden separarse — que es la razón por la
 * que los planetas también comparten sombreador con las estrellas.
 *
 * LA MALLA SE CONSTRUYE EN EL ESPACIO DEL MAPA, no en el del cielo, y eso
 * resuelve la costura sin un solo caso especial. El raster va de longitud −180
 * a +180 —o sea de AR 180° a AR 540°—, así que el índice de columna recorre esa
 * franja de forma MONÓTONA y la coordenada de textura es `i / columnas`, de 0 a
 * 1 limpio. Construirla en ascensión recta obligaría a un `fract` y a partir el
 * triángulo que cruza AR 0, que es exactamente el fallo que en el generador
 * costó una raya blanca de lado a lado del cielo.
 *
 * DOS GRADOS DE PASO, y está elegido contra dos cosas distintas:
 *
 *  - **La curvatura.** Un arco de 2° aproximado por una recta se separa
 *    (2°)²/8 = 1,5 × 10⁻⁴ radianes, o sea 31 segundos de arco. Con el campo de
 *    36,87° repartido en unos 800 píxeles —166″ por píxel— son 0,19 píxeles.
 *  - **La refracción**, que es la que manda. Se evalúa por vértice y se
 *    interpola por dentro, y cerca del horizonte cambia deprisa: de 0° a 2° de
 *    altura pasa de 29,5′ a 14,4′. Con celdas de 2° el error de interpolación
 *    se queda en minutos de arco sobre una banda difusa que mide decenas de
 *    grados. Con celdas de 5° ya sería medio grado.
 *
 * Salen 16.471 vértices y 97.200 índices: 457 KB que suben a la GPU una vez.
 * Los índices caben en `Uint16Array` por poco —16.470 contra el techo de
 * 65.535— y hay una prueba que lo comprueba, porque pasarse no daría un error
 * sino índices dados la vuelta y triángulos cruzando el cielo.
 */

/** Columnas y filas de CELDAS. Un grado de paso sería el doble de todo. */
export const MW_COLUMNS = 180
export const MW_ROWS = 90

/** Números por vértice: ascensión recta y declinación en radianes, y `s`, `t`. */
export const MW_STRIDE_FLOATS = 4

export interface MilkyWayMesh {
  /** Entrelazado, `MW_STRIDE_FLOATS` por vértice. */
  vertices: Float32Array
  /** Triángulos, tres índices cada uno. */
  indices: Uint16Array
  vertexCount: number
}

/**
 * La esfera celeste entera, con el mapa pegado.
 *
 * SE CONSTRUYE ENTERA Y NO SOLO DONDE HAY VÍA LÁCTEA. Recortar las celdas
 * vacías dividiría la malla por cinco —la banda ocupa como una quinta parte del
 * cielo—, pero exigiría tener el PNG descargado para saber cuáles sobran, y
 * ataría la geometría al contenido del fichero. 32.400 triángulos por fotograma
 * no son nada para una tarjeta que ya dibuja el relieve de la isla; lo que sí
 * se evita es el coste de RELLENO, y de eso se encarga el fragmento, que
 * descarta donde el mapa vale cero.
 */
export function buildMilkyWayMesh(): MilkyWayMesh {
  const cols = MW_COLUMNS
  const rows = MW_ROWS
  const vertexCount = (cols + 1) * (rows + 1)
  const vertices = new Float32Array(vertexCount * MW_STRIDE_FLOATS)
  const RAD = Math.PI / 180

  let v = 0
  for (let row = 0; row <= rows; row++) {
    // La fila 0 es el polo norte, igual que la fila 0 del PNG. `t` va de 0 a 1
    // de norte a sur, y por eso la capa sube la textura con `UNPACK_FLIP_Y` en
    // falso: el orden del fichero ES el orden de la textura.
    const t = row / rows
    const decDeg = 90 - t * 180
    for (let col = 0; col <= cols; col++) {
      const s = col / cols
      // Longitud del mapa, de −180 a +180. A ascensión recta le sobran 360.
      const lonDeg = -180 + s * 360
      const raDeg = lonDeg < 0 ? lonDeg + 360 : lonDeg
      vertices[v] = raDeg * RAD
      vertices[v + 1] = decDeg * RAD
      vertices[v + 2] = s
      vertices[v + 3] = t
      v += 4
    }
  }

  const indices = new Uint16Array(cols * rows * 6)
  let i = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col
      const b = a + 1
      const c = a + (cols + 1)
      const d = c + 1
      indices[i] = a
      indices[i + 1] = c
      indices[i + 2] = b
      indices[i + 3] = b
      indices[i + 4] = c
      indices[i + 5] = d
      i += 6
    }
  }

  return { vertices, indices, vertexCount }
}
