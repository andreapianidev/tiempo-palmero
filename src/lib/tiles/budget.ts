/**
 * Cuánto se guarda de GRAFCAN, cuánto dura y cuánto se pide por delante.
 *
 * Los cuatro números de este fichero salen de `scripts/checks/grafcan-cache.ts`,
 * ejecutado contra el servicio en vivo el 18 de agosto de 2026.
 *
 * POR QUÉ HAY CACHÉ. Porque no la hay en ninguna otra parte. Ni la ortofoto ni
 * el MT20 mandan **`cache-control`, `etag`, `last-modified`, `expires` ni
 * `age`**: ni una sola de las cinco. Sin frescura declarada y sin validador, el
 * navegador no tiene con qué calcular la heurística del RFC 9111 §4.2.2 —que se
 * saca del `last-modified`— ni con qué preguntar «¿sigue valiendo esto?». Así
 * que cada tesela que sale de la vista y vuelve se descarga **entera** otra vez,
 * y cada recarga de la página empieza de cero. La caché de MapLibre tapa parte
 * del caso dentro de una sesión —guarda unas cinco pantallas— y ninguna parte
 * del caso que importa, que es volver mañana.
 *
 * QUÉ SE AHORRA, MEDIDO. 30 peticiones a 1024 px repartidas por cinco niveles
 * de zoom y tres sitios de la isla: **mediana 556 ms, p90 1183 ms, máximo
 * 2269 ms**, mínimo 198. Y esa tabla salió un día bueno: una sonda a la misma
 * hora, hora y media antes, se comió **12 873 ms** en una sola tesela de la
 * Caldera. Eso es lo que se paga hoy por segunda vez y lo que la caché convierte
 * en una lectura de IndexedDB.
 *
 * LO QUE PESA. Tesela de tierra a 1024 px (n=20): mínimo 67 kB, **mediana
 * 230 kB**, máximo 373 kB. Las de mar abierto son 6 kB — un JPEG de azul liso.
 */

/**
 * CUÁNTO DURA UNA TESELA GUARDADA: 30 días.
 *
 * Lo que hay al otro lado es la Ortofoto Territorial **2024-2025**, un producto
 * anual, y el Mapa Topográfico 1:20.000, que se revisa por hojas y por años. A
 * 30 días se relee doce veces al año algo que cambia como mucho una. Más corto
 * sería tirar el ahorro; más largo, no.
 *
 * Y no es infinito por lo mismo que `demVersion` existe en `dem.ts`: allí una
 * tesela corregida no le llegaba a quien ya tenía la anterior, y el arreglo se
 * veía bien en incógnito y roto en la ventana de siempre. Aquí ese remedio no
 * está disponible —GRAFCAN no publica ninguna versión que colgar de la URL—, así
 * que lo único que impide repetir aquel fallo es que la copia caduque sola.
 */
export const TILE_TTL_MS = 30 * 24 * 3600 * 1000

/**
 * EL TECHO DE LA CACHÉ: 1 GB.
 *
 * Medido contra la línea de costa del Cabildo, contando las teselas que tocan
 * tierra (`scripts/checks/grafcan-cache.ts`, bloque 4) y multiplicando por la
 * mediana de 230 kB:
 *
 *   z13      54 teselas    12,4 MB
 *   z14     188 teselas    43,2 MB
 *   z15     690 teselas   158,7 MB
 *   z16   2 612 teselas   601 MB
 *
 * Con 1 GB cabe **la isla entera hasta z15 en los dos fondos** —214 MB cada uno,
 * 429 MB los dos— y quedan casi 600 MB para el z16 y el z17 de los sitios que
 * uno mire de verdad, que son unas 2.600 teselas más. Es deliberado que NO quepa
 * la isla completa a z16 en los dos fondos (1,2 GB): eso ya no sería la caché de
 * lo que alguien ha mirado.
 *
 * ESTO ES UN TECHO DE LO QUE SE CONSERVA, NO DE LO QUE SE DESCARGA. Subirlo no
 * pide ni una tesela más a GRAFCAN: solo hace que lo ya visto —incluido el zoom
 * máximo, que es lo que más pesa y lo primero que se perdía— siga ahí mañana. Lo
 * que sí toca a GRAFCAN es la precarga, y esa sigue en 17 teselas por fondo y 8
 * por parada, que es otro número y está más abajo.
 *
 * Aun así es el disco de quien abre la página, así que manda siempre el menor de
 * los dos: este techo o la cuarta parte de la cuota que declare el navegador.
 */
export const MAX_CACHE_BYTES = 1024 * 1024 * 1024

