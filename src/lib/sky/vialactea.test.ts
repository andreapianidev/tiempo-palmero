/**
 * La Vía Láctea: que esté donde tiene que estar y que se apague cuando toca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PRUEBA QUE DE VERDAD IMPORTA ES LA SEGUNDA: **el mapa está georreferenciado
 * o no lo está**, y no hay forma humana de verlo mirando la pantalla. Una Vía
 * Láctea puesta al revés, o girada media vuelta, sale como una banda preciosa
 * cruzando el cielo — y es el cielo de otro sitio. Es exactamente el mismo modo
 * de fallo que la rotación de la oblicuidad de los planetas y que la matriz del
 * cielo transpuesta: coherente, plausible y equivocado.
 *
 * Así que se comprueba contra algo externo al fichero: **el ecuador galáctico**,
 * que sale de la posición del polo norte galáctico (AR 192,85948°, Dec
 * 27,12825°, J2000) y no de nada que haya en este repositorio.
 *
 * LAS DOS ORILLAS, MEDIDAS sobre 72 meridianos:
 *
 * | | mediana | p90 | peor |
 * |---|---:|---:|---:|
 * | **el mapa como está** | **2,60°** | 6,31° | 9,95° |
 * | volteado en vertical (el fallo del `FLIP_Y`) | 108,22° | 123,03° | 127,97° |
 * | girado 180° en ascensión recta | 108,22° | 123,03° | 127,97° |
 *
 * El umbral en 5° de mediana está al doble del caso sano y veinte veces por
 * debajo de los dos fallos. Y se mide la MEDIANA y no el peor caso a propósito:
 * los 9,95° del caso bueno son reales y no son un error — la banda es ancha y
 * asimétrica, el bulbo se extiende al sur del plano, y su centro de masas de
 * brillo no tiene por qué caer sobre la línea geométrica. Un umbral sobre el
 * peor caso estaría midiendo la forma de la galaxia en vez de la del fichero.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import {
  MW_DISPLAY_GAIN,
  MW_PEAK_DELTA_MAG,
  MW_PEAK_MAG,
  MW_PEAK_VALUE,
  milkyWayAlpha,
  milkyWayFraction,
  milkyWayMagArcsec2,
} from './vialactea'
import { ISLAND_DARK_SKY, nanoLamberts } from '../stars/skyglow'

const HERE = dirname(fileURLToPath(import.meta.url))
const PNG_PATH = resolve(HERE, '../../../public/cielo/vialactea.png')
const map = PNG.sync.read(readFileSync(PNG_PATH))

const RAD = Math.PI / 180
/** Polo norte galáctico, J2000. Externo a este repositorio a propósito. */
const RA_GALACTIC_POLE = 192.85948
const DEC_GALACTIC_POLE = 27.12825

/** Declinación del ecuador galáctico en una ascensión recta dada. */
function galacticEquatorDec(raDeg: number): number {
  return (
    Math.atan(-Math.cos((raDeg - RA_GALACTIC_POLE) * RAD) / Math.tan(DEC_GALACTIC_POLE * RAD)) / RAD
  )
}

/**
 * Declinación media PESADA POR BRILLO de un meridiano del mapa.
 *
 * Pesada y no el máximo: el máximo de una columna es un píxel y salta con el
 * ruido del suavizado; el centro de masas usa la columna entera.
 */
function brightnessRidge(raDeg: number, transform: 'none' | 'flipY' | 'shift180'): number | null {
  let lon = raDeg > 180 ? raDeg - 360 : raDeg
  if (transform === 'shift180') lon = ((lon + 360) % 360) - 180
  const col = Math.min(
    map.width - 1,
    Math.max(0, Math.round(((lon + 180) / 360) * map.width - 0.5)),
  )
  let sum = 0
  let weight = 0
  for (let row = 0; row < map.height; row++) {
    const r = transform === 'flipY' ? map.height - 1 - row : row
    const v = map.data[(r * map.width + col) * 4]
    if (v <= 0) continue
    sum += v * (90 - ((row + 0.5) * 180) / map.height)
    weight += v
  }
  return weight > 0 ? sum / weight : null
}

function ridgeErrors(transform: 'none' | 'flipY' | 'shift180'): number[] {
  const errors: number[] = []
  for (let ra = 0; ra < 360; ra += 5) {
    const dec = brightnessRidge(ra, transform)
    if (dec === null) continue
    errors.push(Math.abs(dec - galacticEquatorDec(ra)))
  }
  return errors.sort((a, b) => a - b)
}

