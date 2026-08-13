/**
 * Qué ficha le toca a lo que hay elegido.
 *
 * Solo reparte: el título, la clase de cosa que es y el contenido. Toda la
 * lógica de cada ficha vive en su propio archivo, y este no crece cuando se
 * añade una capa —crece en una rama del `switch` y en un import.
 *
 * La hoja se monta SIEMPRE, con o sin selección, para que la animación de
 * salida tenga algo que animar: desmontarla al cerrar la haría desaparecer de
 * golpe. Cuando no hay nada elegido se queda con el último contenido mientras
 * baja, que es lo que se ve en cualquier hoja de iOS.
 */

import { t } from '@core/i18n'
import type { GuaguaNetwork } from '@core/lib/guagua/network'
import { PLACE_BY_KIND } from '@core/lib/places'
import { InfoSheet } from './InfoSheet'
import { CounterSheet } from './CounterSheet'
import { FireSheet } from './FireSheet'
import { PlaceSheet } from './PlaceSheet'
import { PoiSheet } from './PoiSheet'
import { RoadSheet } from './RoadSheet'
import { RouteSheet } from './RouteSheet'
import { StopSheet } from './StopSheet'
import type { Selection } from './selection'

interface Props {
  selection: Selection | null
  net: GuaguaNetwork | null
  /** Día de la isla con el que se sumaron los aforos. */
  countersToday: string | null
  firePolledAt: number | null
  now: number
  onRoute: (routeId: string) => void
  onWeather: (lon: number, lat: number, label: string) => void
  onClose: () => void
}

export function SelectionSheet(props: Props) {
  const { selection, net } = props
  const head = selection ? headOf(selection, net) : { title: '', kind: '' }

  return (
    <InfoSheet
      open={!!selection}
      title={head.title}
      kind={head.kind}
      onClose={props.onClose}
    >
      {selection?.kind === 'stop' && (
        <StopSheet
          stop={selection.stop}
          net={net}
          onRoute={props.onRoute}
          onWeather={props.onWeather}
        />
      )}
      {selection?.kind === 'route' && <RouteSheet routeId={selection.routeId} net={net} />}
      {selection?.kind === 'place' && (
        <PlaceSheet place={selection.place} onWeather={props.onWeather} />
      )}
      {selection?.kind === 'poi' && <PoiSheet poi={selection.poi} onWeather={props.onWeather} />}
      {selection?.kind === 'road' && (
        <RoadSheet
          road={selection.road}
          lon={selection.lon}
          lat={selection.lat}
          onWeather={props.onWeather}
        />
      )}
      {selection?.kind === 'counter' && props.countersToday && (
        <CounterSheet
          site={selection.site}
          today={props.countersToday}
          now={props.now}
          onWeather={props.onWeather}
        />
      )}
      {selection?.kind === 'fire' && (
        <FireSheet camera={selection.camera} polledAt={props.firePolledAt} now={props.now} />
      )}
    </InfoSheet>
  )
}

/** El título de la hoja y la línea que dice qué clase de cosa se está mirando. */
function headOf(
  selection: Selection,
  net: GuaguaNetwork | null,
): { title: string; kind: string } {
  switch (selection.kind) {
    case 'stop':
      return { title: selection.stop.name, kind: t.guagua.stopTitle }
    case 'route': {
      const route = net?.routes[selection.routeId]
      return {
        title: route ? `${t.guagua.routeTitle} ${route.name}` : selection.routeId,
        kind: route?.longName ?? t.guagua.operator,
      }
    }
    case 'place':
      return {
        title: selection.place.name,
        kind: PLACE_BY_KIND[selection.place.kind]
          ? (t.places.kinds[selection.place.kind] ?? t.places.title)
          : t.places.title,
      }
    case 'poi':
      return { title: selection.poi.name, kind: t.poi.families[selection.poi.family] ?? t.poi.source }
    case 'road':
      return { title: selection.road.name, kind: selection.road.code ?? t.layers.roads }
    case 'counter':
      return {
        title: selection.site.name,
        kind: t.counters.kinds[selection.site.kind] ?? t.counters.title,
      }
    case 'fire':
      return { title: selection.camera.name, kind: t.fire.title }
  }
}
