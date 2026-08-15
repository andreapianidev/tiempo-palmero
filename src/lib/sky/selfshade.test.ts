import { describe, expect, it } from 'vitest'
import { MAP_BBOX } from '../geo'
import { buildCloudScene, type Cloud } from './scene'
import type { SkySample } from './model'
import { MULTIPLE_SCATTERING, selfShade } from './selfshade'
import type { SkyPosition } from '../sun'

const calm = { u: 0, v: 0 }

function uniform(low: number, mid = 0, high = 0, precipMm = 0): SkySample[] {
  const out: SkySample[] = []
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 6; i++) {
      out.push({
        lon: MAP_BBOX.west + ((i + 0.5) / 6) * (MAP_BBOX.east - MAP_BBOX.west),
        lat: MAP_BBOX.south + ((j + 0.5) / 9) * (MAP_BBOX.north - MAP_BBOX.south),
        low,
        mid,
        high,
        precipMm,
        wind: { low: calm, mid: calm, high: calm },
      })
    }
  }
  return out
}

const BAND = { base: 1200, top: 1700 }
const SEED = 20260815
const sun = (elevationDeg: number, azimuthDeg: number): SkyPosition => ({
  elevationDeg,
  azimuthDeg,
})

const scene = (low: number, mid = 0, high = 0, precipMm = 0) =>
  buildCloudScene(uniform(low, mid, high, precipMm), BAND, SEED)

const pick = (clouds: Cloud[], etage: Cloud['etage']) =>
  clouds.find((c) => c.etage === etage)!

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1)

/** Media del tercio más bajo y del más alto, por rango: una manta es plana. */
function thirds(cloud: Cloud, light: Float32Array) {
  const idx = cloud.puffs.map((_, i) => i).sort((a, b) => cloud.puffs[a].h - cloud.puffs[b].h)
  const k = Math.max(1, Math.round(idx.length / 3))
  const at = (ids: number[]) => mean(ids.map((i) => light[i]))
  return { base: at(idx.slice(0, k)), top: at(idx.slice(-k)) }
}

/** Cara al sol menos cara contraria, en planta. */
function flankSplit(cloud: Cloud, light: Float32Array, azimuthDeg: number) {
  const a = (azimuthDeg * Math.PI) / 180
  const ex = Math.sin(a)
  const ny = Math.cos(a)
  const near: number[] = []
  const far: number[] = []
  cloud.puffs.forEach((p, i) => {
    const t = (p.dx * ex + p.dy * ny) / cloud.radiusM
    if (t > 0.3) near.push(light[i])
    else if (t < -0.3) far.push(light[i])
  })
  return mean(near) - mean(far)
}

