import { describe, expect, it } from 'vitest'
import { MAP_BBOX } from '../geo'
import { buildCloudScene, driftClouds, puffCount, type Cloud } from './scene'
import type { SkySample } from './model'

const calm = { u: 0, v: 0 }

/** Una rejilla uniforme: la misma nubosidad en toda la isla. */
function uniform(cover: number, precipMm = 0): SkySample[] {
  const out: SkySample[] = []
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 6; i++) {
      out.push({
        lon: MAP_BBOX.west + ((i + 0.5) / 6) * (MAP_BBOX.east - MAP_BBOX.west),
        lat: MAP_BBOX.south + ((j + 0.5) / 9) * (MAP_BBOX.north - MAP_BBOX.south),
        low: cover,
        mid: 0,
        high: 0,
        precipMm,
        wind: { low: calm, mid: calm, high: calm },
      })
    }
  }
  return out
}

const BAND = { base: 1200, top: 1700 }

/**
 * Qué fracción del dominio tapan de verdad las nubes que se han generado.
 *
 * Se mide por Monte Carlo, mirando en planta: se tiran puntos al azar sobre el
 * rectángulo y se cuenta en cuántos cae al menos una mota. Es la comprobación
 * que de verdad importa de todo este módulo —que la fracción de cielo tapado
 * que se DIBUJA es la que el modelo ha dicho— y no se puede hacer leyendo el
 * código: la cuenta sale de una fórmula con logaritmos y el solape entre discos
 * no es despreciable.
 */
function measuredCover(clouds: readonly Cloud[], samples = 4000): number {
  let hit = 0
  // Determinista: un generador congruencial simple, que aquí sobra.
  let seed = 12345
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  for (let s = 0; s < samples; s++) {
    const lon = MAP_BBOX.west + rand() * (MAP_BBOX.east - MAP_BBOX.west)
    const lat = MAP_BBOX.south + rand() * (MAP_BBOX.north - MAP_BBOX.south)
    let covered = false
    for (const c of clouds) {
      const mPerDegLon = 111_320 * Math.cos((c.lat * Math.PI) / 180)
      const dxTotal = (lon - c.lon) * mPerDegLon
      const dyTotal = (lat - c.lat) * 110_574
      for (const p of c.puffs) {
        const dx = dxTotal - p.dx
        const dy = dyTotal - p.dy
        if (dx * dx + dy * dy <= p.radiusM * p.radiusM) {
          covered = true
          break
        }
      }
      if (covered) break
    }
    if (covered) hit++
  }
  return hit / samples
}

