/**
 * El armazón de la pantalla estrecha: todo lo que flota sobre el mapa cuando la
 * app se abre en un teléfono.
 *
 * Aquí no se calcula nada del tiempo. Los datos, el modelo y la selección
 * llegan hechos de `App`, que es la misma para las dos pantallas; esto decide
 * qué se enseña, en qué orden y a qué altura, que es lo único que cambia entre
 * un escritorio con barra lateral y un teléfono en una mano.
 *
 * Lo que va dentro de la hoja son los MISMOS `PointPanel` y `DetailPanel` del
 * escritorio, pasados como hijos. No hay una segunda versión de ninguna ficha:
 * si mañana el panel del punto aprende algo nuevo, lo aprende en los dos
 * sitios a la vez.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { estimateBundle, type InterpolableVariable, type DisplayVariable, type Model } from '../../lib/interpolate'
import type { RgbStop } from '../../lib/palette'
import type { MapVariable } from '../../lib/variables'
import type { GuaguaNetwork } from '../../lib/guagua/network'
import type { LayerVisibility } from '../MapView'
import type { Selection } from '../DetailPanel'
import type { ProbePoint } from '../PointPanel'
import { activeLayerCount } from '../sidebar/LayerSwitches'
import { activePlaceCount } from '../sidebar/PlaceSwitches'
import type { PlaceVisibility } from '../../hooks/usePlaces'
import { MobileHeader } from './MobileHeader'
import { VariableChips } from './VariableChips'
import { Fabs } from './Fabs'
import { Sheet } from './Sheet'
import { sheetHead, selectionKey } from './head'
import { SNAP } from './snaps'
import type { StatusPart } from './status'
import { t } from '../../i18n'

interface Props {
  status: StatusPart[]

  variable: MapVariable
  onVariable: (v: MapVariable) => void
  /** La higrotérmica que enseña la cabecera: con el CO₂ elegido, temperatura. */
  headVariable: DisplayVariable
  stops: RgbStop[]
  gridOn: boolean
  onToggleGrid: () => void

  visible: LayerVisibility
  places: PlaceVisibility

  locating: boolean
  onLocate: () => void
  onReset: () => void
  onLayers: () => void

  selection: Selection | null
  probe: ProbePoint | null
  models: Record<InterpolableVariable, Model | null>
  /** Margen del modelo, para cuando la estimación no traiga el suyo. */
  uncertainty: number | null
  guagua: GuaguaNetwork | null
  now: number
  /**
   * El punto lo puso el arranque al preguntar la ubicación, no un dedo. Con
   * esto la hoja se queda asomando en vez de subir sola: al abrir la app se ve
   * la isla entera y una línea con la temperatura de donde estás.
   */
  autoProbe: boolean

  children: ReactNode
}

export function MobileShell(props: Props) {
  const { probe, selection, models, headVariable, stops } = props
  /** Alto de lo que asoma de la hoja, para que los botones no queden debajo. */
  const [peekHeight, setPeekHeight] = useState(110)

  /**
   * La cifra de la cabecera se calcula aquí y no se le pide al panel: el panel
   * puede no estar montado —en reposo la hoja no lo enseña— y la cabecera
   * tiene que decir la temperatura igual. Es el mismo `estimateBundle` que usa
   * la ficha, así que las dos cifras no pueden discrepar.
   */
  const bundle = useMemo(
    () =>
      probe && probe.elevation !== null
        ? estimateBundle(models, probe.lon, probe.lat, probe.elevation)
        : null,
    [models, probe],
  )

  const head = sheetHead(
    selection,
    probe
      ? { point: probe, bundle, variable: headVariable, stops, uncertainty: props.uncertainty }
      : null,
    props.guagua,
    props.now,
  )

  return (
    <>
      <div className="mtopfade" aria-hidden />

      <div className="mtop">
        <MobileHeader status={props.status} />
        <VariableChips
          variable={props.variable}
          onVariable={props.onVariable}
          gridOn={props.gridOn}
          onToggleGrid={props.onToggleGrid}
        />
      </div>

      {/* Los botones se apoyan en la hoja: en reposo quedan justo encima del
          asa, y con la hoja subida quedan detrás de ella —tiene más z— en vez
          de flotar sobre la ficha que se está leyendo. */}
      <div className="mfabs-slot" style={{ bottom: peekHeight + 14 }}>
        <Fabs
          locating={props.locating}
          layerCount={activeLayerCount(props.visible) + activePlaceCount(props.places)}
          onLayers={props.onLayers}
          onLocate={props.onLocate}
          onReset={props.onReset}
        />
      </div>

      <Sheet
        head={head}
        contentKey={selectionKey(selection, probe)}
        // Tocar algo en el mapa sube la hoja hasta la mitad, no del todo: la
        // pregunta era «¿qué hay ahí?», y la respuesta cabe en media pantalla
        // sin perder de vista el punto que se acaba de tocar. El punto del
        // arranque no la sube: ahí no ha preguntado nadie.
        openTo={!props.autoProbe && (selection || probe) ? SNAP.half : undefined}
        onPeekHeight={setPeekHeight}
      >
        {/* Subir la hoja sin haber elegido nada deja media pantalla en negro.
            Antes de eso, la hoja dice qué se gana tocando el mapa. */}
        {props.children ?? <p className="msheet-empty">{t.point.tapHint}.</p>}
      </Sheet>
    </>
  )
}
