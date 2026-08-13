/**
 * El sondeo de cobertura, pedido solo si alguien lo mira.
 *
 * Son 105 KB que no alimentan ningún cálculo del resto de la aplicación: la
 * misma regla que las guaguas y los aforos. Mientras la variable elegida no
 * sea la cobertura, aquí no se descarga nada.
 *
 * Y una vez pedido, no caduca: es un fichero de 2013. No hay refresco que
 * valga porque no hay nada que refrescar.
 */

import { useEffect, useMemo, useState } from 'react'
import { fetchLayer } from '../lib/api'
import { buildCoverageField, type CoverageField } from '../lib/coverage/field'

export interface CoverageState {
  field: CoverageField | null
  loading: boolean
  /** El fichero no llegó. No se pinta nada y se dice. */
  failed: boolean
}

export function useCoverage(enabled: boolean): CoverageState {
  const [raw, setRaw] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || raw !== null) return
    let cancelled = false
    setLoading(true)
    fetchLayer('cobertura-movil.geojson')
      .then((fc) => {
        if (cancelled) return
        setRaw(fc ?? null)
        setFailed(fc === null)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, raw])

  const field = useMemo(() => (raw ? buildCoverageField(raw) : null), [raw])
  return { field, loading, failed }
}
