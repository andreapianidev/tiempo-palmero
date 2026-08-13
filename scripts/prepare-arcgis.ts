/**
 * Las capas del OTRO catálogo del Cabildo: los Feature Services de ArcGIS que
 * publica el visor de opendatalapalma.es.
 *
 * El portal público y el catálogo CKAN no son el mismo inventario. CKAN
 * (`lapalmasmart-open.lapalma.es`) sirve ficheros estáticos de 49 conjuntos;
 * opendatalapalma.es sirve un catálogo de ArcGIS Hub con 100 capas vivas, y hay
 * cosas que solo están en uno de los dos. Los miradores son el ejemplo: no hay
 * ningún dataset CKAN de miradores —los que trae `zonas-recreativas` son áreas
 * de descanso, no vistas— y aquí hay 29 puntos con nombre.
 *
 * Este fichero existe aparte de `prepare-data.ts` porque el trato es distinto:
 * no hay `package_show` que resolver, la geometría se pide ya reproyectada
 * (`outSR=4326`, porque el servicio es EPSG:3857 nativo) y los nombres de campo
 * llegan recortados a diez letras, herencia del shapefile del que salieron
 * — `DENOMINACI`, `NOMENCLATU`, `LONG_OFICI`. Se renombran aquí a las mismas
 * claves que usa el portal CKAN, para que la ficha de la aplicación no tenga
 * que saber de qué catálogo vino cada capa.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PUBLIC, getJson, log, warn, roundCoords } from './shared.js'

const ARCGIS = 'https://services.arcgis.com/hkQNLKNeDVYBjvFE/arcgis/rest/services'

/** Página máxima del servicio: `maxRecordCount` es 1000 en las tres capas. */
const PAGE = 1000

interface ArcgisSpec {
  /** Fichero de salida en public/layers/ */
  out: string
  /** Servicio y capa, tal cual salen en el catálogo del portal. */
  service: string
  label: string
  /**
   * Renombrado de campos. Lo que no esté aquí se cae: `OBJECTID` es el
   * identificador interno de la base de Esri y cambia con cada publicación, así
   * que enseñarlo en una ficha sería enseñar ruido.
   */
  rename: Record<string, string>
  /** Cuántos registros anuncia el catálogo. Si llegan otros, se avisa. */
  expect: number
}

const SPECS: ArcgisSpec[] = [
  {
    // Sustituye a `vias-interurbanas-…` de CKAN, que son las MISMAS vías menos
    // ocho: CKAN publica solo las 53 de titularidad insular, y este servicio
    // añade la carretera del Parque Nacional, la del aeropuerto y seis
    // municipales. Comprobado tramo a tramo el 12 ago 2026: los 53 de CKAN
    // están todos aquí, con la misma nomenclatura y la misma denominación.
    out: 'carreteras.geojson',
    service: 'carreteras/FeatureServer/2',
    label: 'Red de carreteras de la isla (61 tramos)',
    expect: 61,
    rename: {
      NOMENCLATU: 'nomenclatura',
      DENOMINACI: 'denominacion',
      RECORRIDO: 'recorrido',
      COLOR: 'color_cartografico',
      LONG_OFICI: 'longitud_oficial_m',
      LONG_GIS: 'longitud_gis_m',
    },
  },
  {
    out: 'miradores.geojson',
    service: 'Miradores/FeatureServer/0',
    label: 'Miradores (29)',
    expect: 29,
    // La capa publica un solo campo, y es el nombre. No hay municipio, ni
    // acceso, ni cota: la ficha lo completa con lo que sabe la aplicación
    // —altitud del modelo de elevación y municipio por geometría—, marcado
    // aparte de lo que dice la fuente.
    rename: { Name: 'nombre' },
  },
  {
    // Los cuatro faros de la isla. La capa publica SOLO el municipio: no trae
    // nombre, ni alcance, ni característica de la luz. No se inventa ninguno
    // —«Faro de Fuencaliente» sería adivinar cuál de los dos de la punta es—:
    // la ficha se titula con el municipio y la aplicación añade la altitud del
    // modelo de elevación, que es lo que sí sabe.
    out: 'faros.geojson',
    service: 'Faros/FeatureServer/0',
    label: 'Faros (4)',
    expect: 4,
    rename: { Municipio: 'municipio' },
  },
  {
    // Antenas de telecomunicaciones, con la TDT dentro.
    //
    // Es la capa que el portal enseña como «Localización de antenas y
    // cobertura de señal TDT». De cobertura no publica ningún polígono: lo que
    // hay son los 100 emplazamientos, y el visor del Cabildo dibuja la
    // cobertura como imagen, no como dato. Así que aquí entran las antenas y
    // la aplicación no dibuja ninguna mancha de cobertura, que sería
    // inventársela.
    //
    // Medido el 13 ago 2026: 33 de telefonía móvil, 32 de televisión, 14 de
    // enlace, 11 de la red Tetra de emergencias y 10 de radio.
    out: 'telecomunicaciones.geojson',
    service: 'Telecomunicaciones/FeatureServer/0',
    label: 'Antenas de telecomunicaciones (100)',
    expect: 100,
    rename: { Ubicacion: 'nombre', Municipio: 'municipio', Tipo: 'tipo' },
  },
  {
    // Sondeo de cobertura móvil. Las 669 medidas son de NOVIEMBRE Y DICIEMBRE
    // DE 2013 —comprobado fila a fila el 13 ago 2026— y no hay ninguna
    // posterior. Se guarda con los campos crudos porque la fecha de cada
    // medida es parte del dato: sin ella, un mapa de cobertura de hace trece
    // años se lee como el de hoy. Ver `lib/coverage/field.ts`.
    out: 'cobertura-movil.geojson',
    service: 'Cobertura_movil/FeatureServer/0',
    label: 'Sondeo de cobertura móvil de 2013 (669 medidas)',
    expect: 669,
    rename: { GSM_down: 'GSM_down', GSM_up: 'GSM_up', UMTS: 'UMTS', Fecha: 'fecha' },
  },
]

