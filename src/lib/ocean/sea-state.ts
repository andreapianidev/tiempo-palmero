/**
 * La física del oleaje, en un solo sitio.
 *
 * QUÉ HACE ESTO Y QUÉ NO. No dibuja nada: son las cuentas que convierten lo que
 * publica el modelo marino —altura, período y dirección de dos trenes de olas—
 * en las magnitudes con las que se puede pintar un mar que se comporte como el
 * de fuera: cuánto mide una ola de lado a lado, cuánto crece al llegar al bajío,
 * a qué profundidad rompe y cuánta espuma arranca el viento.
 *
 * LAS MISMAS FÓRMULAS ESTÁN EN EL SOMBREADOR. No es duplicación por descuido:
 * el sombreador las necesita por vértice y por fragmento, y no se puede llamar
 * a TypeScript desde la GPU. Lo que sí se puede es que las dos versiones se
 * comprueben contra los mismos números, y eso es lo que hace `sea-state.test.ts`
 * — cada función de aquí tiene su gemela en `components/ocean/shaders/`, con el
 * nombre puesto a propósito igual y un comentario que apunta aquí.
 *
 * NINGUNA CONSTANTE DE ESTE FICHERO ES DE COSECHA PROPIA. Cada una lleva al
 * lado de dónde sale, porque son las que deciden si una ola rompe donde rompe.
 */

/** Gravedad, m/s². */
export const G = 9.81

/**
 * Longitud de onda en aguas profundas, m.
 *
 * L₀ = g·T²/2π, la relación de dispersión de Airy cuando el fondo no se nota.
 * Es la regla de 1,56·T² que se enseña en cualquier manual: un mar de fondo de
 * 10 s mide 156 m de cresta a cresta, y uno de viento de 4 s, 25 m. La
 * diferencia entre esas dos escalas es justo lo que hace que un mar se vea
 * grande o picado, así que no se puede pintar con una sola.
 */
export function deepWavelength(periodS: number): number {
  return (G * periodS * periodS) / (2 * Math.PI)
}

/**
 * Número de onda por la profundidad (k·d), resolviendo ω² = g·k·tanh(k·d).
 *
 * La ecuación es implícita y no tiene solución cerrada. Se usa la aproximación
 * explícita de Guo (2002), «Simple and explicit solution of wave dispersion
 * equation», Coastal Engineering 45, 71-74:
 *
 *   x = ω·√(d/g)          y = x²·(1 − e^(−x^2,4908))^(−0,4015)      k·d = y
 *
 * El autor declara un error relativo por debajo del 0,75 % en todo el rango, y
 * comprobado contra los dos extremos exactos (`sea-state.test.ts`) se queda en
 * 0,85 % en aguas someras y en cero en profundas. Newton-Raphson daría el valor
 * exacto, pero esto tiene que correr también en la GPU, una vez por vértice: un
 * bucle iterativo ahí dentro cuesta más que el 0,8 % que ahorra.
 */
export function waveNumberDepth(periodS: number, depthM: number): number {
  const omega = (2 * Math.PI) / Math.max(0.1, periodS)
  const d = Math.max(0.05, depthM)
  const x = omega * Math.sqrt(d / G)
  const x2 = x * x
  return x2 * Math.pow(1 - Math.exp(-Math.pow(x, 2.4908)), -0.4015)
}

/**
 * Coeficiente de asomeramiento (*shoaling*), adimensional.
 *
 * Al entrar en el bajío la ola frena pero sigue transportando la misma energía,
 * así que se hace más alta y más corta: es la razón por la que una mar de fondo
 * que en alta mar apenas se nota se convierte en una pared en la orilla. La
 * cuenta es la conservación del flujo de energía, Ks = √(Cg₀/Cg), con la
 * celeridad de grupo Cg = n·C y n = ½·(1 + 2kd/senh 2kd).
 *
 * Vale 1 en aguas profundas por construcción. Baja ligeramente por debajo de 1
 * —hasta 0,913— alrededor de kd ≈ 1, y eso NO es un fallo: es el mínimo de
 * asomeramiento que la teoría lineal predice y que se mide en canal.
 */
export function shoalingFactor(periodS: number, depthM: number): number {
  const kd = waveNumberDepth(periodS, depthM)
  // senh(2kd) se desborda en float32 por encima de kd ≈ 44; a partir de kd = 10
  // el término vale menos de 1e-8 y la ola ya no ve el fondo.
  if (kd > 10) return 1
  const n = 0.5 * (1 + (2 * kd) / Math.sinh(2 * kd))
  const c = (G * Math.tanh(kd)) / ((2 * Math.PI) / periodS)
  const cg = n * c
  const cg0 = (G * periodS) / (4 * Math.PI)
  return Math.sqrt(cg0 / cg)
}

/**
 * Índice de rotura: cuánto vale H/d ahora mismo.
 *
 * La ola rompe cuando su altura se acerca a la profundidad. El límite clásico
 * es γ = 0,78 (McCowan, 1894, para la onda solitaria); en playas con pendiente
 * se mide entre 0,6 y 1,2, así que 0,78 es el centro honesto de ese abanico y
 * el que usan las guías de ingeniería de costas.
 *
 * Devuelve 0 mar adentro y ≥ 1 donde la ola está rompiendo — que es justo la
 * cantidad con la que se pinta la espuma.
 */
