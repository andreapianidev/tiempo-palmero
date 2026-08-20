/**
 * De dónde sale la posición de los planetas: `astronomy-engine`, cargado tarde.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTO SUSTITUYE A UNA TABLA DE CHEBYSHEV, Y CONVIENE DEJAR ESCRITO POR QUÉ,
 * porque la tabla se construyó con un razonamiento que parecía bueno y tenía un
 * número mal medido dentro.
 *
 * Aquí hubo `table.ts` y `scripts/prepare-planetas.ts`: polinomios de Chebyshev
 * ajustados en Node a la posición heliocéntrica de siete cuerpos, servidos como
 * `public/cielo/planetas.bin`. La decisión que los justificaba decía que meter
 * `astronomy-engine` en el navegador «son 200 KB de JavaScript». **Esa cifra
 * era el fichero sin minificar leído del disco**, no lo que viaja por el cable,
 * y la decisión entera colgaba de ella.
 *
 * MEDIDO CONTRA EL BUILD DE ESTE REPOSITORIO, no estimado:
 *
 * | | tamaño en el cable | caduca |
 * |---|---:|---|
 * | `planetas.bin` (lo que había) | 35,85 KB gz | 1 ene 2036 |
 * | este `import()` (chunk propio) | **19,61 KB gz** | nunca |
 *
 * La tabla de coeficientes pesaba **casi el doble** que la biblioteca que se
 * escribió para no descargar. Son flotantes binarios: no comprimen. El
 * JavaScript sí.
 *
 * EL BUNDLE PRINCIPAL NO CRECE, y ésa es la condición de la que depende todo lo
 * anterior. La carga es un `import()` dinámico con desestructuración por
 * nombre, y Rollup la separa en su propio fragmento: quien nunca encienda los
 * planetas no descarga ni un byte de efemérides. Si alguien añade un `import`
 * estático de `astronomy-engine` en código de aplicación, el fragmento se funde
 * con el principal y estos 19,61 KB se los come todo el mundo. La prueba de
 * `sight.test.ts` lo vigila.
 *
 * EL COSTE POR FOTOGRAMA SE MIDIÓ ANTES DE CAMBIARLO, porque era el argumento
 * de verdad a favor de la tabla: la capa recalcula los seis planetas en cada
 * `render`. VSOP87 entero cuesta **0,0735 ms** por fotograma contra los 0,0103
 * del Chebyshev — siete veces más, y aun así **el 0,44 % de un fotograma de
 * 16,7 ms**. Siete veces algo que no se nota sigue sin notarse.
 *
 * LO QUE SE GANA ADEMÁS DEL TAMAÑO ES LA FECHA. Un Chebyshev fuera de su
 * ventana no se degrada: se dispara. Por eso `table.ts` se negaba a extrapolar,
 * el panel tenía un aviso de «fuera de rango» y había una prueba que iba a
 * fallar en 2034 para avisar de que tocaba regenerar el binario. Nada de eso
 * hace falta ya: VSOP87 vale para milenios y esta función no puede devolver
 * «no hay datos para esa fecha».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL MARCO ES EL ECUADOR MEDIO DE J2000, no la eclíptica. `HelioVector`
 * devuelve rectangulares ecuatoriales en UA, y `sight.ts` cuenta con eso: la
 * resta Tierra-planeta da directamente la dirección ecuatorial que espera el
 * sombreador de las estrellas. `table.ts` documentaba «eclípticas J2000» y era
 * mentira —guardaba la salida cruda de esta misma llamada—; la mentira no hizo
 * daño porque nadie se fio del comentario, pero ya costó una vez un cielo
 * girado 23°, y está contado en `sight.ts`.
 */

import type { Body } from 'astronomy-engine'

/**
 * El orden ya no es un formato de fichero: es solo el orden en que se enseñan.
 * La Tierra está en la lista porque hace de origen, no porque se dibuje.
 */
export const PLANET_IDS = [
  'mercurio',
  'venus',
  'tierra',
  'marte',
  'jupiter',
  'saturno',
  'urano',
] as const

export type PlanetId = (typeof PLANET_IDS)[number]

/** Los que se dibujan. */
export const VISIBLE_PLANETS: PlanetId[] = [
  'mercurio',
  'venus',
  'marte',
  'jupiter',
  'saturno',
  'urano',
]

/**
 * Posición heliocéntrica en el ecuador medio de J2000, rectangular, en UA.
 *
 * ES UNA FUNCIÓN Y NO UN MÓDULO IMPORTADO, y ésa es la costura que mantiene
 * `sight.ts` libre de `astronomy-engine`: la efeméride se inyecta. Sin esto,
 * importar `sight.ts` desde cualquier sitio arrastraría la biblioteca al bundle
 * principal, que es exactamente lo que este fichero existe para evitar.
 */
export type PlanetEphemeris = (id: PlanetId, at: number) => [number, number, number]

/**
 * Carga las efemérides. Una sola vez: quien llama guarda el resultado.
 *
 * LA DESESTRUCTURACIÓN POR NOMBRE NO ES ESTILO. Con `import('astronomy-engine')`
 * a secas y el espacio de nombres entero en la mano, Rollup no puede podar nada
 * y el fragmento pasa de 19,61 KB a 44,30 KB comprimidos. Medido con este mismo
 * build, cambiando solo esa línea.
 */
export async function loadPlanetEphemeris(): Promise<PlanetEphemeris> {
  const { Body, HelioVector } = await import('astronomy-engine')
  const bodies: Record<PlanetId, Body> = {
    mercurio: Body.Mercury,
    venus: Body.Venus,
    tierra: Body.Earth,
    marte: Body.Mars,
    jupiter: Body.Jupiter,
    saturno: Body.Saturn,
    urano: Body.Uranus,
  }
  return (id, at) => {
    const v = HelioVector(bodies[id], new Date(at))
    return [v.x, v.y, v.z]
  }
}
