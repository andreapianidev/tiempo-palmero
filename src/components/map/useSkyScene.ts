/**
 * La escena del cielo: nubes, lluvia, el disco del sol, su carrera, las
 * estrellas y la luna.
 *
 * POR QUÉ VAN JUNTAS. Todas dibujan sobre el mismo trozo de pantalla —los 3,4°
 * de cielo que la cámara alcanza a enseñar con el relieve de casa— y todas
 * comparten la misma regla de profundidad: escriben a profundidad 1 para que el
 * relieve las tape. Repartidas por `MapView` estaban a cien líneas unas de
 * otras, con la malla interpolada y el viento en medio.
 *
 * LOS DATOS ENTRAN POR MÉTODO Y LA CAPA NO SE VUELVE A CREAR NUNCA. Aquí eso
 * importa el doble que en el resto: recrear una capa no solo recompilaría sus
 * sombreadores, rebarajaría las siluetas de todas las nubes, reiniciaría la
 * cortina de lluvia a medio caer y volvería a subir los 214 KB del catálogo de
 * estrellas.
 *
 * EL ORDEN DE LOS EFECTOS DENTRO DE ESTE FICHERO ES EL QUE TENÍAN. Se movieron
 * en bloque y sin reordenar: React ejecuta los efectos en el orden en que se
 * declaran, y el de las nubes tiene que correr antes que el del mar, que
 * refleja esas mismas nubes.
 */

import { useEffect, type MutableRefObject } from 'react'
import type { CloudLayer } from '../sky/CloudLayer'
import type { RainLayer } from '../sky/RainLayer'
import type { OceanLayer } from '../ocean/OceanLayer'
import type { StarLayer } from '../stars/StarLayer'
import type { MoonLayer } from '../moon/MoonLayer'
import type { PlanetLayer } from '../planets/PlanetLayer'
import type { SunLayer } from '../sky/SunLayer'
import type { SunPathLayer } from '../sky/SunPathLayer'
import type { Terrain3D } from '../terrain/Terrain3D'
import { dayFactor } from '../../lib/sun'
import type { Props } from './types'

export interface SkySceneRefs {
  cloud: MutableRefObject<CloudLayer | null>
  rain: MutableRefObject<RainLayer | null>
  /** El mar refleja las MISMAS nubes: por eso está aquí y no solo en el suyo. */
  ocean: MutableRefObject<OceanLayer | null>
  star: MutableRefObject<StarLayer | null>
  moon: MutableRefObject<MoonLayer | null>
  planet: MutableRefObject<PlanetLayer | null>
  sun: MutableRefObject<SunLayer | null>
  sunPath: MutableRefObject<SunPathLayer | null>
  /** El relieve, para el empujón de cámara del botón «mirar al cielo». */
  terrain: MutableRefObject<Terrain3D | null>
}

