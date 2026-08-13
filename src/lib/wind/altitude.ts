/**
 * Lo que hace falta para que una partícula de viento sepa a qué altura está.
 *
 * Aritmética pura y probable, aparte del dibujo: la capa de viento es WebGL y
 * no se puede comprobar mirando una pantalla si una partícula quedó cien metros
 * dentro de la montaña.
 *
 * Tres cuentas, y las tres tienen una razón:
 *
 * 1. `mercatorZ` — la matriz que MapLibre pasa a una capa personalizada espera
 *    Mercator normalizado, y con `renderingMode: '3d'` la Z es CONFORME: un
 *    cubo de lado igual en x, y, z sale cubo. O sea que la altura no va en
 *    metros sino en la misma unidad que el ancho del mundo, que depende de la
 *    latitud. Es exactamente lo que hace `MercatorCoordinate.fromLngLat(ll, alt)`
 *    —comprobado contra ella en los tests—, pero sin construir un objeto por
 *    vértice: son 42.000 por fotograma.
 *
 * 2. `windAltitudeM` — la altura a la que se dibuja la estela. Es la cota del
 *    terreno más un margen, y todo ello por la exageración de la escena, porque
 *    el relieve que se ve está estirado y el viento tiene que estirarse con él.
 *
 * 3. `viewportHeightDeg` — cuánto abarca la pantalla, medido en el CENTRO y a
 *    partir del zoom, no del rectángulo envolvente de la vista. Con la cámara
 *    inclinada ese rectángulo llega hasta el horizonte y es varias veces más
 *    alto que lo que se está mirando: usándolo, inclinar el mapa multiplicaba
 *    por tres la velocidad de las partículas sin que el viento hubiera cambiado.
 */

/**
 * Circunferencia de la Tierra, con el radio MEDIO (6.371.008,8 m) y no con el
 * ecuatorial (6.378.137). Son 40.030 km en vez de 40.075: 45 km de diferencia,
 * un 0,11 %.
 *
 * No es una elección: es la constante que usa MapLibre en
 * `MercatorCoordinate.fromLngLat`, y esta cuenta tiene que dar exactamente lo
 * mismo que la suya o las partículas se dibujan a otra altura que el terreno.
 * Hay un test que las compara vértice a vértice.
 */
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6371008.8

/** Metros que mide un grado de latitud. El mismo que usa `field.ts`. */
const METERS_PER_DEG_LAT = 110_574

/** MapLibre proyecta con teselas de 512 px: el zoom 0 es el mundo en 512 px. */
const TILE_SIZE_PX = 512

export function circumferenceAtLatitude(lat: number): number {
  return EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)
}

/** Metros de altitud → unidades Mercator de la Z conforme. */
export function mercatorZ(altitudeM: number, lat: number): number {
  return altitudeM / circumferenceAtLatitude(lat)
}

/**
 * Margen sobre el suelo con el que se dibuja la estela, en metros.
 *
 * NO es una afirmación sobre a qué altura sopla el viento: las estaciones miden
 * a un par de metros del suelo y el campo es de superficie. Es un margen de
 * DIBUJO, y existe porque la malla del terreno que pinta MapLibre es más basta
 * que el modelo de elevación del que se leen las cotas —a zoom de isla, una
 * tesela de terreno resume 256 píxeles de DEM en unos pocos vértices—, así que
 * en una arista la superficie dibujada puede quedar decenas de metros por
 * encima de la cota que dice el DEM. Sin margen, las estelas se hunden dentro de
 * las cumbres justo donde más viento hay.
 *
 * 60 m: por debajo de 40 se veían tramos tragados por las crestas de la Cumbre
 * Nueva a zoom de isla; por encima de ~100 la estela empieza a despegarse
 * visiblemente del suelo en los barrancos, y entonces parece que el viento va
 * por el aire en vez de por la ladera.
 */
export const WIND_AGL_M = 60

/**
 * Altura a la que se dibuja una partícula, en metros de la ESCENA (o sea, ya
 * exagerados). Cero elevación y exageración 1 devuelven justo el margen.
 */
export function windAltitudeM(groundM: number, exaggeration: number): number {
  return (groundM + WIND_AGL_M) * exaggeration
}

/**
 * Grados de latitud que caben en el alto de la ventana, a partir del zoom.
 *
 * Independiente de la inclinación de la cámara a propósito: es la escala en el
 * centro del mapa, que es donde MapLibre define el zoom. Con `getBounds()` la
 * misma vista inclinada 65° medía tres veces más y las partículas salían
 * disparadas al girar la cámara.
 */
export function viewportHeightDeg(zoom: number, lat: number, heightPx: number): number {
  const metersPerPixel = circumferenceAtLatitude(lat) / (TILE_SIZE_PX * 2 ** zoom)
  return Math.max(0.001, (heightPx * metersPerPixel) / METERS_PER_DEG_LAT)
}
