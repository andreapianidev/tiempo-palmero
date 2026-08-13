/**
 * Lo agrario: demanda de agua del día y qué se cultiva en cada municipio.
 *
 * Dos fuentes con dos ritmos muy distintos y por eso un solo hook las coordina
 * sin mezclarlas: la ETo es del modelo y cambia con la pasada; el resumen de
 * cultivos es un fichero congelado en el build a partir de una capa de 2008 y
 * no va a cambiar en toda la vida de la sesión, así que se pide una vez.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Dem } from '../lib/dem'
import { dataUrl } from '../lib/endpoints'
import { fetchEto, modelGridPoints, type EtoField } from '../lib/agro/eto'

export interface CropSummaryMunicipality {
  codmun: number
  municipio: string
  families: Record<string, { parcels: number; hectares: number }>
  parcels: number
  hectares: number
}

export interface CropSummary {
  year: number
  source: string
  note: string
  totals: { parcels: number; hectares: number }
  municipios: CropSummaryMunicipality[]
}

export interface AgroState {
  eto: EtoField | null
  etoFailed: boolean
  crops: CropSummary | null
}

/** La ETo es un total DIARIO: repetirla cada cinco minutos no la mueve. */
const ETO_REFRESH_MS = 60 * 60 * 1000

export function useAgro(dem: Dem | null, enabled: boolean): AgroState {
  const [eto, setEto] = useState<EtoField | null>(null)
  const [etoFailed, setEtoFailed] = useState(false)
  const [crops, setCrops] = useState<CropSummary | null>(null)

  // Los 54 puntos son los MISMOS que los del campo de viento, así que se
  // recalculan sólo cuando cambia el DEM, no en cada render.
  const points = useMemo(() => (dem ? modelGridPoints(dem) : []), [dem])

  useEffect(() => {
    if (!enabled || !points.length) return
    const controller = new AbortController()
    let alive = true

    const load = async () => {
      try {
        const field = await fetchEto(points, controller.signal)
        if (!alive) return
        setEto(field)
        setEtoFailed(field === null)
      } catch {
        // Sin ETo la sección lo dice y el resto sigue. No hay reintento en
        // bucle: el siguiente ciclo de una hora lo volverá a intentar solo.
        if (alive) setEtoFailed(true)
      }
    }

    load()
    const id = setInterval(load, ETO_REFRESH_MS)
    return () => {
      alive = false
      controller.abort()
      clearInterval(id)
    }
  }, [points, enabled])

  useEffect(() => {
    if (!enabled || crops) return
    const controller = new AbortController()
    let alive = true

    fetch(dataUrl('/layers/cultivos-resumen.json'), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setCrops(d as CropSummary)
      })
      .catch(() => {
        // Un fichero estático que falla es un despliegue roto, no un caso de
        // uso. La sección se queda sin la tabla y no dice nada más.
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [enabled, crops])

  return { eto, etoFailed, crops }
}
