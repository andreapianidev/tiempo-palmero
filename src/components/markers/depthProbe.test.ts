import { describe, expect, it } from 'vitest'
import maplibregl, { type Marker } from 'maplibre-gl'
import { DEPTH_PROBE, silenceDepthProbe } from './depthProbe'

/**
 * ESTA PRUEBA EXISTE PARA QUE UNA SUBIDA DE MAPLIBRE NO DEVUELVA EN SILENCIO
 * LOS 1.694 ms.
 *
 * `silenceDepthProbe` sustituye un método privado. Si la librería lo renombra,
 * la sustitución deja de tener efecto y todo sigue funcionando —los marcadores
 * vuelven a hacer su lectura del búfer de profundidad— solo que la vista 3D
 * vuelve a ir a 35 fps sin que nada avise. Un fallo que no se ve es peor que
 * uno que rompe.
 *
 * NO SE CONSTRUYE UN `Marker` DE VERDAD. Su constructor toca el DOM y aquí no
 * hay navegador; meter `jsdom` en el proyecto por una prueba sería pagar una
 * dependencia entera para comprobar dos líneas. Lo que sí se comprueba contra
 * la librería real es lo único que la librería puede romper: que el método siga
 * llamándose como creemos. El comportamiento del parche se comprueba sobre un
 * doble con la misma forma —el método en el prototipo, no en la instancia—, que
 * es la parte que importa.
 */
describe('la sonda de profundidad de los marcadores', () => {
  it('sigue llamándose como creemos en la versión instalada de MapLibre', () => {
    const proto = maplibregl.Marker.prototype as unknown as Record<string, unknown>
    expect(typeof proto[DEPTH_PROBE]).toBe('function')
  })

  it('la deja sin efecto en la instancia, no en el prototipo', () => {
    let llamadas = 0
    class FakeMarker {
      [DEPTH_PROBE]() {
        llamadas++
      }
    }
    const proto = FakeMarker.prototype as unknown as Record<string, unknown>
    const original = proto[DEPTH_PROBE]

    const marker = new FakeMarker()
    silenceDepthProbe(marker as unknown as Marker)
    ;(marker as unknown as Record<string, () => void>)[DEPTH_PROBE]()

    expect(llamadas).toBe(0)
    // El prototipo queda intacto: cualquier otro marcador del proceso —de otro
    // mapa, de otra librería— sigue con su comportamiento de fábrica.
    expect(proto[DEPTH_PROBE]).toBe(original)
    ;(new FakeMarker() as unknown as Record<string, () => void>)[DEPTH_PROBE]()
    expect(llamadas).toBe(1)
  })

  it('no rompe si el método deja de existir', () => {
    expect(() => silenceDepthProbe({} as unknown as Marker)).not.toThrow()
  })
})
