import snapshot from '../../src/lib/__fixtures__/weather-snapshot.json'
import { buildStations } from '../../src/lib/quality.js'
import { parseLocation, type CdaRow } from '../../src/lib/cabildo.js'
import { toSamples, ols, fitWithRejection, leaveOneOut } from '../../src/lib/interpolate.js'

const NOW = snapshot.capturedAtMs
const ROWS = snapshot.rows as unknown as CdaRow[]
const elev = (lon: number, lat: number) => {
  for (const r of ROWS) {
    const l = parseLocation(r.location)
    if (l && Math.abs(l[0] - lon) < 1e-9 && Math.abs(l[1] - lat) < 1e-9)
      return (r as any)._demElevation
  }
  return null
}
const { stations, census } = buildStations(ROWS, elev, { now: NOW })
console.log('censo', census)
const samples = toSamples(stations, 'temperature')
const fit = ols(samples)
console.log(`\nOLS todas: b=${(fit.b*1000).toFixed(2)} °C/km  a=${fit.a.toFixed(2)}  r2=${fit.r2.toFixed(3)}  sigma=${fit.sigma.toFixed(2)}  n=${fit.n}`)
const rows = samples.map(s => ({ ...s, res: s.value - (fit.a + fit.b * s.elevation) }))
rows.sort((a,b)=>a.elevation-b.elevation)
console.log('\nalt(m)  T(°C)  resid   nombre                              lon,lat')
for (const r of rows) console.log(
  String(Math.round(r.elevation)).padStart(6),
  r.value.toFixed(1).padStart(6),
  r.res.toFixed(1).padStart(6),
  '  ' + r.name.slice(0,36).padEnd(36),
  r.lon.toFixed(4)+','+r.lat.toFixed(4))
const rej = fitWithRejection(samples)
console.log(`\ntras rechazo: b=${(rej.fit.b*1000).toFixed(2)} °C/km r2=${rej.fit.r2.toFixed(3)} sigma=${rej.fit.sigma.toFixed(2)} kept=${rej.kept.length} rejected=${rej.rejected.length} passes=${rej.passes}`)
for (const r of rej.rejected) console.log('   rechazada:', r.name, r.elevation.toFixed(0)+'m', r.value.toFixed(1)+'°C', 'resid', r.residual.toFixed(1), `${r.sigmas.toFixed(1)}σ`)
const loo = leaveOneOut(stations, 'temperature')
console.log(`\nLOO n=${loo.n} MAE=${loo.mae.toFixed(3)} RMSE=${loo.rmse.toFixed(3)} bias=${loo.bias.toFixed(3)} max=${loo.maxError.toFixed(2)}`)
console.log('peores:')
for (const w of loo.worst) console.log('  ', w.name.padEnd(34), Math.round(w.elevation)+'m', 'obs', w.observed.toFixed(1), 'pred', w.predicted.toFixed(1))
