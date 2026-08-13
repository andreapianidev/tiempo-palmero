/**
 * Qué dice la fila que asoma de la hoja, para cada cosa que se puede elegir.
 *
 * La regla es la misma en toda la app: donde hay una MEDIDA va la medida —la
 * temperatura de la estación, las ppm del sensor de CO₂—, donde hay una
 * ESTIMACIÓN va la cifra estimada con su margen en la línea de contexto, y
 * donde no hay ninguna de las dos va un glifo, porque una parada de guagua no
 * marca ningún número y dejar el hueco en blanco confundía.
 *
 * Esto solo reparte y formatea. Ni pide datos ni decide qué se enseña debajo:
 * eso lo siguen haciendo `PointPanel` y `DetailPanel`, que son los mismos en
 * las dos pantallas.
 */

import { cssColor, co2Band, TEMP_STOPS, type RgbStop } from '../../lib/palette'
import { VARIABLES } from '../../lib/variables'
import type { Bundle, DisplayVariable } from '../../lib/interpolate'
import type { GuaguaNetwork } from '../../lib/guagua/network'
import { n, n0, t, humanAge } from '../../i18n'
import type { Selection } from '../DetailPanel'
import type { ProbePoint } from '../PointPanel'
import type { HeadContent } from './SheetHead'

const DIM = 'var(--fg-dim)'
const AMBER = 'var(--amber)'
const ALERT = 'var(--alert)'

/** Un glifo por clase de cosa, los mismos que usa «cerca de aquí». */
const GLYPH: Record<Selection['kind'], string> = {
  station: '◉',
  air: '◍',
  co2: '◈',
  sky: '✦',
  fire: '▲',
  poi: '◆',
  busStop: '⬤',
  busRoute: '◍',
  place: '★',
  road: '⌁',
  counter: '⇅',
}

export interface PointHead {
  point: ProbePoint
  bundle: Bundle | null
  variable: DisplayVariable
  stops: RgbStop[]
  /** Margen del modelo, por si la estimación no trae el suyo. */
  uncertainty: number | null
}

/**
 * La cabecera de lo que esté elegido. Lo tocado en una capa manda sobre el
 * punto: quien acaba de pinchar una parada está preguntando por la parada.
 */
export function sheetHead(
  selection: Selection | null,
  point: PointHead | null,
  guagua: GuaguaNetwork | null,
  now: number,
): HeadContent {
  if (selection) return headOfSelection(selection, guagua, now)
  if (point) return headOfPoint(point)
  return {
    lead: '—',
    leadColor: DIM,
    title: t.point.tapPrompt,
    meta: t.point.tapPromptHint,
  }
}

function headOfPoint({ point, bundle, variable, stops, uncertainty }: PointHead): HeadContent {
  const estimate = bundle?.[variable] ?? null
  const spec = VARIABLES[variable]
  // El grado va sin la C —cabe poco— pero el resto de unidades se enseñan
  // enteras: «1,24» a secas no dice si son kPa o milímetros.
  const unit = spec.unit === t.units.celsius ? '°' : ` ${spec.unit}`
  const margin = estimate?.uncertainty ?? uncertainty
  const place = point.municipality ?? t.point.outsideIsland
  return {
    lead: estimate ? `${n(estimate.value, spec.decimals)}${unit}` : '—',
    leadColor: estimate ? cssColor(stops, estimate.value) : DIM,
    title: point.label ?? place,
    meta:
      (point.elevation !== null ? `${n0(point.elevation)} ${t.units.metres} · ` : '') +
      place +
      (margin !== null ? ` · ± ${n(margin, spec.decimals)} ${spec.unit}` : ''),
  }
}