describe('autosombra de las nubes', () => {
  const deck = pick(scene(95), 'low')

  it('con el sol alto conserva lo que la constante acertaba: la panza oscura', () => {
    // Era lo único que la constante hacía bien, y tiene que seguir saliendo: con
    // el sol en lo alto, a la base de una nube no le llega la luz que la cima ya
    // se ha llevado.
    const t = thirds(deck, selfShade(deck, sun(80, 180)))
    expect(t.top).toBeGreaterThan(t.base)
  })

  it('y con el sol bajo hace lo que la constante NO podía: girar', () => {
    // Aquí está todo el cambio. Con el sol rasante lo oscuro de una nube no es
    // la panza: es el lado contrario al sol. La constante daba exactamente 0 de
    // diferencia entre un flanco y otro a cualquier hora.
    const light = selfShade(deck, sun(12, 100))
    expect(flankSplit(deck, light, 100)).toBeGreaterThan(0.3)
    // Y la diferencia entre flancos tiene que superar a la de altura, que es lo
    // que distingue «iluminada de lado» de «iluminada desde arriba».
    const t = thirds(deck, light)
    expect(flankSplit(deck, light, 100)).toBeGreaterThan(t.top - t.base)
  })

  it('el flanco iluminado es el del sol, no otro', () => {
    // La prueba del signo: si el acimut entrara con el seno y el coseno
    // cambiados, o con el norte al revés, esto seguiría dando un flanco
    // encendido y sería el equivocado. Se comprueba con cuatro rumbos.
    for (const az of [0, 90, 180, 270]) {
      expect(flankSplit(deck, selfShade(deck, sun(12, az)), az), `acimut ${az}`).toBeGreaterThan(
        0.2,
      )
    }
  })

  it('ninguna mota se apaga del todo: una nube negra es un agujero', () => {
    // El suelo de dispersión múltiple. Es el mismo argumento con el que el mar
    // tiene su `LIT_FLOOR`, y aquí lo vigila esto.
    for (const el of [80, 40, 12, 2, -4]) {
      const light = selfShade(deck, sun(el, 120))
      for (let i = 0; i < light.length; i++) {
        expect(light[i], `sol a ${el}°`).toBeGreaterThanOrEqual(MULTIPLE_SCATTERING - 1e-6)
      }
    }
  })

  it('el cirro apenas se hace sombra a sí mismo, la manta sí', () => {
    // No hay ninguna constante por estrato: la diferencia sale sola de la
    // densidad de cada uno, que es lo que decide cuánta luz para una mota.
    const clouds = scene(90, 80, 80)
    const light = (c: Cloud) => mean([...selfShade(c, sun(50, 150))])
    expect(light(pick(clouds, 'high'))).toBeGreaterThan(light(pick(clouds, 'low')))
  })

  it('la lluvia oscurece la nube que llueve', () => {
    const dry = pick(scene(90), 'low')
    const wet = pick(scene(90, 0, 0, 3), 'low')
    const at = sun(50, 150)
    expect(mean([...selfShade(wet, at)])).toBeLessThan(mean([...selfShade(dry, at)]))
  })

  it('el ocaso no da un salto al cambiar el sol por el cenit', () => {
    // De noche no hay haz: ilumina la cúpula, o sea desde arriba. Conmutar de
    // golpe en el instante del ocaso giraría la iluminación de todas las nubes
    // en un fotograma. Se mezcla con `dayFactor`, y esto lo vigila recorriendo
    // el crepúsculo entero de un cuarto de grado en un cuarto de grado.
    let worst = 0
    for (let e = 6; e >= -8; e -= 0.25) {
      const a = selfShade(deck, sun(e, 265))
      const b = selfShade(deck, sun(e - 0.25, 265))
      let sum = 0
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
      worst = Math.max(worst, sum / a.length)
    }
    // SE MIDE LA NUBE, NO LA MOTA, y la diferencia importa. Un cuarto de grado
    // de sol es un minuto de reloj, y en ese paso hay motas sueltas que se
    // mueven hasta 0,188 —una que entra o sale de la esfera de su vecina—; eso
    // es geometría, no una rama, y es una de treinta dibujada al 40 % de
    // opacidad. Lo que se vería como un salto es que se moviera la nube entera.
    //
    // Medido sobre el ocaso completo, de +6° a −8°: la media por paso llega a
    // 0,035 como mucho, con p95 0,033 y mediana 0,003, y baja suave hasta
    // quedarse en cero pasados los −6°. El tope deja margen sobre eso y sigue
    // muy por debajo de lo que costaría conmutar —girar la luz de golpe cambia
    // motas enteras de flanco, del orden de 0,5—.
    expect(worst).toBeLessThan(0.05)
  })

  it('reutiliza el array que se le pasa', () => {
    // Se llama para la escena entera cada vez que el sol se mueve medio grado.
    // Si reservara un array por nube y por barrido, serían cientos de objetos
    // nuevos cada dos minutos para nada.
    const out = new Float32Array(deck.puffs.length)
    expect(selfShade(deck, sun(45, 120), { out })).toBe(out)
  })
})