export const BREAKING_INDEX = 0.78

export function breakingRatio(waveHeightM: number, depthM: number): number {
  if (depthM <= 0) return 1
  return waveHeightM / (BREAKING_INDEX * depthM)
}

/**
 * A qué profundidad rompe una ola que en alta mar mide `deepHeightM`.
 *
 * Se itera porque la altura al llegar depende del asomeramiento y el
 * asomeramiento depende de la profundidad. Doce pasos de bisección bastan para
 * dejarlo en centímetros, y esto NO corre en la GPU: solo lo usa el panel, para
 * poder decir «hoy rompe a metro y medio» con una cifra en vez de un adjetivo.
 */
export function breakingDepth(deepHeightM: number, periodS: number): number {
  let low = 0.05
  let high = 60
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2
    const h = deepHeightM * shoalingFactor(periodS, mid)
    if (h > BREAKING_INDEX * mid) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/**
 * Fracción de mar cubierta de borreguillos, de 0 a 1.
 *
 * W = 3,84·10⁻⁶ · U₁₀^3,41 — Monahan y O'Muircheartaigh (1980), «Optimal
 * power-law description of oceanic whitecap coverage dependence on wind speed»,
 * J. Phys. Oceanogr. 10, 2094-2099. Sigue siendo la relación de referencia.
 *
 * Lo que dice, medido con esta misma función: a 5 m/s hay un 0,09 % de mar
 * blanco —o sea, nada—; a 7 m/s, un 0,29 %; a 12 m/s, un 1,84 %; a 20 m/s, un
 * 10,5 %; a 25 m/s, un 22,5 %. El umbral visual de «el mar se ha puesto
 * blanco» cae por tanto entre 10 y 15 m/s, y eso encaja con la escala
 * Beaufort, que pone los borreguillos abundantes en fuerza 6 (10,8-13,8 m/s).
 * El exponente 3,41 es lo que hace que el mar cambie de carácter de golpe en
 * vez de blanquear poco a poco.
 */
export function whitecapCover(windSpeedMs: number): number {
  if (windSpeedMs <= 0) return 0
  return Math.min(1, 3.84e-6 * Math.pow(windSpeedMs, 3.41))
}

/**
 * Altura significativa de un mar completamente desarrollado, m.
 *
 * Hs = 0,21·U²/g, el espectro de Pierson-Moskowitz (1964). Aquí NO se usa para
 * pintar —para eso está el modelo, que sabe de fetch y de duración— sino al
 * revés: para poder decir, cuando el modelo marino no conteste, qué mar
 * correspondería al viento que sí tenemos. Un mar dibujado a partir del viento
 * es peor que uno dibujado a partir del oleaje, y por eso es el recambio y no
 * la fuente.
 */
export function fullyDevelopedHeight(windSpeedMs: number): number {
  return (0.21 * windSpeedMs * windSpeedMs) / G
}

/** Y la vuelta: qué viento sostendría ese mar. Para el recambio inverso. */
export function windForHeight(heightM: number): number {
  return Math.sqrt((Math.max(0, heightM) * G) / 0.21)
}

/**
 * Peralte: altura entre longitud de onda.
 *
 * Es lo que distingue una ondulación de una ola con cresta. Por encima de 1/7
 * (0,143) la ola no puede existir: rompe sola, en alta mar, sin necesidad de
 * fondo (el límite de Stokes). Se usa para no dibujar jamás una cresta
 * imposible, por muy alta que venga la cifra del modelo.
 */
export const MAX_STEEPNESS = 1 / 7

export function steepness(heightM: number, wavelengthM: number): number {
  return wavelengthM > 0 ? heightM / wavelengthM : 0
}

/**
 * De dirección meteorológica a vector unitario de AVANCE.
 *
 * El modelo publica de dónde VIENE la ola, igual que con el viento. Lo que el
 * sombreador necesita es hacia dónde va, que es el contrario. Errar el signo
 * aquí pinta un mar que se aleja de la costa en vez de romper contra ella, y a
 * simple vista casi no se nota: por eso está en una función con su test.
 */
export function travelVector(directionDeg: number): { x: number; y: number } {
  const rad = (directionDeg * Math.PI) / 180
  return { x: -Math.sin(rad), y: -Math.cos(rad) }
}

/**
 * Escala Beaufort a partir del viento, para poder nombrar el mar en el panel.
 *
 * Los límites son los oficiales de la OMM en m/s. No es adorno: «fuerza 5» dice
 * en una palabra lo que «9,3 m/s» no dice, y el panel enseña las dos.
 */
const BEAUFORT_LIMITS = [0.5, 1.5, 3.3, 5.4, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6]

export function beaufort(windSpeedMs: number): number {
  let force = 0
  while (force < BEAUFORT_LIMITS.length && windSpeedMs >= BEAUFORT_LIMITS[force]) force++
  return force
}
