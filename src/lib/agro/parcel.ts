/**
 * Qué se cultiva EXACTAMENTE aquí: consulta en vivo, una parcela cada vez.
 *
 * POR QUÉ EN VIVO Y NO CONGELADO. La capa son 217.137 polígonos: 35 MB de
 * GeoJSON crudo, 10 MB simplificados a ~11 m —los dos medidos contra la API el
 * 13 ago 2026—. Servir eso a un teléfono para que el 99,99 % no se mire nunca
 * no tiene defensa. Una consulta puntual al Feature Service tarda 0,8 s
 * medidos y devuelve exactamente la parcela que hay debajo del dedo.
 *
 * Es el mismo trato que `nearby.ts` le da a los puntos de interés: lo agregado
 * se congela en el build (`cultivos-resumen.json`, 4,2 KB) y el detalle se
 * pide cuando alguien pregunta.
 *
 * SE FALLA EN ABIERTO. Si el servicio del Cabildo no responde, esto devuelve
 * `null` y la ficha del punto sale sin el bloque agrario. No es un dato de
 * seguridad y no puede tumbar nada.
 */

import { CROP_LAYER_YEAR, cropByCode, type Crop } from './crops'

const PARCEL_QUERY =
  'https://services.arcgis.com/hkQNLKNeDVYBjvFE/arcgis/rest/services' +
  '/Agricultura/FeatureServer/0/query'

export interface Parcel {
  crop: Crop | null
  /** `DESCRIP` del Cabildo, aunque el código no esté en el catálogo con Kc. */
  description: string
  /** Bajo plástico. El servicio lo marca con una `I`. */
  greenhouse: boolean
  /**
   * Suelo de jable: arena volcánica extendida sobre la tierra para conservar
   * humedad, técnica canaria que cambia por completo cuánto riego pide una
   * parcela.
   *
   * ⚠️ **La columna está VACÍA.** Comprobado el 13 ago 2026 con una consulta de
   * estadística agrupada sobre el servicio: `JABLE` vale el espacio en blanco
   * en las **217.137 filas**, sin una sola excepción. Se sigue parseando para
   * que aparezca sola el día que el Cabildo la rellene —igual que se hace con
   * la columna `visibility` de las estaciones—, pero hoy este campo es SIEMPRE
   * `false` y la interfaz no debe prometer que distingue el jable.
   */
  jable: boolean
  /** Cota que el Cabildo dio a la parcela, m. No es la del DEM de la app. */
  elevationM: number | null
  /** Polígono y parcela catastrales, para quien sepa leerlos. */
  reference: string | null
  /** Año en que se levantó la capa. Viaja pegado al dato, siempre. */
  year: number
}

interface EsriAttrs {
  CULTIVO?: unknown
  DESCRIP?: unknown
  INVERNADER?: unknown
  JABLE?: unknown
  Z?: unknown
  POLIGONO?: unknown
  PARCELA?: unknown
}

/** Los campos del servicio son de ancho fijo y llegan con espacios. */
const flag = (v: unknown, on: string): boolean =>
  typeof v === 'string' && v.trim().toUpperCase() === on

export function decodeParcel(attrs: EsriAttrs): Parcel | null {
  const code = typeof attrs.CULTIVO === 'string' ? attrs.CULTIVO.trim() : ''
  const description = typeof attrs.DESCRIP === 'string' ? attrs.DESCRIP.trim() : ''
  if (!code && !description) return null

  const poligono = typeof attrs.POLIGONO === 'string' ? attrs.POLIGONO.trim() : ''
  const parcela = typeof attrs.PARCELA === 'string' ? attrs.PARCELA.trim() : ''

  return {
    crop: cropByCode(code),
    description,
    greenhouse: flag(attrs.INVERNADER, 'I'),
    jable: flag(attrs.JABLE, 'S'),
    elevationM: typeof attrs.Z === 'number' && Number.isFinite(attrs.Z) ? attrs.Z : null,
    reference: poligono && parcela ? `${poligono}/${parcela}` : null,
    year: CROP_LAYER_YEAR,
  }
}

/**
 * Pide la parcela que contiene un punto.
 *
 * `returnGeometry=false` a propósito: el polígono pesa y no se pinta. Lo que
 * hace falta es qué hay ahí, no su contorno exacto.
 */
export async function fetchParcel(
  lon: number,
  lat: number,
  signal?: AbortSignal,
): Promise<Parcel | null> {
  const params = new URLSearchParams({
    geometry: `${lon.toFixed(6)},${lat.toFixed(6)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CULTIVO,DESCRIP,INVERNADER,JABLE,Z,POLIGONO,PARCELA',
    returnGeometry: 'false',
    resultRecordCount: '1',
    f: 'json',
  })

  try {
    const res = await fetch(`${PARCEL_QUERY}?${params}`, { signal })
    if (!res.ok) return null
    const body = (await res.json()) as { features?: { attributes?: EsriAttrs }[] }
    const attrs = body.features?.[0]?.attributes
    return attrs ? decodeParcel(attrs) : null
  } catch {
    return null
  }
}
