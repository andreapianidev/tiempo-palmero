/**
 * ¿Hay agua en este píxel, y cuánta?
 *
 * ES EL GEMELO DE LA PRIMERA DECISIÓN DEL SOMBREADOR DE FRAGMENTOS, por la
 * misma razón que `sea-state.ts` es el gemelo de la física del oleaje: la GPU no
 * puede llamar a TypeScript, y una decisión que dibuja o borra la orilla entera
 * tiene que poder medirse sin abrir un navegador. Los números de aquí se
 * interpolan dentro del GLSL, así que las dos versiones no pueden separarse.
 *
 * LA ORILLA NO ESTÁ QUIETA. El agua sube y baja por la playa con cada ola —el
 * *swash*— y la excursión es del orden de la altura de la ola que llega. Por eso
 * la línea de costa no se decide con un `if` contra la distancia a la costa,
 * sino con una rampa que se mueve con la fase de la cresta.
 *
 * Y EL AGUA NO TREPA POR UN ACANTILADO: contra una pared rebota, no sube. Pero
 * esa corrección vale ÚNICAMENTE EN TIERRA. Aplicada también mar adentro —que es
 * lo que se hacía hasta el 14 de agosto de 2026— secaba una franja de mar
 * pegada a la costa, porque la cota se lee de una textura de 34 × 54 m por texel
 * interpolada linealmente: frente a una pared de 60 m, la cota interpolada ya
 * pasa de los 2,1 m del umbral a 9 m de la orilla, y a 43 m si el DEM además
 * había dejado cota en el primer texel de mar. Medido sobre este mismo módulo,
 * es lo que `coverage.test.ts` comprueba por las dos orillas: que el mar llegue
 * a la costa Y que siga sin subirse al acantilado.
 */

/**
 * Cuánto sube el agua por la orilla respecto a la altura de la ola.
 *
 * 1,3 es el orden de magnitud clásico del *run-up* en playas de pendiente
 * media. Los topes existen para que el mar en calma siga mojando algo (30 cm) y
 * para que un temporal de 7 m no dibuje una lengua de agua de veinte metros
 * tierra adentro (9 m).
 */
export const RUNUP_FACTOR = 1.3
export const RUNUP_MIN_M = 0.3
export const RUNUP_MAX_M = 9

/**
 * A partir de qué cota se considera pared, en fracción del run-up.
 *
 * Medio run-up: si la ola sube 1,2 m, un escalón de 60 cm ya la frena. Y la
 * transición dura `CLIFF_BAND_M` metros de cota, que es lo que separa una rampa
 * de una pared.
 */
export const CLIFF_RUNUP_SHARE = 0.5
export const CLIFF_BAND_M = 1.5

/** El `smoothstep` de GLSL, para que las dos versiones respondan igual. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Hasta dónde sube el agua por la orilla, en metros. */
export function runupM(waveHeightM: number): number {
  return Math.max(RUNUP_MIN_M, Math.min(RUNUP_MAX_M, waveHeightM * RUNUP_FACTOR))
}

export interface CoverageInputs {
  /** Distancia con signo a la costa: positiva en el mar, negativa en tierra. */
  shoreDistM: number
  /** Cota del terreno leída de la textura de orilla, m. */
  landHeightM: number
  /** La mayor de las dos alturas de ola que llegan aquí, m. */
  waveHeightM: number
  /** Fase de la ola: +1 en la cresta, −1 en el seno. */
  crest: number
  /** Escala del mapa: fija lo suave que es el borde del agua. */
  metersPerPixel: number
}

/**
 * Cuánta agua hay en este punto, de 0 (roca seca) a 1 (mar).
 *
 * El borde se suaviza sobre un píxel y pico de pantalla y no sobre una distancia
 * fija en metros: lo que no puede verse es un borde dentado, y eso depende del
 * zoom, no del mar.
 */
export function waterCoverage(input: CoverageInputs): number {
  const runup = runupM(input.waveHeightM)
  const push = runup * Math.max(input.crest, 0)
  const soft = Math.max(1, input.metersPerPixel * 1.2)

  let coverage = smoothstep(-push, -push + soft, input.shoreDistM)
  // 1 en tierra, 0 en cuanto se sale al mar. Es lo que encierra la corrección
  // del acantilado dentro de la tierra, que es donde tiene sentido.
  const ashore = 1 - smoothstep(0, soft, input.shoreDistM)
  coverage *=
    1 -
    ashore *
      smoothstep(
        runup * CLIFF_RUNUP_SHARE,
        runup * CLIFF_RUNUP_SHARE + CLIFF_BAND_M,
        input.landHeightM,
      )
  return coverage
}
