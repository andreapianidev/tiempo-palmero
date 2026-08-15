/**
 * Las manchas que las nubes echan sobre la isla.
 *
 * ES LO MÁS RECONOCIBLE DE UN DÍA CON NUBES, y hasta ahora no estaba. La escena
 * dibujaba cúmulos encendidos por la cara que les da el sol y flotando a su cota
 * —eso lleva desde `sky/`—, pero el suelo debajo seguía uniformemente iluminado.
 * Una nube que no proyecta nada se lee como una calcomanía pegada sobre el
 * paisaje, y el ojo lo nota aunque no sepa decir qué falla: es el mismo defecto
 * que tenían las nubes cuando se movían rígidas, y la misma clase de arreglo.
 *
 * CÓMO CAE UNA SOMBRA DE NUBE. Cada mota está a una cota; su sombra cae a
 * `altura / tan(elevación)` metros en la dirección en la que VIAJA la luz, o sea
 * la contraria a la del sol. A mediodía la mancha está casi debajo de la nube; a
 * las siete de la tarde, con el sol a 10°, una nube a 1200 m proyecta a **6,8 km**
 * de distancia, que es por lo que en un atardecer las sombras aparecen en sitios
 * donde no hay ninguna nube encima.
 *
 * Y SE ESTIRAN. La sombra de una esfera sobre un plano horizontal no es un
 * círculo salvo con el sol en la vertical: es una elipse alargada `1/sen(h)` en
 * la dirección de la luz. Con el sol a 10° eso son 5,8 veces — una mota redonda
 * de 500 m deja una mancha de casi 6 km de larga. No es un adorno: es lo que
 * hace que las sombras del atardecer se lean como cuchillas tumbadas sobre el
 * terreno en vez de como lunares.
 *
 * LA MANCHA ATERRIZA SOBRE EL RELIEVE, no sobre el nivel del mar. Se resuelve
 * con una iteración: se proyecta al plano cero, se lee la cota del terreno donde
 * ha caído y se vuelve a proyectar desde esa cota. Con una basta —el rayo baja
 * mucho más deprisa de lo que sube el terreno salvo en las paredes de la
 * Caldera, y allí la diferencia es de una celda.
 *
 * LO OSCURO NO SE ELIGE. La opacidad de cada nube ya es dato de la escena, y el
 * espesor óptico por mota sale de la misma inversa que usa `CloudLayer` para
 * repartirla: apilar `EFFECTIVE_OVERLAP` capas tiene que devolver la opacidad de
 * la nube entera. Compartir esa constante con la capa que las dibuja no es
 * economía — es que una nube que se ve espesa desde abajo tiene que dar una
 * sombra espesa, y con dos números distintos no lo haría.
 *
 * CUBRE EL MAPA ENTERO Y NO EL RECUADRO DEL DEM, que es más grande de lo que
 * parece: el modelo de elevación abarca 0,62° de longitud y el mapa se puede
 * arrastrar por 0,95°. Calculando la mancha solo donde hay montañas, las sombras
 * terminaban en una raya recta sobre el mar, DENTRO de lo que se ve. Una nube
 * sobre el agua echa su sombra igual que una sobre tierra; lo que no hay fuera
 * del DEM es relieve sobre el que aterrizar, y ahí se toma el nivel del mar,
 * que es lo que hay.
 *
 * NO DIBUJA NADA. Devuelve la misma malla que `terrain.ts`; quien la pinta es
 * `components/shadow/CloudShadowLayer.ts`.
 */

import type { Dem } from '../dem'
import { elevationAt } from '../dem'
import { lonToPixelX, latToPixelY, MAP_BBOX, M_PER_DEG_LAT, M_PER_DEG_LON } from '../geo'
import { EFFECTIVE_OVERLAP, type Cloud } from '../sky/scene'
import type { SkyPosition } from '../sun'
import { MIN_SUN_ELEVATION, type ShadowMask } from './terrain'

const RAD = Math.PI / 180

/**
 * Submuestreo por defecto, en píxeles del DEM.
 *
 * Cuatro, o sea celdas de 134 m, y va más grueso que el de las sombras del
 * relieve a propósito: aquéllas tienen bordes duros que cortan un barranco, y
 * éstas no tienen ningún borde duro que resolver. La estructura más fina de una
 * sombra de nube son los lóbulos de la propia nube, que miden de 300 a 800 m
 * —los radios de mota de `sky/scene.ts`—, así que 134 m los resuelve con holgura.
 *
 * Y la resolución aquí se paga cuatro veces, porque esta malla se rehace mientras
 * las nubes se mueven y la del relieve solo cuando el sol cambia de sitio.
 */
const DEFAULT_STEP = 4

