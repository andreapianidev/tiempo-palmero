/**
 * La línea de estado del móvil dice lo mismo que el escritorio.
 *
 * La prueba que importa aquí no es «¿sale un número?», sino «¿sale el MISMO
 * número que enseña `ModelStatus` con los mismos datos?». La cadena es una sola
 * —`t.model.stationsUsed`— y dos pantallas que la rellenan de sitios distintos
 * es exactamente el fallo que este fichero existe para no repetir: durante unas
 * horas el móvil contó `model.used`, que incluye las anclas de Open-Meteo y la
 * cumbre del TNG, y podía anunciar más «estaciones activas» de las que había.
 */

import { describe, expect, it } from 'vitest'
import { buildStatus } from './status'
import type { InterpolableVariable, Model } from '../../lib/interpolate'
import type { NetworkCensus } from '../../lib/quality'
import { t } from '../../i18n'

/** El censo del fixture del 13 ago 2026: 36 utilizables de 52 registradas. */
const CENSUS: NetworkCensus = {
  total: 52,
  usable: 36,
  droppedStale: 12,
  droppedImplausible: 1,
  droppedOffIsland: 1,
  droppedNoMetric: 2,
  dropped: [],
}

/**
 * Un modelo como el de producción: 32 estaciones del Cabildo que sobreviven al
 * rechazo, más 4 anclas de Open-Meteo y la cumbre. 37 muestras, y ninguna de
 * esas cinco últimas es una «estación activa» del Cabildo.
 */
function modelWith(cabildo: number, anchors: number, summit: number): Model {
  const used = [
    ...Array.from({ length: cabildo }, () => ({ source: 'cabildo' })),
    ...Array.from({ length: anchors }, () => ({ source: 'openmeteo' })),
    ...Array.from({ length: summit }, () => ({ source: 'cabildo' })),
  ]
  return { used } as unknown as Model
}

function models(model: Model | null): Record<InterpolableVariable, Model | null> {
  return {
    temperature: model,
    relativehumidity: null,
  } as unknown as Record<InterpolableVariable, Model | null>
}

const BASE = {
  models: models(modelWith(32, 4, 1)),
  census: CENSUS,
  loading: false,
  upstreamError: null,
  locating: false,
  locationDenied: false,
}

describe('buildStatus', () => {
  it('cuenta las estaciones del censo, no las muestras del modelo', () => {
    const [first] = buildStatus(BASE)
    expect(first.text).toBe(t.model.stationsUsed(36, 52))
    expect(first.strong).toBe(true)
  })

  it('no deja que las anclas ni la cumbre inflen el numerador', () => {
    // 37 muestras en el modelo y 36 estaciones utilizables: si el numerador
    // saliera del modelo, la app anunciaría más estaciones activas que las que
    // publican. Con 60 anclas seguiría diciendo 36.
    const inflated = buildStatus({ ...BASE, models: models(modelWith(32, 60, 1)) })
    expect(inflated[0].text).toBe(t.model.stationsUsed(36, 52))
  })

  it('sin censo no se inventa una cifra', () => {
    const status = buildStatus({ ...BASE, census: null })
    expect(status).toEqual([{ text: t.loading.stations }])
  })

  it('una caída del origen tapa el recuento', () => {
    // Con el servicio caído, el recuento de hace cinco minutos no dice nada.
    const status = buildStatus({ ...BASE, upstreamError: 'HTTP 502' })
    expect(status).toEqual([{ text: t.errors.upstreamDown, strong: true }])
  })

  it('el estado del GPS va al final, y solo cuando hay algo que decir', () => {
    expect(buildStatus(BASE).map((p) => p.text)).toEqual([
      t.model.stationsUsed(36, 52),
      t.mobile.live,
    ])
    expect(buildStatus({ ...BASE, locating: true }).at(-1)?.text).toBe(t.mobile.locating)
    expect(buildStatus({ ...BASE, locationDenied: true }).at(-1)?.text).toBe(
      t.mobile.noLocation,
    )
    // Buscando manda sobre denegada: es lo que está pasando ahora mismo.
    expect(
      buildStatus({ ...BASE, locating: true, locationDenied: true }).at(-1)?.text,
    ).toBe(t.mobile.locating)
  })
})
