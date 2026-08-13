/**
 * Avisos por sendero.
 *
 * DOS COSAS QUE ESTA SECCIÓN DICE EN VOZ ALTA, porque callarlas la haría
 * peligrosa:
 *
 * 1. **No es el estado del sendero.** Los cierres por derrumbe, obra o
 *    incendio los publica el Cabildo, y un aviso de viento no sustituye a un
 *    sendero cerrado. El enlace está abajo y no es decorativo.
 * 2. **No hay aviso de lluvia.** Las 37 estaciones frescas publican cero
 *    precipitación y esta aplicación no interpola lluvia nunca. Un sendero sin
 *    avisos puede estar empapado.
 *
 * Las rutas tranquilas se enseñan igual, al final: saber que hoy una ruta no
 * tiene nada es exactamente lo que alguien quiere antes de elegirla.
 */

import { useState } from 'react'
import { n, n0 } from '../../i18n'
import type { TrailAlert, TrailReport } from '../../lib/trails/alerts'

const KIND_ICON: Record<TrailAlert['kind'], string> = {
  wind: '≋',
  cold: '❄',
  heat: '☀',
  fog: '☁',
}

function alertText(a: TrailAlert): string {
  const share = Math.round(a.share * 100)
  switch (a.kind) {
    case 'wind':
      return (
        `Viento de ${n(a.value, 0)} m/s a ${n0(a.atElevationM)} m ` +
        `(${share} % del recorrido)`
      )
    case 'cold':
      return `${n(a.value, 0)} °C a ${n0(a.atElevationM)} m (${share} % del recorrido)`
    case 'heat':
      return `${n(a.value, 0)} °C a ${n0(a.atElevationM)} m (${share} % del recorrido)`
    case 'fog':
      return `${share} % del recorrido dentro del mar de nubes`
  }
}

interface Props {
  reports: TrailReport[]
}

/** Cuántas rutas se enseñan sin desplegar. Con 49 la lista no se lee. */
const VISIBLE = 8

export function TrailAlerts({ reports }: Props) {
  const [all, setAll] = useState(false)

  if (!reports.length) {
    return (
      <p className="dim small">
        Aún no hay modelo con el que recorrer los senderos. En cuanto la red
        publique, esta sección se llena sola.
      </p>
    )
  }

  const withAlerts = reports.filter((r) => r.worst !== null)
  const shown = all ? reports : reports.slice(0, VISIBLE)

  return (
    <>
      <p className="small">
        <b>{withAlerts.length}</b> de {reports.length} senderos con algún aviso
        ahora mismo.
      </p>

      <ul className="trail-list">
        {shown.map((r) => (
          <li key={r.profile.trail.id} className={`trail-${r.worst ?? 'calm'}`}>
            <div className="trail-head">
              <span className="trail-name">{r.profile.label}</span>
              <span className="mono dim">
                {n(r.profile.trail.longitudKm, 1)} km · {n0(r.profile.minElevationM)}–
                {n0(r.profile.maxElevationM)} m
              </span>
            </div>
            {r.alerts.length ? (
              <ul className="trail-alerts">
                {r.alerts.map((a) => (
                  <li key={a.kind} className={`sev-${a.severity}`}>
                    <span aria-hidden>{KIND_ICON[a.kind]}</span> {alertText(a)}
                    {/* En una cresta el viento casi siempre lo pone el modelo,
                        y decirlo es la diferencia entre un dato y una cifra. */}
                    {a.stationShare !== undefined && a.stationShare < 0.5 && (
                      <em className="dim">
                        {' '}
                        · {Math.round((1 - a.stationShare) * 100)} % modelo
                      </em>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim small trail-calm">Sin avisos</p>
            )}
          </li>
        ))}
      </ul>

      {reports.length > VISIBLE && (
        <button className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Ver menos' : `Ver los ${reports.length} senderos`}
        </button>
      )}

      <p className="dim small">
        Calculado recorriendo cada trazado con el modelo de la aplicación, un
        punto cada 200 m. <b>No es el estado del sendero</b>: los cierres por
        derrumbe u obra los publica el Cabildo en{' '}
        <a
          href="https://www.senderosdelapalma.es/senderos/estado-de-los-senderos/"
          target="_blank"
          rel="noreferrer"
        >
          senderosdelapalma.es
        </a>
        . Y no hay aviso de lluvia: la red no la mide de forma utilizable.
      </p>
    </>
  )
}
