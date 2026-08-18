import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREFETCH_CONCURRENCY } from './budget'
import { pendingWarmups, stopWarming, warmTiles } from './warm'
import type { TileXY } from './grid'

const PLANTILLA = 'https://idecan1.grafcan.es/ServicioWMS/Ortofoto?bbox={bbox-epsg-3857}'
const tiles = (n: number, z = 14): TileXY[] =>
  Array.from({ length: n }, (_, i) => ({ z, x: 7360 + i, y: 6814 }))

/**
 * Estas pruebas vigilan el lado de GRAFCAN, no el nuestro.
 *
 * Al otro lado hay un servicio público cuya licencia prohíbe la descarga
 * masiva. Lo que puede convertir esta precarga en un abuso no es un fallo
 * ruidoso: es que la fila crezca sin techo, que dos precargas abran cuatro
 * peticiones en paralelo en vez de dos, o que un `saveData` se ignore. Nada de
 * eso da error ni se ve en pantalla — solo se ve desde el servidor de enfrente.
 */
describe('la fila de precarga', () => {
  let enVuelo = 0
  let maxEnVuelo = 0
  let pedidas: string[] = []

  beforeEach(() => {
    enVuelo = 0
    maxEnVuelo = 0
    pedidas = []
    // `navigator.connection` sin definir = se precarga (Safari, Firefox).
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', async (url: string) => {
      pedidas.push(url)
      maxEnVuelo = Math.max(maxEnVuelo, ++enVuelo)
      await new Promise((r) => setTimeout(r, 5))
      enVuelo--
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    })
  })

  afterEach(() => {
    stopWarming()
    vi.unstubAllGlobals()
  })

  const vaciada = async () => {
    for (let i = 0; i < 200 && (pendingWarmups() > 0 || enVuelo > 0); i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  it('no abre más peticiones en paralelo de las declaradas', async () => {
    warmTiles('lejos', PLANTILLA, tiles(12))
    await vaciada()
    expect(pedidas).toHaveLength(12)
    expect(maxEnVuelo).toBeLessThanOrEqual(PREFETCH_CONCURRENCY)
  })

  it('un arrastre nuevo tira el borde pendiente del anterior', async () => {
    const VIEJO = `${PLANTILLA}&marca=viejo`
    const NUEVO = `${PLANTILLA}&marca=nuevo`
    warmTiles('borde', VIEJO, tiles(8))
    warmTiles('borde', NUEVO, tiles(8))
    await vaciada()
    // Del primer borde solo salen las que ya iban en vuelo cuando llegó el
    // segundo: el resto sobra, porque el usuario ya va hacia otro lado.
    expect(pedidas.filter((u) => u.includes('viejo')).length).toBeLessThanOrEqual(
      PREFETCH_CONCURRENCY,
    )
    expect(pedidas.filter((u) => u.includes('nuevo'))).toHaveLength(8)
  })

  it('pero NO tira la vista de lejos, que no se vuelve a pedir en 30 días', async () => {
    const LEJOS = `${PLANTILLA}&marca=lejos`
    const BORDE = `${PLANTILLA}&marca=borde`
    warmTiles('lejos', LEJOS, tiles(17, 11))
    warmTiles('borde', BORDE, tiles(8))
    await vaciada()
    expect(pedidas.filter((u) => u.includes('lejos'))).toHaveLength(17)
    expect(pedidas.filter((u) => u.includes('borde'))).toHaveLength(8)
  })

  it('con «ahorro de datos» no pide ni una tesela', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    warmTiles('lejos', PLANTILLA, tiles(17))
    await vaciada()
    expect(pedidas).toEqual([])
  })

  it('con una red por debajo de 4G tampoco', async () => {
    vi.stubGlobal('navigator', { connection: { effectiveType: '3g' } })
    warmTiles('borde', PLANTILLA, tiles(8))
    await vaciada()
    expect(pedidas).toEqual([])
  })

  it('con 4G sí', async () => {
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } })
    warmTiles('borde', PLANTILLA, tiles(3))
    await vaciada()
    expect(pedidas).toHaveLength(3)
  })

  it('al desmontar el mapa no queda nada en la fila', async () => {
    warmTiles('lejos', PLANTILLA, tiles(17))
    stopWarming()
    expect(pendingWarmups()).toBe(0)
  })
})
