/**
 * La vista en tres dimensiones: los parámetros de la escena.
 *
 * QUÉ AÑADE Y QUÉ NO. El modelo de elevación ya estaba: son las mismas teselas
 * terrarium de `public/dem/` que dibujan el sombreado y de las que el motor
 * saca las cotas de cada punto. Aquí no se descarga ni un byte nuevo —MapLibre
 * reutiliza la fuente `terrain` que `mapStyle.ts` ya declara, y que ya está en
 * memoria por el `hillshade`—; lo único que cambia es que esa malla, en vez de
 * servir solo para sombrear un plano, pasa a ser geometría.
 *
 * Y el sombreado NO se apaga al inclinar la cámara. MapLibre no ilumina el
 * terreno: sin la capa `hillshade` encima, el relieve en 3D sale plano de color
 * y no se distingue un barranco de una ladera. Las dos cosas se complementan —
 * la geometría pone la silueta, el sombreado pone la forma.
 *
 * ESTE FICHERO NO ENCIENDE NADA. Solo dice cómo es la escena. Quien se la
 * aplica al mapa es `components/terrain/Terrain3D.ts`.
 */

import type { SkySpecification, TerrainSpecification } from 'maplibre-gl'

/** El id de la fuente `raster-dem` del estilo. Está en un solo sitio. */
export const TERRAIN_SOURCE = 'terrain'

/**
 * Exageración vertical. Por defecto 1: la isla tal como es.
 *
 * Medido sobre el propio DEM el 13 de agosto de 2026 (1792 × 2304 px a
 * 33,54 m/px, z12, las 63 teselas de `public/dem/`):
 *
 *   - cota máxima **2400,1 m**. El Roque de los Muchachos mide 2426: los 26 m
 *     que faltan son la resolución de la malla, no un fallo del modelo.
 *   - pendiente máxima píxel a píxel, con base de 67 m: **362,7 %**, o sea
 *     **74,6°**. Son las paredes de la Caldera de Taburiente.
 *   - sobre 1 km: 81,2 % (39,1°). Sobre 3 km: 33,0 % (18,2°).
 *
 * Con una pared real de 74,6° ya medida, exagerar sale caro enseguida: a 1,25×
 * pasa a 77,6°, a 1,5× a 79,6° y a 2× a 82,1° — una pared vertical dibujada
 * donde no la hay. Por eso el tope es 1,5× y no 3×, que es lo que ofrecen los
 * visores que no tienen que responder de lo que enseñan.
 *
 * Y el multiplicador va escrito en el propio botón. Es la misma regla que en
 * el resto de la aplicación: una cifra corregida se enseña diciendo por cuánto.
 */
export const EXAGGERATIONS = [1, 1.25, 1.5] as const
export type Exaggeration = (typeof EXAGGERATIONS)[number]
export const DEFAULT_EXAGGERATION: Exaggeration = 1

/**
 * La pendiente máxima del DEM, como tangente. 362,7 % — los 74,6° de arriba.
 *
 * Está aquí y no escrita a mano en el panel porque es una cifra MEDIDA, y las
 * cifras medidas se cambian en un sitio: el día que el DEM suba de resolución,
 * esta sube con él y el texto de la interfaz se entera solo.
 */
export const MAX_SLOPE_TAN = 3.627

/** A cuántos grados sale esa pared con la vertical estirada por `x`. */
export function slopeDegrees(exaggeration: number): number {
  return (Math.atan(MAX_SLOPE_TAN * exaggeration) * 180) / Math.PI
}

/**
 * Hasta dónde se puede inclinar la cámara. 65°, no los 85 que admite MapLibre.
 *
 * Dos motivos, y ninguno es estético:
 *
 *  1. Cuanto más rasante es la vista, más cerca queda la cámara de meterse
 *     DENTRO del terreno cuando el centro del mapa cae en un barranco — y en
 *     esta isla el centro cae en un barranco casi siempre.
 *  2. Más rasante también es más isla en pantalla a la vez, y con un fondo de
 *     GRAFCAN encendido eso son más teselas pedidas a un servicio cuya licencia
 *     dice «se prohíbe la descarga masiva de información». El `bounds` de esas
 *     fuentes ya impide pedir mar abierto; el tope de inclinación es lo que
 *     acota el resto.
 */
export const MAX_PITCH = 65

/**
 * El tope en 2D: cero.
 *
 * MapLibre trae el arrastre con el botón derecho activado de fábrica, así que
 * hasta ahora la vista se podía inclinar sin querer y sin terreno debajo —un
 * plano torcido, que no es una vista, es un accidente—. Con la 3D como modo
 * aparte, el modo plano es plano de verdad. Girar el norte se sigue pudiendo.
 */
export const FLAT_MAX_PITCH = 0

/**
 * Inclinación de llegada al encender.
 *
 * 55° deja la cumbre recortada contra el cielo sin que el horizonte se coma la
 * mitad de la pantalla. Desde ahí se sube o se baja a mano hasta los 65.
 */
export const ENTRY_PITCH = 55

/**
 * El cielo. Solo existe porque existe la vista inclinada.
 *
 * Va declarado en el estilo desde el principio y no se enciende ni se apaga: el
 * sombreador de MapLibre solo pinta los fragmentos por encima del horizonte, y
 * con la cámara a cero el horizonte está en el infinito, así que en 2D esto no
 * dibuja nada. Comprobado leyendo `skyFrag` de maplibre-gl 4.7.1 (`if (y >
 * u_horizon)`), que es más fiable que encenderlo y apagarlo en cada cambio.
 *
 * Los colores son los de la casa, no los de un cielo diurno: el mapa es oscuro
 * —el mar es `#080b10`— y un cielo azul claro encima convertiría la isla en un
 * recorte pegado sobre otra aplicación. Lo que se busca es que el horizonte se
 * separe del mar lo justo para que la silueta se lea.
 */
export const SKY: SkySpecification = {
  'sky-color': '#070a12',
  'horizon-color': '#3a4152',
  'sky-horizon-blend': 0.5,
  // La bruma de distancia. Sin ella la cumbre lejana se ve con el mismo
  // contraste que la ladera de delante y la profundidad desaparece.
  'fog-color': '#141924',
  'fog-ground-blend': 0.55,
  'horizon-fog-blend': 0.7,
}

/** Lo que se le pasa a `map.setTerrain()`. */
export function terrainSpec(exaggeration: number): TerrainSpecification {
  return { source: TERRAIN_SOURCE, exaggeration }
}

/** `1` → `1×`, `1.25` → `1,25×`. Con coma, como el resto de cifras. */
export function exaggerationLabel(x: number): string {
  return `${String(x).replace('.', ',')}×`
}
