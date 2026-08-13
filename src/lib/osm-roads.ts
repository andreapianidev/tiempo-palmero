/**
 * El viario de OpenStreetMap, clasificado en las tres jerarquías con las que se
 * dibuja.
 *
 * Existe porque la capa de carreteras del Cabildo son 61 tramos —las vías
 * insulares, las municipales y poco más— y por debajo de ellas la isla estaba
 * vacía: en Tijarafe, en Puntagorda o en cualquier lomo de medianías, las
 * paradas de guagua y los sensores flotaban sobre un relieve sin una sola calle
 * por la que se llega a ellos. OSM tiene 19.770 tramos y 3.373 km para la misma
 * isla (medido el 13 ago 2026, ver `scripts/prepare-osm-roads.ts`).
 *
 * La clasificación es la de OSM reducida a tres niveles, y el corte está donde
 * cambia para qué sirve la vía:
 *
 *   1 principal — la red que atraviesa la isla: LP-1, LP-2, LP-3 y los enlaces.
 *   2 local     — lo que se recorre dentro de un pueblo o entre dos barrios.
 *   3 pista     — accesos: pistas agrícolas y forestales (`track`, 1.540 km) y
 *                 los caminos de servicio (`service`, 686 km). Casi dos tercios
 *                 del viario de la isla, y lo que faltaba justo donde más se
 *                 notaba.
 *
 * Lo que NO entra: `path`, `footway`, `steps`, `cycleway` y `bridleway`. Son
 * 6.570 trazados que aquí serían ruido y además duplicarían la capa de senderos,
 * que ya está y viene del Cabildo con su nombre y su aviso.
 */

export type RoadTier = 1 | 2 | 3

/**
 * Valor de `highway` → jerarquía. Es una lista blanca: una etiqueta nueva de
 * OSM se queda fuera hasta que alguien la mire, en vez de aparecer en el mapa
 * pintada como lo que no es.
 */
export const OSM_ROAD_CLASSES: Readonly<Record<string, RoadTier>> = {
  motorway: 1,
  motorway_link: 1,
  trunk: 1,
  trunk_link: 1,
  primary: 1,
  primary_link: 1,
  secondary: 1,
  secondary_link: 1,

  tertiary: 2,
  tertiary_link: 2,
  unclassified: 2,
  residential: 2,
  residential_link: 2,
  living_street: 2,
  // Una calle peatonal de un casco antiguo es una calle: sin ella, la parte
  // vieja de Santa Cruz sale con un agujero en medio.
  pedestrian: 2,
  busway: 2,
  road: 2,

  service: 3,
  track: 3,
}

export function roadTier(highway: string | undefined | null): RoadTier | null {
  if (!highway) return null
  return OSM_ROAD_CLASSES[highway] ?? null
}

/** Las clases que se piden a Overpass, en el orden en que están declaradas. */
export const OSM_ROAD_KINDS: readonly string[] = Object.keys(OSM_ROAD_CLASSES)
