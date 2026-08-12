/**
 * Un tramo de carretera, leído de la capa del Cabildo.
 *
 * La capa trae seis campos y ninguno se llama «titularidad». El catálogo CKAN
 * sí la publicaba, pero solo porque su fichero contenía ÚNICAMENTE las vías
 * insulares: las 53 llevaban el mismo valor. El Feature Service del portal trae
 * esas 53 y ocho más, y a esas ocho la titularidad se la dice el propio campo
 * de nomenclatura, que en vez de un código pone quién es el titular:
 * «Municipal» seis veces, «Parque Nacional» una y «Aerpuerto» —así, sin la o—
 * la del aeropuerto.
 *
 * De ahí la regla de `ownerOf`: si la nomenclatura es un código LP-n, el tramo
 * es insular; si no, la nomenclatura ES el titular. No es una suposición, es la
 * comparación de los dos ficheros: los 53 códigos LP-* del fichero de vías
 * insulares están todos en el servicio, uno a uno, y ninguno de los ocho
 * restantes lleva código.
 */

const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s && s !== 'null' && s !== 'NA' ? s : undefined
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Titular del tramo, o `null` si la capa no da con qué decidirlo. */
export function ownerOf(nomenclatura: string | undefined): string | null {
  if (!nomenclatura) return null
  return /^LP-\s*\d/i.test(nomenclatura) ? 'insular' : nomenclatura
}

export interface RoadRecord {
  /** Código de la vía (LP-1, LP-108…) cuando lo tiene. */
  code: string | null
  /** Nombre del tramo en mayúsculas, tal como lo publica la fuente. */
  name: string
  /** De dónde a dónde va, en palabras del Cabildo. */
  route: string | null
  /** `insular`, `Municipal`, `Parque Nacional`… Ver el comentario de arriba. */
  owner: string | null
  /** Longitud oficial y longitud medida sobre el trazado, en metros. */
  officialM: number | null
  gisM: number | null
  /** Color con el que la cartografía oficial dibuja la vía. */
  cartoColor: string | null
}

export function readRoad(props: Record<string, unknown>): RoadRecord {
  const code = str(props.nomenclatura)
  const owner = ownerOf(code)
  return {
    // Cuando la nomenclatura es el titular, no es un código de vía y no se
    // enseña como tal: «Municipal» no identifica ninguna carretera.
    code: owner === 'insular' ? (code ?? null) : null,
    name: str(props.denominacion) ?? code ?? '—',
    route: str(props.recorrido) ?? null,
    owner,
    officialM: num(props.longitud_oficial_m),
    gisM: num(props.longitud_gis_m),
    cartoColor: str(props.color_cartografico) ?? null,
  }
}