/**
 * La sombra de las nubes sobre el terreno.
 *
 * `null` con el sol bajo el horizonte o sin nubes: no hay nada que proyectar, y
 * quien llama apaga la capa en vez de dejar puesta la última.
 */
export function cloudShadowMask(
  dem: Dem,
  clouds: readonly Cloud[],
  sun: SkyPosition,
  { step = DEFAULT_STEP }: { step?: number } = {},
): ShadowMask | null {
  if (sun.elevationDeg <= MIN_SUN_ELEVATION || !clouds.length) return null

  const { zoom } = dem.manifest
  // El recuadro es el del MAPA, no el del DEM. Ver la cabecera.
  const originX = lonToPixelX(MAP_BBOX.west, zoom)
  const originY = latToPixelY(MAP_BBOX.north, zoom)
  const width = Math.ceil((lonToPixelX(MAP_BBOX.east, zoom) - originX) / step)
  const height = Math.ceil((latToPixelY(MAP_BBOX.south, zoom) - originY) / step)
  const metersPerCell = dem.manifest.metersPerPixel * step

  const el = sun.elevationDeg * RAD
  const az = sun.azimuthDeg * RAD
  // Hacia dónde VIAJA la luz, que es lo contrario de hacia dónde está el sol.
  const travelE = -Math.sin(az)
  const travelN = -Math.cos(az)
  const tanEl = Math.tan(el)
  const sinEl = Math.sin(el)
  // Lo que se estira la elipse en la dirección de la luz.
  const stretch = 1 / Math.max(sinEl, 1e-3)
  // La misma dirección, pero en la malla: la fila crece hacia el SUR.
  const alongX = travelE
  const alongY = -travelN

  const tau = new Float32Array(width * height)

  for (const cloud of clouds) {
    // Espesor óptico del centro de una mota, para que apilando las que se
    // solapan salga la opacidad de la nube.
    const density = Math.min(0.999, cloud.density)
    if (density <= 0) continue
    const tauPuff = -Math.log(1 - density) / EFFECTIVE_OVERLAP
    const mPerDegLon = M_PER_DEG_LON * Math.cos(cloud.lat * RAD)
    const thickness = cloud.top - cloud.base

    for (const puff of cloud.puffs) {
      const lon = cloud.lon + puff.dx / mPerDegLon
      const lat = cloud.lat + puff.dy / M_PER_DEG_LAT
      const altitude = cloud.base + puff.h * thickness

      // Primera caída, al nivel del mar; después, corregida por la cota del
      // terreno donde ha aterrizado.
      const groundLon = (m: number) => lon + (travelE * m) / mPerDegLon
      const groundLat = (m: number) => lat + (travelN * m) / M_PER_DEG_LAT
      const first = altitude / tanEl
      const terrain = elevationAt(dem, groundLon(first), groundLat(first)) ?? 0
      const run = Math.max(0, altitude - Math.max(0, terrain)) / tanEl
      const hitLon = groundLon(run)
      const hitLat = groundLat(run)

      // A celdas de la malla.
      const cx = (lonToPixelX(hitLon, zoom) - originX) / step
      const cy = (latToPixelY(hitLat, zoom) - originY) / step
      const minor = puff.radiusM / metersPerCell
      const major = minor * stretch

      // Recuadro de la elipse, para no recorrer la malla entera por mota.
      const extentX = Math.abs(alongX) * major + Math.abs(alongY) * minor
      const extentY = Math.abs(alongY) * major + Math.abs(alongX) * minor
      const x0 = Math.max(0, Math.floor(cx - extentX))
      const x1 = Math.min(width - 1, Math.ceil(cx + extentX))
      const y0 = Math.max(0, Math.floor(cy - extentY))
      const y1 = Math.min(height - 1, Math.ceil(cy + extentY))
      if (x1 < x0 || y1 < y0) continue

      for (let y = y0; y <= y1; y++) {
        const oy = y + 0.5 - cy
        for (let x = x0; x <= x1; x++) {
          const ox = x + 0.5 - cx
          // Descompuesta en la dirección de la luz y en la perpendicular.
          const along = (ox * alongX + oy * alongY) / major
          const across = (ox * -alongY + oy * alongX) / minor
          const t2 = along * along + across * across
          if (t2 >= 1) continue
          // Camino óptico por una esfera: proporcional a la cuerda, que es
          // `2r·√(1−t²)`. No es un desvanecido de dibujo, es la geometría.
          tau[y * width + x] += tauPuff * Math.sqrt(1 - t2)
        }
      }
    }
  }

  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) {
    if (tau[i] <= 0) continue
    data[i] = Math.round((1 - Math.exp(-tau[i])) * 255)
  }

  return { data, width, height, step, metersPerCell, originX, originY }
}
