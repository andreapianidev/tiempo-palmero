/**
 * Contraste: la aritmética, sin nada de mapa.
 *
 * La pregunta que resuelve este fichero es una sola: **de qué color tiene que
 * ser una línea para que se vea sobre el fondo que hay debajo.** Y se responde
 * con la definición de contraste de la WCAG —la misma con la que se juzga si
 * un texto es legible—, no con el ojo:
 *
 *     contraste = (L_claro + 0,05) / (L_oscuro + 0,05)
 *
 * donde L es la luminancia relativa, que se calcula sobre el color YA
 * LINEALIZADO. Ese detalle es todo: en sRGB el 50 % de gris no tiene la mitad
 * de luz, tiene el 21 %, y ajustar contrastes sobre los bytes sin linearizar
 * da resultados que se ven mal justo en los tonos medios, que es donde está una
 * ortofoto.
 *
 * EL OBJETIVO ES 3:1, que es lo que la WCAG 1.4.11 pide para un elemento
 * gráfico —un trazo, un icono— frente a lo que tiene al lado. No 4,5:1: eso es
 * para texto, y aplicado a una carretera de referencia obligaría a un blanco
 * puro sobre el relieve oscuro, que convertiría el mapa en un callejero.
 *
 * LA TRANSPARENCIA ENTRA EN LA CUENTA. Las líneas de esta aplicación son
 * semitransparentes a propósito —son referencia, no contenido— y lo que el ojo
 * ve no es su color sino su mezcla con el fondo. La mezcla alfa es lineal en
 * luz lineal, y la luminancia relativa también, así que la composición sale
 * exacta y no aproximada:
 *
 *     L_visto = α · L_tinta + (1 − α) · L_fondo
 */

/** Un color de línea: su tono, y con cuánta transparencia se pinta. */
export interface Ink {
  rgb: [number, number, number]
  alpha: number
}

const srgbToLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4

const linearToSrgb = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055

const LUMA: [number, number, number] = [0.2126, 0.7152, 0.0722]

/** Luminancia relativa de un color dado en 0–1 por canal, ya en sRGB. */
export function luminance(rgb: [number, number, number]): number {
  return rgb.reduce((acc, v, i) => acc + LUMA[i] * srgbToLinear(v), 0)
}

export function contrast(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * La luminancia que hace falta para llegar al contraste pedido, por arriba y
 * por abajo. `null` cuando ese lado no da: sobre un fondo casi blanco no hay
 * ningún color más claro que contraste 3:1, porque el más claro que existe es
 * el blanco.
 */
export function targets(background: number, ratio: number): {
  lighter: number | null
  darker: number | null
} {
  const up = ratio * (background + 0.05) - 0.05
  const down = (background + 0.05) / ratio - 0.05
  return { lighter: up <= 1 ? up : null, darker: down >= 0 ? down : null }
}

/**
 * El mismo tono, con la luz que haga falta.
 *
 * Se escala el color en luz LINEAL, que es lo que conserva la proporción entre
 * canales —o sea, el tono—. Cuando escalar se sale por arriba, lo que sobra se
 * reparte hacia el blanco: es lo que hace que un ámbar sobre papel muy claro
 * acabe siendo ámbar oscuro y no un naranja fluorescente.
 */
export function withLuminance(
  rgb: [number, number, number],
  target: number,
): [number, number, number] {
  const lin = rgb.map(srgbToLinear) as [number, number, number]
  const now = lin.reduce((acc, v, i) => acc + LUMA[i] * v, 0)
  if (now <= 1e-6) {
    const flat = Math.min(Math.max(target, 0), 1)
    return [flat, flat, flat].map(linearToSrgb) as [number, number, number]
  }

  const k = Math.min(Math.max(target, 0), 1) / now
  let out = lin.map((v) => v * k) as [number, number, number]

  // Si algún canal se pasa de uno, se recorta y el resto sube para no perder
  // la luminancia pedida: por ahí es por donde el color se acerca al blanco.
  for (let pass = 0; pass < 3 && out.some((v) => v > 1); pass++) {
    const excess = out.reduce((acc, v, i) => acc + LUMA[i] * Math.max(v - 1, 0), 0)
    out = out.map((v) => Math.min(v, 1)) as [number, number, number]
    const room = out.reduce((acc, v, i) => acc + LUMA[i] * (1 - v), 0)
    if (room <= 1e-6) break
    out = out.map((v) => v + ((1 - v) * excess) / room) as [number, number, number]
  }

  return out.map((v) => linearToSrgb(Math.min(Math.max(v, 0), 1))) as [
    number,
    number,
    number,
  ]
}

/**
 * La tinta que llega al contraste pedido sobre ese fondo, y con cuánta
 * transparencia hay que pintarla.
 *
 * Se prueban las dos orillas —más clara y más oscura que el fondo— y gana la
 * que menos tenga que alejarse del tono original: sobre el relieve oscuro las
 * carreteras siguen siendo el gris cálido claro de siempre, y sobre la carta
 * topográfica el mismo gris se vuelve oscuro en vez de desaparecer.
 *
 * Si con la transparencia que tiene no llega a ninguna de las dos, se le sube
 * hasta donde haga falta —nunca más allá de `maxAlpha`—: antes de que una
 * referencia deje de verse, se acepta que pese un poco más de lo que pesaba.
 */
export function readableInk(
  ink: Ink,
  background: number,
  ratio: number,
  maxAlpha = 0.9,
): Ink {
  const own = luminance(ink.rgb)
  const { lighter, darker } = targets(background, ratio)

  let best: { seen: number; alpha: number } | null = null
  for (const seen of [lighter, darker]) {
    if (seen === null) continue
    // L_visto = α·L_tinta + (1−α)·L_fondo, despejando la tinta.
    let alpha = ink.alpha
    let tint = (seen - (1 - alpha) * background) / alpha
    if (tint < 0 || tint > 1) {
      // Con esta transparencia no se llega ni con tinta negra ni con blanca:
      // la mínima que sí llega es la distancia relativa al fondo.
      alpha = Math.min(maxAlpha, Math.abs(seen - background) / Math.max(background, 1 - background, 1e-3))
      alpha = Math.max(alpha, ink.alpha)
      tint = Math.min(Math.max((seen - (1 - alpha) * background) / alpha, 0), 1)
    }
    const cost = Math.abs(tint - own)
    if (!best || cost < Math.abs(best.seen - own)) best = { seen: tint, alpha }
  }

  if (!best) return ink
  return { rgb: withLuminance(ink.rgb, best.seen), alpha: best.alpha }
}

export function cssRgba(ink: Ink): string {
  const [r, g, b] = ink.rgb.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255))
  return `rgba(${r}, ${g}, ${b}, ${Number(ink.alpha.toFixed(3))})`
}
