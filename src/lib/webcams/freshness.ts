/**
 * Cuándo una webcam ha dejado de ser una webcam y es una foto vieja.
 *
 * A QUIÉN JUZGA, PRIMERO. Solo a las cámaras que mandan `Last-Modified`: las
 * del observatorio y la del ayuntamiento. **Las del Cabildo quedan fuera por
 * completo** —su nginx sirve con `no-store` y sin esa cabecera— y eso importa
 * para leer la tabla de abajo: tres de ellas publican cada DOS HORAS, medido, y
 * si el umbral las alcanzara habría que ponerlo en otro sitio. No las alcanza,
 * porque de ellas no llega ninguna hora que juzgar. Lo suyo se declara a mano
 * con `slowMinutes` en el catálogo.
 *
 * EL UMBRAL ESTÁ MEDIDO, no elegido, y lo que hay que enseñar son las dos
 * orillas: cuánto tarda la VIVA más lenta *de las que sí mandan sello* y cuánto
 * llevaba parada la MUERTA más reciente. Medido el 14 de agosto de 2026 sobre
 * las 34 cámaras que se llegaron a probar, incluidas las descartadas:
 *
 * | | `Last-Modified` más viejo observado |
 * |---|---|
 * | Skywatch ORM — la más lenta con sello, y viva | **30 min** |
 * | Mercator — nocturna, de día no publica | **14 h** |
 * | El Paso (la-palma-aktuell) — parada | 19 días |
 * | All-sky de Warwick — parada | 20 días |
 * | Faro de Fuencaliente — parada | 33 días |
 * | «Vista Volcán» de Los Llanos — parada | 62 días |
 *
 * Entre las dos orillas hay un factor de 28. **Tres horas** cae seis veces por
 * encima de la más lenta que sigue viva y casi cinco veces por debajo de la
 * parada más reciente, así que ni una cámara lenta se marca por serlo ni una
 * nocturna se cuela como fresca a mediodía.
 *
 * SI ALGÚN DÍA ENTRA UNA CON SELLO QUE PUBLIQUE CADA DOS HORAS, esto deja de
 * valer: tres horas estarían a un mísero factor 1,5 de ella. Habría que volver
 * a medir las dos orillas, no subir el número a ojo.
 */

/** Tres horas. Ver la tabla de arriba antes de tocarlo. */
export const WEBCAM_STALE_MS = 3 * 60 * 60 * 1000

/**
 * `true` si la imagen es tan vieja que enseñarla sin avisar sería enseñar el
 * tiempo de otro momento. `null` significa que no hay sello y no se juzga: no
 * saber la hora no es lo mismo que saber que es vieja.
 */
export function isWebcamStale(lastModified: number | null, now: number): boolean {
  if (lastModified === null) return false
  return now - lastModified > WEBCAM_STALE_MS
}
