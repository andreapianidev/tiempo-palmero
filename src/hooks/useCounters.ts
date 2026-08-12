/**
 * Los aforos, pedidos solo si alguien enciende la capa.
 *
 * Son tres peticiones y unos 130 KB, contra una red que ya se cae sola: no se
 * tocan mientras el interruptor esté apagado. Encendida, se refrescan cada
 * cinco minutos, que es la cadencia real del pulso; apagarla no tira lo
 * descargado, pero sí para el reloj.
 */

import { useEffect, useState } from 'react'
import { fetchCounters } from '../lib/counters/fetch'
import { buildSites, type CounterCensus, type CounterSite } from '../lib/counters/model'

const REFRESH_MS = 5 * 60 * 1000

export interface CountersData {
  sites: CounterSite[]
  census: CounterCensus | null
  /** Día de la isla al que se refiere `todayTotal`. */
  today: string | null
  loading: boolean
  error: boolean
}

export function useCounters(enabled: boolean): CountersData {
  const [data, setData] = useState<CountersData>({
    sites: [],
    census: null,
    today: null,
    loading: false,
    error: false,
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const load = () => {
      setData((d) => ({ ...d, loading: !d.sites.length, error: false }))
      fetchCounters(Date.now())
        .then((payload) => {
          if (cancelled) return
          const { sites, census } = buildSites({
            historic: payload.historic,
            today: payload.today,
            inventory: payload.inventory,
            todayKey: payload.window.today,
          })
          setData({ sites, census, today: payload.window.today, loading: false, error: false })
        })
        .catch(() => {
          if (cancelled) return
          // Se conserva lo que ya hubiera: un refresco fallido no vacía el mapa.
          setData((d) => ({ ...d, loading: false, error: true }))
        })
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled])

  return data
}
