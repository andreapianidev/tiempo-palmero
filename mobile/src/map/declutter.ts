/**
 * Qué pin enseña su cifra y cuál se colapsa a un punto.
 *
 * Con 36 estaciones sobre una isla de 42 km, en una pantalla de 393 px los pins
 * se pisan unos a otros y el mapa deja de leerse justo en la vista que más se
 * usa. Es el mismo criterio que la web —recorrer por prioridad y reservar un
 * rectángulo por cada superviviente—, con dos diferencias que impone el móvil:
 *
 * - La posición se calcula, no se mide. En el navegador basta con preguntar al
 *   DOM; aquí pedirle al mapa nativo la proyección de 36 puntos en cada
 *   fotograma serían 36 saltos al puente. Con el centro y el zoom de la cámara
 *   la proyección Web Mercator sale de `@core/lib/geo`, que es exactamente la
 *   que usa MapLibre.
 * - El ancho se estima a partir del texto, porque tampoco hay `offsetWidth`.
 *
 * Nada de esto vale si el mapa está girado o inclinado, y por eso la pantalla
 * del mapa desactiva rotación y `pitch`.
 */

import { latToPixelY, lonToPixelX } from '@core/lib/geo'

export interface DeclutterItem {
  id: string
  lon: number
  lat: number
  /** Cuanto más alto, antes se coloca. En la red: la altitud de la estación. */
  priority: number
  /** Texto del pin, para estimar cuánto ocupa. */
  label: string
}

export interface Viewport {
  center: [number, number]
  zoom: number
  width: number
  height: number
}

/** Métrica de la píldora: IBM Plex Mono 12 px con 7 px de aire a cada lado. */
const CHAR_PX = 7.3
const PILL_PADDING = 18
const PILL_HEIGHT = 19
const DOT_SIZE = 12
/** Aire mínimo entre dos pins, en píxeles. */
const GAP_X = 3
const GAP_Y = 2

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP_X &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP_Y
  )
}

export type PinState = 'pill' | 'dot' | 'hidden'

/**
 * Decide el estado de cada pin. Devuelve un mapa por identificador para que el
 * componente lo consulte sin volver a recorrer nada.
 */
export function declutter(
  items: readonly DeclutterItem[],
  view: Viewport,
): Map<string, PinState> {
  const out = new Map<string, PinState>()
  if (!items.length) return out

  const cx = lonToPixelX(view.center[0], view.zoom)
  const cy = latToPixelY(view.center[1], view.zoom)
  const taken: Rect[] = []

  const ordered = [...items].sort((a, b) => b.priority - a.priority)

  for (const it of ordered) {
    const x = lonToPixelX(it.lon, view.zoom) - cx + view.width / 2
    const y = latToPixelY(it.lat, view.zoom) - cy + view.height / 2

    // Fuera de pantalla no se dibuja: son marcadores nativos y cada uno es una
    // vista real, no un símbolo dentro de la textura del mapa.
    if (x < -60 || y < -40 || x > view.width + 60 || y > view.height + 40) {
      out.set(it.id, 'hidden')
      continue
    }

    const pill: Rect = { x, y, w: it.label.length * CHAR_PX + PILL_PADDING, h: PILL_HEIGHT }
    if (!taken.some((r) => overlaps(pill, r))) {
      taken.push(pill)
      out.set(it.id, 'pill')
      continue
    }

    // Colapsado sigue ocupando sitio: dos puntos encima del otro son un punto.
    const dot: Rect = { x, y, w: DOT_SIZE, h: DOT_SIZE }
    if (!taken.some((r) => overlaps(dot, r))) {
      taken.push(dot)
      out.set(it.id, 'dot')
    } else {
      out.set(it.id, 'hidden')
    }
  }

  return out
}
