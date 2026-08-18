import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTileOnce, inflightCount, raceAbort } from './inflight'

/**
 * Esto existe por una medida, no por una intuición.
 *
 * `scripts/checks/tile-cache.ts` contra Chromium, 18 de agosto de 2026: al
 * encender la ortofoto salían **25 peticiones a GRAFCAN y dos eran la misma
 * URL byte a byte**, porque el precargador y MapLibre pedían a la vez la tesela
 * z10 que la vista de lejos y la pantalla comparten a zoom 9,6. Con esto,
 * 23 y ninguna repetida.
 */
describe('una tesela, una descarga', () => {
  let llamadas: string[] = []
  let resolver: ((v: Response) => void)[] = []

  beforeEach(() => {
    llamadas = []
    resolver = []
    vi.stubGlobal('fetch', (url: string) => {
      llamadas.push(url)
      return new Promise<Response>((res) => resolver.push(res))
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const responder = () => {
    for (const r of resolver) {
      r(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }))
    }
    resolver = []
  }

  it('dos peticiones simultáneas de la misma tesela son una sola descarga', async () => {
    const a = fetchTileOnce('k', 'https://grafcan/x')
    const b = fetchTileOnce('k', 'https://grafcan/x')
    expect(llamadas).toHaveLength(1)
    responder()
    const [ra, rb] = await Promise.all([a, b])
    // Y las dos reciben los bytes: no es que una se quede sin nada.
    expect(ra.body.byteLength).toBe(3)
    expect(rb.body.byteLength).toBe(3)
    expect(ra.type).toBe('image/jpeg')
  })

  it('dos teselas distintas siguen siendo dos descargas', async () => {
    void fetchTileOnce('a', 'https://grafcan/a')
    void fetchTileOnce('b', 'https://grafcan/b')
    expect(llamadas).toHaveLength(2)
    responder()
  })

  it('cuando termina deja de estar en vuelo, y la siguiente vuelve a pedir', async () => {
    const a = fetchTileOnce('k', 'https://grafcan/x')
    expect(inflightCount()).toBe(1)
    responder()
    await a
    expect(inflightCount()).toBe(0)
    void fetchTileOnce('k', 'https://grafcan/x')
    expect(llamadas).toHaveLength(2)
    responder()
  })

  it('un fallo tampoco se queda pegado en vuelo', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }))
    await expect(fetchTileOnce('k', 'https://grafcan/x')).rejects.toThrow('500')
    expect(inflightCount()).toBe(0)
  })

  /**
   * Que uno se vaya no puede dejar al otro sin tesela: MapLibre cancela lo que
   * sale de la vista, y si eso matara la descarga compartida, el precargador
   * —que la pidió para guardarla— se quedaría con las manos vacías y GRAFCAN
   * habría servido esos bytes para nada.
   */
  it('quien cancela se desengancha, y la descarga sigue para el otro', async () => {
    const ctl = new AbortController()
    const compartida = fetchTileOnce('k', 'https://grafcan/x')
    const quienCancela = raceAbort(compartida, ctl.signal)
    const quienEspera = compartida

    ctl.abort(new Error('MapLibre ya no la necesita'))
    await expect(quienCancela).rejects.toThrow('ya no la necesita')

    responder()
    await expect(quienEspera).resolves.toMatchObject({ type: 'image/jpeg' })
    expect(llamadas).toHaveLength(1)
  })

  it('si ya estaba cancelado antes de empezar, no se espera a nada', async () => {
    const ctl = new AbortController()
    ctl.abort(new Error('desmontado'))
    const p = fetchTileOnce('k', 'https://grafcan/x')
    await expect(raceAbort(p, ctl.signal)).rejects.toThrow('desmontado')
    responder()
    await p
  })
})
