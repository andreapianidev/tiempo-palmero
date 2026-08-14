/**
 * Las webcams de la isla: dónde están, quién las opera y qué URL sirve la foto.
 *
 * ES UN CATÁLOGO ESTÁTICO, y no una consulta a la API, por un motivo que se
 * midió antes de escribirlo. El Cabildo publica el dataset `webcam` en
 * `opendatalapalma.es` (ArcGIS, 60 registros con campo `web`), pero el 14 ago
 * 2026 solo **29 de los 60 URL devolvían una imagen**, y de esos varios estaban
 * congelados desde 2016, 2018 y 2019. Los diez registros del propio Cabildo
 * apuntan todos a `locserhom.ddns.net`, un dominio dinámico que ya no resuelve
 * a nada accesible: los seis intentos dieron timeout en el puerto 443. Ese
 * dataset no se ha tocado desde marzo de 2024.
 *
 * Consumirlo en vivo, por tanto, sería pedirle a cada visitante que descubra
 * por su cuenta que dos tercios de la lista están muertos. Lo que hay aquí es
 * la lista DEPURADA: cada URL se pidió, devolvió `image/*`, y —salvo donde se
 * dice lo contrario— cambió de contenido entre dos lecturas separadas.
 *
 * DE DÓNDE SALEN LAS COORDENADAS. De ese mismo dataset del Cabildo, que sigue
 * siendo la fuente buena para las posiciones aunque sus URL hayan caducado:
 * las cámaras no se han movido de sitio. Se reproyectaron de Web Mercator
 * (EPSG:3857) a WGS84. Las de `polimer` que no figuran en el dataset heredan la
 * posición de su gemela en `locserhom` —el mismo emplazamiento servido por el
 * servidor nuevo—, y eso va dicho en cada caso.
 *
 * LA LICENCIA. El «Aviso Legal» del dataset autoriza la reutilización «para
 * fines comerciales y no comerciales», con cesión gratuita y no exclusiva, a
 * cambio de tres cosas: citar la fuente, no desnaturalizar la información y no
 * insinuar patrocinio. Por eso cada ficha imprime el operador; ver
 * `WebcamDetail`.
 *
 * QUÉ NO ESTÁ, Y POR QUÉ:
 *
 *  - Las diez de `locserhom.ddns.net`: el host no responde.
 *  - Mercator y las all-sky de MAGIC: solo publican de noche. La de MAGIC
 *    además sirve con un certificado TLS que el navegador rechaza.
 *  - La all-sky de Warwick: congelada desde el 25 jul 2026.
 *  - El faro de Fuencaliente, «El Paso» de la-palma-aktuell y «Vista Volcán»:
 *    congeladas desde el 12 jul, el 26 jul y el 13 jun de 2026.
 *  - Las de alquileres, hoteles y particulares (`lapalmarentacar.com`,
 *    `apalmet.es/data/img/…`, varios `.de`): funcionan, pero son privadas —no
 *    hay licencia de reutilización— y ninguna publica su posición. Colgarlas
 *    aquí sería servir la imagen de otro sin permiso y encima situarla a ojo.
 */

/** Un ángulo. Un sitio puede tener varios y se enseñan juntos en la ficha. */
export interface WebcamView {
  id: string
  /** Qué mira, cuando el sitio tiene más de una. `null` si es la única. */
  label: string | null
  url: string
}

export type WebcamOperator = 'cabildo' | 'iac' | 'ayuntamiento'

export interface WebcamSite {
  id: string
  name: string
  municipality: string
  lon: number
  lat: number
  /** Se imprime en la ficha: es lo que pide la licencia de reutilización. */
  owner: string
  operator: WebcamOperator
  /**
   * Las del Cabildo llevan la fecha y la hora QUEMADAS EN LA IMAGEN, arriba o
   * abajo. Es el único sello de tiempo fiable que tienen —su servidor no manda
   * `Last-Modified`— y la ficha lo dice en vez de fingir que lo sabe.
   */
  stampedClock: boolean
  views: WebcamView[]
}

const CABILDO = 'Cabildo Insular de La Palma'

