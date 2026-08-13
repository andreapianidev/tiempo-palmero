/**
 * Los cultivos de La Palma, y cuánta agua pide cada uno.
 *
 * DE DÓNDE SALE LA LISTA. Del Feature Service `Agricultura/FeatureServer/0`
 * del Cabildo: 217.137 parcelas, 71 códigos de cultivo, con `CULTIVO` numérico
 * y `DESCRIP` en castellano. Los códigos y las superficies de aquí están
 * medidos contra la propia API el 13 ago 2026 con una consulta de estadística
 * agrupada, no copiados de ningún documento.
 *
 * ⚠️ **LA CAPA ES DE 2008.** Lo dice el propio servicio en su descripción:
 * «Esta capa de cultivos fue realizada por el Gobierno de Canarias entre el
 * año 2002 y cuando fue publicada, en el año 2008». Entre medias está el
 * Tajogaite, que en 2021 sepultó buena parte de la platanera del Valle de
 * Aridane. Ninguna pantalla de esta aplicación enseña estos polígonos sin
 * decir la fecha, y el mapa superpone el perímetro de la colada precisamente
 * para que se vea qué parte de ese dato ya no existe.
 *
 * DE DÓNDE SALEN LOS Kc. De la tabla 12 de FAO-56 (Allen, Pereira, Raes y
 * Smith, «Crop evapotranspiration — Guidelines for computing crop water
 * requirements», FAO Irrigation and Drainage Paper 56, 1998), que es el mismo
 * documento del que sale la ETo que publica Open-Meteo, así que las dos
 * mitades de `ETc = ETo × Kc` hablan el mismo idioma.
 *
 * Se usa el Kc de MEDIA ESTACIÓN (`Kc mid`) y una sola cifra por cultivo, no
 * la curva de cuatro fases. La razón es que la fase la marca la fecha de
 * plantación de CADA parcela, y eso no está en ningún dato publicado: fingir
 * una curva exigiría inventarse el calendario de 217.000 parcelas. Con una
 * plantación perenne y escalonada como la platanera canaria, además, el Kc mid
 * es la mejor aproximación de una sola cifra que existe. La interfaz dice que
 * es media estación, y de ahí no se mueve.
 */

/** Un cultivo tal como lo publica el Cabildo, con lo que la app añade. */
export interface Crop {
  /** `CULTIVO` del Feature Service. Es texto: hay códigos como `T39` o `V11`. */
  code: string
  /** `DESCRIP`, tal cual lo escribe el Cabildo. */
  label: string
  /**
   * Coeficiente de cultivo de media estación (FAO-56, tabla 12). `null` para
   * lo que no es un cultivo: monte, erial, urbano, huerta abandonada. Sin Kc
   * no se calcula demanda, y la ficha lo dice en vez de poner un cero.
   */
  kcMid: number | null
  /** Familia con la que se pinta el mapa. */
  family: CropFamily
}

export type CropFamily = 'platanera' | 'frutal' | 'viña' | 'huerta' | 'pasto' | 'sinCultivo'

/**
 * Los códigos que cubren el 99 % de la superficie catalogada.
 *
 * No están los 71: los que faltan suman menos de 30 ha entre todos y se
 * resuelven por `DESCRIP` en el momento de preparar el dato. Lo que no se
 * reconozca cae en `sinCultivo` con `kcMid: null`, que es no saberlo, no cero.
 *
 * Las superficies del comentario son las medidas el 13 ago 2026.
 */