/**
 * Y NUNCA MÁS DE LA CUARTA PARTE DE LO QUE EL NAVEGADOR OFREZCA.
 *
 * `navigator.storage.estimate()` devuelve una cuota que en Chrome sale del disco
 * libre, así que en una máquina holgada el techo que manda es el de arriba. En
 * una con el disco lleno la cuota puede quedarse en pocos cientos de MB, y
 * llenarla nosotros haría que el navegador empezara a tirar cosas —las suyas y
 * las nuestras— justo cuando peor viene.
 */
export const QUOTA_FRACTION = 0.25

/** El techo real de esta sesión, con la cuota que haya dicho el navegador. */
export function cacheCapBytes(quota: number | undefined): number {
  if (!quota || !Number.isFinite(quota)) return MAX_CACHE_BYTES
  return Math.min(MAX_CACHE_BYTES, Math.floor(quota * QUOTA_FRACTION))
}

/**
 * LOS NIVELES QUE SE PRECARGAN AL ENCENDER UN FONDO: z9, z10 y z11.
 *
 * Son **17 teselas** que cubren la isla entera —838 kB la ortofoto, 1154 kB el
 * topográfico, medidos— y con ellas el fondo aparece completo en cuanto se
 * pulsa el selector, a cualquier escala: MapLibre dibuja la tesela padre
 * ampliada mientras bajan las hijas, así que tener z11 es tener un fondo
 * inmediato hasta z14 largo.
 *
 * EL z12 SE QUEDA FUERA, y esa es la decisión que hay que justificar: son 35
 * teselas más y **triplican la factura** (3,3 MB la ortofoto, 4,7 MB el MT20)
 * para un nivel que el ampliado del z11 ya cubre mientras llega lo bueno.
 *
 * La licencia de GRAFCAN dice «se prohíbe la descarga masiva de información».
 * 17 teselas de la isla de lejos, una vez cada 30 días y solo si alguien
 * enciende ese fondo, es menos de lo que cuesta una pantalla a z16 —12 teselas
 * a 230 kB son 2,8 MB— y bastante menos de lo que hoy se pide dos y tres veces
 * por no poder guardarlo.
 */
export const OVERVIEW_ZOOMS = [9, 10, 11] as const

/**
 * CUÁNTAS TESELAS SE PIDEN POR DELANTE AL PARAR EL MAPA: 8.
 *
 * Una ventana de 1440 × 900 con teselas de 512 CSS px son 4 × 3 en pantalla, o
 * sea que el borde por el que se está saliendo son 4 teselas si el movimiento es
 * horizontal, 3 si es vertical y los dos bordes si es diagonal. Ocho cubre el
 * peor de los tres con margen y **no cubre el anillo entero** (que serían 18):
 * lo que se pide es la dirección en la que el usuario ya iba, no un colchón
 * alrededor por si acaso.
 *
 * Coste máximo por parada, a la mediana medida: 1,8 MB — y solo la primera vez
 * que se pasa por ahí, porque a la segunda ya está guardado. Volver sobre lo
 * andado no cuesta nada, que es justo lo que hoy sí cuesta.
 */
export const PREFETCH_MAX_TILES = 8

/**
 * Cuántas peticiones de precarga van a la vez: 2.
 *
 * MapLibre se reserva hasta 16 peticiones de imagen en paralelo para lo que hay
 * en pantalla (`MAX_PARALLEL_IMAGE_REQUESTS`). La precarga es lo que NO se está
 * mirando, así que va por detrás y en fila estrecha: dos a la vez llenan el
 * hueco sin competir por el ancho de banda con la tesela que el usuario está
 * esperando de verdad.
 */
export const PREFETCH_CONCURRENCY = 2

/**
 * Si esta conexión admite que se le pidan cosas por delante.
 *
 * `saveData` es una petición explícita del usuario —«ahorra datos»— y precargar
 * es exactamente lo contrario. Y por debajo de 4G la precarga no adelanta nada:
 * le quita ancho de banda a la tesela que sí se está mirando y la retrasa.
 *
 * La API es `navigator.connection`, que no existe en Safari ni en Firefox. Sin
 * ella se precarga: es el comportamiento útil, y quien de verdad quiera ahorrar
 * datos tiene el interruptor en el sistema, que sí llega aquí en los
 * navegadores que lo implementan.
 *
 * Sin `navigator` NO se precarga, que es el caso de Node: los scripts de
 * `scripts/` y las pruebas no tienen a nadie mirando un mapa, y una precarga
 * que salta ahí solo sería tráfico a GRAFCAN sin destinatario.
 */
export function prefetchAllowed(): boolean {
  if (typeof navigator === 'undefined') return false
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (!c) return true
  if (c.saveData) return false
  return c.effectiveType === undefined || c.effectiveType === '4g'
}
