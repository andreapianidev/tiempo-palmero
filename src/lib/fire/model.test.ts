/**
 * La prueba que sostiene todo lo demás: que el navegador saca el MISMO número
 * que sacó scikit-learn.
 *
 * El modelo se ajusta en Python y se aplica en TypeScript, y entre las dos
 * mitades hay sitio de sobra para un error silencioso: un umbral comparado con
 * `<` en vez de `<=`, la tasa de aprendizaje aplicada dos veces o ninguna, la
 * tipificación olvidada, el orden de las columnas cambiado al reentrenar. Nada
 * de eso rompe nada. Todo eso produce un mapa con la forma de la isla, colores
 * verosímiles y cifras equivocadas.
 *
 * Así que `scripts/ml/run.py` congela cuarenta celdas repartidas por La Palma
 * con sus entradas EN CRUDO —las mismas que el navegador va a tener— y la
 * probabilidad que les dio scikit-learn. Aquí se recalculan con el código de
 * producción y se exige coincidencia hasta la sexta cifra decimal, que es la
 * precisión con la que se guardaron.
 *
 * Si alguien reentrena el modelo, este test sigue valiendo: el fixture se
 * regenera en la misma pasada y las dos mitades vuelven a compararse. Si
 * alguien toca solo una de las dos, falla.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FUEL_MODELS_PRESENT, FUEL_UNKNOWN, fuelLabel } from './fuel'
import { contributions, susceptibility, type CellInputs, type FireModelSpec } from './model'
import cells from './__fixtures__/model-cells.json'

/**
 * Se lee del disco en vez de importarse como módulo a propósito: son 105 KB de
 * árboles, y hacérselos comprobar a `tsc` en cada compilación cuesta más que
 * todo lo que este fichero prueba.
 */
const spec = JSON.parse(
  readFileSync(new URL('../../../public/fire/model.json', import.meta.url), 'utf8'),
) as FireModelSpec

const inputsOf = (c: (typeof cells)[number]): CellInputs => ({
  fuel: c.fuel,
  distanceM: c.distance,
  slopeDeg: c.slope,
  southness: c.southness,
  westness: c.westness,
  elevationM: c.elevation,
})

describe('el modelo entrenado, aplicado en el navegador', () => {
  it('reproduce scikit-learn en las cuarenta celdas del fixture', () => {
    expect(cells.length).toBeGreaterThanOrEqual(40)
    for (const c of cells) {
      const got = susceptibility(spec, inputsOf(c))
      expect(got, `celda ${c.row},${c.col}`).not.toBeNull()
      expect(got!, `celda ${c.row},${c.col}`).toBeCloseTo(c.probability, 6)
    }
  })

  it('la muestra recorre de verdad el mapa, no una esquina', () => {
    // Una comprobación que pasara con cuarenta celdas de mar no probaría nada.
    const fuels = new Set(cells.map((c) => c.fuel))
    expect(fuels.size).toBeGreaterThanOrEqual(6)
    const probs = cells.map((c) => c.probability)
    expect(Math.max(...probs)).toBeGreaterThan(0.5)
    expect(Math.min(...probs)).toBeLessThan(0.05)
  })

  it('sin combustible clasificado no contesta, y eso no es un cero', () => {
    const c = { ...inputsOf(cells[0]), fuel: FUEL_UNKNOWN }
    expect(susceptibility(spec, c)).toBeNull()
  })

  it('una entrada imposible tampoco produce un número', () => {
    expect(susceptibility(spec, { ...inputsOf(cells[0]), elevationM: NaN })).toBeNull()
  })
})

describe('la explicación de una celda', () => {
  it('nombra predictores del modelo y ninguno inventado', () => {
    const names = new Set(spec.model.features.map((f) => f.name))
    for (const c of cells.slice(0, 10)) {
      for (const item of contributions(spec, inputsOf(c))) {
        expect(names.has(item.name)).toBe(true)
      }
    }
  })

  it('no atribuye nada a los ocho modelos de combustible que la celda no es', () => {
    for (const c of cells) {
      const shown = contributions(spec, inputsOf(c))
        .map((x) => x.name)
        .filter((n) => n.startsWith('fuel'))
      for (const name of shown) {
        expect(Number(name.slice(4)), `celda ${c.row},${c.col}`).toBe(c.fuel)
      }
    }
  })

  it('el efecto de sustituir un predictor por el de la isla se mide de verdad', () => {
    // Dos celdas con el mismo combustible y distinta orientación tienen que
    // dar explicaciones distintas. Si salieran iguales, `contributions` estaría
    // devolviendo una tabla fija en vez de mirar la celda.
    const sur = { ...inputsOf(cells[0]), fuel: 9, southness: 1, westness: 0, elevationM: 1100 }
    const norte = { ...sur, southness: -1 }
    const a = contributions(spec, sur).find((x) => x.name === 'southness')
    const b = contributions(spec, norte).find((x) => x.name === 'southness')
    expect(a?.delta).not.toBe(b?.delta)
  })
})

describe('el catálogo de combustible y el modelo dicen lo mismo', () => {
  it('todos los modelos que el clasificador usa tienen nombre', () => {
    for (const f of spec.model.features) {
      if (!f.name.startsWith('fuel')) continue
      const model = Number(f.name.slice(4))
      expect(FUEL_MODELS_PRESENT).toContain(model)
      expect(fuelLabel(model)).not.toBe(fuelLabel(FUEL_UNKNOWN))
    }
  })

  it('«sin clasificar» no se llama igual que «sin combustible»', () => {
    // Es la confusión que más caro sale en una capa de incendios: colapsar «no
    // lo sé» con «aquí no arde» pinta de tranquilo lo que nadie ha mirado.
    expect(fuelLabel(FUEL_UNKNOWN)).not.toBe(fuelLabel(0))
  })
})

describe('lo que el modelo publica de sí mismo', () => {
  it('trae la validación honesta y la deshonesta, para poder compararlas', () => {
    expect(spec.validation.folds.length).toBe(5)
    expect(spec.validation.aucShuffled).toBeGreaterThan(spec.validation.aucMean)
  })

  it('el peor pliegue se publica y no se esconde tras la media', () => {
    expect(spec.validation.aucWorst).toBeLessThan(spec.validation.aucMean)
    expect(spec.validation.aucWorst).toBeGreaterThan(0.5) // aun así, mejor que el azar
  })

  it('declara los cinco incendios con los que se entrenó, con su fuente', () => {
    expect(spec.training.fires.length).toBe(5)
    for (const fire of spec.training.fires) {
      expect(fire.source.length).toBeGreaterThan(0)
      expect(fire.declaredHa).toBeGreaterThan(100)
    }
  })
})
