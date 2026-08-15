/**
 * La sección «Experimental», y su primera función: el índice de incendio.
 *
 * ESTE BLOQUE ES MÁS AVISO QUE CIFRA, y es a propósito. La capa dibuja un mapa
 * de colores sobre una isla que se ha quemado cinco veces en quince años: lo
 * que hay que dejar claro antes que nada es qué NO es —un aviso oficial, una
 * probabilidad, una garantía— y quién sí avisa de verdad.
 *
 * Después vienen las cifras del propio modelo, y vienen del JSON que exporta el
 * entrenamiento, no escritas a mano aquí. Cuando alguien reentrene con un
 * incendio más, esta pantalla se entera sola. Es la misma regla que ya sigue el
 * bloque del modelo higrotérmico con su R² y su RMSE.
 */

import { t } from '../../i18n'
import type { FireRiskState } from '../../hooks/useFireRisk'
import { fuelLabel } from '../../lib/fire/fuel'

interface Props {
  fire: FireRiskState
  /**
   * El índice se está VIENDO en el mapa, que es variable elegida Y malla
   * encendida. No basta con la primera: sin malla no hay dónde pintarlo, y la
   * casilla marcada sobre un mapa sin un solo color de incendio mentía.
   */
  active: boolean
  onActivate: () => void
}

const pct = (v: number) => `${Math.round(v * 100)} %`

export function FireRisk({ fire, active, onActivate }: Props) {
  const spec = fire.statics?.spec

  return (
    <>
      <p className="warn small">{t.fireRisk.disclaimer}</p>

      <div className="switches">
        <label>
          <input type="checkbox" checked={active} onChange={onActivate} />
          <span>{t.fireRisk.layer}</span>
        </label>
      </div>

      {/* El interruptor no enciende una capa que se suma a lo que ya hay: le
          quita el mapa a la variable meteorológica y se lo queda. Se dice
          antes de marcarlo, y se recuerda mientras está marcado. */}
      <p className="dim small">{active ? t.fireRisk.layerOn : t.fireRisk.layerHint}</p>

      {fire.loading && (
        <p className="dim small history-loading">
          <span className="spinner" />
          {t.fireRisk.loading}
        </p>
      )}
      {fire.failed && <p className="warn small">{t.fireRisk.failed}</p>}
      {active && fire.droughtFailed && <p className="warn small">{t.fireRisk.noDrought}</p>}

      {/*
        Aquí NO va la escala de colores. Cuando la capa está encendida —que es
        la única vez que tendría sentido— el selector de variable ya la dibuja
        arriba, con las mismas FIRE_BANDS, y salían las dos idénticas en el
        mismo panel: en el móvil, a media pantalla de distancia una de otra.
      */}
      <p className="dim small">{t.fireRisk.whatBody}</p>

      {spec && (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t.fireRisk.trainedOn}</th>
                <td className="mono">
                  {spec.training.fires.length} incendios ·{' '}
                  {Math.round(
                    spec.training.fires.reduce((s, f) => s + f.declaredHa, 0),
                  ).toLocaleString('es')}{' '}
                  ha
                </td>
              </tr>
              <tr>
                <th>{t.fireRisk.validation}</th>
                <td className="mono">AUC {spec.validation.aucMean.toFixed(3)}</td>
              </tr>
              <tr>
                <th>{t.fireRisk.worstFold}</th>
                <td className="mono">
                  {spec.validation.aucWorst.toFixed(3)} ·{' '}
                  {shortFire(
                    spec.validation.folds.find((f) => f.auc === spec.validation.aucWorst)?.fire,
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="dim small">{t.fireRisk.validationHint}</p>
          <p className="dim small">{t.fireRisk.worstFoldHint}</p>

          <details className="block">
            <summary className="lbl">Los cinco incendios</summary>
            <table className="kv">
              <tbody>
                {spec.training.fires.map((f) => {
                  const fold = spec.validation.folds.find((x) => x.fire === f.label)
                  return (
                    <tr key={f.year}>
                      <th>
                        {f.year}
                        {f.date ? ` · ${f.date.slice(5)}` : ''}
                      </th>
                      <td className="mono">
                        {Math.round(f.declaredHa).toLocaleString('es')} ha
                        {fold ? ` · AUC ${fold.auc.toFixed(2)}` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="dim small">
              Perímetros del Cabildo Insular (2009 y 2012) y de Copernicus EFFIS (2016, 2020
              y 2023). Es todo lo que hay publicado: no existe perímetro del incendio de 2005,
              y el de 2024 son 5 ha, o sea una celda.
            </p>
          </details>

          <details className="block">
            <summary className="lbl">Qué pesa en el modelo</summary>
            <table className="kv">
              <tbody>
                {spec.importances
                  .filter((i) => i.importance >= 0.01)
                  .map((i) => (
                    <tr key={i.name}>
                      <th>{predictorLabel(i.name)}</th>
                      <td className="mono">{pct(i.importance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="dim small">
              La distancia a la vía más cercana casi no pesa, y eso es un resultado: en esta
              isla hay 2.225 km de pistas agrícolas y forestales, y el 60 % de las celdas
              tienen una dentro. No distingue lo remoto de lo accesible porque casi nada es
              remoto.
            </p>
          </details>

          <details className="block">
            <summary className="lbl">El tiempo de los cinco arranques</summary>
            <table className="kv">
              <tbody>
                {spec.danger.fireDays.map((d) => (
                  <tr key={d.day}>
                    <th>{d.day.slice(0, 7)}</th>
                    <td className="mono">
                      Fosberg p{Math.round(d.fosbergPercentile)}
                      {d.daysSinceRain !== null ? ` · ${d.daysSinceRain} d sin llover` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dim small">
              Percentiles sobre {spec.danger.climateDays.toLocaleString('es')} días de archivo,
              de {spec.danger.climateFrom.slice(0, 4)} a {spec.danger.climateTo.slice(0, 4)}.
              Cuatro de los cinco arrancaron con el tiempo en la mitad alta, y uno —Garafía
              2020— con un día del montón. Con cinco casos eso no valida una escala: la sitúa.
            </p>
          </details>

          <p className="dim small">{t.fireRisk.fuelYear}</p>
          <p className="dim small">{t.fireRisk.droughtModel}</p>
        </>
      )}
    </>
  )
}

/** «Incendio de 2020 (Garafía)» → «2020 Garafía», que es lo que cabe. */
function shortFire(label: string | undefined): string {
  if (!label) return '—'
  const year = label.match(/\d{4}/)?.[0] ?? ''
  const place = label.match(/\(([^)]+)\)/)?.[1] ?? ''
  return [year, place].filter(Boolean).join(' ')
}

/**
 * El nombre interno de un predictor, en castellano.
 *
 * Los de combustible se resuelven contra el catálogo en vez de escribirse aquí,
 * para que reentrenar con un modelo NFFL más no deje una fila con el nombre
 * crudo a la vista.
 */
function predictorLabel(name: string): string {
  if (name.startsWith('fuel')) return `Combustible: ${fuelLabel(Number(name.slice(4)))}`
  switch (name) {
    case 'elevation_km':
      return 'Altitud'
    case 'slope':
      return 'Pendiente'
    case 'southness':
      return 'Orientación al sur'
    case 'westness':
      return 'Orientación al oeste'
    case 'log_distance':
      return 'Distancia a una vía'
    default:
      return name
  }
}

