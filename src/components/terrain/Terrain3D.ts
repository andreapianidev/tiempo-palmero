/**
 * Encender y apagar la vista en tres dimensiones.
 *
 * Es un objeto con estado y no una función suelta porque encender la 3D son
 * cinco cosas que tienen que pasar EN ORDEN y deshacerse en el orden inverso:
 * el tope de inclinación, el terreno, la brújula, el giro de la cámara y —solo
 * al apagar— volver a bloquear el plano cuando la animación haya terminado.
 * Repartir eso por los efectos de `MapView` era garantizar que algún día
 * quedara la brújula de un modo que ya no está.
 *
 * Vive junto a `WindLayer` en su propio directorio y por el mismo motivo: es
 * estado de MapLibre que sobrevive a los renders de React, así que se guarda en
 * una ref y se le mandan órdenes, en vez de reconstruirlo.
 *
 * QUÉ SE DRAPEA Y QUÉ NO. MapLibre proyecta sobre el terreno las capas de tipo
 * `background`, `fill`, `line`, `raster` y `hillshade` (la lista `LAYERS` de su
 * `RenderToTexture`), y eso cubre TODO lo que dibuja esta aplicación salvo dos
 * cosas: los símbolos —que la librería eleva por su cuenta— y las capas
 * personalizadas. La malla interpolada es una fuente `image` con capa `raster`,
 * así que se pega al relieve sola. El viento es una capa personalizada y no:
 * ver `MapView`, que lo apaga mientras la vista esté inclinada.
 */

import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { skyCeilingDeg } from '../../lib/sky/sun-screen'
import {
  DEFAULT_EXAGGERATION,
  ENTRY_PITCH,
  FLAT_MAX_PITCH,
  MAX_PITCH,
  terrainSpec,
} from '../../lib/terrain'

/** Lo que tarda la cámara en levantarse y en volver a caer. */
const ENTER_MS = 900
const EXIT_MS = 600

export class Terrain3D {
  private on = false
  private exaggeration: number = DEFAULT_EXAGGERATION
  /** La brújula solo existe mientras haya algo que orientar. */
  private compass: maplibregl.NavigationControl | null = null
  private lockTimer: ReturnType<typeof setTimeout> | null = null
  /** Hasta dónde deja inclinarse el fondo de ahora. Ver `maxPitchFor`. */
  private ceiling: number = MAX_PITCH

  constructor(private readonly map: MlMap) {}

  setEnabled(on: boolean): void {
    if (on === this.on) return
    this.on = on
    if (on) this.enter()
    else this.exit()
  }

  /**
   * El tope de inclinación del fondo que hay puesto.
   *
   * Se puede llamar con la 3D apagada —entonces solo se guarda— y también con
   * la cámara ya inclinada por encima del tope nuevo, que es lo que pasa al
   * cambiar del relieve a un fondo de GRAFCAN mirando rasante: ahí la cámara
   * BAJA hasta el tope, con animación, en vez de quedarse fuera de rango.
   */
  setCeiling(ceiling: number): void {
    if (ceiling === this.ceiling) return
    this.ceiling = ceiling
    if (!this.on) return
    this.map.setMaxPitch(ceiling)
    if (this.map.getPitch() > ceiling) {
      this.map.easeTo({ pitch: ceiling, duration: ENTER_MS })
    }
  }

  setExaggeration(exaggeration: number): void {
    if (exaggeration === this.exaggeration) return
    this.exaggeration = exaggeration
    // Apagada, el valor se guarda y se aplicará al encender. Llamar a
    // `setTerrain` con la 3D apagada la encendería por la puerta de atrás.
    if (this.on) this.map.setTerrain(terrainSpec(exaggeration))
  }

  /**
   * Sube la cámara hasta el tope, que es donde el cielo entra en pantalla.
   *
   * LO PIDEN LAS DOS CASILLAS QUE DIBUJAN EN EL CIELO —el disco del sol y su
   * carrera—, y por el mismo motivo por el que encender el mar lleva al fondo de
   * satélite: un interruptor que no hace nada es peor que uno que hace de más.
   * Con la inclinación de entrada, 55°, el borde de arriba de la pantalla queda
   * por DEBAJO del horizonte: se enciende el sol y no aparece nada, que es
   * exactamente la queja que trajo todo esto.
   *
   * NO HACE NADA EN TRES CASOS, y los tres son a propósito: con la 3D apagada
   * —ahí la cámara está bloqueada en plano—, con un fondo cuyo tope no llega a
   * enseñar el horizonte —los de GRAFCAN, 65°— y con la vista ya arriba, para no
   * dar un tirón a quien ya estaba mirando el cielo.
   */
  skyward(): void {
    if (!this.on) return
    if (skyCeilingDeg(this.ceiling) <= 0) return
    if (this.map.getPitch() >= this.ceiling - 0.5) return
    this.map.easeTo({ pitch: this.ceiling, duration: ENTER_MS })
  }

  private enter(): void {
    const map = this.map
    this.clearLock()
    // El tope va ANTES del giro: con `maxPitch` a cero, `easeTo` se recortaría
    // a sí mismo y la cámara no se movería ni un grado.
    map.setMaxPitch(this.ceiling)
    map.setTerrain(terrainSpec(this.exaggeration))
    if (!this.compass) {
      this.compass = new maplibregl.NavigationControl({
        // Solo la brújula: los botones de zoom ya están en el control de al
        // lado y duplicarlos sería una columna de cuatro botones.
        showZoom: false,
        showCompass: true,
        visualizePitch: true,
      })
      map.addControl(this.compass, 'bottom-right')
    }
    map.easeTo({ pitch: ENTRY_PITCH, duration: ENTER_MS })
  }

  private exit(): void {
    const map = this.map
    map.setTerrain(null)
    if (this.compass) {
      map.removeControl(this.compass)
      this.compass = null
    }
    map.easeTo({ pitch: 0, bearing: 0, duration: EXIT_MS })
    // El tope se vuelve a poner CUANDO la animación ha terminado, no ahora:
    // puesto ahora, `maxPitch = 0` recorta la cámara de golpe y la vista da un
    // salto en vez de bajar.
    //
    // Y con un temporizador, no con `moveend`: si al apagar la cámara ya estaba
    // a cero —porque se pulsó la brújula antes— no hay movimiento, `moveend` no
    // llega nunca y el plano se quedaría desbloqueado para siempre.
    this.clearLock()
    this.lockTimer = setTimeout(() => {
      this.lockTimer = null
      // Se puede haber vuelto a encender mientras la cámara bajaba.
      if (!this.on) map.setMaxPitch(FLAT_MAX_PITCH)
    }, EXIT_MS + 50)
  }

  private clearLock(): void {
    if (this.lockTimer === null) return
    clearTimeout(this.lockTimer)
    this.lockTimer = null
  }

  /** Al desmontar el mapa. Sin esto el temporizador toca un mapa ya destruido. */
  destroy(): void {
    this.clearLock()
    this.compass = null
  }
}
