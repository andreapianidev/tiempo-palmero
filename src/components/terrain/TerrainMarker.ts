/**
 * Un marcador que no le pregunta nada a la tarjeta gráfica.
 *
 * QUÉ CAMBIA. Nada de lo que se ve: es un `Marker` de MapLibre con el mismo
 * elemento, la misma posición y el mismo comportamiento. Lo único que se anula
 * es `_updateOpacity`, que es el método que —solo con el terreno encendido— lee
 * un píxel del búfer de profundidad para decidir si el marcador está detrás de
 * una montaña. Ese `readPixels` es una barrera entre CPU y GPU, y con 130
 * marcadores en pantalla se convierte en miles de barreras por segundo. Ver
 * `lib/occlusion.ts`, donde está la medición y la alternativa.
 *
 * QUIÉN SE ENCARGA ENTONCES DE ESCONDERLOS. `MapView`, en la misma pasada en la
 * que ya reparte los solapamientos: recorre la línea entre la cámara y cada
 * marcador sobre el modelo de elevación que ya está en memoria. Sin GPU y sin
 * esperas.
 *
 * SE PISA UN MÉTODO PRIVADO, y eso hay que decirlo: `_updateOpacity` empieza
 * por guion bajo. Si una versión futura de MapLibre lo renombra, esta clase
 * dejará de anular nada y volveremos al comportamiento de fábrica —más lento,
 * pero correcto—, nunca a un fallo. Es la razón por la que se anula un método
 * en vez de tocar el estado interno del marcador.
 */

import maplibregl from 'maplibre-gl'

export class TerrainMarker extends maplibregl.Marker {
  /**
   * La opacidad la decide la aplicación, no el búfer de profundidad.
   *
   * Se pone a mano la opacidad configurada para que el marcador no se quede en
   * el valor que MapLibre le hubiera dejado en el fotograma anterior.
   */
  _updateOpacity(): void {
    const element = this.getElement()
    if (element.style.opacity === '') element.style.opacity = '1'
  }
}
