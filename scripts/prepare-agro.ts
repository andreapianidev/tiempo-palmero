/**
 * Las capas agrarias e hidráulicas del Cabildo.
 *
 * VIVE APARTE DE `prepare-arcgis.ts` porque el trato es distinto, no porque
 * haya crecido. Aquél baja capas pequeñas enteras y las guarda tal cual; aquí
 * hay dos problemas que no tiene:
 *
 * **1. La capa de cultivos no se puede servir entera.** Son 217.137 polígonos.
 * Filtrada a lo que está en cultivo quedan 40.387, y medido contra la API el
 * 13 ago 2026 eso son **35 MB** de GeoJSON crudo y **10 MB** simplificando a
 * `maxAllowableOffset=0.0001` (~11 m). Cualquiera de las dos cifras es
 * inaceptable para un teléfono. Así que no se descarga: se descarga un
 * **resumen por municipio y familia de cultivo** —14 filas × 6 familias, unos
 * pocos KB— y el detalle de UNA parcela se pide en vivo cuando alguien pincha
 * el mapa (`lib/agro/parcel.ts`, 0,8 s medidos). Es el mismo trato que la
 * aplicación ya le da a los puntos de interés cercanos: agregado congelado,
 * detalle bajo demanda.
 *
 * **2. La infraestructura hídrica son siete capas que forman una sola idea.**
 * Canales, balsas, nacientes, pozos y galerías se publican por separado y en
 * el mapa son la misma pregunta: por dónde va el agua. Se juntan por geometría
 * —433 puntos de captación y almacenamiento en un fichero, 133 trazados de
 * canal en otro— con un campo `clase` que dice de cuál de las siete venía
 * cada uno.
 *
 * ⚠️ La capa de cultivos la levantó el Gobierno de Canarias **entre 2002 y
 * 2008**, según su propia descripción. En 2021 el Tajogaite sepultó parte de
 * la platanera del Valle de Aridane. Todo lo que sale de aquí lleva el año
 * pegado, y `CROP_LAYER_YEAR` en `lib/agro/crops.ts` es el único sitio donde
 * se escribe.
 */

import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PUBLIC, getJson, log, warn, roundCoords, type LayerIndexEntry } from './shared.js'
import { CROPS } from '../src/lib/agro/crops.js'

const ARCGIS = 'https://services.arcgis.com/hkQNLKNeDVYBjvFE/arcgis/rest/services'
const PAGE = 1000

/**
 * Qué cuenta como «en cultivo» y a qué familia va cada código sale del MISMO
 * catálogo que usa la aplicación, `src/lib/agro/crops.ts`, no de una copia.
 *
 * La versión anterior repetía aquí las dos tablas. Era exactamente el fallo que
 * este repositorio acaba de corregir con `lib/variables.ts`: dos listas que
 * nadie obliga a coincidir acaban divergiendo, y el síntoma habría sido un
 * resumen por municipio que suma hectáreas de un cultivo que la ficha de
 * parcela ya no reconoce. `prepare-data.ts` y `prepare-guagua.ts` ya importan
 * de `../src`, así que no hay nada nuevo que montar.
 */
const CROPPED = CROPS.filter((c) => c.kcMid !== null)
const CROPPED_CODES = CROPPED.map((c) => c.code)
const FAMILY_OF: Record<string, string> = Object.fromEntries(
  CROPPED.map((c) => [c.code, c.family]),
)

interface EsriStatsRow {
  attributes: Record<string, string | number | null>
}

// ---------------------------------------------------------------------------
// 1. Resumen de cultivos por municipio
// ---------------------------------------------------------------------------

export interface CropSummaryRow {
  /** Código INE, el mismo `codmun` que trae `municipios.geojson`. */
  codmun: number
  municipio: string
  /** Parcelas y hectáreas por familia. */
  families: Record<string, { parcels: number; hectares: number }>
  parcels: number
  hectares: number
}

/**
 * Pide el agregado al servidor en UNA consulta.
 *
 * `groupByFieldsForStatistics` hace el trabajo en la base de Esri: bajan 14×17
 * filas de números en vez de 40.387 geometrías. Es la diferencia entre un
 * script de dos segundos y uno de cuarenta peticiones.
 */
