import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXAGGERATION,
  EXAGGERATIONS,
  ENTRY_PITCH,
  FLAT_MAX_PITCH,
  MAX_PITCH,
  MAX_SLOPE_TAN,
  SKY,
  HILLSHADE_SOURCE,
  TERRAIN_SOURCE,
  exaggerationLabel,
  slopeDegrees,
  terrainSpec,
} from './terrain'
import { buildStyle } from './mapStyle'
import type { DemManifest } from './dem'

/** El manifiesto real de `public/dem/`, medido el 13 ago 2026. */
const MANIFEST: DemManifest = {
  zoom: 12,
  minZoom: 9,
  tileSize: 256,
  x0: 1841,
  y0: 1703,
  cols: 7,
  rows: 9,
  metersPerPixel: 33.54,
  attribution: '',
  encoding: 'terrarium',
  generated: '',
}

/**
 * La exageración vertical es lo único de esta vista que puede MENTIR.
 *
 * El resto —la cámara, el cielo, la brújula— cambia cómo se mira; el
 * multiplicador cambia lo que se mide. De ahí que lo que se prueba sea que el
 * valor de fábrica sea la isla real y que el tope no llegue a convertir las
 * paredes de la Caldera en un acantilado vertical.
 */
describe('exageración vertical', () => {
  it('de fábrica no exagera nada', () => {
    expect(DEFAULT_EXAGGERATION).toBe(1)
    expect(EXAGGERATIONS).toContain(DEFAULT_EXAGGERATION)
  })

  it('la pendiente medida del DEM sale a los 74,6° del comentario', () => {
    // 362,7 % medido píxel a píxel sobre las 63 teselas de `public/dem/`, con
    // base de 67 m (dos píxeles a 33,54 m). Si el DEM cambia de resolución,
    // esta cifra se vuelve a medir y este test es quien avisa.
    expect(MAX_SLOPE_TAN).toBeCloseTo(3.627, 3)
    expect(slopeDegrees(1)).toBeCloseTo(74.6, 1)
  })

  it('ningún valor del selector llega a dibujar un acantilado vertical', () => {
    // 80° es la línea: por encima, la pared de la Caldera se lee como
    // perfectamente vertical y la vista deja de servir para juzgar una
    // pendiente. A 1,5× salen 79,6°; a 2× serían 82,1° y por eso 2× no está.
    for (const x of EXAGGERATIONS) {
      expect(slopeDegrees(x), `${x}×`).toBeLessThan(80)
    }
    expect(slopeDegrees(2)).toBeGreaterThan(80)
  })

  it('crece con la exageración y nunca la deshace', () => {
    const grados = EXAGGERATIONS.map(slopeDegrees)
    expect(grados).toEqual([...grados].sort((a, b) => a - b))
  })

  it('la etiqueta lleva la cifra puesta, con coma', () => {
    // Es la regla de la casa: una cifra corregida se enseña diciendo por
    // cuánto. Un botón que dijera solo «más relieve» escondería el factor.
    expect(exaggerationLabel(1)).toBe('1×')
    expect(exaggerationLabel(1.25)).toBe('1,25×')
    expect(exaggerationLabel(1.5)).toBe('1,5×')
  })
})

describe('cámara', () => {
  it('el modo plano es plano de verdad', () => {
    // MapLibre trae el arrastre con el botón derecho activado de fábrica. Sin
    // este cero, la vista se inclina sin querer y sin relieve debajo.
    expect(FLAT_MAX_PITCH).toBe(0)
  })

  it('la inclinación de llegada cabe dentro del tope', () => {
    expect(ENTRY_PITCH).toBeLessThan(MAX_PITCH)
    expect(ENTRY_PITCH).toBeGreaterThan(FLAT_MAX_PITCH)
  })

  it('el tope se queda lejos del máximo de MapLibre', () => {
    // 85 es lo que admite la librería. Aquí manda que la cámara no se meta en
    // los barrancos y que un fondo de GRAFCAN no acabe pidiendo media isla de
    // teselas por fotograma.
    expect(MAX_PITCH).toBeLessThanOrEqual(65)
  })
})

describe('escena', () => {
  it('el terreno usa una fuente que el estilo declara', () => {
    // Si estos dos se separan, `setTerrain` falla en silencio y la vista 3D se
    // queda plana sin decir por qué.
    const style = buildStyle(MANIFEST)
    expect(style.sources[TERRAIN_SOURCE]).toBeDefined()
    expect(style.sources[TERRAIN_SOURCE].type).toBe('raster-dem')
    expect(terrainSpec(1).source).toBe(TERRAIN_SOURCE)
  })

  it('EL SOMBREADO Y EL RELIEVE NO COMPARTEN FUENTE', () => {
    // La invariante que costó descubrir. `setTerrain` marca su caché de teselas
    // con `usedForTerrain` y le pone `tileSize` 1024; si la comparte con la capa
    // `hillshade`, el sombreado hereda esa elección y se dibuja borroso. Medido:
    // 49 % menos de detalle sobre la isla. No da ningún error y no se nota sin
    // comparar dos capturas, así que la única defensa es esto.
    //
    // MapLibre avisa por consola —«you are using the same source for a hillshade
    // layer and for 3D terrain»— y ese aviso estuvo meses en producción.
    expect(TERRAIN_SOURCE).not.toBe(HILLSHADE_SOURCE)
    const style = buildStyle(MANIFEST)
    const hillshades = style.layers.filter((l) => l.type === 'hillshade')
    expect(hillshades.length).toBeGreaterThan(0)
    for (const layer of hillshades) {
      expect(
        (layer as { source?: string }).source,
        `la capa ${layer.id} vuelve a colgar del relieve`,
      ).toBe(HILLSHADE_SOURCE)
    }
    // Y las dos fuentes tienen que apuntar a las MISMAS teselas: son dos cachés
    // del mismo DEM, no dos modelos de elevación distintos.
    const a = style.sources[TERRAIN_SOURCE] as { tiles?: string[] }
    const b = style.sources[HILLSHADE_SOURCE] as { tiles?: string[] }
    expect(a.tiles).toEqual(b.tiles)
  })

  it('el estilo trae el cielo declarado desde el principio', () => {
    // Va en el estilo y no se enciende al inclinar: el sombreador de MapLibre
    // solo pinta por encima del horizonte, y con la cámara a cero el horizonte
    // está en el infinito. Declararlo una vez evita encender y apagar en cada
    // cambio de modo.
    expect(buildStyle(MANIFEST).sky).toBe(SKY)
  })

  it('el cielo es oscuro, como el resto del mapa', () => {
    // Un cielo diurno sobre un mar `#080b10` convierte la isla en un recorte
    // pegado encima de otra aplicación.
    const luma = (hex: string) => {
      const v = parseInt(hex.slice(1), 16)
      return (((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114) / 255
    }
    expect(luma(SKY['sky-color'] as string)).toBeLessThan(0.15)
    // El horizonte sí aclara: es lo que separa la silueta de la isla del mar.
    expect(luma(SKY['horizon-color'] as string)).toBeGreaterThan(
      luma(SKY['sky-color'] as string),
    )
  })
})
