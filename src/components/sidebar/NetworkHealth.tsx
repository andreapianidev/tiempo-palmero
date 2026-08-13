/**
 * Qué sensores no se cree la aplicación, y por qué.
 *
 * Es el bloque que hacía falta para que el mapa deje de mentir por omisión.
 * Antes, una estación averiada pintaba su cifra como cualquier otra y no había
 * en toda la interfaz un sitio donde enterarse; ahora se dice el nombre, la
 * regla que ha saltado y LA CIFRA que la sostiene, que es lo único que se
 * puede ir a comprobar en la gráfica de esa misma estación.
 *
 * No enseña un porcentaje de salud ni un semáforo: enseña una lista corta de
 * nombres. Cuando está vacía, lo dice en una línea y se acaba.
 */

import type { Diagnosis, Fault } from '../../lib/sensor-health'
import { WINDOW_H } from '../../lib/sensor-health'
import type { SensorHealth } from '../../hooks/useSensorHealth'
import type { Station } from '../../lib/quality'
import { t } from '../../i18n'

interface Props {
  health: SensorHealth
  stations: Station[]
}

/** La frase que describe una avería, con su cifra. */
export function faultLine(fault: Fault): string {
  switch (fault.kind) {
    case 'jump':
      return t.health.fault.jump(fault.measured)
    case 'stuck':
      return t.health.fault.stuck(fault.measured)
    case 'incoherent':
      return t.health.fault.incoherent(fault.measured)
    case 'impossible':
      return t.health.fault.impossible(fault.measured)
  }
}

/** Cuántas averías hay entre las estaciones que están hoy en el mapa. */
export function faultyOf(
  health: SensorHealth,
  stations: readonly Station[],
): { station: Station; diagnosis: Diagnosis }[] {
  const out: { station: Station; diagnosis: Diagnosis }[] = []
  for (const station of stations) {
    const diagnosis = health.diagnoses.get(station.entityId)
    if (diagnosis?.faulty) out.push({ station, diagnosis })
  }
  return out
}

export function NetworkHealth({ health, stations }: Props) {
  if (health.unavailable) return <p className="warn small">{t.health.unavailable}</p>
  if (health.loading) return <p className="dim small">{t.health.checking}</p>

  const faulty = faultyOf(health, stations)

  if (!faulty.length) {
    return (
      <>
        <p className="dim small">{t.health.allSound(health.examined)}</p>
        <p className="dim small">{t.health.windowNote(WINDOW_H)}</p>
      </>
    )
  }

  return (
    <>
      <p className="headline-stat">{t.health.summary(faulty.length, health.examined)}</p>

      <ul className="fault-list">
        {faulty.map(({ station, diagnosis }) => (
          <li key={station.entityId}>
            <p className="fault-name">{station.name}</p>
            <ul className="fault-why">
              {diagnosis.faults.map((fault) => (
                <li key={fault.kind} className="mono small">
                  {faultLine(fault)}
                </li>
              ))}
            </ul>
            <p className="dim small">{t.health.excludedFromModel}</p>
          </li>
        ))}
      </ul>

      <p className="dim small">{t.health.windowNote(WINDOW_H)}</p>

      <details className="explain">
        <summary>{t.health.title}</summary>
        {/* Se explica solo lo que ha saltado de verdad: una lista de las cuatro
            reglas siempre visible sería un manual, no una explicación. */}
        {[...new Set(faulty.flatMap((f) => f.diagnosis.faults.map((x) => x.kind)))].map(
          (kind) => (
            <p key={kind} className="small">
              {t.health.faultWhy[kind]}
            </p>
          ),
        )}
      </details>
    </>
  )
}