describe('escena de nubes', () => {
  it('con el cielo despejado no dibuja ni una nube', () => {
    // La otra orilla de todo esto: la escena NO puede inventarse tiempo. Un
    // cero del modelo tiene que salir como un cielo vacío, no como «unas
    // nubecillas de cortesía» que harían que la capa no significara nada.
    expect(buildCloudScene(uniform(0), BAND, 1)).toHaveLength(0)
  })

  it('tapa aproximadamente la fracción de cielo que dice el modelo', () => {
    // Ésta es la prueba central. Se barre todo el rango porque el modelo
    // booleano se separa de la regla ingenua «N ∝ cobertura» justo al subir: al
    // 20 % las dos coinciden casi, al 80 % la ingenua se queda muy corta por el
    // solape.
    for (const cover of [10, 20, 50, 80, 95]) {
      const clouds = buildCloudScene(uniform(cover), BAND, 7)
      const measured = measuredCover(clouds)
      // Cinco puntos de tolerancia. Empezó en diez, con el argumento de que las
      // motas no llenan su disco entero; luego se midió de verdad —ver
      // `PUFF_SPREAD` en `scene.ts`, con la tabla— y el peor caso real quedó en
      // 2,9. Diez puntos dejaban pasar el error de doce que metió el cambio a
      // motas de dos tamaños, así que la tolerancia era el agujero.
      expect(Math.abs(measured * 100 - cover)).toBeLessThan(5)
    }
  })

  it('más cobertura es siempre más cielo tapado', () => {
    // Monotonía: aunque la tolerancia de arriba fuese generosa, el orden no
    // puede romperse nunca.
    const c20 = measuredCover(buildCloudScene(uniform(20), BAND, 3))
    const c60 = measuredCover(buildCloudScene(uniform(60), BAND, 3))
    const c95 = measuredCover(buildCloudScene(uniform(95), BAND, 3))
    expect(c20).toBeLessThan(c60)
    expect(c60).toBeLessThan(c95)
  })

  it('no se pasa del tope de motas ni con el cielo cerrado', () => {
    // El tope de coste existe para que un dato absurdo no cuelgue la pestaña.
    // 15 480 es el peor caso declarado en `scene.ts` sumando los tres estratos;
    // aquí solo hay estrato bajo, así que su parte son 320 nubes × 30 motas.
    const clouds = buildCloudScene(uniform(100), BAND, 5)
    expect(puffCount(clouds)).toBeLessThanOrEqual(320 * 30)
  })

  it('la misma semilla da exactamente la misma escena', () => {
    // Sin esto, cada repintado de React rebarajaría las siluetas y la isla
    // parpadearía varias veces por segundo.
    const a = buildCloudScene(uniform(40), BAND, 99)
    const b = buildCloudScene(uniform(40), BAND, 99)
    expect(a.length).toBe(b.length)
    expect(a[0].lon).toBe(b[0].lon)
    expect(a[0].puffs[0].dx).toBe(b[0].puffs[0].dx)
    // Y semillas distintas dan escenas distintas, o no sería azar.
    const c = buildCloudScene(uniform(40), BAND, 100)
    expect(c[0].lon).not.toBe(a[0].lon)
  })

  it('coloca las nubes a la cota que le dan, no a una de catálogo', () => {
    const clouds = buildCloudScene(uniform(50), { base: 900, top: 1400 }, 1)
    for (const c of clouds.filter((x) => x.etage === 'low')) {
      expect(c.base).toBe(900)
      expect(c.top).toBe(1400)
    }
  })

  it('las motas de una nube no comparten fase de hervido', () => {
    // Es donde está todo el efecto: con una fase común, la nube entera se
    // balancearía en bloque, que es justo el defecto de calcomanía arrastrada
    // que el hervido viene a arreglar, solo que con más pasos.
    const cloud = buildCloudScene(uniform(40), BAND, 4)[0]
    const fases = new Set(cloud.puffs.map((p) => p.phase.toFixed(4)))
    expect(fases.size).toBeGreaterThan(cloud.puffs.length * 0.8)
    for (const p of cloud.puffs) {
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThanOrEqual(1)
    }
  })

  it('mezcla dos tamaños de mota, y las pequeñas van por fuera', () => {
    // Una nube con todas las motas iguales se lee como un racimo de bolas y el
    // ojo las cuenta. Lo que la convierte en nube es la mezcla de escalas, con
    // el grano fino en el borde, que es donde lo produce el rozamiento con el
    // aire seco de alrededor.
    const cloud = buildCloudScene(uniform(40), BAND, 11)[0]
    const radios = cloud.puffs.map((p) => p.radiusM).sort((a, b) => a - b)
    // La más gorda al menos duplica a la más fina: hay dos escalas de verdad.
    expect(radios[radios.length - 1]).toBeGreaterThan(radios[0] * 2)

    const media = radios.reduce((a, b) => a + b, 0) / radios.length
    const finas = cloud.puffs.filter((p) => p.radiusM < media)
    const gordas = cloud.puffs.filter((p) => p.radiusM >= media)
    const dist = (ps: typeof cloud.puffs) =>
      ps.reduce((a, p) => a + Math.hypot(p.dx, p.dy), 0) / ps.length
    expect(dist(finas)).toBeGreaterThan(dist(gordas))
  })

  it('la nube se queda, de media, dentro del radio que dice tener', () => {
    // Es lo que mantiene honesta la cuenta de nubes: el modelo booleano promete
    // discos de radio R, y si cada nube pintara bastante más que eso taparía más
    // cielo del que el modelo ha dicho. Ver `PUFF_SPREAD`.
    //
    // Se mide sobre la MEDIA y sobre el máximo, no exigiendo que ninguna mota
    // pase de R. Un tope duro por mota sería un test equivocado: la mota crece a
    // propósito con el aplanado, para que un cielo cubierto cierre sin agujeros,
    // así que las de fuera SÍ sobresalen y tienen que hacerlo. Medido, el
    // alcance de una mota en unidades de R:
    //
    //   cobertura 10 % → media 0,78 · p90 1,02 · máx 1,20
    //   cobertura 95 % → media 0,89 · p90 1,17 · máx 1,36
    //
    // Lo que no puede pasar es que la MEDIA se vaya por encima de R, porque
    // entonces la nube entera sería más grande que su disco y la cobertura
    // dibujada dejaría de ser la que el modelo dijo.
    for (const cover of [10, 60, 95]) {
      const clouds = buildCloudScene(uniform(cover), BAND, 21)
      const reach = clouds.flatMap((c) =>
        c.puffs.map((p) => (Math.hypot(p.dx, p.dy) + p.radiusM) / c.radiusM),
      )
      const media = reach.reduce((a, b) => a + b, 0) / reach.length
      expect(media).toBeLessThan(1)
      expect(Math.max(...reach)).toBeLessThan(1.45)
    }
  })

  it('solo el estrato bajo lleva lluvia', () => {
    // Dibujar lluvia cayendo de un cirro a 8200 m sería absurdo: esa
    // precipitación se evapora mucho antes de llegar a ninguna parte.
    const samples = uniform(60, 2).map((s) => ({ ...s, mid: 60, high: 60 }))
    const clouds = buildCloudScene(samples, BAND, 1)
    expect(clouds.some((c) => c.etage === 'low' && c.precipMm > 0)).toBe(true)
    expect(clouds.every((c) => c.etage === 'low' || c.precipMm === 0)).toBe(true)
  })
})

