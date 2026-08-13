/**
 * Histórico de una estación: 24 horas o 7 días.
 *
 * Es lo único de la aplicación que mira hacia atrás. El resto contesta «cuánto
 * hace ahora»; esto contesta «cuánto ha apretado hoy», que es otra pregunta y
 * necesita máxima, mínima y la hora a la que ocurrieron.
 *
 * Se carga SOLO al abrirlo. Un día son 124 KB y la mayoría de quien abre el
 * panel de una estación quiere la lectura de ahora, no la curva.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  coverage,
  daysCovering,
  extremes,
  fetchDay,
  seriesFor,
  sliceWindow,
  type DayPayload,
  type SeriesPoint,
  type SeriesVariable,
} from '../lib/history'
import { formatIslandTime } from '../lib/cabildo'
import { LineChart } from './chart/LineChart'
import { n } from '../i18n'

type Range = '24h' | '7d'

const RANGES: { id: Range; label: string; hours: number; hourly: boolean }[] = [
  { id: '24h', label: '24 horas', hours: 24, hourly: false },
  { id: '7d', label: '7 días', hours: 24 * 7, hourly: true },
]

const VARIABLES: { id: SeriesVariable; label: string; unit: string; color: string; decimals: number }[] = [
  { id: 'temperature', label: 'Temperatura', unit: '°C', color: '#e2b45c', decimals: 1 },
  { id: 'relativehumidity', label: 'Humedad', unit: '%', color: '#6fb3d2', decimals: 0 },
  { id: 'dewpoint', label: 'Punto de rocío', unit: '°C', color: '#8fbf7f', decimals: 1 },
  { id: 'windspeed', label: 'Viento', unit: 'km/h', color: '#c9a0dc', decimals: 1 },
]

interface Props {
  entityId: string
  /** Ahora, en epoch ms. Se recibe para no tener dos relojes en la pantalla. */
  now: number
}

export function StationHistory({ entityId, now }: Props) {
  /**
   * ABIERTO DE ENTRADA, y no plegado como estaba.
   *
   * La serie es lo que decide si una cifra rara es tiempo o es avería —justo
   * la pregunta que trae a alguien a tocar una estación—, y detrás de un
   * botón no se hacía. El coste es una petición al archivo por ficha abierta;
   * el archivo se sirve por día y con caché de CDN, así que la segunda ficha
   * de la misma sesión ya no baja nada.
   */
  const [open, setOpen] = useState(true)
  const [range, setRange] = useState<Range>('24h')
  const [variable, setVariable] = useState<SeriesVariable>('temperature')
  const [days, setDays] = useState<DayPayload[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = RANGES.find((r) => r.id === range) ?? RANGES[0]
  const from = now - config.hours * 3_600_000

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)

    // Cada día es una petición independiente y cacheada por separado en el
    // CDN: al pasar de 24 h a 7 días solo se descargan los seis que faltan.
    const wanted = daysCovering(from, now)
    Promise.all(
      wanted.map((day) =>
        fetchDay(day, { hourly: config.hourly, signal: controller.signal }).catch(() => null),
      ),
    )
      .then((payloads) => {
        if (cancelled) return
        const ok = payloads.filter((p): p is DayPayload => p !== null)
        setDays(ok)
        // Que falle algún día suelto es normal —el origen se cae a ratos— y la
        // gráfica se dibuja con lo que haya. Que fallen todos es otra cosa.
        setError(ok.length ? null : 'El histórico del Cabildo no responde ahora mismo.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // `now` cambia con el reloj de la aplicación; la clave de días no.
  }, [open, entityId, config.hourly, daysCovering(from, now).join(',')])

  const points = useMemo(() => {
    const all = seriesFor(days, entityId)
    return sliceWindow(all, from, now)
  }, [days, entityId, from, now])

  const active = VARIABLES.find((v) => v.id === variable) ?? VARIABLES[0]
  const chartPoints = useMemo(
    () => points.map((p: SeriesPoint) => ({ x: p.at, y: p[active.id] })),
    [points, active.id],
  )
  const ext = extremes(points, active.id)
  // La cadencia real de la red ronda los 10 minutos; en la vista semanal el
  // endpoint ya devuelve medias horarias.
  const cadenceMin = config.hourly ? 60 : 10
  const cover = coverage(points, active.id, from, now, cadenceMin)

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
        <span>Evolución</span>
        {/* Mientras baja el archivo, el estado se dice AQUÍ además de en el
            cuerpo: plegado o no, la cabecera es lo que se está mirando. */}
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

          {loading && (
            <p className="dim small history-loading">
              <span className="spinner" aria-hidden /> Descargando el archivo del Cabildo…
            </p>
          )}
          {error && <p className="warn small">{error}</p>}

          {!loading && !error && (
            <>
              <LineChart
                points={chartPoints}
                domain={[from, now]}
                color={active.color}
                unit={active.unit}
                formatX={fmtX}
                formatY={fmtY}
                // Dos veces la cadencia: por debajo de eso es una muestra que
                // faltó, por encima es que la estación estuvo callada.
                gapMs={cadenceMin * 2 * 60_000}
                ariaLabel={`${active.label}, últimas ${config.label}`}
              />

              {ext && (
                <table className="kv">
                  <tbody>
                    <tr>
                      <td>Máxima</td>
                      <td className="mono">
                        {n(ext.max.value, active.decimals)} {active.unit}
                        <span className="dim"> · {formatIslandTime(ext.max.at)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Mínima</td>
                      <td className="mono">
                        {n(ext.min.value, active.decimals)} {active.unit}
                        <span className="dim"> · {formatIslandTime(ext.min.at)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Una serie con agujeros dibuja una línea con la misma pinta que
                  una completa. Si falta más de un quinto del intervalo, se dice:
                  la forma de la curva no puede ser el único aviso. */}
              {cover < 0.8 && (
                <p className="note small">
                  Esta estación solo transmitió el {n(cover * 100, 0)} % del intervalo. La curva
                  dibuja lo que envió, no lo que pasó en los huecos.
                </p>
              )}
              {!ext && (
                <p className="dim small">
                  Esta estación no publicó {active.label.toLowerCase()} en este intervalo.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
