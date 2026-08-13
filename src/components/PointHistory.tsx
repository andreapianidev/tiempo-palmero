/**
 * La curva de las últimas 24 h o 7 días en un punto CUALQUIERA de la isla.
 *
 * Hermana de `StationHistory`, y deliberadamente distinta en una cosa: aquélla
 * dibuja lo que un sensor midió, ésta dibuja lo que el modelo estima. Por eso
 * lleva banda de incertidumbre y una nota que lo dice, y por eso la curva es de
 * trazo discontinuo. Que las dos se vean parecidas no significa que sean lo
 * mismo, y la interfaz no puede dejar que se confundan.
 *
 * Nace ABIERTA, igual que la de estación. Estuvo cerrada con el argumento de que
 * el archivo de un día son 124 KB y que quien pincha un punto quiere el dato de
 * ahora; pero quien pincha un punto quiere saber si eso que marca es mucho o
 * poco para la hora que es, y eso solo lo contesta la curva. Cerrada, la
 * respuesta estaba detrás de un clic que casi nadie daba —y la de estación ya
 * nacía abierta, así que las dos fichas hermanas se comportaban distinto sin
 * ninguna razón—. El coste está acotado por el CDN: `/api/history` sirve los
 * días terminados con `s-maxage` de 30 días y el de hoy con 300 s, así que la
 * petición casi nunca llega al Cabildo.
 */

import { useEffect, useMemo, useState } from 'react'
import { daysCovering, fetchDay, type DayPayload } from '../lib/history'
import { bucketize, fieldSeries, type FieldPoint } from '../lib/history-field'
import type { InterpolableVariable } from '../lib/interpolate'
import { formatIslandTime } from '../lib/cabildo'
import { elevationAt, type Dem } from '../lib/dem'
import { LineChart } from './chart/LineChart'
import { n, t } from '../i18n'

type Range = '24h' | '7d'

/**
 * El paso de reconstrucción.
 *
 * En 24 h se rehace el modelo cada 30 min —48 ajustes completos, unos 30 ms— y
 * en 7 días cada 3 h, que son 56. Bajar el paso no añade información: la red
 * publica cada 10–60 min según la familia y por debajo de eso se estaría
 * dibujando el ruido del redondeo.
 */
const STEP_MIN: Record<Range, number> = { '24h': 30, '7d': 180 }

const RANGES: { id: Range; label: string; hours: number }[] = [
  { id: '24h', label: '24 horas', hours: 24 },
  { id: '7d', label: '7 días', hours: 24 * 7 },
]

const VARIABLES: {
  id: InterpolableVariable
  label: string
  unit: string
  color: string
  decimals: number
}[] = [
  { id: 'temperature', label: 'Temperatura', unit: '°C', color: '#e2b45c', decimals: 1 },
  { id: 'relativehumidity', label: 'Humedad', unit: '%', color: '#6fb3d2', decimals: 0 },
]

interface Props {
  lon: number
  lat: number
  elevation: number
  dem: Dem | null
  /** Averiadas: no participan en la reconstrucción, igual que no lo hacen hoy. */
  excluded: ReadonlySet<string>
  now: number
}

