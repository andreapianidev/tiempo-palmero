/**
 * La textura de detalle: el rizado que no cabe en la geometría.
 *
 * EL PROBLEMA QUE RESUELVE. La rejilla del mar tiene unos 50.000 vértices
 * repartidos por la pantalla, o sea un vértice cada ocho píxeles. Una ola de
 * mar de fondo mide 47 m y a poco zoom son dos píxeles: la geometría no puede
 * dibujarla, y aunque pudiera, el rizado fino que hace que el agua PAREZCA agua
 * mide entre 20 cm y 2 m. Eso no se dibuja con triángulos ni con cien veces más
 * triángulos; se dibuja con la normal, píxel a píxel.
 *
 * QUÉ HAY DENTRO. Una suma de dieciséis trenes de olas con vector de onda
 * ENTERO —esa es la condición para que la textura se repita sin costura—,
 * repartidos alrededor de la dirección del viento con la función de dispersión
 * angular cos²(θ/2) que se usa en oceanografía, y con las amplitudes del
 * espectro de Pierson-Moskowitz. No es ruido con pinta de agua: es un mar
 * pequeño, calculado con las mismas reglas que el grande.
 *
 * SE GENERA UNA SOLA VEZ. La textura sale orientada al este; el sombreador la
 * gira hacia donde sople el viento y le sube o le baja la amplitud. Regenerarla
 * en cada cambio de viento costaría 20 ms y no se notaría: lo que cambia con el
 * viento de verdad es cuánto rizado hay y de qué tamaño, y las dos cosas se
 * hacen al leerla.
 */

/** Lado de la textura, en texeles. */
export const DETAIL_SIZE = 256

/**
 * Componentes de la suma. Dieciséis.
 *
 * Con ocho se ve el patrón repetirse dentro del propio mosaico; con treinta y
 * dos, la textura tarda el doble en generarse y no se distingue de la de
 * dieciséis. Medido en pantalla, no adivinado.
 */
const COMPONENTS = 16

/**
 * Pendiente máxima que cabe en la codificación, adimensional.
 *
 * 1,2 es una pared: la pendiente de una ola real no pasa del límite de Stokes
 * (0,44 en tangente, o sea 24°) ni en la cresta más peraltada, así que con este
 * techo el escalón de la codificación es de 0,009 —muy por debajo de lo que el
 * ojo distingue en un reflejo— y no se recorta ninguna cresta.
 */
export const DETAIL_MAX_SLOPE = 1.2

/**
 * Generador reproducible. La textura tiene que ser la misma en cada carga: si
 * cambiara, el mar se vería distinto en dos pestañas del mismo sitio a la misma
 * hora, y eso en una aplicación que enseña datos es una diferencia que alguien
 * acabaría intentando interpretar.
 */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export interface DetailTexture {
  size: number
  /** RGBA: pendiente este, pendiente norte, altura, sin usar. */
  pixels: Uint8Array
  /** Pendiente cuadrática media, medida sobre la propia textura. */
  rmsSlope: number
}

/**
 * Construye la textura.
 *
 * `wavelengthTexels` es la longitud de onda del componente principal medida en
 * texeles: 64 sobre 256 significa que en el mosaico caben cuatro crestas
 * grandes, y las demás componentes van por encima en frecuencia. Es lo que fija
 * la escala relativa entre el rizado grueso y el fino.
 */
export function buildDetailTexture(
  size = DETAIL_SIZE,
  wavelengthTexels = 64,
  seed = 20260813,
): DetailTexture {
  const random = seeded(seed)
  const k0 = (2 * Math.PI) / wavelengthTexels

  const waves: { kx: number; ky: number; amp: number; phase: number }[] = []
  for (let i = 0; i < COMPONENTS; i++) {
    // Frecuencias en progresión geométrica: cada componente es 1,32 veces más
    // corta que la anterior, lo que reparte quince octavas de textura en las
    // cuatro que caben entre 64 y 4 texeles.
    const scale = Math.pow(1.32, i)
    // Dispersión angular cos²(θ/2), muestreada: los componentes cortos se
    // abren más que los largos, igual que en el mar.
    const spread = (Math.PI / 3) * (0.35 + 0.65 * (i / COMPONENTS))
    const theta = (random() * 2 - 1) * spread
    const k = k0 * scale
    // Al vector de onda hay que redondearlo a entero (en ciclos por mosaico)
    // o la textura no cierra por los bordes.
    const cycles = (k * size) / (2 * Math.PI)
    const kx = Math.max(1, Math.round(cycles * Math.cos(theta)))
    const ky = Math.round(cycles * Math.sin(theta))
    // Pierson-Moskowitz: la energía cae con la quinta potencia de la
    // frecuencia. En amplitud, eso es k^-2,5.
    const amp = Math.pow(scale, -2.5)
    waves.push({ kx, ky, amp, phase: random() * 2 * Math.PI })
  }

  // Normalización: la suma de amplitudes fija la pendiente, y lo que se quiere
  // es que la textura salga con una pendiente cuadrática media conocida (0,12,
  // que es un mar rizado de manual) para que el sombreador la escale desde ahí.
  // Los componentes son independientes, así que sus pendientes se suman EN
  // CUADRATURA, no linealmente: la media cuadrática de una sinusoide de
  // amplitud a y número de onda k es a·k/√2, y el total es la raíz de la suma
  // de los cuadrados. Sumándolas a secas —que es el error fácil— la textura
  // sale con menos de la mitad de rizado del que se le pide.
  const targetRms = 0.12
  let spectrumSlopeSq = 0
  for (const w of waves) {
    const k = Math.hypot(w.kx, w.ky) * ((2 * Math.PI) / size)
    spectrumSlopeSq += (w.amp * k) ** 2 / 2
  }
  const norm = targetRms / Math.sqrt(spectrumSlopeSq)

  const pixels = new Uint8Array(size * size * 4)
  let measuredSlopeSq = 0
  let minH = Infinity
  let maxH = -Infinity
  const heights = new Float32Array(size * size)
  const sx = new Float32Array(size * size)
  const sy = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const phase = ((2 * Math.PI) / size) * (w.kx * x + w.ky * y) + w.phase
        const a = w.amp * norm
        h += a * Math.sin(phase)
        const c = a * Math.cos(phase) * ((2 * Math.PI) / size)
        dx += c * w.kx
        dy += c * w.ky
      }
      const i = y * size + x
      heights[i] = h
      sx[i] = dx
      sy[i] = dy
      measuredSlopeSq += dx * dx + dy * dy
      if (h < minH) minH = h
      if (h > maxH) maxH = h
    }
  }

  const span = Math.max(1e-6, maxH - minH)
  for (let i = 0; i < heights.length; i++) {
    const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
    pixels[i * 4] = byte(0.5 + (0.5 * sx[i]) / DETAIL_MAX_SLOPE)
    // La `y` de la textura crece hacia el sur; la del mapa, hacia el norte.
    pixels[i * 4 + 1] = byte(0.5 - (0.5 * sy[i]) / DETAIL_MAX_SLOPE)
    pixels[i * 4 + 2] = byte((heights[i] - minH) / span)
    pixels[i * 4 + 3] = 255
  }

  return { size, pixels, rmsSlope: Math.sqrt(measuredSlopeSq / heights.length) }
}