/**
 * Las panorámicas del Cabildo, servidas por `polimer.lapalma.es`.
 *
 * Es el backend del portal oficial `webcam.lapalma.es`. Devuelve JPEG de
 * 2688×1520 por HTTPS con certificado válido. Los identificadores no son
 * correlativos con nada: se descubrieron barriendo el rango y contrastando con
 * los rótulos del portal.
 *
 * DOS DE ESTOS SITIOS SON TORRES DE VIGILANCIA DE INCENDIOS —las mismas que la
 * capa `fire` dibuja como triángulos—: Las Tricias cae a 39 m de `WTER 01` y
 * San Antonio del Monte a 8 m de `WTER 02`. No es la cámara térmica, que no
 * publica imagen: es la panorámica en visible instalada en la misma torre.
 */
const CABILDO_SITES: WebcamSite[] = [
  {
    id: 'cab-tricias',
    name: 'Las Tricias',
    municipality: 'Garafía',
    lon: -17.950445,
    lat: 28.774378,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [
      { id: '99876593', label: 'Panorámica', url: 'https://polimer.lapalma.es/webcam/99876593' },
      // Segundo ángulo del mismo emplazamiento. No figura en el dataset, así
      // que no tiene posición propia y se cuelga del sitio, que es lo que es.
      { id: '99876586', label: 'Segundo ángulo', url: 'https://polimer.lapalma.es/webcam/99876586' },
    ],
  },
  {
    id: 'cab-san-antonio',
    // Posición de su gemela en `locserhom` (`…/timelaps/sanantonio/`), a 8 m de
    // la cámara de incendios `WTER 02` del open data. Mismo emplazamiento.
    name: 'San Antonio del Monte',
    municipality: 'Garafía',
    lon: -17.921401,
    lat: 28.819269,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876587', label: null, url: 'https://polimer.lapalma.es/webcam/99876587' }],
  },
  {
    id: 'cab-el-time',
    // Posición de su gemela `…/timelaps/time/`. OJO: es el MIRADOR de El Time,
    // sobre el valle de Aridane, no la torre forestal `WTER 04`, que está 3 km
    // al norte y cuya imagen el Cabildo marca como privada en el dataset.
    name: 'Mirador de El Time',
    municipality: 'Tijarafe',
    lon: -17.941959,
    lat: 28.664985,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876589', label: null, url: 'https://polimer.lapalma.es/webcam/99876589' }],
  },
  {
    id: 'cab-san-bartolo',
    name: 'San Bartolo',
    municipality: 'Puntallana',
    lon: -17.743377,
    lat: 28.745624,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876590', label: null, url: 'https://polimer.lapalma.es/webcam/99876590' }],
  },
  {
    id: 'cab-los-sauces',
    name: 'Los Sauces',
    municipality: 'San Andrés y Sauces',
    lon: -17.780735,
    lat: 28.805151,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [
      { id: '99876591/1', label: 'Norte', url: 'https://polimer.lapalma.es/webcam/99876591/1' },
      { id: '99876591/2', label: 'Sursuroeste', url: 'https://polimer.lapalma.es/webcam/99876591/2' },
    ],
  },
  {
    id: 'cab-tirimaga',
    name: 'Montaña de Tirimaga',
    municipality: 'Villa de Mazo',
    lon: -17.786252,
    lat: 28.571914,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876592', label: null, url: 'https://polimer.lapalma.es/webcam/99876592' }],
  },
  {
    id: 'cab-puntallana',
    name: 'Puntallana',
    municipality: 'Puntallana',
    lon: -17.747749,
    lat: 28.738807,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876594', label: null, url: 'https://polimer.lapalma.es/webcam/99876594' }],
  },
  {
    id: 'cab-los-llanos',
    name: 'Los Llanos de Aridane',
    municipality: 'Los Llanos de Aridane',
    lon: -17.914751,
    lat: 28.656465,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [
      { id: '99876595/1', label: 'Norte', url: 'https://polimer.lapalma.es/webcam/99876595/1' },
      { id: '99876595/2', label: 'Sur', url: 'https://polimer.lapalma.es/webcam/99876595/2' },
    ],
  },
  {
    id: 'cab-tijarafe',
    name: 'Tijarafe — Residencia',
    municipality: 'Tijarafe',
    lon: -17.955981,
    lat: 28.710562,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876596', label: null, url: 'https://polimer.lapalma.es/webcam/99876596' }],
  },
  {
    id: 'cab-puntagorda',
    name: 'Pueblo de Puntagorda',
    municipality: 'Puntagorda',
    lon: -17.979734,
    lat: 28.766121,
    owner: CABILDO,
    operator: 'cabildo',
    stampedClock: true,
    views: [{ id: '99876597', label: null, url: 'https://polimer.lapalma.es/webcam/99876597' }],
  },
]

