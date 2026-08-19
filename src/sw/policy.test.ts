import { describe, expect, it } from 'vitest'
import { routeFor } from './policy'

const ORIGIN = 'https://app.tiempopalmero.com'
const route = (path: string, mode = 'cors', method = 'GET') =>
  routeFor(`${ORIGIN}${path}`, ORIGIN, mode, method)

describe('routeFor', () => {
  it('NUNCA cachea la API: un dato del Cabildo viejo enseñado como nuevo es una mentira', () => {
    expect(route('/api/cda')).toBe('passthrough')
    expect(route('/api/openmeteo?lat=28.7&lon=-17.9')).toBe('passthrough')
    expect(route('/api/history')).toBe('passthrough')
    expect(route('/api/co2')).toBe('passthrough')
  })

  it('deja pasar lo que no es de este origen, teselas incluidas', () => {
    expect(routeFor('https://opencache.grafcan.es/wms?BBOX=1', ORIGIN, 'cors')).toBe('passthrough')
    expect(routeFor('https://fonts.gstatic.com/s/barlow.woff2', ORIGIN, 'cors')).toBe('passthrough')
  })

  it('una navegación es la aplicación guardada', () => {
    expect(route('/', 'navigate')).toBe('shell')
    expect(route('/cualquier-cosa', 'navigate')).toBe('shell')
  })

  it('lo que lleva hash en el nombre se sirve de la caché sin preguntar', () => {
    expect(route('/assets/index-BMIR2vVR.js')).toBe('immutable')
    expect(route('/assets/index-qZBPfEJo.css')).toBe('immutable')
  })

  it('las teselas del DEM son inmutables porque llevan la versión en la URL', () => {
    expect(route('/dem/12/1841/1703.png?v=20260815')).toBe('immutable')
  })

  it('pero el manifiesto que dice qué versión hay va SIEMPRE a la red primero', () => {
    expect(route('/dem/manifest.json')).toBe('fresh')
    expect(route('/ocean/manifest.json')).toBe('fresh')
    expect(route('/cielo/manifest.json')).toBe('fresh')
    expect(route('/layers/index.json')).toBe('fresh')
  })

  it('una tesela del DEM sin `?v=` no se congela: sin versión no hay inmutabilidad', () => {
    expect(route('/dem/12/1841/1703.png')).toBe('data')
  })

  it('los datos generados y los iconos se sirven de la caché y se refrescan detrás', () => {
    expect(route('/gazetteer.json')).toBe('data')
    expect(route('/guagua-red.json')).toBe('data')
    expect(route('/fire/riesgo.png')).toBe('data')
    expect(route('/ocean/batimetria.png')).toBe('data')
    // El catálogo de estrellas: 107 KB que se piden una vez y valen para
    // siempre hasta que se regenere el fichero.
    expect(route('/cielo/estrellas.bin')).toBe('data')
    expect(route('/cielo/figuras.bin')).toBe('data')
    expect(route('/manifest.webmanifest')).toBe('data')
    expect(route('/icon-512.png')).toBe('data')
  })

  it('las capas del Cabildo se quedan fuera: 16 MB que casi nadie enciende', () => {
    expect(route('/layers/senderos.geojson')).toBe('passthrough')
    expect(route('/layers/carreteras.geojson')).toBe('passthrough')
  })

  it('lo que no es GET no se toca', () => {
    expect(route('/gazetteer.json', 'cors', 'POST')).toBe('passthrough')
    expect(route('/', 'navigate', 'POST')).toBe('passthrough')
  })
})
