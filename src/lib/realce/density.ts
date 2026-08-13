/**
 * Cuántos píxeles se le piden a GRAFCAN por tesela.
 *
 * Hasta ahora se pedían 512 × 512 y se dibujaban en un cuadro de 512 CSS px.
 * En una pantalla de las que hay hoy —cualquier portátil de Apple, cualquier
 * móvil— ese cuadro son 1024 píxeles físicos, así que el navegador ampliaba
 * cada tesela al doble antes de enseñarla. De ahí la carta topográfica lechosa
 * y la ortofoto blanda de las capturas: no era el servicio, era que se le
 * pedía la mitad de lo que iba a hacer falta.
 *
 * QUE EL SERVIDOR DIBUJA MÁS FINO, NO AMPLÍA, ESTÁ MEDIDO. Tesela z16 sobre
 * Los Llanos de Aridane, 13 de agosto de 2026, misma bbox, energía media del
 * laplaciano (|∇²| medio por píxel, en niveles de 0–255):
 *
 *                        512 pedidos      1024 pedidos     512 ampliado a 1024
 *   Topográfico MT20        49,2              37,7                 17,4
 *   Ortofoto                52,2              38,6                 18,1
 *
 * La columna que importa es la de la derecha contra la del medio, que son las
 * dos formas de llenar los mismos 1024 píxeles: el servidor pone **2,17×**
 * (MT20) y **2,13×** (ortofoto) el detalle fino que pone el interpolador del
 * navegador. Es cartografía nueva, no un aumento.
 *
 * POR QUÉ EL TOPE ES 2 Y NO MÁS. A 2048 la ortofoto TODAVÍA trae detalle real
 * —37,7 → 32,4 de laplaciano, cuando ampliar la de 1024 daría ~18—, porque el
 * vuelo territorial está a 25 cm y a esa escala se pide 30 cm. Pero la tesela
 * pasa a pesar 1,07 MB. La licencia de GRAFCAN dice «se prohíbe la descarga
 * masiva de información», y aunque esto no descarga más SUPERFICIE, cuadruplicar
 * el peso de cada tesela para un detalle que ninguna pantalla puede enseñar es
 * exactamente lo que esa frase pide no hacer. El coste real del salto que sí se
 * nota, medido sobre las mismas teselas:
 *
 *   MT20     86,7 kB → 295 kB   (3,4×)
 *   Ortofoto 91,9 kB → 305 kB   (3,3×)
 *
 * y el mismo número de peticiones, que es lo que cuenta para un servicio.
 *
 * Quien tenga una pantalla de densidad 1 no paga nada de esto: se le siguen
 * pidiendo 512.
 */

/** El lado en CSS px de una tesela de fondo. Lo fija `basemaps.ts`. */
export const TILE_CSS_SIZE = 512

/**
 * El techo, en densidad de pantalla. Por encima de 2 no se pide más: ver
 * arriba por qué.
 */
export const MAX_DENSITY = 2

/**
 * La densidad que se va a usar, redondeada hacia arriba al medio punto.
 *
 * Hacia ARRIBA porque una pantalla de 1,5 que recibe teselas de densidad 1 las
 * amplía —justo el problema— y una que recibe 2 las reduce, que no se nota.
 * Al medio punto y no libre porque cada densidad distinta es una URL distinta:
 * con el valor crudo, dos pestañas con zoom del navegador diferente no
 * comparten ni una tesela en la caché.
 */
export function tileDensity(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return 1
  return Math.min(MAX_DENSITY, Math.ceil(devicePixelRatio * 2) / 2)
}

/** Los píxeles que van en `width=` y `height=` de la petición WMS. */
export function tileRequestPixels(devicePixelRatio: number): number {
  return TILE_CSS_SIZE * tileDensity(devicePixelRatio)
}

/**
 * La densidad de esta pantalla. Se lee una vez, al construir las fuentes: si
 * cambiara a mitad de sesión —arrastrar la ventana a otro monitor— cambiaría
 * la URL de todas las teselas y habría que recargarlas todas para ganar
 * nitidez en un caso que casi no pasa.
 */
export function screenDensity(): number {
  return typeof window === 'undefined' ? 1 : tileDensity(window.devicePixelRatio)
}
