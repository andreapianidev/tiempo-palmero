import { describe, expect, it } from 'vitest'
import { BASEMAP_LEVELS } from '../realce/levels'
import { composited, designRatio, palette, REFERENCE_LUMA } from './palette'
import { contrast, cssRgba, luminance, readableInk, targets, withLuminance } from './ratio'
import { ROLES, ROLE_IDS, roleCss } from './roles'

const RELIEVE = BASEMAP_LEVELS.relieve.luma
const CARTA = BASEMAP_LEVELS.topografico.luma
const SATELITE = BASEMAP_LEVELS.satelite.luma

describe('aritmética del contraste', () => {
  it('la luminancia relativa es la de la WCAG, sobre color linealizado', () => {
    expect(luminance([0, 0, 0])).toBeCloseTo(0, 9)
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 9)
    // El 50 % de gris no tiene la mitad de luz: tiene el 21,4 %. Es justo el
    // motivo de linealizar, y si esto deja de cumplirse la cuenta está mal.
    expect(luminance([0.5, 0.5, 0.5])).toBeCloseTo(0.2140, 3)
  })

  it('blanco sobre negro son los 21:1 de manual', () => {
    expect(contrast(1, 0)).toBeCloseTo(21, 6)
    expect(contrast(0.5, 0.5)).toBeCloseTo(1, 9)
  })

  it('sobre un fondo casi blanco no existe nada más claro que contraste', () => {
    expect(targets(0.95, 3).lighter).toBeNull()
    expect(targets(0.95, 3).darker).not.toBeNull()
    expect(targets(0.02, 3).lighter).not.toBeNull()
  })

  it('cambiar la luz de un color le respeta el tono', () => {
    const amber: [number, number, number] = [226 / 255, 197 / 255, 106 / 255]
    const dark = withLuminance(amber, luminance(amber) / 3)
    expect(luminance(dark)).toBeCloseTo(luminance(amber) / 3, 4)
    // Sigue siendo ámbar: rojo por encima de verde y verde por encima de azul.
    expect(dark[0]).toBeGreaterThan(dark[1])
    expect(dark[1]).toBeGreaterThan(dark[2])
  })

  it('y no se sale de rango ni pidiendo un imposible', () => {
    const out = withLuminance([0.1, 0.2, 0.3], 0.99)
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(luminance(out)).toBeCloseTo(0.99, 2)
  })
})

/**
 * La propiedad que hace que esto no sea una segunda paleta escrita a mano: en
 * el fondo para el que se eligieron los colores, la regla tiene que devolver
 * los colores tal cual. Si esto falla, cambiar de fondo y volver dejaría el
 * mapa con otros colores que los del diseño.
 */
describe('sobre el relieve, la regla no toca nada', () => {
  it('devuelve exactamente el color de partida', () => {
    const p = palette(REFERENCE_LUMA)
    for (const id of ROLE_IDS) expect(p[id], id).toBe(roleCss(id))
  })

  it('y la referencia es el fondo de casa, no otro', () => {
    expect(REFERENCE_LUMA).toBe(RELIEVE)
  })
})

describe('sobre la carta topográfica, que es papel', () => {
  const p = palette(CARTA)

  it('las líneas se vuelven oscuras en vez de desaparecer', () => {
    // Sobre un fondo de 0,808, el gris cálido claro de las carreteras no puede
    // contrastar por arriba: no hay nada más claro que el blanco.
    for (const id of ['road', 'trail', 'guagua', 'osmMain'] as const) {
      const seen = composited(readableInk(ROLES[id], CARTA, designRatio(ROLES[id])), CARTA)
      expect(seen, id).toBeLessThan(CARTA)
    }
  })

  it('con el mismo contraste que tenían sobre el relieve', () => {
    for (const id of ROLE_IDS) {
      const want = designRatio(ROLES[id])
      const got = contrast(composited(readableInk(ROLES[id], CARTA, want), CARTA), CARTA)
      expect(got, id).toBeCloseTo(want, 2)
    }
  })

  /**
   * Lo que NO puede pasar: que al arreglar la visibilidad se aplane la
   * jerarquía. El viario de OSM son 19.770 trazados contra 61 carreteras
   * insulares, y tiene que seguir estando por debajo.
   */
  it('y sin aplanar la jerarquía entre unas y otras', () => {
    const order = ['road', 'osmMain', 'osmLocal', 'osmService'] as const
    const ratios = order.map((id) =>
      contrast(composited(readableInk(ROLES[id], CARTA, designRatio(ROLES[id])), CARTA), CARTA),
    )
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i], order[i]).toBeLessThan(ratios[i - 1])
    }
  })

  it('el resultado es CSS que un mapa entiende', () => {
    for (const id of ROLE_IDS) expect(p[id], id).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/)
  })
})

describe('sobre la ortofoto', () => {
  it('el contraste de diseño también se conserva', () => {
    for (const id of ROLE_IDS) {
      const want = designRatio(ROLES[id])
      const got = contrast(
        composited(readableInk(ROLES[id], SATELITE, want), SATELITE),
        SATELITE,
      )
      expect(got, id).toBeCloseTo(want, 2)
    }
  })

  it('y la transparencia no se dispara sin necesidad', () => {
    // Subirle el alfa a una línea es el último recurso: son referencia, no
    // contenido, y una referencia opaca tapa el dato de debajo. Nunca baja —eso
    // sería perder visibilidad— y nunca pasa del tope, salvo las dos que ya
    // nacieron opacas porque son avisos.
    for (const id of ROLE_IDS) {
      const out = readableInk(ROLES[id], SATELITE, designRatio(ROLES[id]))
      expect(out.alpha, id).toBeLessThanOrEqual(Math.max(0.9, ROLES[id].alpha))
      expect(out.alpha, id).toBeGreaterThanOrEqual(ROLES[id].alpha - 1e-9)
    }
  })
})

describe('formato', () => {
  it('cssRgba redondea a byte y no escribe decimales infinitos', () => {
    expect(cssRgba({ rgb: [1, 0.5, 0], alpha: 0.4211 })).toBe('rgba(255, 128, 0, 0.421)')
  })
})
