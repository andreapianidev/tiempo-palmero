/**
 * Repintar las líneas del mapa cuando cambia el fondo.
 *
 * La cuenta está en `lib/contrast/`; aquí solo vive la tabla de qué capa lleva
 * qué papel, que es información del mapa y no de la aritmética del color.
 *
 * Se ejecuta al cambiar de fondo y nada más: son doce llamadas a
 * `setPaintProperty`, que en MapLibre es cambiar un uniforme, no reconstruir la
 * capa. No hay nada que hacer en cada fotograma.
 *
 * QUÉ NO SE TOCA, Y POR QUÉ:
 *
 *  - **El relleno de las paradas de guagua.** Van con relleno claro y aro
 *    oscuro a propósito —está escrito en `GuaguaLayer.ts`— y ese aro ya es un
 *    halo: funciona igual sobre papel blanco que sobre malpaís. Oscurecerles el
 *    relleno por seguir la regla las dejaría peor.
 *  - **La capa de toque de las carreteras**, que se pinta con opacidad cero.
 *  - **El contorno de la isla y el mar**, que son la estructura del mapa y no
 *    referencia dibujada encima.
 */

import type { Map as MlMap } from 'maplibre-gl'
import type { BasemapId } from '../../lib/basemaps'
import { palette } from '../../lib/contrast/palette'
import type { RoleId } from '../../lib/contrast/roles'
import { BASEMAP_LEVELS } from '../../lib/realce/levels'

/** Capa → papel. Un `line-color` cada una. */
const LINE_ROLES: [layer: string, role: RoleId][] = [
  ['carreteras-linea', 'road'],
  ['viario-osm-principal', 'osmMain'],
  ['viario-osm-local', 'osmLocal'],
  ['viario-osm-pista', 'osmTrack'],
  ['viario-osm-servicio', 'osmService'],
  ['canals-line', 'canal'],
  ['guagua-lineas-trazado', 'guagua'],
  ['guagua-lineas-elegida', 'guaguaBright'],
  ['municipal-boundaries', 'boundary'],
]

/** El id de la capa de senderos, que lleva expresión y va aparte. */
const TRAILS = 'trails-line'

export function applyOverlayContrast(map: MlMap, basemap: BasemapId): void {
  const p = palette(BASEMAP_LEVELS[basemap].luma)

  for (const [layer, role] of LINE_ROLES) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, 'line-color', p[role])
  }

  // Los senderos no tienen un color: tienen tres, y cuál se usa lo decide la
  // propiedad `sev` de cada trazado. Se reconstruye la misma expresión con los
  // tres ya corregidos, que es lo único que se puede hacer con un `match`.
  if (map.getLayer(TRAILS)) {
    map.setPaintProperty(TRAILS, 'line-color', [
      'match',
      ['coalesce', ['get', 'sev'], ''],
      'warning', p.trailWarning,
      'notice', p.trailNotice,
      p.trail,
    ])
  }
}
