/**
 * Pendiente y orientación del terreno, sacadas del mismo DEM que todo lo demás.
 *
 * Son las dos primeras derivadas del relieve que este repositorio calcula. Hasta
 * ahora el DEM servía para tres cosas —la cota de un punto, el sombreado y la
 * geometría de la vista 3D— y ninguna de las tres necesitaba saber hacia dónde
 * mira una ladera. Un modelo de incendios sí:
 *
 *  - **La pendiente acelera el fuego cuesta arriba.** La llama se inclina sobre
 *    el combustible que tiene delante y lo precalienta; es el mismo mecanismo
 *    que el viento de espalda. En los modelos de propagación al uso (Rothermel,
 *    1972) el factor de pendiente crece con `tan²(φ)`, así que no es un matiz
 *    en una isla donde el DEM mide paredes de 74,6°.
 *  - **La orientación decide cuánto sol recibe el combustible.** A esta latitud
 *    —28,7° N— una ladera sur recibe muchas más horas de sol directo que una
 *    norte, y el combustible fino llega a la tarde con menos humedad.
 *
 * AQUÍ NO SE DECIDE NADA. Este fichero calcula números del terreno y se para
 * ahí: cuánto pesa cada uno lo dice el modelo entrenado, no una constante
 * escrita a mano. Es la misma separación que hay entre `psychro.ts` —que
 * convierte— y `interpolate.ts` —que decide.
 *
 * MÉTODO. Horn (1981), la ventana de 3×3 con los vecinos diagonales pesando la
 * mitad. Es el método que usan GDAL, GRASS y ArcGIS, y la razón de preferirlo a
 * la diferencia simple de dos vecinos es que promedia el ruido del propio
 * modelo de elevación en vez de amplificarlo — y el DEM de esta aplicación es
 * un remuestreo de SRTM, que trae ruido de sobra.
 *
 * EL PASO ES DE MALLA, NO DE PÍXEL. La pendiente entre dos píxeles contiguos
 * del DEM (33,5 m) no es la pendiente que siente un incendio: es el escalón de
 * cuantización del modelo. Se mide sobre el mismo paso que usa la malla del
 * mapa (~200 m), que además es la escala a la que el resto de la aplicación
 * responde por sus cifras.
 */

import { lonToPixelX, latToPixelY } from '../geo'
import type { Dem } from '../dem'
import { SEA_LEVEL_M } from '../dem'

/**
 * Paso por defecto, en píxeles de DEM. 6 × 33,54 m ≈ 201 m — el mismo de
 * `rasterizeGrid`, para que la pendiente de una celda sea la de esa celda y no
 * la de un retículo distinto que casi coincide.
 */
export const SLOPE_STEP_PX = 6

export interface Relief {
  /** Grados sobre la horizontal, 0–90. */
  slopeDeg: number
  /**
   * Hacia dónde mira la ladera: grados desde el norte, en sentido horario
   * (90 = este, 180 = sur). `null` en terreno llano, donde la orientación no
   * existe — y devolver 0 ahí sería declarar «mira al norte».
   */
  aspectDeg: number | null
  /**
   * Cuánto mira al sur, de −1 (norte franco) a +1 (sur franco). Es
   * `cos(aspecto − 180°)`, o sea el coseno del ángulo que separa la ladera del
   * sur. Vale 0 en terreno llano, que es lo correcto: una meseta no está ni
   * abrigada ni expuesta, recibe el sol del mediodía sin más.
   */
  southness: number
  /** Igual, pero hacia el oeste. `sin(aspecto − 180°)` con signo positivo al oeste. */
  westness: number
}

/** Terreno llano. Lo que se devuelve sobre el mar y fuera del DEM. */
export const FLAT: Relief = { slopeDeg: 0, aspectDeg: null, southness: 0, westness: 0 }

