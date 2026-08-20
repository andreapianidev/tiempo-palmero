/**
 * Los planetas de esta noche: las efemérides, dónde están y cuáles se ven.
 *
 * VA APARTE DE `useNightSky` porque es otra descarga y otra decisión. El
 * catálogo de estrellas son 133 KB y las efemérides 19,61, y quien encienda el
 * cielo estrellado no tiene por qué pagar las dos: son dos casillas.
 *
 * LA DESCARGA ES CÓDIGO, NO DATOS, y por eso este efecto es un `import()` y no
 * un `fetch`. Aquí se descargaba `planetas.bin`, una tabla de Chebyshev de
 * 35,85 KB comprimidos con fecha de caducidad; ahora se carga el fragmento de
 * `astronomy-engine`, que pesa 19,61 y no caduca. El porqué entero, con las dos
 * cifras medidas contra este build, está en `lib/planets/ephemeris.ts`.
 *
 * SE PIDE UNA VEZ Y SE QUEDA: apagar y encender no vuelve a cargarlo.
 *
 * FALLA EN ABIERTO. Sin efemérides no hay planetas y el panel dice por qué; el
 * resto de la escena nocturna sigue funcionando entera. Lo que ya no puede
 * pasar es quedarse sin fecha: la ventana de diez años se fue con la tabla.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadPlanetEphemeris,
  VISIBLE_PLANETS,
  type PlanetEphemeris,
} from '../lib/planets/ephemeris'
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
  /** Motivo por el que no hay efemérides, si no las hay. */
  failed: string | null
  ephemeris: PlanetEphemeris | null
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
  /** Lo que la capa necesita. `null` sin efemérides. */
  scene: PlanetSceneState | null
}

export function usePlanets(
  enabled: boolean,
  now: number,
  observer: PlanetsObserver,
  sky: PlanetsSky,
): PlanetsState {
  const [eph, setEph] = useState<PlanetEphemeris | null>(null)
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
    if (attempted.current || eph) return
    attempted.current = true
    let alive = true
    setLoading(true)
    loadPlanetEphemeris()
      .then((e) => {
        if (!alive) return
        setEph(() => e)
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
  }, [enabled, eph])

  return useMemo<PlanetsState>(() => {
    const all: PlanetSight[] = []
    if (eph) {
      for (const id of VISIBLE_PLANETS) {
        all.push(
          planetSight(eph, id, now, {
            lon: observer.lon,
            lat: observer.lat,
            elevationM: observer.elevationM,
            pressureHpa: observer.pressureHpa ?? undefined,
            temperatureC: observer.temperatureC ?? undefined,
          }),
        )
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
      ephemeris: eph,
      all,
      visible,
      scene: eph
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
    eph,
  ])
}
