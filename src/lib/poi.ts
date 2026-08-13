/**
 * Puntos de interés de la red de senderos: taxonomía, iconos y ficha.
 *
 * La capa `senderos-poi.geojson` trae 1.190 puntos con cinco campos —
 * `id_punto`, `codigo`, `tipo`, `subtipo` y `descripcion`— y nada más. El
 * `subtipo` es lo único que distingue un restaurante de un barranco, y venía
 * dibujado como un círculo ámbar idéntico para los 1.190: el mapa decía «aquí
 * hay algo» y no llegaba a decir qué.
 *
 * Aquí se traduce cada subtipo a un icono y a una de las tres familias del
 * catálogo (servicios, cultural, natural). El color dice la familia de un
 * vistazo; el dibujo dice qué es exactamente.
 *
 * Los iconos se generan como SVG y se registran en el mapa con `addImage`. No
 * se declara `glyphs` en el estilo —una capa `symbol` solo necesita servidor de
 * glifos si lleva `text-field`, y estas no llevan— así que la app sigue sin
 * ninguna dependencia externa en tiempo de ejecución.
 */

export type PoiFamily = 'servicios' | 'cultural' | 'natural'

/** Un color por familia, el mismo que usa la ficha y la leyenda. */
export const FAMILY_COLOR: Record<PoiFamily, string> = {
  servicios: '#8fc3e0',
  cultural: '#e2c56a',
  natural: '#8fc79a',
}

/**
 * Glifos en una caja de 24×24, centrados en (12,12) y contenidos en un radio
 * de 7 px: por fuera de ahí se salen del disco del icono. Son trazos, no
 * rellenos — a 22 px en pantalla un relleno se convierte en una mancha.
 */
const GLYPH: Record<string, string> = {
  // Servicios
  restaurante: 'M9.6 17v-5.4M8 7v3.2a1.6 1.6 0 003.2 0V7M15 17V7c1.7.6 1.7 5.4 0 5.4',
  tienda: 'M7.6 10.2h8.8L15.6 17H8.4zM10 10.2V8.9a2 2 0 014 0v1.3',
  agua: 'M12 6.6c2.5 3 3.8 4.6 3.8 6.3a3.8 3.8 0 11-7.6 0c0-1.7 1.3-3.3 3.8-6.3z',
  fuente: 'M12 6.2c1.8 2.2 2.7 3.4 2.7 4.6a2.7 2.7 0 11-5.4 0c0-1.2.9-2.4 2.7-4.6zM6.6 15.6c1.1-1 2.2-1 3.3 0s2.2 1 3.3 0 2.2-1 3.3 0',
  merendero: 'M5.6 10.8h12.8M7.8 10.8L6.4 17.2M16.2 10.8l1.4 6.4M7.4 14.2h9.2',
  refugio: 'M6.4 13L12 7.4l5.6 5.6M8.6 12v5h6.8v-5',
  alojamiento: 'M6.4 17v-8M6.4 12.6h11.2V17M6.4 15.4h11.2M9.4 12.6v-2.2h3.2a2 2 0 012 2.2',
  senal: 'M8.8 18V6.4M8.8 7.9h7.6l-1.8 2.2 1.8 2.2H8.8',
  // Cultural
  arquitectura: 'M6.2 17.2h11.6M6.6 11.4L12 7.2l5.4 4.2zM8.6 11.8v5M11 11.8v5M13.4 11.8v5M15.8 11.8v5',
  iglesia: 'M12 5.6v5M10.2 7.4h3.6M7.4 17.2v-5.6L12 8l4.6 3.6v5.6',
  arqueologia:
    'M13.4 12a1.5 1.5 0 11-2.9-.5 3.2 3.2 0 016.2 1 5 5 0 01-6.5 4.6',
  // 187 puntos: eras, terrazas, atarjeas, pajeros. Un muro de piedra seca es lo
  // que casi todos son de verdad.
  etnografia: 'M6.6 10.2h10.8M6.6 13.2h10.8M6.6 16.2h10.8M9.8 10.2v3M14.6 10.2v3M12.2 13.2v3',
  pastoril: 'M12 6.4L6.8 17.2h10.4zM10.4 17.2v-3.4h3.2v3.4',
  toponimo: 'M6.8 11.6l4.6-4.6h5.8v5.8L12.6 17zM14.6 10a.7.7 0 11-1.4 0 .7.7 0 011.4 0',
  // Natural
  arbol: 'M12 6.2L8.6 11.4h6.8zM12 9.4l-4.4 6.2h8.8zM12 15.6v1.8',
  barranco: 'M6 7.4l4.4 9.8M18 7.4l-4.4 9.8M12 17.2v-3',
  montana: 'M5.6 16.6l4.6-7.2 2.8 3.8 2-2.6 3.4 6z',
  crater: 'M6 14a6 3.2 0 0012 0 6 3.2 0 00-12 0M9 12.6l1.4-3.2M15 12.6l-1.4-3.2',
  cueva: 'M6.6 17.2v-2.4a5.4 5.4 0 0110.8 0v2.4M10 17.2v-1.4a2 2 0 014 0v1.4',
  // Estratos, no un monte: `Geol_Otros` y `Geol_Montaña` son cosas distintas y
  // a 22 px dos triángulos son el mismo icono.
  roca: 'M6.8 15.2l2.4-4.6 4.6-1.4 3.4 3.6-1.8 4.4-6.8.6zM9.2 10.6l1.8 3.8 5.2-1.6',
  hoja: 'M7.8 16.4c-.4-5 2.8-8.4 8.4-8.6.4 5-2.8 8.4-8.4 8.6zM7.8 16.4l4.4-4.4',
}

