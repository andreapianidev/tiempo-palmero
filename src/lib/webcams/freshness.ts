/**
 * Cuándo una webcam ha dejado de ser una webcam y es una foto vieja.
 *
 * EL UMBRAL ESTÁ MEDIDO, no elegido, y lo que hay que enseñar son las dos
 * orillas: cuánto tarda la cámara VIVA más lenta y cuánto llevaba parada la
 * MUERTA más reciente. Medido el 14 de agosto de 2026 sobre las 34 cámaras que
 * se llegaron a probar, incluidas las que no entraron al catálogo:
 *
 * | | `Last-Modified` más viejo observado |
 * |---|---|
 * | Skywatch ORM — la viva más lenta del catálogo | **30 min** |
 * | Mercator — nocturna, de día no publica | **14 h** |
 * | El Paso (la-palma-aktuell) — parada | 19 días |
 * | All-sky de Warwick — parada | 20 días |
 * | Faro de Fuencaliente — parada | 33 días |
 * | «Vista Volcán» de Los Llanos — parada | 62 días |
 *
 * Entre las dos orillas hay un factor de 28. **Tres horas** cae seis veces por
 * encima de la más lenta que sigue viva y casi cinco veces por debajo de la
 * parada más reciente, así que ni una cámara lenta se marca por serlo ni una
 * nocturna se cuela como fresca a mediodía. Si algún día se añade una que
 * publique cada dos horas, esto hay que volver a medirlo — no subirlo a ojo.
 *
 * NO SE APLICA A LAS DEL CABILDO, y no por descuido: su servidor no manda
 * `Last-Modified`, así que de ellas no hay ninguna hora que juzgar. Ver
 * `stampedClock` en el catálogo.
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