async function fetchCropSummary(): Promise<CropSummaryRow[]> {
  const where = `CULTIVO IN (${CROPPED_CODES.map((c) => `'${c}'`).join(',')})`
  const stats = [
    { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
    { statisticType: 'sum', onStatisticField: 'Shape__Area', outStatisticFieldName: 'm2' },
  ]
  const url =
    `${ARCGIS}/Agricultura/FeatureServer/0/query?` +
    `where=${encodeURIComponent(where)}` +
    `&groupByFieldsForStatistics=COD_MUNIC,CULTIVO` +
    `&outStatistics=${encodeURIComponent(JSON.stringify(stats))}&f=json`

  const body = await getJson<{ features?: EsriStatsRow[] }>(url)
  const rows = body.features ?? []

  // Los nombres NO se cablean: salen del propio `municipios.geojson` que la
  // aplicación ya sirve, emparejados por `codmun`. Una tabla de códigos INE
  // escrita a mano aquí sería otra cosa más que puede desviarse del dato.
  const muni = JSON.parse(
    await readFile(path.join(PUBLIC, 'layers', 'municipios.geojson'), 'utf8'),
  ) as { features: { properties: { codmun: number; municipio: string } }[] }
  const names = new Map(muni.features.map((f) => [f.properties.codmun, f.properties.municipio]))

  const byMuni = new Map<number, CropSummaryRow>()
  for (const r of rows) {
    const codmun = Number(r.attributes.COD_MUNIC)
    const code = String(r.attributes.CULTIVO ?? '').trim()
    const family = FAMILY_OF[code]
    const parcels = Number(r.attributes.n ?? 0)
    const hectares = Number(r.attributes.m2 ?? 0) / 1e4
    // Las dos parcelas con `COD_MUNIC` en blanco se caen: sin municipio no hay
    // fila donde sumarlas, y son dos de 40.387.
    if (!family || !names.has(codmun)) continue

    let row = byMuni.get(codmun)
    if (!row) {
      row = { codmun, municipio: names.get(codmun)!, families: {}, parcels: 0, hectares: 0 }
      byMuni.set(codmun, row)
    }
    const f = (row.families[family] ??= { parcels: 0, hectares: 0 })
    f.parcels += parcels
    f.hectares += hectares
    row.parcels += parcels
    row.hectares += hectares
  }

  for (const row of byMuni.values()) {
    row.hectares = Math.round(row.hectares * 10) / 10
    for (const f of Object.values(row.families)) {
      f.hectares = Math.round(f.hectares * 10) / 10
    }
  }

  return [...byMuni.values()].sort((a, b) => b.hectares - a.hectares)
}

// ---------------------------------------------------------------------------
// 2. Infraestructura hídrica
// ---------------------------------------------------------------------------

interface HydroSpec {
  service: string
  clase: string
  label: string
  expect: number
  rename: Record<string, string>
}

/**
 * Las siete capas, con el número de features que tenían el 13 ago 2026.
 *
 * `MASAS_AGUA_SUBTERRANEA` NO está aquí y es deliberado: publica un esquema de
 * 29 columnas y **cero filas**. Una capa vacía en el conmutador es una promesa
 * incumplida cada vez que alguien la enciende.
 */
const HYDRO: HydroSpec[] = [
  {
    service: 'CANAL_LPI/FeatureServer/0',
    clase: 'canal',
    label: 'Canal LP-I',
    expect: 88,
    rename: { NombreObra: 'nombre', Tipo_Red: 'tipo_red', CodObraHi: 'codigo' },
  },
  {
    service: 'CANAL_LPII/FeatureServer/0',
    clase: 'canal',
    label: 'Canal LP-II',
    expect: 44,
    rename: { NombreObra: 'nombre', Tipo_Red: 'tipo_red', CodObraHi: 'codigo' },
  },
  {
    service: 'CANAL_LPIII/FeatureServer/0',
    clase: 'canal',
    label: 'Canal LP-III',
    expect: 1,
    rename: { NombreObra: 'nombre', Tipo_Red: 'tipo_red', CodObraHi: 'codigo' },
  },
  {
    service: 'BALSAS/FeatureServer/0',
    clase: 'balsa',
    label: 'Balsas de agua',
    expect: 12,
    rename: { DenObraHi: 'nombre', CAPACIDAD: 'capacidad' },
  },
  {
    service: 'NACIENTES/FeatureServer/0',
    clase: 'naciente',
    label: 'Nacientes',
    expect: 150,
    rename: { NOMBRE: 'nombre', MUNICIPIO: 'municipio', COMARCA: 'comarca', CODIGO: 'codigo' },
  },
  {
    service: 'Pozos/FeatureServer/0',
    clase: 'pozo',
    label: 'Pozos',
    expect: 84,
    rename: {
      Nombre_de: 'nombre', Municipio: 'municipio', Paraje: 'paraje',
      Altitud__m: 'altitud_m', Estado: 'estado', Subtipo: 'subtipo',
    },
  },
  {
    service: 'Galerías/FeatureServer/0',
    clase: 'galeria',
    label: 'Galerías',
    expect: 187,
    rename: {
      Nombre_de: 'nombre', Municipio: 'municipio', Paraje: 'paraje',
      Altitud__m: 'altitud_m', Estado: 'estado', Subtipo: 'subtipo',
    },
  },
]

interface EsriGeoJson {
  features: {
    geometry: { type: string; coordinates: unknown } | null
    properties: Record<string, unknown> | null
  }[]
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
}

async function fetchAll(service: string): Promise<EsriGeoJson['features']> {
  const features: EsriGeoJson['features'] = []
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${ARCGIS}/${encodeURI(service)}/query?where=1%3D1&outFields=*&returnGeometry=true` +
      `&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${PAGE}`
    const page = await getJson<EsriGeoJson>(url)
    features.push(...(page.features ?? []))
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit
    if (!more || !page.features?.length) return features
  }
}

function renameProps(
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

export async function prepareAgro(): Promise<Record<string, LayerIndexEntry>> {
  const index: Record<string, LayerIndexEntry> = {}

  // --- Resumen de cultivos ---
  try {
    const rows = await fetchCropSummary()
    const totals = rows.reduce(
      (a, r) => ({ parcels: a.parcels + r.parcels, hectares: a.hectares + r.hectares }),
      { parcels: 0, hectares: 0 },
    )
    await writeFile(
      path.join(PUBLIC, 'layers', 'cultivos-resumen.json'),
      JSON.stringify({
        year: 2008,
        source: 'Cabildo Insular de La Palma · Agricultura',
        note: 'Capa levantada entre 2002 y 2008. No refleja la erupción de 2021.',
        totals: { ...totals, hectares: Math.round(totals.hectares * 10) / 10 },
        municipios: rows,
      }),
    )
    log(
      `cultivos-resumen.json: ${rows.length} municipios, ` +
        `${totals.parcels} parcelas, ${Math.round(totals.hectares)} ha`,
    )
    if (rows.length !== 14) {
      warn(`cultivos-resumen: ${rows.length} municipios, se esperaban 14`)
    }
  } catch (e) {
    warn(`resumen de cultivos: ${String(e)}`)
  }

  // --- Infraestructura hídrica, las seis capas en una ---
  try {
    const points: unknown[] = []
    const lines: unknown[] = []
    for (const spec of HYDRO) {
      const features = await fetchAll(spec.service)
      if (features.length !== spec.expect) {
        warn(
          `${spec.label}: ${features.length} features, se esperaban ${spec.expect} ` +
            '(el catálogo del Cabildo ha cambiado: revisa el número en el README)',
        )
      }
      for (const f of features) {
        if (!f.geometry) continue
        const feature = {
          type: 'Feature',
          geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) },
          properties: {
            clase: spec.clase,
            origen: spec.label,
            ...renameProps(f.properties, spec.rename),
          },
        }
        // Puntos y trazados van a ficheros distintos: los puntos son una capa
        // de sitios, con su icono y su ficha, y los canales son líneas que se
        // pintan como tales. Mezclarlos obligaría a cada consumidor a filtrar
        // por geometría, que es justo lo que este script existe para evitar.
        ;(f.geometry.type.includes('Point') ? points : lines).push(feature)
      }
      log(`  ${spec.label}: ${features.length}`)
    }

    await writeFile(
      path.join(PUBLIC, 'layers', 'hidrico.geojson'),
      JSON.stringify({ type: 'FeatureCollection', features: points }),
    )
    await writeFile(
      path.join(PUBLIC, 'layers', 'hidrico-canales.geojson'),
      JSON.stringify({ type: 'FeatureCollection', features: lines }),
    )
    index.hidrico = {
      file: '/layers/hidrico.geojson',
      features: points.length,
      label: `Captación y almacenamiento de agua: balsas, nacientes, pozos y galerías (${points.length})`,
    }
    index['hidrico-canales'] = {
      file: '/layers/hidrico-canales.geojson',
      features: lines.length,
      label: `Canales de transporte de agua LP-I, LP-II y LP-III (${lines.length})`,
    }
    log(`hidrico: ${points.length} puntos, ${lines.length} trazados`)
  } catch (e) {
    warn(`infraestructura hídrica: ${String(e)}`)
  }

  return index
}
