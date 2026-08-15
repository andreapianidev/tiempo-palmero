/**
 * Devolver a la vida un ajuste guardado, sin fiarse de él.
 *
 * Lo que sale del disco lo escribió **otra versión de esta aplicación**, y esa
 * versión puede ser de hace seis meses. Puede traer una capa que ya no existe,
 * faltarle una que se añadió la semana pasada, tener un `"si"` donde ahora va
 * un booleano, o una calidad de océano que se renombró. Nada de eso puede
 * impedir que la isla aparezca, y ninguna de esas cosas debe entrar en el
 * estado de React tal cual: una capa desconocida encendida es un `undefined`
 * paseándose por el motor de dibujo.
 *
 * La regla es la misma en las cuatro funciones: **lo que no se reconoce se
 * sustituye por el valor de fábrica, no se descarta el ajuste entero**. Si
 * alguien tenía nueve capas encendidas y una de ellas ya no existe, se quedan
 * las ocho buenas y la décima cae; perder las nueve por culpa de una sería
 * castigar al usuario por un cambio nuestro.
 *
 * El valor de fábrica llega como segundo argumento y hace doble trabajo: es el
 * relleno de lo que falte, y en `flags` es además **la lista de claves
 * válidas**. Así, añadir una capa en el objeto de fábrica la hace aparecer aquí
 * sin tocar este archivo, y quitarla de allí la hace desaparecer de lo
 * guardado sin migración ninguna.
 */

/**
 * Un valor crudo salido del JSON, más el valor de fábrica, dan un valor bueno
 * o `null`. `null` significa «esto no era interpretable», y quien llama pone lo
 * de fábrica en su sitio.
 */
export type Revive<T> = (raw: unknown, fallback: T) => T | null

/** Un interruptor. Solo un booleano de verdad vale; `0`, `"true"` y `null` no. */
export const bool: Revive<boolean> = (raw) => (typeof raw === 'boolean' ? raw : null)

/**
 * Uno de una lista cerrada: la variable, el fondo, la exageración del relieve,
 * la calidad del mar. La lista es la del catálogo vivo, así que un valor
 * retirado del catálogo deja de reconocerse el día que se retira.
 */
export function oneOf<T extends string | number>(values: readonly T[]): Revive<T> {
  return (raw) => (values.includes(raw as T) ? (raw as T) : null)
}

/**
 * Un objeto de interruptores: las capas, los sitios, las secciones plegables.
 *
 * Las claves son las del valor de fábrica y solo esas. Una clave guardada que
 * ya no esté ahí se ignora, y una clave nueva que lo guardado no tenga toma su
 * valor de fábrica. Es lo que hace que añadir una capa no obligue a versionar
 * el formato.
 */
export function flags<K extends string>(): Revive<Record<K, boolean>> {
  return (raw, fallback) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const stored = raw as Record<string, unknown>
    const out = {} as Record<K, boolean>
    for (const key of Object.keys(fallback) as K[]) {
      out[key] = typeof stored[key] === 'boolean' ? (stored[key] as boolean) : fallback[key]
    }
    return out
  }
}

/**
 * Un objeto con campos de distinto tipo: el relieve (`{on, exaggeration}`) y el
 * océano (`{on, seamarks, depth, quality}`).
 *
 * Campo a campo, con su propio validador. Un campo que no pase se rellena de
 * fábrica y los demás se conservan: una exageración inválida no debe apagar la
 * vista 3D de quien la tenía encendida.
 */
export function shape<T extends object>(revivers: { [K in keyof T]: Revive<T[K]> }): Revive<T> {
  return (raw, fallback) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const stored = raw as Record<string, unknown>
    const out = {} as T
    for (const key of Object.keys(revivers) as (keyof T)[]) {
      out[key] = revivers[key](stored[key as string], fallback[key]) ?? fallback[key]
    }
    return out
  }
}
