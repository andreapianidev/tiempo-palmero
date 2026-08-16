/**
 * Fondos de mapa.
 *
 * El fondo de casa —relieve sombreado sobre las teselas DEM de `public/dem/`,
 * que arma `mapStyle.ts`— sigue siendo el de siempre y el que trae la app al
 * abrirse: es el único que no depende de nadie en tiempo de ejecución y el
 * único sobre el que la malla interpolada se lee sin pelearse con el fondo.
 *
 * Los otros dos son cartografía oficial canaria, servida por GRAFCAN
 * (IDECanarias) y pedida en vivo. Comprobado contra el servicio el 13 de
 * agosto de 2026, sobre el recuadro de La Palma:
 *
 *   - los dos declaran `EPSG:3857` en su GetCapabilities, así que MapLibre los
 *     puede pedir tesela a tesela con `{bbox-epsg-3857}`;
 *   - los dos responden `Access-Control-Allow-Origin: *`, que es lo que
 *     permite usarlos desde el navegador sin proxy;
 *   - los dos pintan a cualquier escala de las que usa la app (z8,5–16): no
 *     son capas que se vacíen al alejarse.
 *
 * `Fees: none` y, en el propio Abstract del servicio, «esta información es
 * libre y gratuita». La misma frase sigue: «se prohíbe la descarga masiva de
 * información» — de ahí que esto sea un fondo que se pide mientras se mira y
 * nada más. No se cachea, no se descarga la isla entera, no se reempaqueta.
 *
 * NO se piden teselas de un fondo apagado: MapLibre solo carga las fuentes que
 * tengan alguna capa visible, así que quien no toque este selector no gasta ni
 * una petición fuera de casa.
 *
 * Por qué el 1:20.000 canario y no el MTN del IGN nacional (que también sirve
 * la isla, en WMTS y con CORS abierto): el de GRAFCAN es cartografía hecha
 * para estas islas, con los barrancos y los topónimos que aquí se usan, y
 * llega a más detalle. El del IGN queda como recambio si GRAFCAN cayera.
 */

import type { RasterSourceSpecification } from 'maplibre-gl'
import { ISLAND_BBOX } from './geo'
import { screenDensity, TILE_CSS_SIZE } from './realce/density'

export type BasemapId = 'relieve' | 'topografico' | 'satelite'

export interface Basemap {
  id: BasemapId
  label: string
  /** Una línea en el panel: qué se está mirando y de quién es. */
  note: string
  /** `null` en el relieve — no hay nada externo que pedir. */
  source: RasterSourceSpecification | null
  /**
   * Zoom a partir del cual el fondo trae sus propios topónimos y ya se leen;
   * desde ahí, los nuestros dejan de dibujarse, porque encima serían los
   * mismos nombres dos veces, desplazados entre sí y con dos grafías que no
   * tienen por qué coincidir. `null` = ese fondo no trae ninguno.
   *
   * El 12,5 está medido sobre la propia carta, pidiendo la tesela de Los
   * Llanos de Aridane a cuatro escalas (13 de agosto de 2026):
   *
   *   z11 — los rótulos están puestos, pero miden menos de un píxel: no se lee
   *         ni «Los Llanos».
   *   z12 — se distingue que hay texto; no se lee ninguna palabra.
   *   z13 — «LOS LLANOS DE ARIDANE», «Barranco de las Angustias» y «Puerto de
   *         Tazacorte» se leen sin esfuerzo.
   *
   * O sea que el punto de cambio cae entre 12 y 13, y 12,5 es su mitad. Por
   * debajo se dibujan los nuestros —que a esa escala son los únicos que se
   * leen— y por encima manda la carta.
   */
  labelsFrom: number | null
  /**
   * Fondo claro. El texto de los marcadores es casi blanco con sombra negra,
   * que sobre papel topográfico deja de leerse: con esto la interfaz lo
   * invierte.
   */
  light: boolean
  /**
   * QUÉ HAY DEBAJO DEL AGUA en este fondo, que es lo que decide si el mar en
   * movimiento tiene sentido encima y cómo se compone con él.
   *
   * Medido el 14 de agosto de 2026 sobre el mar frente a Tijarafe:
   *
   *   'foto'  la ortofoto de GRAFCAN, un mar fotografiado de verdad: 0,053 de
   *           luminancia mediana, 0,130 de percentil 90 y hasta 0,92 en el
   *           reflejo del sol. El agua puede DEJARLO VER cuando no hay luz
   *           propia que enseñar (ver `NIGHT_OPACITY` en `ocean/light.ts`), y
   *           la refracción tiene algo que refractar.
   *   'plano' una tinta lisa: en el relieve, `COLORS.sea`, 0,003 de luminancia.
   *           No hay nada debajo que enseñar, así que el agua se pinta opaca
   *           siempre; dejarla translúcida solo la apagaría —la composición
   *           nocturna caía a 0,014 contra los 0,027 del agua sola—. Es también
   *           el fondo donde el mar en movimiento más cambia las cosas, porque
   *           lo que había era un rectángulo negro.
   *   false   aquí no se dibuja. La carta topográfica es papel: tiene su propio
   *           mar, sus batimetrías y sus rótulos, y un océano fotorrealista
   *           encima los tapa y desentona con todo lo demás.
   */
  sea: 'foto' | 'plano' | false
  /**
   * SI LA LUZ DEL SOL SE VUELVE A DIBUJAR ENCIMA DE ESTE FONDO.
   *
   * El `hillshade` del estilo va debajo de los fondos externos, así que sobre
   * uno opaco no se ve. Los que pongan esto en `true` llevan una segunda capa de
   * sombreado por encima —misma luz, translúcida—, que es lo que hace que el
   * interruptor de luz solar signifique algo fuera del relieve. Ver
   * `terrain-light-photo.ts`, donde está medida su opacidad.
   *
   *   relieve      false — el sombreado ES el fondo; encima sería dos veces.
   *   satélite     true  — la ortofoto lo tapa entero, y es donde más falta hace.
   *   topográfico  false — y no por descuido. Es la misma razón por la que no
   *                lleva mar: es papel. La carta ya dice el relieve con sus
   *                curvas de nivel, y el sombreado —que es azul oscuro— sobre
   *                papel blanco ensucia las curvas en vez de añadir nada.
   */
  sunShading: boolean
}