/**
 * Pendiente y orientación en el punto, con la ventana centrada en él.
 *
 * Devuelve `FLAT` —no `null`— cuando el punto cae fuera del DEM o sobre el mar:
 * quien llama ya sabe por la cota si está en tierra, y obligarle a distinguir
 * dos «no hay dato» distintos solo produce ramas muertas.
 */
export function reliefAt(dem: Dem, lon: number, lat: number, stepPx = SLOPE_STEP_PX): Relief {
  const { zoom } = dem.manifest
  const px = lonToPixelX(lon, zoom) - dem.originX
  const py = latToPixelY(lat, zoom) - dem.originY
  return reliefAtPixel(dem, Math.round(px), Math.round(py), stepPx)
}

/**
 * La misma cuenta en coordenadas de píxel del DEM.
 *
 * Existe aparte porque recorrer la isla celda a celda —200.000 celdas en la
 * malla de 200 m— pasando por grados y volviendo a píxeles costaría dos
 * conversiones trigonométricas por celda para llegar al mismo entero.
 */
export function reliefAtPixel(dem: Dem, x: number, y: number, stepPx = SLOPE_STEP_PX): Relief {
  const h = (dx: number, dy: number): number | null => {
    const sx = x + dx * stepPx
    const sy = y + dy * stepPx
    if (sx < 0 || sy < 0 || sx >= dem.width || sy >= dem.height) return null
    return dem.heights[sy * dem.width + sx]
  }

  // Los ocho vecinos de Horn. En el borde del DEM —y en la costa, donde el
  // vecino es mar— se sustituye por la cota del propio punto: el efecto es una
  // pendiente medida solo contra el lado que existe, que es lo honesto, y no
  // un cero que aplanaría un acantilado.
  const c = h(0, 0)
  if (c === null || c <= SEA_LEVEL_M) return FLAT
  const at = (dx: number, dy: number): number => {
    const v = h(dx, dy)
    return v === null || v <= SEA_LEVEL_M ? c : v
  }

  const z1 = at(-1, -1)
  const z2 = at(0, -1)
  const z3 = at(1, -1)
  const z4 = at(-1, 0)
  const z6 = at(1, 0)
  const z7 = at(-1, 1)
  const z8 = at(0, 1)
  const z9 = at(1, 1)

  // En Web Mercator el píxel es cuadrado sobre el terreno —la proyección es
  // conforme—, así que el paso horizontal y el vertical son el mismo número.
  const spacing = stepPx * dem.manifest.metersPerPixel

  // dz/dx positivo hacia el este; dz/dy positivo hacia el NORTE (la fila crece
  // hacia el sur en el raster, de ahí el signo cambiado respecto a la fórmula
  // tal cual se escribe en coordenadas de imagen).
  const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * spacing)
  const dzdy = (z1 + 2 * z2 + z3 - (z7 + 2 * z8 + z9)) / (8 * spacing)

  const rise = Math.hypot(dzdx, dzdy)
  const slopeDeg = (Math.atan(rise) * 180) / Math.PI

  // Por debajo de esto la orientación es ruido del DEM, no una ladera. El corte
  // es el escalón de cuantización del propio modelo: terrarium guarda la cota
  // en 1/256 m, y sobre una base de 201 m eso son 0,0011° de pendiente. Se deja
  // dos órdenes de magnitud por encima —0,1°, que son 35 cm en 201 m— para que
  // una llanura con un píxel mal decodificado no salga «mirando al oeste».
  if (slopeDeg < 0.1) return { slopeDeg, aspectDeg: null, southness: 0, westness: 0 }

  // La ladera mira hacia donde el terreno BAJA: el gradiente apunta cuesta
  // arriba, así que la orientación es su opuesto.
  let aspectDeg = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI
  if (aspectDeg < 0) aspectDeg += 360

  const fromSouth = ((aspectDeg - 180) * Math.PI) / 180
  return {
    slopeDeg,
    aspectDeg,
    southness: Math.cos(fromSouth),
    westness: Math.sin(fromSouth),
  }
}
