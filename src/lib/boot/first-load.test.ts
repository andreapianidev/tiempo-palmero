import { describe, expect, it } from 'vitest'
import { advance, PENDING, progress, type Load, type Step } from './first-load'

/** Un paso llevado por la secuencia de estados que le dé su gancho. */
function run(loads: Load[]): Step {
  return loads.reduce(advance, PENDING)
}

const IDLE: Load = { loading: false, ready: false }
const LOADING: Load = { loading: true, ready: false }
const DONE: Load = { loading: false, ready: true }

describe('un paso de la primera carga', () => {
  /**
   * La trampa de este cálculo: al montar y al terminar, `loading` vale `false`
   * en los dos. Sin recordar que se le ha visto pedir, la barra saldría llena
   * en el primer render y no diría nada de nada.
   */
  it('no cuenta como hecho antes de haber empezado', () => {
    expect(run([IDLE]).done).toBe(false)
    expect(run([IDLE, IDLE, IDLE]).done).toBe(false)
  })

  it('se hace al terminar la petición', () => {
    expect(run([IDLE, LOADING]).done).toBe(false)
    expect(run([IDLE, LOADING, DONE]).done).toBe(true)
  })

  /**
   * Y ÉSTA ES LA REGLA QUE IMPORTA: una capa que falla cuenta como terminada.
   * `useOsmRoads` deja `loading` en `false` y los datos en `null` cuando el
   * servidor no contesta; si eso no contara, la barra se quedaría clavada en
   * 4/5 encima del mapa para el resto de la sesión.
   */
  it('se hace también cuando la petición falla', () => {
    expect(run([IDLE, LOADING, IDLE]).done).toBe(true)
  })

  /**
   * Los datos pueden estar sin que se le haya visto pedir: es el caso de las
   * carreteras, que no publican bandera de carga y solo se sabe de ellas
   * cuando llegan.
   */
  it('se hace si los datos aparecen sin haber visto la petición', () => {
    expect(run([IDLE, DONE]).done).toBe(true)
  })

  /**
   * Lo hecho no se deshace. Apagar y volver a encender una capa dispara otra
   * petición —`useOsmRoads` reintenta así— y eso no es «la primera carga»: la
   * barra ya se fue y no tiene que volver a media sesión.
   */
  it('no vuelve atrás cuando la capa se recarga más tarde', () => {
    expect(run([IDLE, LOADING, DONE, LOADING]).done).toBe(true)
    expect(run([IDLE, LOADING, DONE, LOADING, IDLE]).done).toBe(true)
  })
})

describe('el recuento', () => {
  it('cuenta los hechos sobre el total', () => {
    const steps = [PENDING, { seen: true, done: true }, { seen: true, done: false }]
    expect(progress(steps)).toEqual({ done: 1, total: 3 })
  })

  it('sin pasos no hay nada que esperar', () => {
    expect(progress([])).toEqual({ done: 0, total: 0 })
  })
})
