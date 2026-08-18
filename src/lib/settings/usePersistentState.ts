/**
 * `useState`, pero lo elegido dura más que la sesión.
 *
 * Se usa exactamente igual —devuelve el par valor/actualizador de siempre— y
 * por eso el cambio en las pantallas es sustituir la llamada y nada más: ni un
 * `onChange` distinto, ni un efecto que sincronice, ni un contexto nuevo. Lo
 * que añade son tres cosas:
 *
 * - Una **clave**, que es el nombre del ajuste dentro del bulto guardado.
 * - Un **valor de fábrica**, que es lo que se ve la primera vez y el relleno de
 *   todo lo que no se pueda interpretar. Acepta una función para los que cuesta
 *   calcular, como la calidad del océano, que mira la pantalla y el equipo.
 * - Un **validador** de `revive.ts`, porque lo guardado no es de fiar.
 *
 * La lectura ocurre en el inicializador de `useState`, o sea antes del primer
 * render y no en un efecto posterior. Es deliberado: hidratar después obliga a
 * pintar una vez con los valores de fábrica y corregir al fotograma siguiente,
 * y eso se ve como un salto de la malla al entrar. Por eso el cajón es síncrono,
 * y lo tiene que ser en cualquier plataforma que lo implemente —ver
 * `backend.ts`.
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { readSetting, writeSetting } from './store'
import type { Revive } from './revive'

export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  revive: Revive<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const base = typeof fallback === 'function' ? (fallback as () => T)() : fallback
    const raw = readSetting(key)
    if (raw === undefined) return base
    return revive(raw, base) ?? base
  })

  // El guardado va en un efecto y no dentro del actualizador porque el valor
  // puede cambiar por más de un camino —hay interruptores que mueven a otros,
  // como encender la 3D al encender el cielo— y aquí se ven todos. `writeSetting`
  // ignora lo que no ha cambiado, así que montar no escribe.
  useEffect(() => {
    writeSetting(key, value)
  }, [key, value])

  return [value, setValue]
}
