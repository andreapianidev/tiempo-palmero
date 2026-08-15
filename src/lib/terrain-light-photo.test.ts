import { describe, expect, it } from 'vitest'
import { PHOTO_OPACITY, photoLight } from './terrain-light-photo'
import { terrainLight } from './terrain-light'
import { sunPosition } from './sun'

/**
 * La medición está en `scripts/checks/foto-hillshade.ts` y su lectura, en la
 * cabecera de `terrain-light-photo.ts`. Aquí se guarda el caso peor —sol a 10°
 * sobre la pared de la Caldera, la pendiente más fuerte de la isla— para que
 * cambiar la opacidad a ojo no pase de largo.
 *
 * `separacion` es cuánta luminancia separa a las laderas que miran al sol de las
 * que le dan la espalda, ya compuesto sobre la ortofoto; `textura`, qué fracción
 * de la variación propia de la foto (σ local 5×5) sobrevive debajo.
 */
const MEDIDO = [
  { opacidad: 0.2, separacion: 0.036, textura: 0.81 },
  { opacidad: 0.3, separacion: 0.082, textura: 0.73 },
  { opacidad: 0.35, separacion: 0.105, textura: 0.69 },
  { opacidad: 0.4, separacion: 0.128, textura: 0.65 },
  { opacidad: 0.65, separacion: 0.243, textura: 0.47 },
  { opacidad: 1, separacion: 0.392, textura: 0.34 },
]

/**
 * Y lo que hay que vencer: a esa hora la ortofoto tira EN CONTRA. Las laderas
 * que miran al sol de ahora salen 0,053 más oscuras que las que le dan la
 * espalda, porque el vuelo pasó con otro sol.
 */
const LUZ_DEL_VUELO = 0.053

/**
 * El presupuesto de foto: cuánta de su textura propia tiene que sobrevivir en el
 * caso peor. Es el mismo tipo de tope que el 0,5 % de daño de `realce/levels.ts`
 * —un límite declarado, no un resultado— y aquí vale dos tercios.
 */
const TEXTURA_MINIMA = 2 / 3

describe('luz del sol sobre la ortofoto', () => {
  it('le da la vuelta a la luz que la foto ya trae, con margen', () => {
    // La orilla de abajo. A esa hora el vuelo tira en contra, así que no basta
    // con «que se note»: la luz nueva tiene que mandar sobre la vieja.
    const fila = MEDIDO.find((m) => m.opacidad === PHOTO_OPACITY)
    expect(fila, `no hay medición para ${PHOTO_OPACITY}: vuelve a medir`).toBeDefined()
    expect(fila!.separacion / LUZ_DEL_VUELO).toBeGreaterThan(1.5)
  })

  it('y no entierra la foto, que es la otra orilla', () => {
    const fila = MEDIDO.find((m) => m.opacidad === PHOTO_OPACITY)!
    expect(fila.textura).toBeGreaterThan(TEXTURA_MINIMA)
  })

  it('es la más fuerte que cabe en ese presupuesto', () => {
    // Las dos orillas pesan igual, y tiran en sentidos contrarios: subir la
    // opacidad siempre hace la luz más evidente —eso es fácil— a costa de la
    // ortofoto, que es lo que la gente vino a ver. Se coge la última que cabe.
    const dentro = MEDIDO.filter((m) => m.textura > TEXTURA_MINIMA)
    expect(dentro[dentro.length - 1].opacidad).toBe(PHOTO_OPACITY)
  })

  it('las opacidades tímidas no valen: pierden contra la luz del vuelo', () => {
    const floja = MEDIDO.find((m) => m.opacidad === 0.2)!
    expect(floja.separacion).toBeLessThan(LUZ_DEL_VUELO)
  })
})

describe('photoLight', () => {
  const sun = sunPosition(Date.UTC(2026, 7, 15, 8, 0), -17.87, 28.68)
  const base = terrainLight(sun, null, 0)
  const foto = photoLight(base)

  it('no toca la hora que es', () => {
    // La dirección y la exageración SON la posición del sol traducida (ver
    // `terrain-light.ts`). Suavizarlas aquí sería enseñar otra hora sobre la
    // foto que sobre el relieve, con el mismo interruptor puesto.
    expect(foto.direction).toBe(base.direction)
    expect(foto.exaggeration).toBe(base.exaggeration)
  })

  it('conserva el color de la luz y solo le pone alfa', () => {
    // MapLibre no tiene `hillshade-opacity`: la opacidad de la capa son los
    // alfas de sus tres colores. Lo que no puede cambiar es el color, que es el
    // mismo que el mar usa para su reflejo.
    const rgb = (hex: string) =>
      [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16))
    for (const key of ['highlight', 'shadow', 'accent'] as const) {
      const m = foto[key].match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/)
      expect(m, `${key}: ${foto[key]}`).not.toBeNull()
      expect([Number(m![1]), Number(m![2]), Number(m![3])]).toEqual(rgb(base[key]))
      expect(Number(m![4])).toBe(PHOTO_OPACITY)
    }
  })

  it('el estilo sabe leer lo que devuelve', () => {
    // Un color que MapLibre no entienda no rompe nada visible: la capa se queda
    // como estaba y el mapa no dice por qué. Es el mismo fallo mudo que la
    // prueba de los fondos vigila en las peticiones de GRAFCAN.
    for (const key of ['highlight', 'shadow', 'accent'] as const) {
      expect(foto[key]).toMatch(/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.\d+\)$/)
    }
  })
})
