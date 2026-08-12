/**
 * i18n mínimo. Estructura lista para más idiomas, con `es` como único
 * poblado — el público de esta app está en la isla.
 */

import { es, type Strings } from './es'

export type Locale = 'es'

const catalogues: Record<Locale, Strings> = { es }

export const DEFAULT_LOCALE: Locale = 'es'

export function strings(locale: Locale = DEFAULT_LOCALE): Strings {
  return catalogues[locale] ?? es
}

export const t = es

/** Formato de números en castellano: coma decimal, punto de millares. */
export function n(value: number, decimals = 1): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function n0(value: number): string {
  return Math.round(value).toLocaleString('es-ES')
}

/** Antigüedad legible a partir de milisegundos. */
export function humanAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t.freshness.justNow
  if (minutes < 60) return t.freshness.minutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t.freshness.hours(hours)
  return t.freshness.days(Math.floor(hours / 24))
}

export type { Strings }