/**
 * El Observatorio del Roque de los Muchachos, a ~2.400 m.
 *
 * Son las únicas cámaras de la isla POR ENCIMA de la inversión térmica, y por
 * eso valen tanto en una aplicación del tiempo: enseñan el mar de nubes desde
 * arriba, que es la mitad del clima de La Palma y la que no se ve desde
 * ninguna otra cámara. Sirven `Last-Modified` de verdad —al revés que las del
 * Cabildo—, así que su ficha puede decir la hora exacta de la foto.
 *
 * Las posiciones son las del dataset del Cabildo. El dataset tiene ahí un
 * error de copia —los registros de Warwick, Mercator y LST-1 repiten los tres
 * el mismo URL— así que las URL salen del portal de `apalmet`, contrastadas
 * una a una, y de las posiciones solo se usan las de cada telescopio.
 */
const ORM_SITES: WebcamSite[] = [
  {
    id: 'orm-gtc',
    name: 'Gran Telescopio Canarias',
    municipality: 'Garafía',
    lon: -17.891528,
    lat: 28.75609,
    owner: 'IAC — GRANTECAN',
    operator: 'iac',
    stampedClock: false,
    /**
     * OJO: `www.gtc.iac.es` sirve una CADENA TLS INCOMPLETA. Manda solo la hoja
     * y se deja fuera la intermedia (GEANT TLS RSA 1), así que un cliente que
     * no salga a buscarla por su cuenta rechaza la conexión: `curl` en macOS la
     * acepta —tiene la intermedia en el llavero— y Node la rechaza con
     * `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Comprobado el 14 ago 2026.
     *
     * Consecuencias, las dos previstas: `api/webcam` no puede leerle la hora
     * —contesta `reachable: false`, y la ficha cae al caso de la descarga— y en
     * un navegador que no persiga la intermedia por AIA la imagen no cargará.
     * Para eso está el aviso de error de `WebcamDetail`: si pasa, se dice, en
     * vez de dejar el icono roto. No hay alternativa por otro nombre: el
     * certificado también cubre `gtc.iac.es`, pero ese nombre no existe en DNS.
     */
    views: [
      {
        id: 'gtc-ext',
        label: 'Exterior',
        url: 'https://www.gtc.iac.es/multimedia/netcam/camaraExt.jpg',
      },
      {
        id: 'gtc-allsky',
        label: 'Cámara de cielo',
        url: 'https://www.gtc.iac.es/multimedia/netcam/camaraAllSky.jpg',
      },
    ],
  },
  {
    id: 'orm-not',
    name: 'Nordic Optical Telescope',
    municipality: 'Garafía',
    lon: -17.879017,
    lat: 28.762137,
    owner: 'IAC — NOT',
    operator: 'iac',
    stampedClock: false,
    views: [
      {
        id: 'not-caldera',
        label: 'Sobre la Caldera de Taburiente',
        url: 'https://www.not.iac.es/weather/img/dyn/caldera.jpg',
      },
      { id: 'not-dome', label: 'Cúpula', url: 'https://www.not.iac.es/weather/img/dyn/domebig.jpg' },
    ],
  },
  {
    id: 'orm-lt',
    name: 'Liverpool Telescope',
    municipality: 'Garafía',
    lon: -17.879119,
    lat: 28.762241,
    owner: 'Liverpool John Moores University',
    operator: 'iac',
    stampedClock: false,
    views: [
      {
        id: 'lt-ext',
        label: 'Exterior',
        url: 'https://telescope.livjm.ac.uk/pics/webcam_ext_1.jpg',
      },
      {
        id: 'lt-sky',
        label: 'Cielo',
        url: 'https://telescope.livjm.ac.uk/data/archive/webfiles/QS/Latest/j_latest.jpg',
      },
    ],
  },
  {
    id: 'orm-warwick',
    name: 'La Palma Observatory (Warwick)',
    municipality: 'Garafía',
    lon: -17.890614,
    lat: 28.75493,
    owner: 'University of Warwick',
    operator: 'iac',
    stampedClock: false,
    views: [
      { id: 'w-ext1', label: 'Exterior 1', url: 'https://lapalma-observatory.warwick.ac.uk/camera/ext1' },
      { id: 'w-ext2', label: 'Exterior 2', url: 'https://lapalma-observatory.warwick.ac.uk/camera/ext2' },
    ],
  },
  {
    id: 'orm-lst1',
    name: 'LST-1',
    municipality: 'Garafía',
    lon: -17.891944,
    lat: 28.756115,
    owner: 'CTAO — LST-1',
    operator: 'iac',
    stampedClock: false,
    views: [
      // OJO CON LA CADENA: `www.lst1.iac.es` responde 301 a `lst.iac.es`, y
      // éste responde 302 a `old.lst.iac.es`, que es quien sirve el JPEG. Se
      // guarda el salto intermedio y no el final: los tres hosts tienen
      // certificado válido y el navegador sigue la cadena solo, pero apuntar a
      // uno que se llama «old» es apostar a que no lo apaguen. Se ahorra el
      // primer salto, que es el único que ya no hace falta dar.
      { id: 'lst1-a', label: 'Cámara 1', url: 'https://lst.iac.es/webcams/current1/800.jpg' },
      { id: 'lst1-b', label: 'Cámara 3', url: 'https://lst.iac.es/webcams/current3/800.jpg' },
    ],
  },
  {
    id: 'orm-tng',
    name: 'Telescopio Nazionale Galileo',
    municipality: 'Garafía',
    lon: -17.891021,
    lat: 28.754836,
    owner: 'Fundación Galileo Galilei — INAF',
    operator: 'iac',
    stampedClock: false,
    views: [{ id: 'tng', label: null, url: 'https://www.tng.iac.es/webcam/get.html?resolution=640x480' }],
  },
  {
    id: 'orm-skywatch',
    name: 'Skywatch ORM',
    municipality: 'Garafía',
    lon: -17.891107,
    lat: 28.755306,
    owner: 'skywatching.eu',
    operator: 'iac',
    stampedClock: false,
    views: [{ id: 'murdoc', label: null, url: 'https://skywatching.eu/camera/murdoc_latest.jpg' }],
  },
]

