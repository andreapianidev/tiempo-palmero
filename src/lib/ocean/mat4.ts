/**
 * El álgebra que necesita la rejilla proyectada del océano, y nada más.
 *
 * POR QUÉ NO SE USA gl-matrix. MapLibre la lleva dentro pero no la reexporta,
 * así que sería una dependencia nueva —y su `mat4` trabaja en `Float32Array`.
 * Aquí hace falta lo contrario: **doble precisión**. La matriz del mapa lleva
 * coordenadas Mercator normalizadas, donde la isla entera ocupa 0,0026 unidades
 * de 1 y un píxel de pantalla al máximo acercamiento son 1,5·10⁻⁸. Un `float`
 * de 32 bits tiene siete cifras significativas: invertir la matriz en simple
 * precisión y desproyectar con ella deja la malla del mar temblando.
 *
 * Todo lo de aquí devuelve `Float64Array` y se pasa a `Float32Array` solo en el
 * último momento, ya restado el origen local (ver `OceanLayer`).
 */

export type Mat4 = Float64Array

/** `a · b`, con la convención de columnas de OpenGL: se aplica antes `b`. */
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const out = new Float64Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

/** Traslación pura. */
export function translation(x: number, y: number, z: number): Mat4 {
  const m = new Float64Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

/**
 * Inversa de una matriz 4×4 por cofactores.
 *
 * Devuelve `null` si es singular en vez de un montón de infinitos: en mitad de
 * una animación de cámara puede llegar una matriz degenerada, y lo correcto
 * entonces es saltarse el fotograma, no dibujar un mar en el infinito.
 */
export function invert(m: ArrayLike<number>): Mat4 | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]

  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det || !Number.isFinite(det)) return null
  const d = 1 / det

  const out = new Float64Array(16)
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
  return out
}

/** Aplica la matriz a un punto y divide por w. `null` si el punto es degenerado. */
export function transformPoint(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
): [number, number, number] | null {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  if (!w || !Number.isFinite(w)) return null
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ]
}

/**
 * Dónde está la cámara, a partir de la inversa de la matriz del mapa.
 *
 * HACE FALTA PARA EL AGUA. El reflejo de Fresnel, el brillo del sol y la
 * refracción dependen todos del ángulo con el que se mira cada punto, y ese
 * ángulo no se puede sacar de la matriz sin saber desde dónde se mira.
 *
 * MapLibre 4 no publica la posición de la cámara —`getFreeCameraOptions` es de
 * Mapbox, y el `transform` interno no es API—, así que se deduce: en una
 * proyección en perspectiva TODOS los rayos que salen de la pantalla se cortan
 * en el ojo. Se lanzan dos, se cortan y ya está. Es exacto, no una
 * aproximación, y son quince líneas frente a depender de un campo privado que
 * cualquier versión puede renombrar.
 *
 * Devuelve `null` si los dos rayos son paralelos: eso es una proyección
 * ortográfica, donde no hay un ojo que encontrar.
 */
export function cameraPosition(
  inverse: ArrayLike<number>,
): [number, number, number] | null {
  const rayA = ray(inverse, -0.5, -0.5)
  const rayB = ray(inverse, 0.5, 0.5)
  if (!rayA || !rayB) return null
  const [a0, da] = rayA
  const [b0, db] = rayB

  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const r = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]]
  const aa = dot(da, da)
  const ab = dot(da, db)
  const bb = dot(db, db)
  const det = aa * bb - ab * ab
  if (!det || !Number.isFinite(det)) return null
  const s = (bb * dot(da, r) - ab * dot(db, r)) / det
  return [a0[0] + da[0] * s, a0[1] + da[1] * s, a0[2] + da[2] * s]
}

function ray(
  inverse: ArrayLike<number>,
  ndcX: number,
  ndcY: number,
): [number[], number[]] | null {
  const near = transformPoint(inverse, ndcX, ndcY, -1)
  const far = transformPoint(inverse, ndcX, ndcY, 1)
  if (!near || !far) return null
  return [near, [far[0] - near[0], far[1] - near[1], far[2] - near[2]]]
}

/**
 * De un punto de la pantalla al plano del mar.
 *
 * Es el corazón de la rejilla proyectada: para cada punto de una malla regular
 * EN LA PANTALLA se lanza el rayo que pasa por él y se corta con el plano
 * horizontal del agua. Así la densidad de triángulos es constante en píxeles
 * —cerca de la cámara caen juntos, en el horizonte se estiran— y no hace falta
 * ningún sistema de niveles de detalle: el detalle sale donde se ve.
 *
 * `ndc` va de −1 a 1 en las dos direcciones. El rayo se construye con los dos
 * puntos que en coordenadas de recorte tienen z = −1 (plano cercano) y z = 1
 * (plano lejano).
 *
 * Devuelve `null` cuando el rayo no corta el plano por delante de la cámara: es
 * el cielo, o el mar más allá del horizonte. Quien llama decide qué hacer con
 * ese vértice —aquí se empuja al horizonte y se difumina—, pero lo que no puede
 * es recibir un número inventado.
 */
export function unprojectToPlane(
  inverse: ArrayLike<number>,
  ndcX: number,
  ndcY: number,
  planeZ: number,
): [number, number] | null {
  const near = transformPoint(inverse, ndcX, ndcY, -1)
  const far = transformPoint(inverse, ndcX, ndcY, 1)
  if (!near || !far) return null
  const dz = far[2] - near[2]
  if (Math.abs(dz) < 1e-30) return null
  const t = (planeZ - near[2]) / dz
  if (t < 0 || t > 1) return null
  return [near[0] + (far[0] - near[0]) * t, near[1] + (far[1] - near[1]) * t]
}
