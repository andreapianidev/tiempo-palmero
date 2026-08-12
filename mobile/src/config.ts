/**
 * De dónde saca los datos la app móvil.
 *
 * Del mismo despliegue que sirve la web. No hay una segunda API ni una copia de
 * los 15 MB de capas dentro del binario: `/api/cda` y `/api/co2` son las
 * funciones edge que ya sortean el CORS del Cabildo, y `/dem`, `/layers`,
 * `/gazetteer.json` y `/guagua-red.json` son los mismos ficheros estáticos que
 * genera `npm run prepare-data`. Publicar la web actualiza también el móvil.
 */

export const DATA_ORIGIN = 'https://tiempo-palmero.vercel.app'

/**
 * Paso de la malla, en píxeles de DEM. La web usa 6 (≈200 m); en el móvil son
 * 8 (≈268 m) porque cada celda es una estimación completa y aquí se calculan en
 * el hilo de JavaScript de un teléfono: 64.000 celdas en lugar de 114.000.
 */
export const GRID_STEP = 8

/**
 * Vista inicial: la isla entera. El zoom no es el 9,6 de la web porque el zoom
 * de MapLibre se mide en píxeles de pantalla y un teléfono tiene 393 de ancho
 * contra los 1.400 de un escritorio: a 10,4 La Palma ocupa unos 334 × 542 px,
 * que la deja entera y con sitio para la cabecera y los chips.
 */
export const ISLAND_CENTER: [number, number] = [-17.86, 28.66]
export const ISLAND_ZOOM = 10.4
export const MIN_ZOOM = 9
export const MAX_ZOOM = 16