/**
 * El recuadro de la ISLA, no el de la ventana del mapa.
 *
 * Era `maxBounds` —el rectángulo hasta donde se puede arrastrar la vista— y eso
 * son 92,5 × 111 km para una isla que mide 27,7 × 45: **8,3 veces su área**,
 * casi toda océano abierto que GRAFCAN tiene que dibujar tesela a tesela para
 * devolver agua. Justo lo que el «se prohíbe la descarga masiva de información»
 * de su licencia pide no hacer.
 *
 * Con `ISLAND_BBOX` —el mismo recuadro que ya usa el motor, con unos 3 km de
 * margen sobre la costa— se pide lo que se mira. Y de paso se nota en la vista
 * 3D: con el recuadro viejo, la ortofoto sobresalía del mar como una bandeja
 * cuadrada flotando alrededor de la isla.
 */
const ISLAND_BOUNDS: [number, number, number, number] = [
  ISLAND_BBOX.west,
  ISLAND_BBOX.south,
  ISLAND_BBOX.east,
  ISLAND_BBOX.north,
]

/**
 * Un servicio WMS de GRAFCAN, envuelto como fuente raster.
 *
 * WMS 1.1.1 y no 1.3.0 a propósito: en 1.3.0 el orden de los ejes del bbox
 * depende del CRS, y `{bbox-epsg-3857}` de MapLibre siempre escribe
 * `minx,miny,maxx,maxy`. Con 1.1.1 esa es la única lectura posible.
 *
 * Teselas de 512 y no de 256: es una imagen que el servidor dibuja en cada
 * petición, y a 256 son cuatro veces más peticiones para la misma pantalla y
 * la misma escala de dibujo.
 */
function grafcan(
  service: string,
  layer: string,
  attribution: string,
  maxzoom = 16,
): RasterSourceSpecification {
  // Los píxeles que se piden NO son los de la tesela en pantalla: son los que
  // esa tesela va a ocupar de verdad en esta pantalla. Ver `realce/density.ts`,
  // donde está medido cuánto detalle nuevo trae eso y cuánto cuesta.
  const px = String(TILE_CSS_SIZE * screenDensity())
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    srs: 'EPSG:3857',
    // El servicio solo ofrece JPEG: su GetCapabilities declara `image/jpeg` y
    // nada más, y pedirle PNG devuelve un `InvalidFormat`. Comprobado el 13 de
    // agosto de 2026 contra los dos servicios.
    format: 'image/jpeg',
    width: px,
    height: px,
  })
  return {
    type: 'raster',
    // El bbox va fuera del URLSearchParams: las llaves de la plantilla no
    // deben salir escapadas, o MapLibre no las reconoce.
    tiles: [`https://idecan1.grafcan.es/ServicioWMS/${service}?${q}&bbox={bbox-epsg-3857}`],
    tileSize: 512,
    minzoom: 8,
    maxzoom,
    bounds: ISLAND_BOUNDS,
    attribution,
  }
}

const GRAFCAN_CREDIT =
  'Cartografía: <a href="https://www.idecanarias.es" target="_blank" rel="noreferrer">IDECanarias</a> · GRAFCAN'

