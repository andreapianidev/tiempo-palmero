/**
 * Los planetas de esta noche: la tabla, dónde están y cuáles se ven.
 *
 * VA APARTE DE `useNightSky` porque es otra descarga y otra decisión. El
 * catálogo de estrellas son 133 KB y la tabla de planetas 36, y quien encienda
 * el cielo estrellado no tiene por qué pagar los dos: son dos casillas.
 *
 * SE PIDE UNA VEZ Y SE QUEDA. La tabla cubre diez años, así que no hay nada que
 * refrescar: apagar y encender no vuelve a descargarla.
 *
 * FALLA EN ABIERTO. Sin tabla no hay planetas y el panel dice por qué; el resto
 * de la escena nocturna sigue funcionando entera. Y si el reloj se sale de la
 * ventana de la tabla —del 1 de enero de 2026 al 1 de enero de 2036— tampoco se
 * dibuja nada, que es lo correcto: extrapolar un Chebyshev da posiciones
 * enormes con toda confianza. Ver `lib/planets/table.ts`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPlanetTable,
  VISIBLE_PLANETS,
  type PlanetTable,
} from '../lib/planets/table'
import { planetSight, type PlanetSight } from '../lib/planets/sight'
import type { PlanetSceneState } from '../components/planets/PlanetLayer'
import { airMass } from '../lib/shadow/depth'

export interface PlanetsObserver {
  lon: number
  lat: number
  elevationM: number
  pressureHpa: number | null
  temperatureC: number | null
}

/** Lo que la escena nocturna ya ha calculado y aquí no se vuelve a calcular. */
export interface PlanetsSky {
  limitMag: number
  extinctionK: number
  floorDeg: number
  density: number
}

export interface PlanetsState {
  loading: boolean
  /** Motivo por el que no hay tabla, si no la hay. */
  failed: string | null
  table: PlanetTable | null
  /** Fuera de la ventana de la tabla: no hay efemérides para esta fecha. */
  outOfRange: boolean
  /**
   * Todos los de la tabla, con su posición y su brillo. Ordenados por altura,
   * el más alto primero: es el orden en que alguien los buscaría en el cielo.
   */
  all: PlanetSight[]
  /**
   * Los que de verdad se ven ahora: por encima del horizonte del observador y
   * por encima de la magnitud límite de esta noche.
   */
  visible: PlanetSight[]
  /** Lo que la capa necesita. `null` sin tabla. */
  scene: PlanetSceneState | null
}

export function usePlanets(
  enabled: boolean,
  now: number,
  observer: PlanetsObserver,
  sky: PlanetsSky,
): PlanetsState {
  const [table, setTable] = useState<PlanetTable | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * SE INTENTA UNA VEZ, y el «ya se ha intentado» vive en una ref y no en el
   * estado. Con `loading` en las dependencias, el render que provoca
   * `setLoading(true)` dispara la limpieza del propio efecto, `alive` se pone a
   * `false` y la descarga terminada no guarda nada: el panel se queda en
   * «Descargando…» para siempre con la red devolviendo 200. Le pasó al catálogo
   * de estrellas en producción; el mecanismo entero está escrito en
   * `useNightSky.ts`.
   */
  const attempted = useRef(false)
  useEffect(() => {
    if (!enabled) {
      attempted.current = false
      return
    }
    if (attempted.current || table) return
    attempted.current = true
    let alive = true
    setLoading(true)
    fetchPlanetTable()
      .then((t) => {
        if (!alive) return
        setTable(t)
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setFailed(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled, table])

  return useMemo<PlanetsState>(() => {
    const outOfRange = !!table && (now < table.startMs || now > table.endMs)
    const all: PlanetSight[] = []
    if (table && !outOfRange) {
      for (const id of VISIBLE_PLANETS) {
        const sight = planetSight(table, id, now, {
          lon: observer.lon,
          lat: observer.lat,
          elevationM: observer.elevationM,
          pressureHpa: observer.pressureHpa ?? undefined,
          temperatureC: observer.temperatureC ?? undefined,
        })
        if (sight) all.push(sight)
      }
      all.sort((a, b) => b.apparentElevationDeg - a.apparentElevationDeg)
    }

    // «Se ve» es el MISMO criterio que la capa dibuja, y por eso sale de las
    // mismas dos cifras: el horizonte del observador y la magnitud límite de
    // esta noche. Con la extinción puesta, que es lo que hace que un planeta
    // bajo se apague antes que uno alto.
    const visible = all.filter(
      (p) =>
        p.apparentElevationDeg > sky.floorDeg &&
        // `airMass` es la de Kasten y Young que ya usan el sol, la luna y el
        // sombreador de las estrellas. Vive en `shadow/depth.ts` por dónde se
        // escribió primero, y se importa en vez de copiarse: tres líneas
        // duplicadas son dos cielos que pueden discrepar.
        p.magnitude + sky.extinctionK * airMass(p.apparentElevationDeg) <= sky.limitMag,
    )

    return {
      loading,
      failed,
      table,
      outOfRange,
      all,
      visible,
      scene: table
        ? {
            lon: observer.lon,
            lat: observer.lat,
            limitMag: sky.limitMag,
            extinctionK: sky.extinctionK,
            floorDeg: sky.floorDeg,
            density: sky.density,
          }
        : null,
    }
  }, [
    failed,
    loading,
    now,
    observer.elevationM,
    observer.lat,
    observer.lon,
    observer.pressureHpa,
    observer.temperatureC,
    sky.density,
    sky.extinctionK,
    sky.floorDeg,
    sky.limitMag,
    table,
  ])
}