/**
 * Subtipo → icono. Las claves van en minúsculas porque la fuente mezcla
 * convenciones: publica `Viveres_Tienda` y `Viveres_tienda`, `Arq_Religiosa`
 * y `Arq_religiosa`. Sin normalizar, tres tiendas y una ermita se quedaban
 * fuera del catálogo.
 */
const BY_SUBTYPE: Record<string, string> = {
  // Servicios
  viveres_bar_rest: 'restaurante',
  viveres_tienda: 'tienda',
  otros_agua_pot: 'agua',
  otros_area_recr: 'merendero',
  otros_refugio: 'refugio',
  aloj_casa_rural: 'alojamiento',
  aloj_otros: 'alojamiento',
  aloj_albergue: 'alojamiento',
  // Cultural
  arq_civil: 'arquitectura',
  arq_religiosa: 'iglesia',
  arqueologico: 'arqueologia',
  etnog_otros: 'etnografia',
  etnog_ref_pastoril: 'pastoril',
  toponimo: 'toponimo',
  // Natural
  biol_botanica: 'arbol',
  biol_otros: 'hoja',
  geol_botanica: 'arbol',
  geol_barranco: 'barranco',
  geol_montana: 'montana',
  'geol_montaña': 'montana',
  geol_crater: 'crater',
  geol_cueva: 'cueva',
  geol_otros: 'roca',
  fuente_natural: 'fuente',
}

/** Cuando el subtipo es `Otros` —o algo que no está en el catálogo— manda el tipo. */
const BY_TYPE: Record<string, { icon: string; family: PoiFamily }> = {
  servicios: { icon: 'senal', family: 'servicios' },
  cultural: { icon: 'arquitectura', family: 'cultural' },
  natural: { icon: 'hoja', family: 'natural' },
}

const FAMILY_OF_ICON: Record<string, PoiFamily> = {
  restaurante: 'servicios',
  tienda: 'servicios',
  agua: 'servicios',
  merendero: 'servicios',
  refugio: 'servicios',
  alojamiento: 'servicios',
  senal: 'servicios',
  arquitectura: 'cultural',
  iglesia: 'cultural',
  arqueologia: 'cultural',
  etnografia: 'cultural',
  pastoril: 'cultural',
  toponimo: 'cultural',
  arbol: 'natural',
  hoja: 'natural',
  barranco: 'natural',
  montana: 'natural',
  crater: 'natural',
  cueva: 'natural',
  roca: 'natural',
  fuente: 'natural',
}

