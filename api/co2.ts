/**
 * Proxy de la red DEMASE de CO₂ (Puerto Naos / La Bombilla).
 *
 * Esto es un dato de seguridad para la vida. Estos sensores miden hasta 69.301
 * ppm — 6,9 %, letal en minutos — y son el motivo por el que Puerto Naos se
 * evacuó. Todo aquí está escrito para fallar en cerrado.
 *
 * Reglas que aplica este fichero:
 *  - TTL de 30 s. Nunca se sirve un CO₂ cacheado más allá de eso.
 *  - Ni `stale-while-revalidate` ni `stale-if-error`. Un verde rancio es peor
 *    que no tener dato: el usuario decide si entra en una casa mirando esto.
 *  - Si el origen no responde, se devuelve 503 con `failClosed: true`. NUNCA
 *    la última lectura buena.
 *  - No se recorta el valor a rangos de aire interior. 69.000 ppm es real y es
 *    justo el peligro que este sensor existe para medir.
 *
 * El token es una constante pública, impresa en la página 1 de la propia
 * documentación PDF que publica el Cabildo. No es un secreto y no va en una
 * variable de entorno: ponerlo ahí sugeriría que rotarlo sirve de algo.
 */

export const config = { runtime: 'edge' }

const DEMASE = 'https://www.demasesl.com'
const TOKEN = 'Y29udHJvbENPMg-Y0NPMjEyMDc' // guion ASCII, no guion largo

export default async function handler(req: Request): Promise<Response> {
  const which = new URL(req.url).searchParams.get('resource') ?? 'actuales'
  const path =
    which === 'metadato' ? '/MetaDato' : `/datos_actuales?token=${TOKEN}`

  try {
    const res = await fetch(`${DEMASE}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`origen HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('respuesta inesperada')

    return new Response(
      JSON.stringify({ fetchedAt: Date.now(), data }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // El inventario de sensores sí puede cachearse; las lecturas no.
          'cache-control':
            which === 'metadato'
              ? 'public, s-maxage=86400'
              : 'public, s-maxage=30',
        },
      },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'red de CO₂ no disponible',
        detail: e instanceof Error ? e.message : String(e),
        failClosed: true,
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    )
  }
}