describe('el mapa que se sirve', () => {
  it('es el equirrectangular de un cuarto de grado', () => {
    expect(map.width).toBe(1440)
    expect(map.height).toBe(720)
    expect(360 / map.width).toBeCloseTo(0.25, 6)
  })

  it('SU PICO ES `MW_PEAK_VALUE`, que es de donde cuelga todo el brillo', () => {
    // Los cinco contornos anidados de `prepare-vialactea.ts` a 40 cada uno. Si
    // aquel script cambia el número de niveles o el paso y esta constante no,
    // no habría ningún error: habría una Vía Láctea del brillo equivocado, y
    // `MW_PEAK_MAG` estaría anclado a un nivel que ya no existe.
    let peak = 0
    for (let i = 0; i < map.data.length; i += 4) peak = Math.max(peak, map.data[i])
    expect(peak).toBe(MW_PEAK_VALUE)
  })

  it('y no está casi todo el cielo ocupado, que sería un relleno invertido', () => {
    // El fallo de la paridad del relleno, que en el generador costó una raya
    // blanca de lado a lado. Un par-impar del revés pinta el complementario:
    // la banda ocupa como una quinta parte del cielo, no cuatro quintas.
    let lit = 0
    for (let i = 0; i < map.data.length; i += 4) if (map.data[i] > 0) lit++
    const share = lit / (map.width * map.height)
    expect(share).toBeGreaterThan(0.05)
    expect(share).toBeLessThan(0.5)
  })
})

describe('está donde tiene que estar', () => {
  it('la cresta de brillo sigue al ECUADOR GALÁCTICO', () => {
    const errors = ridgeErrors('none')
    expect(errors.length).toBeGreaterThan(60)
    const median = errors[errors.length >> 1]
    expect(median, `mediana ${median.toFixed(2)}°`).toBeLessThan(5)
    // El peor caso también, con mucho margen: son los 9,95° del bulbo.
    expect(errors[errors.length - 1]).toBeLessThan(15)
  })

  it('LA CONTRAPRUEBA: volteado en vertical se vería', () => {
    // El fallo del `UNPACK_FLIP_Y_WEBGL` heredado de MapLibre, que pondría el
    // hemisferio sur en el norte. La capa lo pone a mano en falso.
    const median = ridgeErrors('flipY')[Math.floor(72 / 2)]
    expect(median).toBeGreaterThan(50)
  })

  it('LA OTRA CONTRAPRUEBA: girado media vuelta en ascensión recta también', () => {
    // El fallo de confundir la longitud del mapa —de −180 a +180— con la
    // ascensión recta —de 0 a 360—. Ver `mesh.ts`.
    const median = ridgeErrors('shift180')[Math.floor(72 / 2)]
    expect(median).toBeGreaterThan(50)
  })
})

