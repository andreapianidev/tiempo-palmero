import { describe, expect, it } from 'vitest'
import { sunPosition } from './sun'
import { HILLSHADE_DEFAULT, terrainLight } from './terrain-light'

const LON = -17.86
const LAT = 28.66
const at = (iso: string) => sunPosition(Date.parse(iso), LON, LAT)

describe('luz sobre el relieve', () => {
  it('ilumina desde donde está el sol, no desde el noroeste', () => {
    // Es todo el motivo del fichero. Por la mañana el sol está al este, así que
    // la ladera que se enciende es la de levante; por la tarde, la de poniente.
    const manana = terrainLight(at('2026-08-15T09:00:00Z'), null)
    const tarde = terrainLight(at('2026-08-15T18:00:00Z'), null)
    expect(manana.direction).toBeGreaterThan(45)
    expect(manana.direction).toBeLessThan(135)
    expect(tarde.direction).toBeGreaterThan(225)
    expect(tarde.direction).toBeLessThan(315)
    // Y ninguna de las dos es la convención fija.
    expect(manana.direction).not.toBeCloseTo(HILLSHADE_DEFAULT.direction, 0)
  })

  it('el sol rasante marca más el relieve que el sol alto', () => {
    // MapLibre no acepta la altura del sol, así que se traduce a exageración.
    // Si esto se invirtiera, el mediodía saldría con los barrancos grabados a
    // cuchillo y el amanecer plano, que es exactamente al revés de la realidad.
    const mediodia = terrainLight(at('2026-06-21T13:11:00Z'), null)
    const rasante = terrainLight(at('2026-06-21T19:30:00Z'), null)
    expect(rasante.exaggeration).toBeGreaterThan(mediodia.exaggeration)
  })

  it('nunca se sale del rango que acepta MapLibre', () => {
    // `hillshade-exaggeration` va de 0 a 1. Un valor fuera no da error: MapLibre
    // lo recorta, y el sombreado se queda pegado a un extremo sin decir nada.
    for (let h = 0; h < 24; h++) {
      for (const day of ['2026-06-21', '2026-12-21', '2026-03-20']) {
        const l = terrainLight(at(`${day}T${String(h).padStart(2, '0')}:00:00Z`), null)
        expect(l.exaggeration).toBeGreaterThanOrEqual(0)
        expect(l.exaggeration).toBeLessThanOrEqual(1)
        expect(l.direction).toBeGreaterThanOrEqual(0)
        expect(l.direction).toBeLessThan(360)
        for (const c of [l.highlight, l.shadow, l.accent]) {
          expect(c).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    }
  })

  it('la luz se pone naranja al caer el sol', () => {
    // El rojo del canal crece y el azul cae: es el mismo enrojecimiento que ya
    // usa el mar para su reflejo, y con los mismos dos extremos.
    const azul = (c: string) => parseInt(c.slice(5, 7), 16)
    const rojo = (c: string) => parseInt(c.slice(1, 3), 16)
    const alto = terrainLight(at('2026-06-21T13:11:00Z'), null).highlight
    const bajo = terrainLight(at('2026-06-21T19:45:00Z'), null).highlight
    expect(azul(bajo)).toBeLessThan(azul(alto))
    expect(rojo(bajo)).toBeGreaterThanOrEqual(rojo(alto) - 8)
  })

  it('la sombra no es negra: es la parte que solo ve el cielo', () => {
    // Con negro puro, una ladera en sombra se convierte en un agujero. La sombra
    // real está iluminada por la bóveda celeste, que es azul.
    const l = terrainLight(at('2026-08-15T13:00:00Z'), null)
    expect(parseInt(l.shadow.slice(5, 7), 16)).toBeGreaterThan(
      parseInt(l.shadow.slice(1, 3), 16),
    )
  })

  it('de noche con luna llena alta, la luz viene de la luna', () => {
    const noche = at('2026-08-15T02:00:00Z')
    expect(noche.elevationDeg).toBeLessThan(0)
    const luna = { elevationDeg: 40, azimuthDeg: 200 }
    const l = terrainLight(noche, luna, 1)
    expect(l.direction).toBeCloseTo(200, 0)
  })

  it('sin luna el relieve conserva un mínimo de forma', () => {
    // La otra orilla: el mapa se sigue usando de noche para leer temperaturas, y
    // un relieve completamente liso se lee peor. No es fingir que hay luz — es
    // que un instrumento ilegible no sirve.
    const noche = at('2026-08-15T02:00:00Z')
    const l = terrainLight(noche, null, 0)
    expect(l.exaggeration).toBeGreaterThan(0.1)
    // Y sin luna no se inventa una dirección: se queda en la convención.
    expect(l.direction).toBe(HILLSHADE_DEFAULT.direction)
  })

  it('el amanecer es una transición y no un salto', () => {
    // Recorre el orto minuto a minuto: ningún paso puede cambiar la exageración
    // de golpe. Con un `if (elevación > 0)` el mapa parpadearía en un fotograma
    // a mitad de un amanecer que dura media hora.
    let previous = terrainLight(at('2026-08-15T06:00:00Z'), null).exaggeration
    for (let m = 1; m <= 180; m++) {
      const t = new Date(Date.parse('2026-08-15T06:00:00Z') + m * 60000).toISOString()
      const e = terrainLight(sunPosition(Date.parse(t), LON, LAT), null).exaggeration
      expect(Math.abs(e - previous)).toBeLessThan(0.02)
      previous = e
    }
  })
})