export function PointHistory({ lon, lat, elevation, dem, excluded, now }: Props) {
  const [open, setOpen] = useState(true)
  const [range, setRange] = useState<Range>('24h')
  const [variable, setVariable] = useState<InterpolableVariable>('temperature')
  const [days, setDays] = useState<DayPayload[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = RANGES.find((r) => r.id === range) ?? RANGES[0]
  const from = now - config.hours * 3_600_000
  const dayKeys = daysCovering(from, now).join(',')

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(
      dayKeys
        .split(',')
        .map((day) =>
          fetchDay(day, { signal: controller.signal }).catch(() => null),
        ),
    )
      .then((payloads) => {
        if (cancelled) return
        const ok = payloads.filter((p): p is DayPayload => p !== null)
        setDays(ok)
        setError(ok.length ? null : t.pointHistory.unavailable)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, dayKeys])

  const series: FieldPoint[] = useMemo(() => {
    if (!dem || !days.length) return []
    const lookup = (x: number, y: number) => elevationAt(dem, x, y)
    const buckets = bucketize(days, lookup, STEP_MIN[range], excluded)
    return fieldSeries(buckets, variable, lon, lat, elevation).filter(
      (p) => p.at >= from && p.at <= now,
    )
    // `now` avanza cada segundo; recalcular 48 ajustes por tick no aporta nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dem, days, range, variable, lon, lat, elevation, excluded, dayKeys])

  const active = VARIABLES.find((v) => v.id === variable) ?? VARIABLES[0]
  const chartPoints = useMemo(
    () => series.map((p) => ({ x: p.at, y: p.value })),
    [series],
  )

  const band = useMemo(() => {
    if (!series.length) return null
    const worst = Math.max(...series.map((p) => p.uncertainty))
    const mean = series.reduce((s, p) => s + p.uncertainty, 0) / series.length
    return { worst, mean }
  }, [series])

  const extremes = useMemo(() => {
    if (!series.length) return null
    let min = series[0]
    let max = series[0]
    for (const p of series) {
      if (p.value < min.value) min = p
      if (p.value > max.value) max = p
    }
    return { min, max }
  }, [series])

  const fmtY = (y: number) => n(y, active.decimals)
  const fmtX = (x: number) =>
    range === '24h'
      ? formatIslandTime(x).slice(-5)
      : new Date(x).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          timeZone: 'Atlantic/Canary',
        })

  return (
    <section className="history">
      <button
        type="button"
        className="history-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t.pointHistory.title}</span>
        {/* Con la ficha recién abierta el cuerpo tarda un segundo en tener
            curva, y el rótulo «ocultar» sobre un hueco blanco se lee como que
            no hay nada. Lo mismo que hace la ficha de estación. */}
        <span className="dim small">
          {loading ? 'cargando…' : open ? 'ocultar' : 'ver 24 h / 7 días'}
        </span>
      </button>

      {open && (
        <div className="history-body">
          <div className="history-controls">
            <div className="seg" role="group" aria-label="Intervalo">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={r.id === range ? 'on' : ''}
                  aria-pressed={r.id === range}
                  onClick={() => setRange(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Variable">
              {VARIABLES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={v.id === variable ? 'on' : ''}
                  aria-pressed={v.id === variable}
                  onClick={() => setVariable(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {loading && <p className="dim small">{t.pointHistory.rebuilding}</p>}
          {error && <p className="warn small">{error}</p>}

          {!loading && !error && series.length > 0 && (
            <>
              <div className="chart-estimated">
                <LineChart
                  points={chartPoints}
                  domain={[from, now]}
                  color={active.color}
                  unit={active.unit}
                  formatX={fmtX}
                  formatY={fmtY}
                  // Un hueco es un instante en que la red no daba para ajustar
                  // nada. Se deja como hueco: unir esos extremos con una recta
                  // sería inventar justo donde no se sabe.
                  gapMs={STEP_MIN[range] * 2.5 * 60_000}
                  ariaLabel={`${active.label} estimada, últimas ${config.label}`}
                />
              </div>

              <table className="kv">
                <tbody>
                  {extremes && (
                    <>
                      <tr>
                        <td>{t.pointHistory.max}</td>
                        <td className="mono">
                          {n(extremes.max.value, active.decimals)} {active.unit}
                          <span className="dim"> · {formatIslandTime(extremes.max.at)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td>{t.pointHistory.min}</td>
                        <td className="mono">
                          {n(extremes.min.value, active.decimals)} {active.unit}
                          <span className="dim"> · {formatIslandTime(extremes.min.at)}</span>
                        </td>
                      </tr>
                    </>
                  )}
                  {band && (
                    <tr title={t.pointHistory.bandHint}>
                      <td>{t.pointHistory.band}</td>
                      <td className="mono">
                        ±{n(band.mean, 1)} {active.unit}
                        <span className="dim"> · máx ±{n(band.worst, 1)}</span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>{t.pointHistory.rebuilt}</td>
                    <td className="mono">{t.pointHistory.fits(series.length)}</td>
                  </tr>
                </tbody>
              </table>

              <p className="note small">{t.pointHistory.note}</p>
              {series.some((p) => p.elevationExtrapolated) && (
                <p className="warn small">{t.pointHistory.aboveCeiling}</p>
              )}
            </>
          )}

          {!loading && !error && series.length === 0 && days.length > 0 && (
            <p className="dim small">{t.pointHistory.tooFewStations}</p>
          )}
        </div>
      )}
    </section>
  )
}