describe('cuánto se ve, contra el fondo que miden los fotómetros', () => {
  it('el pico está DERIVADO de las 0,4 magnitudes publicadas', () => {
    // La cadena entera, rehecha aquí desde el otro lado: si el núcleo sube el
    // fondo `MW_PEAK_DELTA_MAG`, entonces sumar su luminancia a la del cielo de
    // referencia tiene que dar exactamente esa diferencia de magnitudes.
    const sky = nanoLamberts(ISLAND_DARK_SKY)
    const core = nanoLamberts(MW_PEAK_MAG)
    const brighter = -2.5 * Math.log10((sky + core) / sky)
    // A cuatro decimales y no a seis: `nanoLamberts` lleva el 0,92104 redondeado
    // de Krisciunas y Schaefer y la derivación usa el log10 exacto. La
    // diferencia son 1,8 millonésimas de magnitud, y perseguirla sería exigirle
    // a una constante publicada más cifras de las que trae.
    expect(Math.abs(brighter)).toBeCloseTo(MW_PEAK_DELTA_MAG, 4)
  })

  it('la tabla de la cabecera es la que sale', () => {
    // Las cifras que están escritas en `vialactea.ts`. Si alguien toca una
    // constante, esto falla y hay que volver a escribir la tabla, que es
    // justo lo que se quiere: que el comentario no pueda quedarse viejo.
    expect(milkyWayFraction(200, 22.43)).toBeCloseTo(0.489, 3)
    expect(milkyWayFraction(200, 21.6)).toBeCloseTo(0.308, 3)
    expect(milkyWayFraction(200, 20.0)).toBeCloseTo(0.093, 3)
    expect(milkyWayFraction(200, 18.5)).toBeCloseTo(0.025, 3)
    expect(milkyWayFraction(200, 16.0)).toBeCloseTo(0.003, 3)
  })

  it('SE APAGA CON LA LUNA SIN QUE NADIE LO HAYA ESCRITO', () => {
    // La propiedad que justifica todo el diseño. De una buena noche del Roque a
    // la luna llena hay un factor 12,3, y sale solo de dividir: no hay ninguna
    // rama que diga «si hay luna».
    const buena = milkyWayFraction(200, 21.6)
    const llena = milkyWayFraction(200, 18.5)
    expect(buena / llena).toBeCloseTo(12.3, 1)
    // Y en pantalla, con la ganancia puesta, queda por debajo del 5 %.
    expect(milkyWayAlpha(200, 18.5)).toBeLessThan(0.05)
    expect(milkyWayAlpha(200, 21.6)).toBeGreaterThan(0.5)
  })

  it('es monótona en el brillo del fondo y en el valor del mapa', () => {
    for (let mag = 16; mag < 22.5; mag += 0.25) {
      expect(milkyWayFraction(200, mag)).toBeLessThan(milkyWayFraction(200, mag + 0.25))
    }
    for (let v = 0; v < 200; v += 10) {
      expect(milkyWayFraction(v, 21.6)).toBeLessThan(milkyWayFraction(v + 10, 21.6))
    }
  })

  it('LA EXTINCIÓN LA APAGA ABAJO, con la misma k que a una estrella', () => {
    // A 5° de altura la masa de aire vale 10,3 y con la k del sitio son casi
    // dos magnitudes: la banda que se hunde por el oeste se va antes de tocar
    // el horizonte, que es lo que se ve de verdad desde la cumbre.
    const cenit = milkyWayFraction(200, 21.6, 1, 0.15)
    const bajo = milkyWayFraction(200, 21.6, 10.3, 0.15)
    // MEDIDO: la fracción cae de 0,280 a 0,097, factor 2,88. No es un factor
    // redondo porque la fracción está acotada por 1 y se comprime arriba; lo
    // que sí es exacto es la RAZÓN de luminancias que hay detrás, y por eso se
    // comprueba también: tiene que caer 10^(0,4 · k · ΔX) = 3,6141, ni más ni
    // menos. Ahí no cabe una extinción puesta a ojo.
    expect(cenit / bajo).toBeCloseTo(2.88, 2)
    const razon = (f: number) => f / (1 - f)
    expect(razon(cenit) / razon(bajo)).toBeCloseTo(Math.pow(10, 0.4 * 0.15 * 9.3), 4)
  })

  it('donde no hay mapa no hay nada, y eso no es «muy débil»', () => {
    expect(milkyWayFraction(0, 21.6)).toBe(0)
    expect(milkyWayAlpha(0, 21.6)).toBe(0)
    expect(milkyWayMagArcsec2(0)).toBe(Infinity)
    // Y la mitad de luz son 0,75 magnitudes más flojo, que es la definición.
    expect(milkyWayMagArcsec2(100) - milkyWayMagArcsec2(200)).toBeCloseTo(0.7526, 3)
  })
})

describe('el sombreador no tiene números propios', () => {
  it('todo lo que decide el brillo entra por uniformes', () => {
    // El gemelo de este fichero corre en la GPU, y una constante copiada allí
    // es un segundo cielo que puede separarse de éste sin que nada falle. Ya
    // pasó con la refracción, que por eso tiene su propia prueba de gemelos.
    const shader = readFileSync(resolve(HERE, '../../components/milkyway/milkyway-shaders.ts'), 'utf8')
    const fragment = shader.slice(shader.indexOf('MILKYWAY_FRAGMENT_SHADER'))
    for (const uniform of ['u_peakValue', 'u_peakMag', 'u_skyMag', 'u_gain', 'u_extinction']) {
      expect(fragment, `falta ${uniform}`).toContain(uniform)
    }
    // Y ninguna de las tres cifras aparece escrita a mano dentro del programa.
    const body = fragment.slice(fragment.indexOf('void main'))
    for (const forbidden of [
      MW_PEAK_MAG.toFixed(2),
      String(MW_DISPLAY_GAIN),
      String(MW_PEAK_VALUE),
    ]) {
      expect(body, `${forbidden} está copiado en el sombreador`).not.toContain(forbidden)
    }
  })
})