const key = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()

export function classifyPoi(tipo: unknown, subtipo: unknown): { icon: string; family: PoiFamily } {
  const icon = BY_SUBTYPE[key(subtipo)]
  if (icon) return { icon, family: FAMILY_OF_ICON[icon] }
  return BY_TYPE[key(tipo)] ?? { icon: 'senal', family: 'servicios' }
}

// ---------------------------------------------------------------------------
// Iconos del mapa
// ---------------------------------------------------------------------------

/** Lado del icono en píxeles CSS. El bitmap se genera al doble, para pantallas HiDPI. */
const ICON_SIZE = 24

export function poiIconSvg(icon: string, size = ICON_SIZE): string {
  const family = FAMILY_OF_ICON[icon] ?? 'servicios'
  const color = FAMILY_COLOR[family]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="10.2" fill="rgba(14,13,11,0.86)" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="${GLYPH[icon] ?? GLYPH.senal}" fill="none" stroke="${color}" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  )
}

export function poiIconDataUrl(icon: string, size = ICON_SIZE): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(poiIconSvg(icon, size))}`
}

/**
 * Las dos piezas del icono, sueltas: el trazo y el color de su familia.
 *
 * El SVG de arriba solo sirve donde hay un navegador que lo decodifique. La app
 * nativa dibuja estos mismos iconos con Skia, y para eso necesita el trazo, no
 * una cadena `<svg>` que en iOS y en Android nadie sabe leer. Salen de aquí y
 * no de una copia en el móvil: un icono que se dibuja distinto en cada
 * plataforma deja de ser el mismo icono.
 */
export function poiGlyph(icon: string): string {
  return GLYPH[icon] ?? GLYPH.senal
}

export function poiColor(icon: string): string {
  return FAMILY_COLOR[FAMILY_OF_ICON[icon] ?? 'servicios']
}

/** Todos los iconos del catálogo, para la leyenda y para registrarlos en el mapa. */
export const POI_ICONS = Object.keys(GLYPH)

/** Nombre de la imagen dentro del estilo. */
export const imageId = (icon: string) => `poi-${icon}`

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

/** Lo que el mapa entrega al panel: todo lo que publica la capa, sin recortar. */
export interface PoiRecord {
  name: string
  tipo: string | null
  subtipo: string | null
  icon: string
  family: PoiFamily
  lon: number
  lat: number
  /** Propiedades crudas del GeoJSON, tal cual llegan del Cabildo. */
  props: Record<string, unknown>
}

/** Campos internos que añade la app o el propio clustering, y que no son datos. */
const INTERNAL_PROPS = new Set(['icon', 'family', 'cluster', 'cluster_id', 'point_count', 'point_count_abbreviated'])

export function isDataProp(k: string): boolean {
  return !INTERNAL_PROPS.has(k)
}

export function readPoi(props: Record<string, unknown>, lon: number, lat: number): PoiRecord {
  const tipo = props.tipo === undefined || props.tipo === null ? null : String(props.tipo)
  const subtipo = props.subtipo === undefined || props.subtipo === null ? null : String(props.subtipo)
  const { icon, family } = classifyPoi(tipo, subtipo)
  const description = props.descripcion ? String(props.descripcion).trim() : ''
  return {
    // Sin descripción el punto sigue teniendo identidad: el código de la ficha.
    name: description || (props.codigo ? String(props.codigo) : (subtipo ?? '')),
    tipo,
    subtipo,
    icon,
    family,
    lon,
    lat,
    props,
  }
}

/**
 * Añade a cada punto el icono que le toca, para que la capa `symbol` pueda
 * leerlo con `['get', 'icon']`. Se hace una sola vez, al cargar la capa: son
 * 1.190 puntos y la alternativa —una expresión `match` con 28 ramas dentro del
 * estilo— se evalúa en cada repintado.
 */
export function decoratePoiCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const props = f.properties ?? {}
      const { icon, family } = classifyPoi(props.tipo, props.subtipo)
      return { ...f, properties: { ...props, icon: imageId(icon), family } }
    }),
  }
}
