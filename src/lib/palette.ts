/**
 * Paletas. Una escala divergente para temperatura, secuenciales para humedad
 * y punto de rocío, y una escala de bandas —no continua— para el CO₂.
 *
 * La del CO₂ es a propósito escalonada y no interpolada: un gradiente suave
 * entre 900 y 1100 ppm sugiere una transición gradual donde en realidad hay un
 * umbral de decisión.
 */

export type RgbStop = [number, string]

/** Divergente centrada en ~18 °C, la media insular a media altura. */
export const TEMP_STOPS: RgbStop[] = [
  [2, '#3b4b8c'],
  [8, '#4a7fb5'],
  [13, '#6fb0b8'],
  [18, '#8fc79a'],
  [22, '#e2c56a'],
  [27, '#e0854a'],
  [33, '#c4403a'],
]

export const HUMIDITY_STOPS: RgbStop[] = [
  [10, '#8a6a3a'],
  [35, '#b99a5c'],
  [55, '#8fae82'],
  [75, '#4f9fa8'],
  [95, '#2f5f96'],
]

/**
 * Déficit de presión de vapor, kPa. Secuencial de húmedo a sediento.
 *
 * Los cortes no son estéticos: 0,4 y 1,6 kPa son los bordes de la banda que la
 * horticultura bajo plástico maneja como cómoda —por debajo el aire no seca y
 * aparece hongo, por encima la planta empieza a cerrar estomas—. Son rangos de
 * manejo de invernadero, no umbrales medidos en La Palma, y así se dicen en la
 * interfaz. El salto de color en 1,6 es deliberado y algo brusco, para que la
 * frontera se vea en el mapa en vez de disolverse en un degradado.
 */
export const VPD_STOPS: RgbStop[] = [
  [0, '#2f5f96'],
  [0.4, '#4f9fa8'],
  [1.0, '#8fc79a'],
  [1.6, '#e2c56a'],
  [2.5, '#e0854a'],
  [4, '#a8332f'],
]

export const DEWPOINT_STOPS: RgbStop[] = [
  [-5, '#5b5f8c'],
  [4, '#5a8fb0'],
  [10, '#6fae9a'],
  [15, '#9dbf72'],
  [20, '#d9a95c'],
  [25, '#c9603c'],
]

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export function sampleRamp(stops: RgbStop[], value: number): [number, number, number] {
  if (!Number.isFinite(value)) return [58, 55, 51]
  if (value <= stops[0][0]) return hexToRgb(stops[0][1])
  for (let i = 0; i < stops.length - 1; i++) {
    const [va, ca] = stops[i]
    const [vb, cb] = stops[i + 1]
    if (value <= vb) {
      const t = (value - va) / (vb - va)
      const A = hexToRgb(ca)
      const B = hexToRgb(cb)
      return [
        Math.round(A[0] + (B[0] - A[0]) * t),
        Math.round(A[1] + (B[1] - A[1]) * t),
        Math.round(A[2] + (B[2] - A[2]) * t),
      ]
    }
  }
  return hexToRgb(stops[stops.length - 1][1])
}

export function rampCss(stops: RgbStop[]): string {
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]
  const parts = stops.map(([v, c]) => `${c} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`)
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export function cssColor(stops: RgbStop[], value: number): string {
  const [r, g, b] = sampleRamp(stops, value)
  return `rgb(${r},${g},${b})`
}

// ---------------------------------------------------------------------------
// CO₂ — bandas, no gradiente
// ---------------------------------------------------------------------------

export interface Co2Band {
  /** Límite inferior en ppm, inclusive. */
  from: number
  color: string
  /** Etiqueta descriptiva. Nunca dice «seguro». */
  label: string
}

/**
 * Las etiquetas describen la MEDIDA, no dan una garantía. En esta app no
 * aparece la palabra «seguro» en ningún sitio: quien decide si un sitio es
 * seguro es el Cabildo, no una pantalla.
 */
/**
 * Suelo de medida de los equipos DEMASE, en ppm.
 *
 * No es una banda: es el valor más bajo que el sensor sabe declarar. Medido
 * sobre la red en vivo el 12 ago 2026, **169 de los 182 sensores que
 * transmitían daban exactamente 400,00** — un fondo atmosférico real no se
 * repite clavado en 169 equipos, y además el fondo global de 2026 está más
 * cerca de 420 que de 400. Es un suelo, y la ficha lo dice en vez de dejar que
 * la cifra más repetida de la red pase por una medida precisa.
 */
export const CO2_FLOOR_PPM = 400

export const CO2_BANDS: Co2Band[] = [
  { from: 0, color: '#5b7f6a', label: 'Nivel ambiental' },
  { from: 1000, color: '#c8a850', label: 'Por encima del ambiental' },
  { from: 5000, color: '#d97b3c', label: 'Concentración alta' },
  { from: 30000, color: '#b8322c', label: 'Concentración muy alta' },
]

export function co2Band(ppm: number): Co2Band {
  let band = CO2_BANDS[0]
  for (const b of CO2_BANDS) if (ppm >= b.from) band = b
  return band
}

// ---------------------------------------------------------------------------
// Frescura de las estaciones
// ---------------------------------------------------------------------------

export const FRESHNESS_COLOR = {
  live: '#5fbf7f', // < 1 h
  recent: '#e2c56a', // < 24 h
  dead: '#6b6560', // sin señal
} as const
