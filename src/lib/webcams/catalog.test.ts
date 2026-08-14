/**
 * El catálogo de webcams, comprobado en lo que se puede comprobar sin red.
 *
 * NO se pide aquí que las cámaras respondan: un test que dependa de que
 * `polimer.lapalma.es` esté en pie fallaría en cuanto el Cabildo reinicie un
 * servidor, y estaría diciendo algo del servidor, no del código. Lo que sí se
 * cuida es todo lo que un descuido al editar la lista rompería en silencio:
 *
 *  - Un `id` repetido: React reutilizaría el mismo nodo para dos cámaras
 *    distintas y la ficha enseñaría la imagen de otra.
 *  - Un `http://`: la aplicación se sirve por HTTPS y el navegador bloquearía
 *    la imagen como contenido mixto, sin error visible más que un hueco.
 *  - Una coordenada fuera de la isla: el marcador caería en el mar, o —peor—
 *    fuera del `maxBounds` del mapa, donde no se puede llegar ni arrastrando.
 */

import { describe, it, expect } from 'vitest'
import { inIslandBbox } from '../geo'
import { WEBCAM_HOSTS, WEBCAM_SITES, webcamViewCount } from './catalog'

describe('catálogo de webcams', () => {
  it('no repite identificadores, ni de sitio ni de vista', () => {
    const sites = WEBCAM_SITES.map((s) => s.id)
    expect(new Set(sites).size).toBe(sites.length)

    const views = WEBCAM_SITES.flatMap((s) => s.views.map((v) => v.id))
    expect(new Set(views).size).toBe(views.length)
  })

  it('sirve todas las imágenes por HTTPS', () => {
    const insecure = WEBCAM_SITES.flatMap((s) => s.views)
      .map((v) => v.url)
      .filter((u) => !u.startsWith('https://'))
    expect(insecure).toEqual([])
  })

  it('sitúa todas las cámaras dentro de la isla', () => {
    const outside = WEBCAM_SITES.filter((s) => !inIslandBbox(s.lon, s.lat)).map((s) => s.id)
    expect(outside).toEqual([])
  })

  it('da un nombre a cada ángulo cuando el sitio tiene más de uno', () => {
    // Con una sola vista la etiqueta sobra —el nombre del sitio ya la nombra—,
    // pero con dos, «Norte» y «Sur» son lo único que las distingue en la ficha.
    const unlabelled = WEBCAM_SITES.filter(
      (s) => s.views.length > 1 && s.views.some((v) => v.label === null),
    ).map((s) => s.id)
    expect(unlabelled).toEqual([])
  })

  it('deriva la lista de hosts de las propias vistas', () => {
    // `api/webcam` valida contra esta lista. Si se escribiera a mano, añadir una
    // cámara de un host nuevo dejaría su edad sin consultar y sin avisar.
    for (const site of WEBCAM_SITES) {
      for (const view of site.views) {
        expect(WEBCAM_HOSTS).toContain(new URL(view.url).host)
      }
    }
  })

  it('cuenta las vistas, que son más que los sitios', () => {
    expect(webcamViewCount()).toBeGreaterThan(WEBCAM_SITES.length)
  })
})