interface EsriGeoJson {
  features: { geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> | null }[]
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
}

/**
 * Descarga una capa entera, paginando si hace falta.
 *
 * Ninguna de las dos capas de aquí llega hoy a las 1000 filas, pero el servicio
 * no avisa de que ha recortado más que con `exceededTransferLimit`, y una capa
 * silenciosamente truncada es peor que una que falla: el mapa saldría con media
 * isla sin carreteras y sin un solo error por ninguna parte.
 */
async function fetchAll(service: string): Promise<EsriGeoJson['features']> {
  const features: EsriGeoJson['features'] = []
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${ARCGIS}/${service}/query?where=1%3D1&outFields=*&returnGeometry=true` +
      `&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${PAGE}`
    const page = await getJson<EsriGeoJson>(url)
    features.push(...(page.features ?? []))
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit
    if (!more || !page.features?.length) return features
  }
}

/**
 * Aplica el renombrado y tira lo que no está en la tabla.
 *
 * Es una lista blanca a propósito: un campo nuevo en origen se queda fuera
 * hasta que alguien lo mire y decida cómo se llama en castellano, en vez de
 * aparecer solo en la ficha con su nombre de columna de Esri.
 */
export function renameProps(
  props: Record<string, unknown> | null,
  rename: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [from, to] of Object.entries(rename)) {
    const v = props?.[from]
    if (v === null || v === undefined || String(v).trim() === '') continue
    out[to] = v
  }
  return out
}

export interface LayerIndexEntry {
  file: string
  features: number
  label: string
}

/**
 * Deja las capas en `public/layers/` y devuelve sus entradas para el índice.
 * No escribe `index.json`: lo escribe `prepare-data.ts` con todo junto, para
 * que el índice no dependa de en qué orden se ejecutaron los dos módulos.
 */
export async function prepareArcgis(): Promise<Record<string, LayerIndexEntry>> {
  const index: Record<string, LayerIndexEntry> = {}

  for (const spec of SPECS) {
    try {
      const features = await fetchAll(spec.service)
      if (features.length !== spec.expect) {
        warn(
          `${spec.out}: ${features.length} features, se esperaban ${spec.expect} ` +
            '(el catálogo del portal ha cambiado: revisa el número en el README)',
        )
      }
      const fc = {
        type: 'FeatureCollection',
        features: features
          .filter((f) => f.geometry)
          .map((f) => ({
            type: 'Feature' as const,
            geometry: {
              ...f.geometry!,
              coordinates: roundCoords(f.geometry!.coordinates),
            },
            properties: renameProps(f.properties, spec.rename),
          })),
      }
      await writeFile(path.join(PUBLIC, 'layers', spec.out), JSON.stringify(fc))
      index[spec.out.replace('.geojson', '')] = {
        file: `/layers/${spec.out}`,
        features: fc.features.length,
        label: spec.label,
      }
      log(`${spec.out}: ${fc.features.length} features (ArcGIS ${spec.service})`)
    } catch (e) {
      warn(`${spec.service}: ${String(e)}`)
    }
  }

  return index
}
