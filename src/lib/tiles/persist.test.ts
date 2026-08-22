import { describe, expect, it, vi } from 'vitest'
import { askPersistence } from './persist'

describe('almacenamiento persistente', () => {
  it('sin API no se pide nada y no se rompe nada', async () => {
    await expect(askPersistence(undefined)).resolves.toBe(false)
    await expect(askPersistence({})).resolves.toBe(false)
  })

  /**
   * Lo que evita esta comprobación es un diálogo de más en Firefox, que es el
   * único que pregunta: pedir un permiso que ya está concedido.
   */
  it('si ya está concedido no se vuelve a pedir', async () => {
    const persist = vi.fn(async () => true)
    const ok = await askPersistence({ persisted: async () => true, persist })
    expect(ok).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('si no está concedido se pide', async () => {
    const persist = vi.fn(async () => true)
    await expect(askPersistence({ persisted: async () => false, persist })).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  /**
   * Denegar es una respuesta normal —Chrome lo hace sin preguntar en un sitio
   * sin instalar— y no cambia nada de lo que hace la caché.
   */
  it('una negativa se devuelve tal cual', async () => {
    await expect(askPersistence({ persisted: async () => false, persist: async () => false })).resolves.toBe(false)
  })

  /**
   * Un `SecurityError` —contexto sin permisos, un iframe de otro origen— no
   * puede tumbar el arranque del mapa.
   */
  it('un fallo de la API se traga', async () => {
    const roto: never = undefined as never
    await expect(
      askPersistence({
        persisted: async () => {
          throw new Error('SecurityError')
        },
        persist: async () => roto,
      }),
    ).resolves.toBe(false)
  })
})
