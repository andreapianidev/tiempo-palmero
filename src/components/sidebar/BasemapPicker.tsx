/**
 * Selector de fondo de mapa.
 *
 * Tres chips y una línea que explica el elegido. La línea no es adorno: los
 * tres fondos no son tres estéticas, son tres cosas distintas —un cálculo de
 * casa, una carta topográfica y una foto aérea— y de qué está hecho lo que se
 * mira decide cuánto se puede fiar uno de lo que ve.
 *
 * El catálogo NO vive aquí: está en `lib/basemaps.ts`, junto a las fuentes que
 * el mapa declara. Este archivo solo lo dibuja.
 *
 * Y PRECARGA EL FONDO QUE EL PUNTERO ESTÁ TOCANDO, que es lo único que hace
 * aquí además de dibujar. Con el mapa a z15, encender la ortofoto era esperar a
 * que GRAFCAN sirviera una pantalla entera; pedirla mientras la mano va hacia
 * el chip la tiene guardada antes del clic. La decisión y sus cifras están en
 * `lib/tiles/intent.ts`, no aquí: esto solo dice cuándo empieza y cuándo se
 * cancela.
 */

import { BASEMAPS, BASEMAP_ORDER, type BasemapId } from '../../lib/basemaps'
import { cancelBasemapIntent, warmBasemapIntent } from '../../lib/tiles/intent'

interface Props {
  basemap: BasemapId
  onBasemap: (id: BasemapId) => void
  /** La malla está encendida — y encendida, tapa cualquier fondo. */
  gridOn: boolean
  onToggleGrid: () => void
}

export function BasemapPicker({ basemap, onBasemap, gridOn, onToggleGrid }: Props) {
  const current = BASEMAPS[basemap]

  return (
    <>
      <div className="chips">
        {BASEMAP_ORDER.map((id) => BASEMAPS[id]).map((b) => (
          <button
            key={b.id}
            className="chip-btn"
            aria-pressed={basemap === b.id}
            onClick={() => onBasemap(b.id)}
            // El fondo puesto no se precarga: sus teselas llevan en la caché
            // desde que se pintó. `onFocus`/`onBlur` no son adorno de
            // accesibilidad — quien llega al selector con el tabulador merece
            // el mismo adelanto que quien llega con el ratón.
            onPointerEnter={() => b.id !== basemap && warmBasemapIntent(b.id)}
            onFocus={() => b.id !== basemap && warmBasemapIntent(b.id)}
            onPointerLeave={cancelBasemapIntent}
            onBlur={cancelBasemapIntent}
          >
            {b.label}
          </button>
        ))}
      </div>

      <p className="dim small">{current.note}</p>

      {/* Con la malla encendida, del fondo se ve el mar y poco más: la malla
          cubre la isla entera y es opaca.

          Y opaca se queda. Bajarle la transparencia para que asome la carta
          sonaba bien hasta que se mira lo que significa: el color de la malla
          ES la lectura, y un naranja de 28° al 60 % sobre una ortofoto verde
          ya no es un naranja de 28°. Antes que enseñar una temperatura falsa,
          se dice lo que pasa y se ofrece apagarla. */}
      {current.source && gridOn && (
        <p className="dim small">
          La malla interpolada va encima y cubre la isla.{' '}
          <button className="link-btn" onClick={onToggleGrid}>
            Apagarla para ver el fondo
          </button>
        </p>
      )}

      {/* Que un fondo se pida fuera no es un detalle de implementación: es la
          diferencia entre un mapa que funciona con la red caída y uno que no.
          Se dice donde se elige, no en la pantalla de fuentes. */}
      {current.source && (
        <p className="dim small">Se pide a GRAFCAN mientras se mira; sin conexión, no se dibuja.</p>
      )}
    </>
  )
}
