/**
 * Comprueba `/api/history` de punta a punta contra la API real.
 *
 * No es un test: los tests no salen a la red. Esto sirve para verificar contra
 * el archivo vivo que el recorte es correcto y cuánto ocupa de verdad lo que
 * llega al navegador. Se ejecuta a mano: `npx tsx scripts/probe-history.ts`.
 */

import handler from '../api/history'

const DAY = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

async function probe(query: string) {
  const t0 = Date.now()
  const res = await handler(new Request(`http://local/api/history?${query}`))
  const text = await res.text()
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const kb = Math.round(new TextEncoder().encode(text).length / 1024)

  if (!res.ok) {
    console.log(`  ${query} -> HTTP ${res.status} ${text.slice(0, 160)}`)
    return null
  }
  const body = JSON.parse(text) as {
    day: string
    step: number
    columns: string[]
    stations: { entityId: string; name: string; samples: (number | null)[][] }[]
  }
  const samples = body.stations.reduce((a, s) => a + s.samples.length, 0)
  console.log(
    `  ${query}\n    ${kb} KB · ${secs} s · ${body.stations.length} estaciones · ${samples} muestras · cache ${res.headers.get('cache-control')}`,
  )
  return body
}

console.log(`Día probado: ${DAY}`)
const raw = await probe(`day=${DAY}`)
const hourly = await probe(`day=${DAY}&step=60`)

if (raw && hourly) {
  const s = raw.stations[0]
  const h = hourly.stations.find((x) => x.entityId === s.entityId)
  console.log(`\n  Ejemplo: ${s.name} (${s.entityId})`)
  console.log(`    columnas: ${raw.columns.join(', ')}`)
  console.log(`    cruda:   ${s.samples.length} muestras, primera ${JSON.stringify(s.samples[0])}`)
  console.log(`    horaria: ${h?.samples.length} muestras, primera ${JSON.stringify(h?.samples[0])}`)

  const minutes = s.samples.map((x) => x[0] as number)
  console.log(`    minutos: ${Math.min(...minutes)} .. ${Math.max(...minutes)} (debe estar en 0..1439)`)

  // La media horaria tiene que caer entre el mínimo y el máximo de su tramo.
  const firstHour = s.samples.filter((x) => (x[0] as number) < 60).map((x) => x[1]).filter((v): v is number => v !== null)
  const avg = h?.samples[0]?.[1]
  if (firstHour.length && typeof avg === 'number') {
    const lo = Math.min(...firstHour)
    const hi = Math.max(...firstHour)
    console.log(
      `    primera hora: cruda ${lo}..${hi} °C, media ${avg} °C -> ${avg >= lo && avg <= hi ? 'OK' : 'FUERA DE RANGO'}`,
    )
  }
}

console.log('\nRechazos esperados:')
await probe('day=no-es-fecha')
await probe('day=2026-02-31')
await probe('day=2030-01-01')
await probe(`day=${DAY}&step=13`)
