/**
 * La capa experimental de incendios, a demanda.
 *
 * Son 134 KB entre el PNG de la cartografía y el JSON del modelo, más una
 * petición al archivo de lluvia. No se piden al arrancar: la inmensa mayoría de
 * las visitas vienen a mirar qué temperatura hace, y esta capa está detrás de
 * una sección plegada que hay que abrir a conciencia.
 *
 * Apagarla no tira lo descargado. Volver a encenderla es lo más probable que
 * puede pasar después de apagarla, y el modelo no cambia entre una cosa y la
 * otra.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDrought, type DroughtField } from '../lib/fire/fetch'
import { loadFireStatic, type FireStatic } from '../lib/fire/static'

export interface FireRiskState {
  statics: FireStatic | null
  drought: DroughtField | null
  loading: boolean
  /** El modelo no llegó. No se pinta nada y se dice. */
  failed: boolean
  /**
   * El archivo de lluvia no llegó, pero el modelo sí. El índice sigue
   * calculándose con la mitad que sale de las estaciones, y la interfaz avisa
   * de que le falta la sequía en vez de rellenarla con un valor cualquiera.
   */
  droughtFailed: boolean
}

export function useFireRisk(enabled: boolean): FireRiskState {
  const [statics, setStatics] = useState<FireStatic | null>(null)
  const [drought, setDrought] = useState<DroughtField | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [droughtFailed, setDroughtFailed] = useState(false)
  // En una `ref` y no en estado: marcarlo no debe provocar otro render.
  const askedStatic = useRef(false)
  const askedDrought = useRef(false)

  useEffect(() => {
    if (!enabled || askedStatic.current) return
    askedStatic.current = true
    setLoading(true)
    setFailed(false)
    let cancelled = false

    loadFireStatic()
      .then((s) => {
        if (!cancelled) setStatics(s)
      })
      .catch(() => {
        // Se desmarca para que volver a encender la capa reintente. Un fallo de
        // red no puede dejar la función rota hasta que alguien recargue.
        askedStatic.current = false
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || askedDrought.current) return
    askedDrought.current = true
    const controller = new AbortController()

    fetchDrought(controller.signal)
      .then((d) => {
        if (d) setDrought(d)
        else {
          askedDrought.current = false
          setDroughtFailed(true)
        }
      })
      .catch(() => {
        askedDrought.current = false
        // Un aborto no es un fallo: es que la capa se apagó mientras cargaba.
        if (!controller.signal.aborted) setDroughtFailed(true)
      })

    return () => controller.abort()
  }, [enabled])

  return useMemo(
    () => ({ statics, drought, loading, failed, droughtFailed }),
    [statics, drought, loading, failed, droughtFailed],
  )
}
