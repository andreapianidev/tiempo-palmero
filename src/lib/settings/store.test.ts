import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_VERSION, parseSettings, serializeSettings } from './store'

/**
 * Un disco de mentira, para no tocar ni `localStorage` ni el sistema de
 * archivos. Cuenta las escrituras además de guardarlas: parte de lo que hay
 * que demostrar es que arrancar NO escribe.
 */
const disk = vi.hoisted(() => ({ text: null as string | null, writes: 0 }))

vi.mock('./backend', () => ({
  backend: {
    read: () => disk.text,
    write: (text: string) => {
      disk.text = text
      disk.writes += 1
    },
  },
}))

/**
 * El cajón cachea lo leído durante todo el arranque, que es justo lo que se
 * quiere en producción y un estorbo en una prueba. Volver a importar el módulo
 * es tener un arranque nuevo.
 */
async function arranque() {
  vi.resetModules()
  return import('./store')
}

beforeEach(() => {
  disk.text = null
  disk.writes = 0
})

/**
 * Lo guardado lo escribió otra versión de la aplicación, y las maneras de que
 * llegue inservible no son hipotéticas: un despliegue a mitad de escritura lo
 * trunca, un cambio de formato lo deja con la forma de antes, y una extensión
 * del navegador puede escribir cualquier cosa en la misma clave. Ninguna de
 * ellas puede impedir que la isla aparezca.
 */
describe('parseSettings', () => {
  it('lee lo que escribió serializeSettings', () => {
    const values = { layers: { grid: true }, variable: 'dewpoint' }
    expect(parseSettings(serializeSettings(values))).toEqual(values)
  })

  it('no hay nada guardado todavía', () => {
    expect(parseSettings(null)).toEqual({})
    expect(parseSettings('')).toEqual({})
  })

  it('el texto está truncado o no es JSON', () => {
    expect(parseSettings('{"v":1,"values":{"gri')).toEqual({})
    expect(parseSettings('vaya')).toEqual({})
  })

  it('el JSON es válido pero no es un sobre', () => {
    expect(parseSettings('[1,2,3]')).toEqual({})
    expect(parseSettings('"ajustes"')).toEqual({})
    expect(parseSettings('null')).toEqual({})
  })

  it('el sobre es de otra versión del formato', () => {
    const viejo = JSON.stringify({ v: SETTINGS_VERSION - 1, values: { variable: 'presion' } })
    expect(parseSettings(viejo)).toEqual({})
    const futuro = JSON.stringify({ v: SETTINGS_VERSION + 1, values: { variable: 'vpd' } })
    expect(parseSettings(futuro)).toEqual({})
  })

  it('el sobre es de esta versión pero el contenido no es un objeto', () => {
    expect(parseSettings(JSON.stringify({ v: SETTINGS_VERSION }))).toEqual({})
    expect(parseSettings(JSON.stringify({ v: SETTINGS_VERSION, values: [1] }))).toEqual({})
    expect(parseSettings(JSON.stringify({ v: SETTINGS_VERSION, values: null }))).toEqual({})
  })

  it('desconoce las claves pero no las juzga: eso es cosa de revive.ts', () => {
    // El cajón entrega tal cual; quien valida el contenido de cada ajuste es el
    // validador de la pantalla que lo pidió.
    const raro = JSON.stringify({ v: SETTINGS_VERSION, values: { capaQueNoExiste: 7 } })
    expect(parseSettings(raro)).toEqual({ capaQueNoExiste: 7 })
  })
})

describe('leer y escribir', () => {
  it('lo elegido en una sesión se lee en la siguiente', async () => {
    const sesion = await arranque()
    sesion.writeSetting('variable', 'vpd')
    sesion.writeSetting('layers', { grid: false, wind: true })

    const siguiente = await arranque()
    expect(siguiente.readSetting('variable')).toBe('vpd')
    expect(siguiente.readSetting('layers')).toEqual({ grid: false, wind: true })
  })

  it('un ajuste que nunca se tocó no está, y no es `null`', async () => {
    const sesion = await arranque()
    // La diferencia importa: `usePersistentState` distingue «no hay nada
    // guardado» de «hay guardado algo que no vale», y solo lo segundo pasa por
    // el validador.
    expect(sesion.readSetting('basemap')).toBeUndefined()
  })

  it('arrancar no escribe: montar los hooks con lo que ya estaba no toca el disco', async () => {
    const primera = await arranque()
    primera.writeSetting('variable', 'vpd')
    primera.writeSetting('terrain', { on: true, exaggeration: 1.5 })
    const escriturasIniciales = disk.writes

    // Lo que hace el efecto de cada hook al montarse: guardar el valor con el
    // que se inicializó, que es exactamente el que ya estaba guardado.
    const segunda = await arranque()
    segunda.writeSetting('variable', 'vpd')
    segunda.writeSetting('terrain', { on: true, exaggeration: 1.5 })
    expect(disk.writes).toBe(escriturasIniciales)
  })

  it('pero un cambio de verdad sí escribe, aunque sea dentro de un objeto', async () => {
    const sesion = await arranque()
    sesion.writeSetting('terrain', { on: true, exaggeration: 1 })
    const antes = disk.writes
    sesion.writeSetting('terrain', { on: true, exaggeration: 1.5 })
    expect(disk.writes).toBe(antes + 1)
    expect(sesion.readSetting('terrain')).toEqual({ on: true, exaggeration: 1.5 })
  })

  it('un disco corrupto arranca de fábrica y la primera escritura lo repara', async () => {
    disk.text = '{"v":1,"values":{"varia'
    const sesion = await arranque()
    expect(sesion.readSetting('variable')).toBeUndefined()

    sesion.writeSetting('variable', 'dewpoint')
    const reparada = await arranque()
    expect(reparada.readSetting('variable')).toBe('dewpoint')
  })

  it('guardar un ajuste no borra los demás', async () => {
    const sesion = await arranque()
    sesion.writeSetting('variable', 'vpd')
    sesion.writeSetting('basemap', 'satelite')

    const siguiente = await arranque()
    siguiente.writeSetting('variable', 'temperature')

    const tercera = await arranque()
    expect(tercera.readSetting('variable')).toBe('temperature')
    expect(tercera.readSetting('basemap')).toBe('satelite')
  })
})
