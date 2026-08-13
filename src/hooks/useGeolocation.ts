/**
 * Dónde está el teléfono, y qué se hace con ello.
 *
 * Se pregunta UNA sola vez al abrir, y solo cuando `ready` dice que ya hay DEM
 * y modelo: sin altitud no hay corrección altimétrica y sin modelo no hay nada
 * que estimar, así que preguntar antes daría una aguja puesta sobre una ficha
 * vacía. Lo que se hace con la respuesta es dejarla escrita en la cabecera de
 * la hoja —`onFix` la recibe con `auto: true`— y nada más: ni se vuela hacia
 * ella ni se sube la hoja. Acercarse a la ubicación antes de que a nadie le
 * haya dado tiempo a mirar la isla es quitarle a la app lo primero que enseña.
 *
 * Con el botón sí se vuela, porque ahí sí se ha pedido.
 *
 * Sin ubicación la app entera sigue funcionando: es un atajo, no un requisito.
 * Por eso un rechazo no abre ningún diálogo — se dice en la línea de estado de
 * la cabecera y se acabó.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GeoFix {
  lon: number
  lat: number
  /** Vino del arranque, no de un botón: no se vuela ni se sube la hoja. */
  auto: boolean
}

export interface GeolocationState {
  /** Última posición conocida, para el punto azul del mapa. */
  me: { lon: number; lat: number } | null
  locating: boolean
  /** El navegador dijo que no, o no contestó a tiempo. */
  denied: boolean
  locate: () => void
}

/**
 * 8 s de espera y hasta 1 min de caché.
 *
 * El minuto es a propósito: entre el arranque automático y un toque en el
 * botón pasan segundos, y volver a encender el GPS para lo mismo gasta batería
 * sin cambiar la cifra. Nadie se mueve lo bastante en un minuto como para
 * cambiar de celda de la malla, que mide 100 m.
 */
const OPTIONS: PositionOptions = {
  timeout: 8_000,
  maximumAge: 60_000,
  enableHighAccuracy: false,
}

export function useGeolocation(
  enabled: boolean,
  ready: boolean,
  onFix: (fix: GeoFix) => void,
): GeolocationState {
  const [me, setMe] = useState<{ lon: number; lat: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)

  // El callback cambia en cada render de `App`; se lee desde una ref para que
  // pedir la ubicación no dependa de esa identidad.
  const fix = useRef(onFix)
  fix.current = onFix

  const ask = useCallback((auto: boolean) => {
    if (!navigator.geolocation) {
      setDenied(true)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setDenied(false)
        const { longitude: lon, latitude: lat } = pos.coords
        setMe({ lon, lat })
        fix.current({ lon, lat, auto })
      },
      () => {
        setLocating(false)
        setDenied(true)
      },
      OPTIONS,
    )
  }, [])

  const asked = useRef(false)
  useEffect(() => {
    if (!enabled || !ready || asked.current) return
    asked.current = true
    ask(true)
  }, [enabled, ready, ask])

  const locate = useCallback(() => ask(false), [ask])

  return { me, locating, denied, locate }
}
