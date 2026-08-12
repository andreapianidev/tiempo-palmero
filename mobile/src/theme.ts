/**
 * Los tokens del diseño de iOS, tal cual.
 *
 * Salen del prototipo `tiempo-palmero-ios.html` y se copian con sus valores
 * exactos —incluidos los medios píxeles y los tamaños con decimales— porque son
 * los que hacen que la pantalla se lea como se diseñó. Cambiar 13,5 px por 14
 * «que queda igual» es justo lo que convierte un diseño en otro parecido.
 *
 * Aquí NO hay colores de dato: la rampa de temperatura, las bandas de CO₂ y los
 * colores de frescura viven en `@core/lib/palette`, compartidos con la web, y
 * son los mismos números en las tres plataformas.
 */

import { Platform } from 'react-native'

export const color = {
  ink: '#0d0c0b',
  panel: 'rgba(22,21,19,0.92)',
  line: 'rgba(255,255,255,0.13)',
  hairline: 'rgba(255,255,255,0.055)',
  fg: '#f4f1ec',
  dim: '#a8a29a',
  faint: '#7d786f',
  amber: '#e8b35c',
  /** Fondo de los elementos flotantes sobre el mapa, antes del desenfoque. */
  float: 'rgba(22,21,19,0.75)',
  floatSolid: 'rgba(22,21,19,0.88)',
  /** Tinta sobre ámbar y sobre las píldoras de color. */
  onLight: '#141311',
  pillDim: '#3a3733',
  pillDimText: '#e8e4de',
  dot: '#e8e4de',
  me: '#4a8fe0',
  ok: '#7fbf87',
  warn: '#e2c56a',
  bad: '#c9503c',
} as const

/**
 * Familias reales, no alias. `expo-font` registra estos nombres y en Android no
 * existe el peso sintético: cada grosor es una familia distinta o no se ve.
 */
export const font = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
} as const

/** Curva de iOS del prototipo: `cubic-bezier(.32,.72,0,1)`. */
export const easing = [0.32, 0.72, 0, 1] as const

export const duration = {
  peek: 320,
  screen: 340,
} as const

export const radius = {
  card: 22,
  pill: 999,
  fab: 23,
} as const

export const space = {
  /** Margen lateral de la pantalla del mapa. */
  gutter: 18,
  /** Margen lateral de la pantalla de detalle. */
  sheet: 20,
} as const

/**
 * Sombra de las tarjetas flotantes. En iOS es una sombra de verdad; en Android,
 * elevación, que es lo único que el sistema sabe pintar.
 */
export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  default: { elevation: 12 },
})

export const pillShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  default: { elevation: 4 },
})