export const BASEMAPS: Record<BasemapId, Basemap> = {
  relieve: {
    id: 'relieve',
    label: 'Relieve',
    note: 'Sombreado del modelo de elevación, recortado por la línea de costa del Cabildo. Es el fondo sobre el que la malla de color se lee sin competencia.',
    source: null,
    labelsFrom: null,
    light: false,
    // Tinta lisa debajo del agua, y la más oscura de las tres: es donde el mar
    // en movimiento más se nota.
    sea: 'plano',
    // Aquí el sombreado no va encima: es el fondo mismo.
    sunShading: false,
  },
  topografico: {
    id: 'topografico',
    label: 'Topográfico',
    // Curvas de nivel, barrancos con nombre, pistas y sendas. Es el fondo que
    // pide la capa de senderos: ahí lo que hace falta saber es la pendiente
    // que viene, no la temperatura.
    note: 'Mapa Topográfico 1:20.000 de Canarias: curvas de nivel, topónimos y sendas. Se pide a la resolución de esta pantalla, no a la mitad.',
    // Mismo techo que la ortofoto, por la misma medida (16 ago 2026): a cámara
    // z17 la z16 ampliada da |∇²| 14,0 / 17,1 / 12,3 y la z17 pedida 33,0 /
    // 41,2 / 28,7 —2,3–2,4× con densidad 2 y 2,7–2,8× con densidad 1—. El z18
    // no paga (2,1–2,4×, 16 teselas por pantalla).
    source: grafcan('MT20', 'MT20', `${GRAFCAN_CREDIT} · Mapa Topográfico 1:20.000`, 17),
    labelsFrom: 12.5,
    light: true,
    // Papel. El mar de la carta ya está dibujado, con sus batimetrías y sus
    // rótulos, y no hay océano que quepa encima sin taparlo.
    sea: false,
    // Y por lo mismo, tampoco luz: las curvas de nivel ya dicen el relieve.
    sunShading: false,
  },
  satelite: {
    id: 'satelite',
    label: 'Satélite',
    // Sin cifras: la longitud de la colada se repite en muchos sitios con
    // muchos números distintos y aquí no hay con qué medirla. Lo que sí se ve
    // en la imagen, y es verdad, es que va del cono al mar.
    note: 'Ortofoto territorial 2024-2025, a la resolución de esta pantalla y sin la calima del vuelo. La colada de Tajogaite se ve como lo que es: la cicatriz que baja del cono hasta el mar.',
    // El techo de 17 está medido, no elegido: `scripts/checks/detalle-tiles.ts`
    // (16 ago 2026) pide la foto a z16–z18 y mide el laplaciano |∇²| sobre los
    // MISMOS píxeles de pantalla. A cámara z17, la z16 de hoy ampliada da
    // 20,6 / 10,6 / 11,5 (Los Llanos, Caldera, costa oeste) con densidad 2 y
    // 23,8 / 12,9 / 14,6 con densidad 1; la z17 pedida da 76,5 / 34,2 / 40,2 y
    // 73,4 / 37,1 / 40,4: 3,2–3,7× más detalle real con densidad 2 y 2,8–3,1×
    // con densidad 1. El z18 no paga: menos |∇²| por píxel (la foto entra en su
    // resolución de vuelo, 25 cm) y 16 teselas por pantalla. Coste del 17:
    // 4 teselas donde antes 1, ~0,7–1 MB por pantalla al fondo del zoom. No se
    // descarga más superficie, solo la que se mira, a más píxeles.
    source: grafcan('Ortofoto', 'ortofoto', `${GRAFCAN_CREDIT} · Ortofoto Territorial 2024-2025`, 17),
    // La ortofoto no rotula nada, así que los topónimos son nuestros a todas
    // las escalas. Y sobre imagen aérea el texto blanco con sombra negra es
    // justo lo que mejor se lee: no hay nada que invertir.
    labelsFrom: null,
    light: false,
    sea: 'foto',
    // La foto es opaca y se come el sombreado de debajo. Aquí la luz del sol se
    // vuelve a dibujar encima, translúcida: es el único fondo donde hace falta.
    sunShading: true,
  },
}

/** El orden del selector. El de casa primero: es el que se usa. */
export const BASEMAP_ORDER: BasemapId[] = ['relieve', 'topografico', 'satelite']

/** Los que traen fuente externa — los que hay que declarar en el estilo. */
export const EXTERNAL_BASEMAPS = BASEMAP_ORDER.map((id) => BASEMAPS[id]).filter(
  (b): b is Basemap & { source: RasterSourceSpecification } => b.source !== null,
)

/** Id de la fuente y de la capa de un fondo externo, en un solo sitio. */
export const basemapSourceId = (id: BasemapId) => `basemap-${id}`
export const basemapLayerId = (id: BasemapId) => `basemap-${id}-raster`