export function useSkyScene(ready: boolean, props: Props, refs: SkySceneRefs): void {
  const { dem } = props
  const {
    cloud: cloudLayerRef,
    rain: rainLayerRef,
    ocean: oceanLayerRef,
    star: starLayerRef,
    moon: moonLayerRef,
    planet: planetLayerRef,
    sun: sunLayerRef,
    sunPath: sunPathLayerRef,
    terrain: terrainRef,
  } = refs

  //
  // Mismo criterio que las dos anteriores: los datos entran por método y la capa
  // no se vuelve a crear nunca. Aquí importa el doble, porque recrearla no solo
  // recompilaría los shaders: rebarajaría las siluetas de todas las nubes y
  // reiniciaría la cortina de lluvia a medio caer.
  //
  // La escena y la lluvia se ponen en el MISMO efecto y con la misma
  // dependencia. Son la misma escena vista dos veces —de qué nubes cae el agua
  // es una propiedad de esas nubes—, y separarlos abría la puerta a un
  // fotograma con la lluvia de la escena anterior colgando de las nubes de la
  // nueva.
  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setScene(props.sky3d.clouds)
    rainLayerRef.current?.setScene(props.sky3d.clouds, dem)
    // El mar refleja el MISMO cielo: las nubes que le llegan son las de la
    // escena, ni una versión de segunda. Con la escena apagada la lista va
    // vacía y el reflejo vuelve al cielo analítico de siempre.
    oceanLayerRef.current?.setClouds(props.sky3d.on ? props.sky3d.clouds : [])
  }, [ready, props.sky3d.clouds, props.sky3d.on, dem])

  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setVisible(props.sky3d.on)
    rainLayerRef.current?.setVisible(props.sky3d.on)
  }, [ready, props.sky3d.on])

  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setExaggeration(props.terrain.exaggeration)
    rainLayerRef.current?.setExaggeration(props.terrain.exaggeration)
  }, [ready, props.terrain.exaggeration])

  // La luz. Las dos capas tienen que recibir el MISMO sol: si la nube se
  // apagara al anochecer y la lluvia no, se vería llover de un cielo vacío.
  //
  // Y la nube recibe además la luz completa —la que ilumina el agua y pinta la
  // cúpula—, de la que saca dos cosas: el color al que se desvanece la distancia
  // y la luz que hay de noche. Va aparte del sol porque no depende del
  // interruptor de luz solar: la escena atmosférica se dibuja con su propio
  // interruptor y el aire que hay delante existe igual.
  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setSun(props.sky3d.sun)
    cloudLayerRef.current?.setLight(props.sunLight.dome)
    sunLayerRef.current?.setSun(props.sky3d.sun)
    sunLayerRef.current?.setLight(props.sunLight.dome)
    sunPathLayerRef.current?.setLight(props.sunLight.dome)
    rainLayerRef.current?.setDay(dayFactor(props.sky3d.sun.elevationDeg))
  }, [ready, props.sky3d.sun, props.sunLight.dome])

  // El disco del sol tiene su propia casilla: es lo único de esta función que
  // se DIBUJA en vez de iluminar, y dibujar un sol sobre un mapa de datos es una
  // decisión de quien mira, no del programa.
  useEffect(() => {
    if (!ready) return
    sunLayerRef.current?.setVisible(props.sunLight.disc)
  }, [props.sunLight.disc])

  /**
   * El cielo estrellado. El catálogo sube una sola vez —`setData` es
   * idempotente— y el estado de la escena cada vez que cambia la hora, el
   * fotómetro o una casilla.
   */
  useEffect(() => {
    const layer = starLayerRef.current
    if (!layer) return
    if (props.nightSky.data) {
      layer.setData(props.nightSky.data.catalog, props.nightSky.data.figures)
    }
    if (props.nightSky.scene) layer.setState(props.nightSky.scene)
    layer.setVisible(props.nightSky.on && !!props.nightSky.scene)
  }, [ready, props.nightSky.on, props.nightSky.data, props.nightSky.scene])

  /**
   * La luna. Va por su cuenta y no dentro del efecto de arriba porque NO
   * DEPENDE DEL CATÁLOGO: se dibuja aunque los 133 KB de estrellas no hayan
   * llegado o hayan fallado, que es lo correcto —la luna se ve igual—.
   */
  useEffect(() => {
    const layer = moonLayerRef.current
    if (!layer) return
    if (props.nightSky.moon) layer.setState(props.nightSky.moon)
    layer.setVisible(props.nightSky.on && !!props.nightSky.moon)
  }, [ready, props.nightSky.on, props.nightSky.moon])

  // El camino del sol: su propia casilla, y su propio dato. Se recalcula solo
  // cuando cambia el día —`sunTrack` se memoriza fuera—, así que esto es una
  // asignación por minuto y no una vuelta por las cuarenta y tres posiciones.
  useEffect(() => {
    if (!ready) return
    sunPathLayerRef.current?.setTrack(props.sunLight.track)
  }, [ready, props.sunLight.track])

  useEffect(() => {
    if (!ready) return
    sunPathLayerRef.current?.setVisible(props.sunLight.path)
  }, [ready, props.sunLight.path])

  /**
   * El empujón: subir la cámara hasta donde hay cielo.
   *
   * Con la inclinación de entrada —55°— el borde de arriba de la pantalla queda
   * por debajo del horizonte, así que se marca la casilla del disco y no aparece
   * nada. La cuenta y los tres casos en los que esto no hace nada están en
   * `Terrain3D.skyward()`.
   *
   * VA AQUÍ Y NO EN `App` porque la 3D y el fondo se encienden en el mismo
   * chasquido, y hasta que React no los aplica la cámara sigue bloqueada en
   * plano: un `skyward()` llamado dentro del manejador del interruptor no movería
   * un grado. Este efecto corre DESPUÉS del de la vista 3D —está declarado más
   * abajo— así que para cuando llega, el tope de inclinación ya es el nuevo.
   *
   * El contador arranca en cero y ese cero no hace nada: un ajuste guardado de
   * la visita anterior no levanta la cámara al arrancar. Lo primero que esta
   * aplicación tiene que enseñar es la isla en plano, con su dato encima.
   */
  useEffect(() => {
    if (!ready || props.sunLight.nudge === 0) return
    terrainRef.current?.skyward(props.sunLight.lookAt)
    // `lookAt` a propósito fuera de las dependencias: el rumbo cambia cada
    // minuto y esto no es un seguimiento, es un empujón. Con él dentro, la
    // cámara giraría sola cada vez que el sol se mueve un cuarto de grado.
  }, [ready, props.sunLight.nudge])


  /**
   * Los planetas. Como la luna, no dependen del catálogo de estrellas: la
   * tabla son 36 KB propios y se dibujan aunque los 133 KB de estrellas estén
   * descargándose o hayan fallado.
   */
  useEffect(() => {
    const layer = planetLayerRef.current
    if (!layer) return
    if (props.nightSky.planetTable) layer.setTable(props.nightSky.planetTable)
    if (props.nightSky.planets) layer.setState(props.nightSky.planets)
    layer.setVisible(
      props.nightSky.on && !!props.nightSky.planets && !!props.nightSky.planetTable,
    )
  }, [ready, props.nightSky.on, props.nightSky.planets, props.nightSky.planetTable])
}
