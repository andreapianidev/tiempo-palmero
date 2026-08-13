/**
 * El diagnóstico temporal de la red, traído del archivo.
 *
 * NO BLOQUEA NADA, y es deliberado. La ventana son 48 horas —tres días UTC—
 * y unos 370 KB; el mapa tiene que estar en pie mucho antes de eso. Así que se
 * pide en segundo plano y las averías aparecen unos segundos después, sobre un
 * mapa que ya funciona. Mientras no haya diagnóstico no se marca nada: la
 * aplicación no dice «esta estación está bien», dice que todavía no ha mirado.
 *
 * Se aprovecha que `/api/history` sirve el día ENTERO con todas las
 * estaciones: la red se diagnostica con tres peticiones, no con tres por
 * estación. Y los días pasados se cachean 30 días en el CDN, así que de las
 * tres solo una —la de hoy— llega de verdad al origen.
 */

import { useEffect, useMemo, useState } from 'react'
import { daysCovering, fetchDay, type DayPayload } from '../lib/history'
import { diagnoseNetwork, WINDOW_H, type Diagnosis, type Track } from '../lib/sensor-health'
import { elevationAt, type Dem } from '../lib/dem'

/** Se rehace con la misma cadencia que el resto de la aplicación. */
const REFRESH_MS = 5 * 60 * 1000

export interface SensorHealth {
  /** Diagnóstico por `entityId`. Vacío mientras no se haya podido mirar. */
  diagnoses: Map<string, Diagnosis>
  /** Cuántas estaciones se han examinado de verdad. */
  examined: number
  loading: boolean
  /** true si el archivo no ha respondido: no se marca nada, y se dice. */
  unavailable: boolean
}

const EMPTY: SensorHealth = {
  diagnoses: new Map(),
  examined: 0,
  loading: true,
  unavailable: false,
}

/**
 * Convierte los días del archivo en series por estación.
 *
 * La altitud NO viene del archivo —la API no publica ninguna— sino del DEM,
 * igual que en `buildStations`. Sin DEM no hay diagnóstico de coherencia,
 * porque el desvío se mide contra el gradiente altimétrico de la isla.
 */
export function tracksFrom(
  days: readonly DayPayload[],
  dem: Dem,
  fromMs: number,
): Track[] {
  const iT = days[0]?.columns.indexOf('temperature') ?? -1
  if (iT < 0) return []

  const merged = new Map<string, { track: Track; samples: [number, number][] }>()
  for (const payload of days) {
    const dayStart = Date.parse(`${payload.day}T00:00:00Z`)
    if (!Number.isFinite(dayStart)) continue
    for (const station of payload.stations) {
      const elevation = elevationAt(dem, station.lon, station.lat)
      if (elevation === null) continue
      let entry = merged.get(station.entityId)
      if (!entry) {
        entry = {
          track: {
            entityId: station.entityId,
            name: station.name,
            elevation,
            samples: [],
          },
          samples: [],
        }
        merged.set(station.entityId, entry)
      }
      for (const sample of station.samples) {
        const minutes = sample[0]
        // `samples` guarda el minuto en la posición 0 y los valores desplazados
        // uno, igual que en `seriesFor`.
        const value = sample[iT + 1]
        if (typeof minutes !== 'number' || typeof value !== 'number') continue
        const at = dayStart + minutes * 60_000
        if (at < fromMs) continue
        entry.samples.push([at, value])
      }
    }
  }

  const out: Track[] = []
  for (const { track, samples } of merged.values()) {
    samples.sort((a, b) => a[0] - b[0])
    out.push({ ...track, samples })
  }
  return out
}

export function useSensorHealth(dem: Dem | null, now: number): SensorHealth {
  const [days, setDays] = useState<DayPayload[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // El reloj de la aplicación avanza cada segundo; la clave de días no. Sin
  // esto el archivo se volvería a pedir en cada tick.
  const from = now - WINDOW_H * 3_600_000
  const dayKeys = daysCovering(from, now).join(',')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    Promise.all(
      dayKeys
        .split(',')
        .map((day) => fetchDay(day, { signal: controller.signal }).catch(() => null)),
    ).then((payloads) => {
      if (cancelled) return
      const ok = payloads.filter((p): p is DayPayload => p !== null)
      // Que falle un día suelto no invalida el diagnóstico: se hace con lo que
      // haya y la ventana queda más corta. Que fallen todos sí.
      setUnavailable(ok.length === 0)
      setDays(ok.length ? ok : null)
    })

    const id = setInterval(() => {
      // Solo el día en curso cambia; los anteriores los sirve la caché.
      fetchDay(dayKeys.split(',').at(-1) as string)
        .then((fresh) => {
          if (cancelled) return
          setDays((prev) =>
            prev ? [...prev.filter((p) => p.day !== fresh.day), fresh] : [fresh],
          )
        })
        .catch(() => {
          /* se conserva lo que ya hubiera */
        })
    }, REFRESH_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [dayKeys])

  return useMemo(() => {
    if (!dem || !days) return { ...EMPTY, unavailable }
    const tracks = tracksFrom(days, dem, from)
    if (!tracks.length) return { ...EMPTY, loading: false, unavailable }
    return {
      diagnoses: diagnoseNetwork(tracks),
      examined: tracks.length,
      loading: false,
      unavailable: false,
    }
    // `from` se mueve con el reloj; recalcular el diagnóstico cada segundo no
    // aporta nada, así que se ancla a la clave de días como la descarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dem, days, dayKeys, unavailable])
}