function headOfSelection(
  selection: Selection,
  net: GuaguaNetwork | null,
  now: number,
): HeadContent {
  const lead = GLYPH[selection.kind]
  switch (selection.kind) {
    /**
     * La estación enseña SU temperatura, no la estimada de su punto: es una
     * medida y es lo que la distingue de tocar el mapa un metro más allá.
     */
    case 'station': {
      const s = selection.value
      return {
        lead: s.temperature !== null ? `${n(s.temperature, 1)}°` : lead,
        leadColor: s.temperature !== null ? cssColor(TEMP_STOPS, s.temperature) : AMBER,
        title: s.name,
        meta: `${t.point.measured} · ${humanAge(now - s.timeinstant)}`,
      }
    }
    case 'air': {
      const a = selection.value
      return {
        lead: a.index !== null ? n0(a.index) : lead,
        leadColor: AMBER,
        title: a.name,
        meta: a.level ? `${t.air.title} · ${a.level}` : t.air.title,
      }
    }
    case 'co2': {
      const c = selection.value
      const ppm = c.stale ? null : (c.reading?.ppm ?? null)
      return {
        lead: ppm !== null ? n0(ppm) : lead,
        leadColor: ppm !== null ? co2Band(ppm).color : DIM,
        title: c.alias ?? c.name,
        meta: ppm !== null ? `${t.units.ppm} · ${t.co2.title}` : t.co2.noData,
      }
    }
    case 'sky': {
      const s = selection.value
      return {
        lead: s.skyMagnitude !== null ? n(s.skyMagnitude, 2) : lead,
        leadColor: '#8aa4d6',
        title: s.name,
        meta: `${t.sky.magnitude} · ${t.units.magArcsec}`,
      }
    }
    case 'fire': {
      const f = selection.value
      return {
        lead,
        leadColor: f.hasAlert ? ALERT : DIM,
        title: f.name,
        meta: f.hasAlert ? t.fire.alert : t.fire.noAlert,
      }
    }
    case 'poi':
      return {
        lead,
        leadColor: AMBER,
        title: selection.value.name,
        meta: t.poi.families[selection.value.family] ?? t.poi.source,
      }
    case 'busStop':
      return {
        lead,
        leadColor: AMBER,
        title: selection.value.name,
        meta: selection.value.code
          ? `${t.guagua.stopTitle} · ${t.guagua.stopCode} ${selection.value.code}`
          : t.guagua.stopTitle,
      }
    case 'busRoute': {
      const route = net?.routes[selection.value.routeId]
      return {
        lead: route?.name ?? lead,
        leadColor: AMBER,
        title: route ? `${t.guagua.routeTitle} ${route.name}` : selection.value.routeId,
        meta: route?.longName ?? t.guagua.operator,
      }
    }
    case 'place':
      return {
        lead,
        leadColor: AMBER,
        title: selection.value.name,
        meta: t.places.kinds[selection.value.kind] ?? t.places.title,
      }
    case 'road':
      return {
        lead,
        leadColor: AMBER,
        title: selection.value.name,
        meta: selection.value.code ?? t.layers.roads,
      }
    case 'counter':
      return {
        lead,
        leadColor: AMBER,
        title: selection.value.name,
        meta: t.counters.kinds[selection.value.kind] ?? t.counters.title,
      }
  }
}

/**
 * Qué distingue una selección de otra de la misma clase. La hoja lo usa para
 * devolver la lista a su origen: sin esto, abrir una parada después de leer
 * una ficha larga empezaba a media altura de la ficha nueva.
 */
export function selectionKey(selection: Selection | null, point: ProbePoint | null): string {
  if (selection) {
    if (selection.kind === 'busRoute') return `busRoute:${selection.value.routeId}`
    const v = selection.value as { entityId?: string; id?: string | number; name?: string }
    const id = v.entityId ?? (v.id !== undefined ? String(v.id) : undefined) ?? v.name ?? ''
    return `${selection.kind}:${id}`
  }
  if (point) return `punto:${point.lon.toFixed(5)},${point.lat.toFixed(5)}`
  return 'nada'
}