describe('deriva', () => {
  it('mueve las nubes con su viento y en el sentido correcto', () => {
    const clouds = buildCloudScene(uniform(30), BAND, 1)
    const c = clouds[0]
    // Viento del oeste: `u` positiva es componente hacia el este, así que la
    // nube tiene que irse hacia el este. Confundir el signo aquí llevaría el
    // alisio a sotavento.
    c.u = 10
    c.v = 0
    const before = c.lon
    driftClouds([c], 60)
    expect(c.lon).toBeGreaterThan(before)
    // 10 m/s durante 60 s son 600 m, que a esta latitud son ~0,0061°.
    expect(c.lon - before).toBeCloseTo(600 / (111_320 * Math.cos((c.lat * Math.PI) / 180)), 5)
  })

  it('reaparece por el lado contrario en vez de salirse del mapa', () => {
    const clouds = buildCloudScene(uniform(30), BAND, 1)
    const c = clouds[0]
    c.lon = MAP_BBOX.west + 0.001
    c.u = -50
    c.v = 0
    // Empujada hacia el oeste el tiempo suficiente para cruzar el borde.
    driftClouds([c], 600)
    expect(c.lon).toBeGreaterThanOrEqual(MAP_BBOX.west)
    expect(c.lon).toBeLessThanOrEqual(MAP_BBOX.east)
  })

  it('sigue dentro del mapa tras una hora larga de deriva', () => {
    // El módulo con signo: `%` en JavaScript devuelve negativo para entradas
    // negativas, y sin corregirlo una nube que salga por el oeste acaba con una
    // longitud fuera del rectángulo y no se dibuja nunca más.
    const clouds = buildCloudScene(uniform(50), BAND, 2)
    for (const c of clouds) {
      c.u = -18
      c.v = -12
    }
    for (let i = 0; i < 60; i++) driftClouds(clouds, 60)
    for (const c of clouds) {
      expect(c.lon).toBeGreaterThanOrEqual(MAP_BBOX.west)
      expect(c.lon).toBeLessThanOrEqual(MAP_BBOX.east)
      expect(c.lat).toBeGreaterThanOrEqual(MAP_BBOX.south)
      expect(c.lat).toBeLessThanOrEqual(MAP_BBOX.north)
    }
  })
})
