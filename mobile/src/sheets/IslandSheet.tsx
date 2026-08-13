/**
 * «Estado de la isla»: lo que la web enseña en cuatro bloques del panel lateral.
 *
 * En el escritorio esos bloques caben plegados al lado del mapa y se abren
 * cuando interesan. En 393 px no hay lado, así que van en una hoja que sube
 * desde abajo — la misma que ya usan las fichas de capa, para que el gesto de
 * cerrar sea el que la mano ya conoce.
 *
 * El armazón no calcula nada: recibe lo ya calculado por `@core` y reparte.
 * Cada bloque es un fichero de `src/island/`, que es la misma regla que la web
 * aplica en `components/sidebar/`.
 */

import type { CloudDeck } from '@core/lib/clouds'
import type { RoqueStatus } from '@core/lib/roque'
import type { TrailReport } from '@core/lib/trails/alerts'
import type { EtoField } from '@core/lib/agro/eto'
import { InfoSheet } from './InfoSheet'
import { CloudSeaBlock } from '../island/CloudSeaBlock'
import { RoqueBlock } from '../island/RoqueBlock'
import { TrailsBlock } from '../island/TrailsBlock'
import { AgroBlock, type CropSummary } from '../island/AgroBlock'
import { zoneAt } from '@core/lib/clouds'

interface Props {
  open: boolean
  onClose: () => void
  deck: CloudDeck | null
  roque: RoqueStatus | null
  trailReports: TrailReport[]
  eto: EtoField | null
  etoFailed: boolean
  crops: CropSummary | null
  here: { lon: number; lat: number; elevationM: number; label: string | null } | null
  now: number
}

export function IslandSheet(props: Props) {
  return (
    <InfoSheet
      open={props.open}
      kind="La isla ahora"
      title="Estado de la isla"
      onClose={props.onClose}
    >
      <CloudSeaBlock
        deck={props.deck}
        hereM={props.here?.elevationM ?? null}
        hereLabel={props.here?.label ?? null}
      />
      <RoqueBlock
        status={props.roque}
        aboveDeck={props.deck ? zoneAt(props.deck, 2387) === 'above' : null}
        now={props.now}
      />
      <TrailsBlock reports={props.trailReports} />
      <AgroBlock
        eto={props.eto}
        etoFailed={props.etoFailed}
        crops={props.crops}
        here={props.here}
      />
    </InfoSheet>
  )
}
