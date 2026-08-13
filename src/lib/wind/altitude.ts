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
 * DIBUJO, y existe porque LA MALLA DEL TERRENO QUE PINTA MAPLIBRE NO ES EL DEM
 * DEL QUE SE LEEN LAS COTAS. MapLibre teselada y suaviza; el motor lee el
 * terrarium a 34 m/px.
 *
 * MEDIDO el 13 ago 2026, comparando `map.queryTerrainElevation` contra el mismo
 * muestreo bilineal que usa la aplicación, en 1.761 puntos de tierra repartidos
 * por la isla (malla menos DEM, en metros; positivo = la superficie dibujada
 * queda por ENCIMA de la cota leída):
 *
 *   mediana  +4,4     p90  +61,2     p99  +137,6     máx  +190
 *   p10     −67,9     mín −255,9
 *
 * No depende del zoom —se repitió a 9,6, 11, 12,5 y 13,5 y salió idéntico—, así
 * que no hay ninguna vista en la que el desajuste desaparezca: es el suavizado
 * de la malla sobre las aristas de esta isla.
 *
 * De ahí 60 y no otra cosa: es el p90 del lado positivo, o sea que en nueve de
 * cada diez puntos la estela queda por encima de la superficie dibujada. En el
 * décimo se hunde y la prueba de profundidad la esconde —cosa que pasa en
 * crestas, que es donde el propio relieve ya tapa—. Subirlo a 140 taparía el
 * p99, pero entonces en la mitad de la isla —donde la malla queda POR DEBAJO
 * del DEM, hasta 256 m— la estela volaría visiblemente separada del suelo, que
 * es el error contrario y se ve mucho más.
 *
 * La alternativa exacta existe y se descartó con el cronómetro delante:
 * preguntarle a MapLibre la cota dibujada de cada vértice cuesta 1,01 µs por
 * llamada —8.400 por fotograma son 8,5 ms de los 16 que hay—, así que se
 * llevaría medio presupuesto de fotograma para ganar unos metros que a la
 * escala de esta isla son uno o dos píxeles.
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
 * Sustituye a `map.getBounds()`, y CONVIENE SABER QUÉ CAMBIÓ Y QUÉ NO. Se
 * sustituyó temiendo que el rectángulo envolvente creciera con la inclinación
 * —hasta el horizonte— y disparara la velocidad de las partículas al girar la
 * cámara. Medido el 13 ago 2026 contra el mapa real: eso NO pasa. `getBounds()`
 * de MapLibre 4.7 devuelve lo mismo a 0°, 45°, 65° y 70° de inclinación, y esta
 * cuenta da 0,99× de lo que daba aquél a todos los zooms probados (9,6 a 13,4).
 *
 * O sea que el cambio no arregló ningún defecto visible: lo que hace es no
 * depender de un comportamiento de `getBounds()` que la documentación no fija
 * —la vista inclinada VE más terreno del que ese rectángulo declara— y medir la
 * escala donde MapLibre la define, que es el centro. Se queda por eso, no por
 * la razón con la que se escribió.
 */
export function viewportHeightDeg(zoom: number, lat: number, heightPx: number): number {
  const metersPerPixel = circumferenceAtLatitude(lat) / (TILE_SIZE_PX * 2 ** zoom)
  return Math.max(0.001, (heightPx * metersPerPixel) / METERS_PER_DEG_LAT)
}