export const CROPS: readonly Crop[] = [
  // — Lo que de verdad se riega en esta isla —
  // 16.974 parcelas, 2.563,9 ha. El cultivo de exportación de La Palma.
  { code: '21', label: 'Platanera Aire Libre', kcMid: 1.1, family: 'platanera' },
  // 1.847 parcelas, 688,3 ha.
  { code: '20', label: 'Platanera Invernadero', kcMid: 1.1, family: 'platanera' },
  // 959 al aire libre (216,2 ha) y 658 bajo plástico (115,4 ha), mismo código.
  { code: '4', label: 'Aguacate', kcMid: 0.9, family: 'frutal' },
  // 8.260 parcelas, 1.163,5 ha.
  { code: '13', label: 'Viña', kcMid: 0.7, family: 'viña' },
  { code: '3', label: 'Cítricos', kcMid: 0.65, family: 'frutal' },
  { code: '7', label: 'Almendro', kcMid: 0.9, family: 'frutal' },
  { code: '83', label: 'Otros Frutales Templados', kcMid: 0.95, family: 'frutal' },
  // 3.730 parcelas, 331,4 ha.
  { code: '11', label: 'Papa', kcMid: 1.15, family: 'huerta' },
  { code: '12', label: 'Hortalizas Aire Libre', kcMid: 1.0, family: 'huerta' },
  { code: '105', label: 'Huerto Familiar', kcMid: 1.0, family: 'huerta' },
  { code: '120', label: 'Batata o Boniato', kcMid: 1.15, family: 'huerta' },
  { code: '1', label: 'Flores y Plantas Ornamentales y Aromáticas', kcMid: 1.0, family: 'huerta' },
  { code: '19', label: 'Cereales y Leguminosas', kcMid: 1.15, family: 'huerta' },
  { code: '102', label: 'Asociación Viña-Papa', kcMid: 0.9, family: 'viña' },
  { code: '121', label: 'Caña de Azúcar', kcMid: 1.25, family: 'huerta' },
  // 1.908 parcelas, 811,5 ha. Se riega poco, pero es superficie viva.
  { code: '14', label: 'Pastizal', kcMid: 0.85, family: 'pasto' },
  // 1.654 parcelas, 464,8 ha. Forraje de secano, arbustivo y endémico.
  { code: '71', label: 'Tagasaste', kcMid: 0.7, family: 'pasto' },

  // — Lo que NO se riega. Sin Kc a propósito —
  // 41.754 parcelas, 32.374,1 ha: casi la mitad de la superficie catalogada.
  { code: '16', label: 'Monte', kcMid: null, family: 'sinCultivo' },
  // 55.001 parcelas, 15.328,8 ha.
  { code: '17', label: 'Erial', kcMid: null, family: 'sinCultivo' },
  // 67.976 parcelas, 11.678,9 ha. El dato más elocuente de esta capa.
  { code: '36', label: 'Huerta Abandonada', kcMid: null, family: 'sinCultivo' },
  { code: '35', label: 'Huerta en no Cultivo', kcMid: null, family: 'sinCultivo' },
  { code: '39', label: 'Almendro Abandonado', kcMid: null, family: 'sinCultivo' },
  { code: '171', label: 'Urbano y Viales', kcMid: null, family: 'sinCultivo' },
]

const BY_CODE = new Map(CROPS.map((c) => [c.code, c]))

export function cropByCode(code: string): Crop | null {
  return BY_CODE.get(code) ?? null
}

/**
 * Superficie en cultivo según la propia capa: **40.387 parcelas y 6.873,6 ha**,
 * de 217.137 parcelas y 70.666 ha catalogadas. Un 9,7 % de lo cartografiado.
 *
 * Medido el 13 ago 2026 con una consulta de estadística sobre el Feature
 * Service, filtrando por los códigos con Kc de esta tabla, no sumando a mano
 * lo que se ve en pantalla. Vive aquí y no suelto en un texto porque es una de
 * esas cifras que el repositorio obliga a volver a medir cuando cambia, y así
 * hay un solo sitio donde tocarla.
 */
export const CROPPED_PARCELS_2008 = 40_387
export const CROPPED_HECTARES_2008 = 6_873.6
export const CATALOGUED_PARCELS_2008 = 217_137
export const CATALOGUED_HECTARES_2008 = 70_666

/** Año en que se levantó la capa. No es decorativo: es un aviso. */
export const CROP_LAYER_YEAR = 2008
export const CROP_LAYER_SOURCE = 'Cabildo Insular de La Palma · Agricultura (levantada 2002-2008)'
