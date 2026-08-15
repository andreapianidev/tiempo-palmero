/**
 * Lo que el usuario ha elegido, y que sobrevive a cerrar la aplicación.
 *
 * Hasta ahora no sobrevivía nada: cada interruptor vivía en un `useState` con
 * su valor de fábrica escrito al lado, así que recargar la página —o que el
 * teléfono matara la app en segundo plano, o desplegar una versión nueva—
 * devolvía la isla al estado de la primera visita. Quien miraba siempre el
 * punto de rocío y con el mar encendido lo volvía a encender cada vez.
 *
 * Aquí no se decide QUÉ se guarda: eso lo dice cada pantalla llamando a
 * `usePersistentState`. Esto es solo el cajón, y tiene tres reglas:
 *
 * 1. **Un solo bulto, no una clave por ajuste.** Diez ajustes son diez lecturas
 *    y diez escrituras si cada uno va por su lado; en el móvil, además, diez
 *    ficheros. Se leen todos juntos una vez y se escriben todos juntos cuando
 *    uno cambia.
 * 2. **Nunca se confía en lo guardado.** Lo que sale del disco es texto que
 *    escribió una versión anterior de esta aplicación, y puede estar truncado,
 *    ser de otro formato o traer una capa que ya no existe. Se valida entero
 *    (ver `revive.ts`) y lo que no pase la validación se sustituye por el
 *    valor de fábrica en vez de tumbar el arranque.
 * 3. **Un formato con número de versión.** Cuando la forma de lo guardado
 *    cambie de verdad —no añadir una capa, que ya se tolera, sino cambiar qué
 *    significa una clave— se sube `SETTINGS_VERSION` y lo viejo se descarta
 *    entero. Sin ese número no hay manera de distinguir «esto es de antes» de
 *    «esto está corrupto».
 */

import { backend } from './backend'

/**
 * La versión del formato. Se sube SOLO cuando lo guardado deja de poder
 * interpretarse con las reglas de hoy; añadir o quitar un ajuste no lo
 * requiere, porque `revive.ts` ya rellena lo que falta y descarta lo que sobra.
 */
export const SETTINGS_VERSION = 1

/** De dónde se leen y a dónde se escriben. Un archivo por plataforma. */
export interface SettingsBackend {
  read(): string | null
  write(text: string): void
}

interface Envelope {
  v: number
  values: Record<string, unknown>
}

/**
 * Texto guardado → ajustes utilizables.
 *
 * Devuelve `{}` —o sea, «todo de fábrica»— ante cualquier cosa que no sea un
 * sobre de la versión de hoy: sin guardar nada, JSON roto, un array, un sobre
 * de otra versión o un `values` que no es un objeto. Es una función pura para
 * que esas cinco maneras de fallar se puedan probar sin tocar disco.
 */
export function parseSettings(text: string | null): Record<string, unknown> {
  if (!text) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const envelope = parsed as Partial<Envelope>
  if (envelope.v !== SETTINGS_VERSION) return {}
  const values = envelope.values
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return {}
  return { ...values }
}

/** Y la vuelta: ajustes → texto, siempre con la versión delante. */
export function serializeSettings(values: Record<string, unknown>): string {
  return JSON.stringify({ v: SETTINGS_VERSION, values } satisfies Envelope)
}

/**
 * Lo guardado, ya interpretado. Se lee del disco una sola vez por arranque: la
 * decena de hooks que preguntan lo hacen todos durante el primer render, y
 * abrir el fichero diez veces seguidas para responder diez preguntas sobre el
 * mismo contenido no tiene sentido.
 */
let cache: Record<string, unknown> | null = null

function load(): Record<string, unknown> {
  if (cache === null) cache = parseSettings(backend.read())
  return cache
}

export function readSetting(key: string): unknown {
  return load()[key]
}

/**
 * Guarda un ajuste, si de verdad ha cambiado.
 *
 * La comparación no es una optimización de adorno: cada hook escribe su valor
 * al montarse, así que sin ella un arranque normal serían diez escrituras del
 * bulto entero —diez del fichero completo, en el móvil— para dejarlo tal y como
 * ya estaba. Con ella, en régimen solo escribe quien ha tocado un interruptor.
 *
 * Se escribe de forma síncrona y sin agrupar. Retrasar la escritura para juntar
 * varias ahorraría poco —un dedo no da más de un toque por fotograma— y abriría
 * la única manera real de perder un ajuste: que el sistema mate la app con la
 * escritura todavía pendiente en un temporizador.
 */
export function writeSetting(key: string, value: unknown): void {
  const values = load()
  if (key in values && JSON.stringify(values[key]) === JSON.stringify(value)) return
  values[key] = value
  backend.write(serializeSettings(values))
}
