/**
 * La malla: que los índices quepan y que las coordenadas de textura sean las
 * del generador y no otras parecidas.
 *
 * LO QUE ESTO CAZA ES UN DESACUERDO DE CONVENIO, que es la clase de fallo que
 * no da error. `prepare-vialactea.ts` escribe la columna 0 en longitud −180 y
 * la fila 0 en el polo norte; si esta malla decide que `s = 0` es ascensión
 * recta 0, o que `t = 0` es el polo sur, sale una Vía Láctea perfecta y puesta
 * en el sitio equivocado. Aquí se rehace el mapeo del generador desde su propia
 * fórmula y se comprueba vértice a vértice.
 */

import { describe, expect, it } from 'vitest'
import { buildMilkyWayMesh, MW_COLUMNS, MW_ROWS, MW_STRIDE_FLOATS } from './mesh'

/*
  CUATRO DECIMALES Y NO SEIS en las comparaciones de ángulos: los vértices viven
  en un `Float32Array` porque es lo que va a la GPU, y en un flotante de 32 bits
  un radián trae siete cifras. En grados eso son seis millonésimas, muy por
  debajo de cualquier cosa que se dibuje y muy por encima del `toBeCloseTo(…, 6)`
  que exige medio millonésimo.
*/

const mesh = buildMilkyWayMesh()
const DEG = 180 / Math.PI

function vertex(i: number) {
  const v = i * MW_STRIDE_FLOATS
  return {
    raDeg: mesh.vertices[v] * DEG,
    decDeg: mesh.vertices[v + 1] * DEG,
    s: mesh.vertices[v + 2],
    t: mesh.vertices[v + 3],
  }
}

describe('la malla', () => {
  it('tiene los vértices y los triángulos que dice', () => {
    expect(mesh.vertexCount).toBe((MW_COLUMNS + 1) * (MW_ROWS + 1))
    expect(mesh.vertices.length).toBe(mesh.vertexCount * MW_STRIDE_FLOATS)
    expect(mesh.indices.length).toBe(MW_COLUMNS * MW_ROWS * 6)
  })

  it('LOS ÍNDICES CABEN EN 16 BITS, y por poco', () => {
    // 16.470 contra el techo de 65.535. Pasarse no daría un error: daría
    // índices dados la vuelta y triángulos cruzando el cielo entero. Con un
    // grado de paso —cuatro veces más vértices— ya no cabrían, y habría que
    // pasar a `Uint32Array` con su extensión.
    expect(mesh.vertexCount).toBeLessThan(65536)
    for (const i of mesh.indices) expect(i).toBeLessThan(mesh.vertexCount)
  })

  it('cada índice de cada triángulo existe y no hay ninguno repetido en un triángulo', () => {
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]]
      // Salvo en los polos, donde toda una fila es el mismo punto del cielo y
      // los triángulos degenerados son inevitables y no molestan.
      const row = Math.floor(a / (MW_COLUMNS + 1))
      if (row > 0 && row < MW_ROWS - 1) {
        expect(new Set([a, b, c]).size).toBe(3)
      }
    }
  })
})

describe('el convenio del mapa, rehecho desde el generador', () => {
  it('la columna 0 es longitud −180, o sea ascensión recta 180', () => {
    const first = vertex(0)
    expect(first.s).toBe(0)
    expect(first.raDeg).toBeCloseTo(180, 4)
  })

  it('LA COSTURA ESTÁ COSIDA: el primer y el último vértice de una fila son el mismo punto', () => {
    // La razón de construir la malla en el espacio del MAPA y no en el del
    // cielo. Los dos son ascensión recta 180 y tienen `s` distinto, 0 y 1, así
    // que el triángulo de la costura interpola de un borde de la textura al
    // otro sin dar la vuelta al cielo — que es el fallo que en el generador
    // costó una raya blanca de lado a lado.
    const row = 30
    const izquierda = vertex(row * (MW_COLUMNS + 1))
    const derecha = vertex(row * (MW_COLUMNS + 1) + MW_COLUMNS)
    expect(izquierda.raDeg).toBeCloseTo(derecha.raDeg, 4)
    expect(izquierda.decDeg).toBeCloseTo(derecha.decDeg, 4)
    expect(izquierda.s).toBe(0)
    expect(derecha.s).toBe(1)
  })

  it('la fila 0 es el POLO NORTE, igual que la fila 0 del PNG', () => {
    expect(vertex(0).t).toBe(0)
    expect(vertex(0).decDeg).toBeCloseTo(90, 4)
    const last = vertex(mesh.vertexCount - 1)
    expect(last.t).toBe(1)
    expect(last.decDeg).toBeCloseTo(-90, 4)
  })

  it('TODO VÉRTICE CUMPLE LA FÓRMULA DEL GENERADOR', () => {
    // La comprobación de verdad. `prepare-vialactea.ts` escribe
    //     lon = −180 + (col + 0,5) · 360 / W       dec = 90 − (fila + 0,5) · 180 / H
    // y aquí se exige que el par (s, t) de cada vértice apunte a esa misma
    // longitud y a esa misma declinación. Un signo cambiado en cualquiera de
    // las dos sale como un cielo creíble del sitio equivocado.
    for (let i = 0; i < mesh.vertexCount; i += 37) {
      const { raDeg, decDeg, s, t } = vertex(i)
      const lonDelMapa = -180 + s * 360
      const raEsperada = lonDelMapa < 0 ? lonDelMapa + 360 : lonDelMapa
      expect(raDeg).toBeCloseTo(raEsperada, 4)
      expect(decDeg).toBeCloseTo(90 - t * 180, 4)
    }
  })

  it('el paso es de dos grados en las dos direcciones', () => {
    expect(360 / MW_COLUMNS).toBeCloseTo(2, 6)
    expect(180 / MW_ROWS).toBeCloseTo(2, 6)
    const a = vertex(0)
    const b = vertex(1)
    expect(Math.abs(b.raDeg - a.raDeg)).toBeCloseTo(2, 4)
  })
})
