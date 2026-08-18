import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTENT_DELAY_MS, INTENT_MAX_TILES } from './budget'
import {
  cancelBasemapIntent,
  forgetView,
  rememberView,
  warmBasemapIntent,
  type CameraView,
} from './intent'
import { stopWarming } from './warm'

/**
 * Esta precarga tiene DOS orillas, igual que las otras dos, y aquí la segunda
 * pesa más que en ningún otro sitio.
 *
 * Se dispara con el puntero, o sea con el gesto más barato que hay: cruzar el
 * panel lateral pasa por encima de los tres chips sin querer nada de ninguno.
 * Si eso pidiera una pantalla de teselas por chip, la promesa de `basemaps.ts`
 * —quien no toca el selector no gasta ni una petición fuera de casa— se
 * quedaría en nada y GRAFCAN recibiría tráfico de gente que ni siquiera ha
 * mirado esos fondos. Por eso hay tantas pruebas de lo que NO se pide.
 */
describe('la precarga por intención del selector', () => {
  /** La ventana de Los Llanos a z14, la misma de `prefetch.test.ts`. */
  const VISTA: CameraView = { west: -17.96, south: 28.58, east: -17.87, north: 28.65, zoom: 14 }
  let pedidas: string[] = []

  beforeEach(() => {
    pedidas = []
    // Relojes falsos: el único reloj real que hay aquí son los 150 ms de la
    // cuenta atrás, y esperarlos ocho veces le costaba 4,2 s a una suite que
    // entera tarda 4,5. En un repositorio donde cada cambio pasa por `npm test`
    // antes de desplegarse, eso es un peaje por arreglo de una línea.
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', async (url: string) => {
      pedidas.push(url)
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    })
    rememberView(VISTA)
  })

  afterEach(() => {
    forgetView()
    stopWarming()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /**
   * Adelanta el reloj y deja correr la fila de `warm.ts`.
   *
   * Las dos partes hacen falta: el `advanceTimersByTimeAsync` dispara la cuenta
   * atrás, y la vuelta por la cola de microtareas deja que los obreros —que
   * encadenan `hasTile`, `fetch` y `writeTile`, tres promesas por tesela—
   * lleguen hasta el final. Sin lo segundo, `pedidas` se leería a medias y la
   * prueba pasaría o fallaría según el día.
   */
  const reposar = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms)
    for (let i = 0; i < 50; i++) await Promise.resolve()
  }

  it('no pide nada mientras el puntero solo está de paso', async () => {
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS / 2)
    expect(pedidas).toEqual([])
  })

  it('un roce que se va antes de tiempo no le cuesta nada a GRAFCAN', async () => {
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS / 2)
    cancelBasemapIntent()
    await reposar(INTENT_DELAY_MS * 3)
    expect(pedidas).toEqual([])
  })

  it('cruzar los tres chips seguidos no pide tres pantallas', async () => {
    // Cada chip cancela al anterior, así que lo que queda es la intención del
    // último y nada de los dos primeros.
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS / 3)
    warmBasemapIntent('topografico')
    await reposar(INTENT_DELAY_MS / 3)
    cancelBasemapIntent()
    await reposar(INTENT_DELAY_MS * 3)
    expect(pedidas).toEqual([])
  })

  it('quedándose encima sí pide el encuadre, y no más de una pantalla', async () => {
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS * 4)
    expect(pedidas.length).toBeGreaterThan(0)
    expect(pedidas.length).toBeLessThanOrEqual(INTENT_MAX_TILES)
  })

  it('pide el fondo que se está tocando y solo ese', async () => {
    warmBasemapIntent('topografico')
    await reposar(INTENT_DELAY_MS * 4)
    expect(pedidas.length).toBeGreaterThan(0)
    expect(pedidas.every((u) => u.includes('/MT20?'))).toBe(true)
    expect(pedidas.some((u) => u.includes('/Ortofoto?'))).toBe(false)
  })

  it('del fondo de casa no hay nada que precargar', async () => {
    // `relieve` no tiene fuente externa: sale del DEM que ya está servido aquí.
    warmBasemapIntent('relieve')
    await reposar(INTENT_DELAY_MS * 4)
    expect(pedidas).toEqual([])
  })

  it('sin saber dónde está el mapa no se adivina un encuadre', async () => {
    // Pasa de verdad: el puntero puede llegar al selector antes del primer
    // `idle` del mapa. Precargar entonces sería pedir teselas de un sitio
    // inventado, que es peor que no precargar nada.
    forgetView()
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS * 4)
    expect(pedidas).toEqual([])
  })

  it('con «ahorro de datos» no pide nada, como el resto de la precarga', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    warmBasemapIntent('satelite')
    await reposar(INTENT_DELAY_MS * 4)
    expect(pedidas).toEqual([])
  })
})
