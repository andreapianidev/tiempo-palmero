/**
 * Qué enseña la hoja: la cabecera y el cuerpo de lo que esté elegido.
 *
 * Una sola hoja para todo. Antes había dos —la del punto, que era una pantalla
 * entera, y una modal para las paradas, los sitios y los aforos—, y eran dos
 * respuestas distintas a la misma pregunta: «¿qué es esto que acabo de tocar?».
 * Ahora la pregunta tiene un solo sitio donde contestarse, y ese sitio nunca
 * desaparece.
 *
 * Este fichero solo reparte. La lógica de cada ficha vive en la suya, y esto no
 * crece cuando se añade una capa: crece en una rama del `switch` y un import.
 */

import { cssColor, type RgbStop } from '@core/lib/palette'
import { VARIABLES } from '@core/lib/variables'
import type { Bundle, DisplayVariable, InterpolableVariable, Model } from '@core/lib/interpolate'
import type { GuaguaNetwork } from '@core/lib/guagua/network'
import type { NetworkCensus, Station } from '@core/lib/quality'
import { n, n0, t } from '@core/i18n'
import { color } from '../theme'
import type { HeadContent } from '../components/sheet/SheetHead'
import { PointDetail, type PointPlace } from '../detail/PointDetail'
import { CounterSheet } from './CounterSheet'
import { FireSheet } from './FireSheet'
import { PlaceSheet } from './PlaceSheet'
import { PoiSheet } from './PoiSheet'
import { RoadSheet } from './RoadSheet'
import { RouteSheet } from './RouteSheet'
import { StopSheet } from './StopSheet'
import type { Selection } from './selection'

/**
 * Un glifo por clase de cosa, los mismos que «cerca de aquí».
 *
 * Donde hay una temperatura va la temperatura; donde no la hay —una parada, una
 * carretera— va el dibujo, porque la cabecera necesita algo a la izquierda que
 * diga de un vistazo qué se está mirando.
 */
const GLYPH: Record<Selection['kind'], string> = {
  stop: '⬤',
  route: '◍',
  place: '★',
  poi: '◆',
  road: '⌁',
  counter: '⇅',
  fire: '▲',
}

interface PointState {
  place: PointPlace
  bundle: Bundle | null
  variable: DisplayVariable
  stops: RgbStop[]
  /** Margen del modelo, para la línea de contexto de la cabecera. */
  uncertainty: number | null
}

interface Props {
  selection: Selection | null
  point: PointState | null
  net: GuaguaNetwork | null
  countersToday: string | null
  firePolledAt: number | null
  stations: Station[]
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  now: number
  onRoute: (routeId: string) => void
  onWeather: (lon: number, lat: number, label: string) => void
}

/** La cabecera que asoma siempre. Lo elegido en una capa manda sobre el punto. */
export function sheetHead(
  selection: Selection | null,
  point: PointState | null,
  net: GuaguaNetwork | null,
): HeadContent {
  if (selection) return headOfSelection(selection, net)
  if (point) return headOfPoint(point)
  return {
    lead: '—',
    leadColor: color.dim,
    title: t.point.tapPrompt,
    meta: t.point.tapPromptHint,
  }
}

export function SheetContent(props: Props) {
  const { selection, point } = props

  if (selection) {
    switch (selection.kind) {
      case 'stop':
        return (
          <StopSheet
            stop={selection.stop}
            net={props.net}
            onRoute={props.onRoute}
            onWeather={props.onWeather}
          />
        )
      case 'route':
        return <RouteSheet routeId={selection.routeId} net={props.net} />
      case 'place':
        return <PlaceSheet place={selection.place} onWeather={props.onWeather} />
      case 'poi':
        return <PoiSheet poi={selection.poi} onWeather={props.onWeather} />
      case 'road':
        return (
          <RoadSheet
            road={selection.road}
            lon={selection.lon}
            lat={selection.lat}
            onWeather={props.onWeather}
          />
        )
      case 'counter':
        return props.countersToday ? (
          <CounterSheet
            site={selection.site}
            today={props.countersToday}
            now={props.now}
            onWeather={props.onWeather}
          />
        ) : null
      case 'fire':
        return (
          <FireSheet camera={selection.camera} polledAt={props.firePolledAt} now={props.now} />
        )
    }
  }

  if (!point) return null

  return (
    <PointDetail
      point={point.place}
      bundle={point.bundle}
      variable={point.variable}
      stops={point.stops}
      stations={props.stations}
      models={props.models}
      census={props.census}
      validation={props.validation}
      now={props.now}
    />
  )
}

function headOfPoint({ place, bundle, variable, stops, uncertainty }: PointState): HeadContent {
  const estimate = bundle?.[variable] ?? null
  const spec = VARIABLES[variable]
  // El grado de la cabecera va sin la C —cabe poco— pero el resto de unidades
  // se enseñan enteras: «1,24» a secas no dice si son kPa o milímetros.
  const lead = spec.unit === t.units.celsius ? '°' : spec.unit
  const margin = estimate?.uncertainty ?? uncertainty
  return {
    lead: estimate ? `${n(estimate.value, spec.decimals)}${lead}` : '—',
    leadColor: estimate ? cssColor(stops, estimate.value) : color.dim,
    title: place.title,
    meta:
      `${n0(place.elevation)} m · ${place.municipality}` +
      (margin !== null ? ` · ± ${n(margin, spec.decimals)} ${spec.unit}` : ''),
  }
}

function headOfSelection(selection: Selection, net: GuaguaNetwork | null): HeadContent {
  const lead = GLYPH[selection.kind]
  switch (selection.kind) {
    case 'stop':
      return {
        lead,
        leadColor: color.amber,
        title: selection.stop.name,
        meta: selection.stop.code
          ? `${t.guagua.stopTitle} · ${t.guagua.stopCode} ${selection.stop.code}`
          : t.guagua.stopTitle,
      }
    case 'route': {
      const route = net?.routes[selection.routeId]
      return {
        lead: route?.name ?? lead,
        leadColor: color.amber,
        title: route ? `${t.guagua.routeTitle} ${route.name}` : selection.routeId,
        meta: route?.longName ?? t.guagua.operator,
      }
    }
    case 'place':
      return {
        lead,
        leadColor: color.amber,
        title: selection.place.name,
        meta: t.places.kinds[selection.place.kind] ?? t.places.title,
      }
    case 'poi':
      return {
        lead,
        leadColor: color.amber,
        title: selection.poi.name,
        meta: t.poi.families[selection.poi.family] ?? t.poi.source,
      }
    case 'road':
      return {
        lead,
        leadColor: color.amber,
        title: selection.road.name,
        meta: selection.road.code ?? t.layers.roads,
      }
    case 'counter':
      return {
        lead,
        leadColor: color.amber,
        title: selection.site.name,
        meta: t.counters.kinds[selection.site.kind] ?? t.counters.title,
      }
    case 'fire':
      return {
        lead,
        leadColor: selection.camera.hasAlert ? color.bad : color.dim,
        title: selection.camera.name,
        meta: selection.camera.hasAlert ? t.fire.alert : t.fire.noAlert,
      }
  }
}
