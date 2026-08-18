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
 *   z17  10 175 teselas   2,3 GB
 *
 * Con 1 GB cabe **la isla entera hasta z15 en los dos fondos** —214 MB cada uno,
 * 429 MB los dos— y quedan casi 600 MB para el z16 y el z17 de los sitios que
 * uno mire de verdad, que son unas 2.600 teselas más. Es deliberado que NO quepa
 * la isla completa a z16 en los dos fondos (1,2 GB): eso ya no sería la caché de
 * lo que alguien ha mirado.
 *
 * Y POR ESO NO SE BAJA LA ISLA AL ZOOM MÁXIMO, aunque sea lo primero que se
 * ocurre al ver un techo de 1 GB. La fila del z17 está ahí para que la cifra no
 * haya que imaginarla: son **10 175 teselas de tierra, 2,3 GB por fondo** —el
 * doble contando los dos—, que a dos peticiones en paralelo y con la mediana de
 * 556 ms son **47 minutos** seguidos pidiéndole cosas a GRAFCAN. No cabe en el
 * techo (se iría expulsando a sí misma mientras baja), no cabe en la paciencia
 * de nadie y es exactamente la «descarga masiva de información» que la licencia
 * del servicio prohíbe. Lo que sí es defendible al zoom máximo es guardar lo
 * que alguien ha mirado, y eso ya lo hace la caché.
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
 * Son **17 teselas** que cubren la isla entera —z9:1, z10:4, z11:12— y con
 * ellas MapLibre tiene siempre una tesela padre que ampliar mientras bajan las
 * hijas, así que tener el z11 es tener fondo a cualquier escala hasta z14 largo.
 *
 * LO QUE PESAN, medido el 18 de agosto de 2026 con dos pasadas por servicio:
 * **718 y 739 kB la ortofoto, 901 y 1037 kB el topográfico**. Van en pares
 * porque no es un número fijo: el WMS vuelve a dibujar y a comprimir el JPEG en
 * cada petición, así que las mismas 17 teselas pesan distinto dos veces
 * seguidas —un 3 % de diferencia en la ortofoto, un 15 % en el MT20—. Cualquier
 * cifra suelta de estas es la mitad de un rango, y aquí antes había dos (838 y
 * 1154 kB) escritas como si fueran una medida exacta.
 *
 * Y NO APARECE COMPLETO «EN CUANTO SE PULSA EL SELECTOR», que es lo que decía
 * este comentario y no es verdad. Las 17 solas, con los dos obreros y sin nadie
 * compitiendo, tardan **2,9-3,4 s**; dentro del navegador tardan bastante más,
 * porque van en fila detrás de las teselas que MapLibre está pidiendo para la
 * pantalla y GRAFCAN habla HTTP/1.1 —seis conexiones por servidor, repartidas
 * entre las dos cosas—. Eso es lo correcto y no un defecto: primero baja lo que
 * se está mirando y la vista de lejos rellena por detrás. Lo que no se puede es
 * contarlo como si fuera instantáneo.
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

/**
 * CUÁNTAS TESELAS SE PIDEN AL PASAR POR ENCIMA DE UN FONDO EN EL SELECTOR: 24.
 *
 * Es una pantalla entera, y el número sale de contarlas
 * (`scripts/checks/pantalla-teselas.ts`, tres sitios de la isla y siete niveles
 * de zoom, para que la cuenta no dependa de dónde caiga la rejilla):
 *
 *   portátil 1440 × 900            12 teselas
 *   MacBook Pro 16" 1728 × 1117    20 teselas
 *   iMac 27" 2560 × 1440           24 teselas
 *   4K 3840 × 2160                 54 teselas
 *
 * EL PRIMER NÚMERO QUE SE PUSO AQUÍ FUE 12, y estaba mal por una razón que vale
 * la pena dejar escrita: 12 es el «4 × 3» que cuenta `PREFETCH_MAX_TILES` aquí
 * arriba, y ese 4 × 3 son las teselas ENTERAS. Una ventana casi nunca cae
 * alineada con la rejilla, así que se piden además la columna y la fila de los
 * bordes. El propio fixture de `prefetch.test.ts` —la ventana de Los Llanos a
 * z14— son 20 teselas, y con el tope en 12 la precarga por intención habría
 * dejado fuera un tercio de la pantalla en el portátil de cualquiera.
 *
 * 24 CUBRE ENTERA HASTA LA PANTALLA DEL iMac y recorta solo el 4K, donde la
 * cuenta salta a 54 —12,4 MB a la mediana de 230 kB— y pedirlos por si alguien
 * va a pulsar ya no es adelantarse, es acaparar. Ahí se piden las 24 del centro
 * y el resto llega por el camino de siempre. A 24 el peor caso son 5,5 MB, y
 * los paga quien iba a pedirlos de todos modos 150 ms después.
 *
 * Y PIDE LA VISTA, NO LA ISLA DE LEJOS. Son dos cosas distintas y solo una hace
 * instantáneo el cambio de fondo: con el mapa a z15, la vista de lejos de
 * `OVERVIEW_ZOOMS` deja un z11 ampliado 16 veces —algo que enseñar mientras
 * baja lo bueno, no lo bueno—. Lo que quita la espera son las teselas del
 * encuadre en el que está el mapa ahora mismo, y esas son estas.
 *
 * Se piden del centro hacia afuera, para que el tope se lo coman los bordes y
 * no el sitio al que se está mirando.
 */
export const INTENT_MAX_TILES = 24

/**
 * CUÁNTO HAY QUE QUEDARSE ENCIMA DE UN CHIP PARA QUE CUENTE: 150 ms.
 *
 * LO QUE ESTÁ MEDIDO ES EL COSTE DE EQUIVOCARSE, y es lo que hace que este
 * número no tenga que ser fino. El canal `intención` es descartable como
 * `borde`: al salir el puntero se tira la fila entera, así que lo que cuesta un
 * roce no son las 24 teselas, sino las que hayan dado tiempo a bajar. Con dos
 * obreros y la mediana de 556 ms eso son **3,6 teselas por segundo de espera**,
 * o unos 830 kB/s, empezando a contar a los 150 ms:
 *
 *   se va enseguida        2 teselas   460 kB   (las que ya iban en vuelo)
 *   se queda un segundo    ~6          1,3 MB
 *   se queda dos          ~10          2,2 MB
 *
 * Y a los dos segundos eso ya no es un roce, es alguien leyendo el chip. La
 * primera versión de este comentario decía «2 teselas como mucho», que es lo
 * que cuesta el instante de irse y no lo que cuesta quedarse: la cota crece con
 * el tiempo que uno pase encima, y así escrita se leía como si no.
 *
 * LO QUE ACOTA POR EL OTRO LADO es la mediana de espera del servicio, 556 ms:
 * por debajo de unos 150 ms de adelanto se estaría ganando menos de un tercio
 * de una tesela, o sea nada que nadie note. Ese es el suelo.
 *
 * LO QUE NO ESTÁ MEDIDO, y se dice porque en este repositorio un umbral sin su
 * cifra al lado es una corazonada: cuánto se queda un dedo o un puntero encima
 * de un chip antes de pulsarlo de verdad. Eso pide un navegador con una persona
 * delante y aquí no lo hay. El 150 se apoya en las dos cotas de arriba —cuesta
 * poco pasarse, no vale la pena quedarse corto—, no en una medida de esa
 * espera. Si algún día se mide, este comentario es el que hay que corregir.
 */
export const INTENT_DELAY_MS = 150
