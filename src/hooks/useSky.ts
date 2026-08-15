/**
 * El cielo de la escena 3D: descarga la rejilla y construye las nubes.
 *
 * Vive fuera de `useIslandData` por lo mismo que el viento: ese hook ya coordina
 * siete fuentes y pasa de 500 líneas, y esto es otra responsabilidad con su
 * propia fuente, su propio ritmo y su propia forma de fallar.
 *
 * SOLO PIDE CUANDO ESTÁ ENCENDIDO. La escena es una función experimental que
 * arranca apagada, así que quien no la use no gasta ni una petición: sin `on`,
 * este hook no llama a nadie. Es la misma regla que ya siguen las secciones que
 * cuestan dinero —el Roque, la ETo, los senderos—, y aquí importa porque la
 * petición son 70 puntos con once variables cada uno.
 *
 * LA ESCENA SE RECONSTRUYE CON EL DATO, NO CON EL RELOJ. La semilla del azar es
 * la hora de la pasada del modelo, así que mientras no llegue una pasada nueva
 * las nubes son las mismas y solo se mueven. Sin eso, cada repintado de React
 * rebarajaría las siluetas y la isla parpadearía.
 */

import { useEffect, useMemo, useState } from 'react'
import { fetchSkyGrid, skyGridPoints, type SkyGrid } from '../lib/sky/model'
import { lowDeck, type LowDeckSource } from '../lib/sky/decks'
import { buildCloudScene, type Cloud } from '../lib/sky/scene'
import type { CloudDeck } from '../lib/clouds'

export interface SkyState {
  grid: SkyGrid | null
  /** Las nubes ya colocadas. Las mueve la capa, no este hook. */
  clouds: Cloud[]
  /** Cota de la capa baja y de dónde sale, para que el panel lo declare. */
  lowBase: number
  lowTop: number
  lowSource: LowDeckSource
  loading: boolean
  failed: boolean
}

export function useSky(
  on: boolean,
  /** La manta diagnosticada por los sondeos, si la hay. Pone la cota. */
  deck: CloudDeck | null,
  /** Nivel de condensación por ascenso, m. El relevo cuando no hay manta. */
  lclM: number | null,
  refreshKey: number | null,
): SkyState {
  const [grid, setGrid] = useState<SkyGrid | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!on) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)

    fetchSkyGrid(skyGridPoints(), controller.signal)
      .then((r) => {
        if (cancelled) return
        setGrid(r)
        setFailed(r.samples.length === 0)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [on, refreshKey])

  const band = useMemo(() => lowDeck(deck, lclM), [deck, lclM])

  const clouds = useMemo(() => {
    if (!on || !grid) return []
    // La semilla es la hora de la pasada. Ver la cabecera.
    return buildCloudScene(grid.samples, band, grid.observedAt || 1)
  }, [on, grid, band])

  return {
    grid,
    clouds,
    lowBase: band.base,
    lowTop: band.top,
    lowSource: band.source,
    loading,
    failed,
  }
}
