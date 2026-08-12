/**
 * Comprobación del point-in-polygon municipal contra puntos de verdad conocida.
 * Las coordenadas de Puerto Naos y La Bombilla son centroides reales de la red
 * de sensores CO₂ del propio portal, no estimaciones a ojo.
 */
import fs from 'node:fs'
import { areaContaining, bboxOfMultiPolygon, toMultiPolygon, type NamedArea } from '../../src/lib/geo.js'

const g = JSON.parse(fs.readFileSync('public/layers/municipios.geojson', 'utf8'))
const areas: NamedArea[] = g.features.map((f: any) => {
  const polygons = toMultiPolygon(f.geometry)
  return { name: f.properties.municipio, polygons, bbox: bboxOfMultiPolygon(polygons) }
})

const cases: [string, number, number, string][] = [
  ['El Pinar de Tijarafe', -17.93363, 28.7031, 'TIJARAFE'],
  ['Puerto Naos (sensores CO₂)', -17.9096, 28.586, 'LOS LLANOS DE ARIDANE'],
  ['La Bombilla (sensores CO₂)', -17.9186, 28.5929, 'TAZACORTE'],
  ['Los Llanos de Aridane', -17.9182, 28.6585, 'LOS LLANOS DE ARIDANE'],
  ['Roque de los Muchachos', -17.885, 28.7543, 'GARAFÍA'],
  ['Santa Cruz de La Palma', -17.7645, 28.6835, 'SANTA CRUZ DE LA PALMA'],
  ['Fuencaliente (pueblo)', -17.8452, 28.4931, 'FUENCALIENTE'],
  ['Barlovento', -17.7995, 28.8281, 'BARLOVENTO'],
  ['Aeropuerto', -17.7555, 28.6265, 'VILLA DE MAZO'],
  ['Atlántico, al oeste', -17.99, 28.5, 'null'],
]

let bad = 0
for (const [label, lon, lat, expect] of cases) {
  const got = areaContaining(lon, lat, areas)
  const ok = String(got) === expect
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(28)} → ${got}${ok ? '' : `  (esperado ${expect})`}`)
}
console.log(bad ? `\n${bad} fallo(s)` : '\nTodos correctos')
process.exit(bad ? 1 : 0)
