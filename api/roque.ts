/**
 * Proxy de la estación meteorológica del TNG, en el Roque de los Muchachos.
 *
 * POR QUÉ HACE FALTA UN PROXY. `tngweb.tng.iac.es` no manda ninguna cabecera
 * `access-control-allow-origin` —comprobado el 13 ago 2026 con un `Origin:`
 * de producción—, así que el navegador no puede leerlo directamente. El
 * servidor sí.
 *
 * QUÉ ES ESTA FUENTE, Y QUÉ NO. El Telescopio Nazionale Galileo es un
 * observatorio de investigación, no un portal de datos abiertos: publica su
 * meteorología porque le sirve para operar, no porque se haya comprometido a
 * servírsela a nadie. De ahí las tres decisiones de este fichero:
 *
 *  - **Se cachea 5 minutos.** La estación publica cada ~30 s, pero la app no
 *    necesita ese ritmo y el TNG no tiene por qué pagar nuestro tráfico.
 *  - **Se degrada, no se cae.** Si el origen no contesta, esto devuelve 503 y
 *    la sección desaparece del panel. Ninguna otra parte de la aplicación se
 *    entera. No es un dato de seguridad como el CO₂: es un extra.
 *  - **`stale-if-error`.** Aquí sí, al revés que en `co2.ts`: una temperatura
 *    de cumbre de hace diez minutos sigue siendo informativa, y el flag
 *    `outdated` que trae cada campo permite decir cuándo dejó de serlo.
 *
 * La respuesta del origen ya trae, campo a campo, `timestamp`, `outdated` y
 * `level`. Se pasan tal cual: esa autodeclaración de obsolescencia es lo mejor
 * que tiene esta fuente y tirarla para «simplificar» sería perder justo la
 * parte honesta.
 */

export const config = { runtime: 'edge' }

const TNG = 'https://tngweb.tng.iac.es/api/meteo/weather'

export default async function handler(): Promise<Response> {
  try {
    const res = await fetch(TNG, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) throw new Error(`origen HTTP ${res.status}`)
    const data = await res.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('respuesta inesperada')
    }

    return new Response(JSON.stringify({ fetchedAt: Date.now(), data }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, s-maxage=300, stale-if-error=1800',
      },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'estación del Roque no disponible',
        detail: e instanceof Error ? e.message : String(e),
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