/** Lo poco que hay fuera del Cabildo y del observatorio y que se sostiene. */
const MUNICIPAL_SITES: WebcamSite[] = [
  {
    id: 'ayto-brena-alta',
    name: 'Breña Alta',
    municipality: 'Breña Alta',
    lon: -17.787276,
    lat: 28.662242,
    owner: 'Ayuntamiento de Breña Alta',
    operator: 'ayuntamiento',
    stampedClock: false,
    views: [
      { id: 'balta-1', label: 'San Pedro', url: 'https://www.balta.org/webcam/ImgCam1.jpg' },
      { id: 'balta-2', label: 'Cumbre Nueva', url: 'https://www.balta.org/webcam/ImgCam2.jpg' },
    ],
  },
]

export const WEBCAM_SITES: WebcamSite[] = [...CABILDO_SITES, ...ORM_SITES, ...MUNICIPAL_SITES]

/**
 * Los hosts que la aplicación consulta. Existe para que `api/webcam` no sea un
 * proxy abierto: solo se pregunta la edad de una imagen de esta lista, igual
 * que `api/cda` solo reenvía los `dataAccessId` que la app usa.
 */
export const WEBCAM_HOSTS: string[] = [
  ...new Set(WEBCAM_SITES.flatMap((s) => s.views.map((v) => new URL(v.url).host))),
]

export function webcamViewCount(): number {
  return WEBCAM_SITES.reduce((n, s) => n + s.views.length, 0)
}
