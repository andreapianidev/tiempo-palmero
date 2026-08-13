/**
 * Mar de nubes, en el teléfono.
 *
 * Es el mismo diagnóstico que la web —`@core/lib/clouds`, misma banda, mismo
 * umbral de nubosidad, misma incertidumbre— pintado con los tokens de iOS. Lo
 * único que cambia entre plataformas es el dibujo; la afirmación es idéntica,
 * y tiene que serlo: dos aplicaciones de la misma casa no pueden decir que la
 * manta está a alturas distintas.
 */

import { StyleSheet, Text } from 'react-native'
import { n0 } from '@core/i18n'
import { sunlightAbove, zoneAt, type CloudDeck } from '@core/lib/clouds'
import { Section } from '../detail/Section'
import { Row } from '../detail/Row'
import { color, font } from '../theme'

interface Props {
  deck: CloudDeck | null
  hereM: number | null
  hereLabel: string | null
}

export function CloudSeaBlock({ deck, hereM, hereLabel }: Props) {
  if (!deck) {
    return (
      <Section
        title="Mar de nubes"
        first
        note="El sondeo de ahora no encuentra ninguna capa estable entre 200 y 2.500 m: hoy la atmósfera sube seguida."
      />
    )
  }

  const sun = sunlightAbove(deck)
  const zone = hereM !== null ? zoneAt(deck, hereM) : null

  return (
    <Section title="Mar de nubes" first>
      <Text style={styles.headline}>
        {deck.present ? (
          <>
            Manta entre <Text style={styles.hi}>{n0(deck.base)}</Text> y{' '}
            <Text style={styles.hi}>{n0(deck.top)} m</Text>. Por encima de{' '}
            <Text style={styles.hi}>{n0(sun)} m</Text> hay sol.
          </>
        ) : (
          <>
            Hay inversión entre {n0(deck.base)} y {n0(deck.top)} m, pero{' '}
            <Text style={styles.hi}>sin nubes debajo</Text>.
          </>
        )}
      </Text>

      <Row label="Base" value={`${n0(deck.base)} m`} valueSub={`± ${n0(deck.resolutionM)}`} />
      <Row label="Techo" value={`${n0(deck.top)} m`} valueSub={`± ${n0(deck.resolutionM)}`} />
      <Row
        label="Salto térmico"
        sub={deck.deltaT > 0 ? 'sube con la altura' : undefined}
        value={`${deck.deltaT > 0 ? '+' : ''}${deck.deltaT.toFixed(1)} °C`}
      />
      <Row label="Caída de humedad" value={`${deck.deltaRh.toFixed(0)} pt`} />
      <Row
        label="Nubosidad baja"
        value={deck.coverage === null ? '—' : `${Math.round(deck.coverage)} %`}
      />
      <Row
        label="Columnas de acuerdo"
        value={`${deck.agreement.withInversion}/${deck.agreement.total}`}
        last
      />

      {zone && (
        <Text style={styles.here}>
          {hereLabel ?? 'El punto elegido'} está a {n0(hereM!)} m:{' '}
          {zone === 'below'
            ? deck.present
              ? 'por debajo de la capa, cielo tapado desde abajo.'
              : 'por debajo de la capa.'
            : zone === 'above'
              ? deck.present
                ? 'por encima de la capa, al sol.'
                : 'por encima de la capa.'
              : 'dentro del margen de la capa: con esta resolución no se puede afirmar de qué lado cae.'}
        </Text>
      )}

      <Text style={styles.foot}>
        Del sondeo de niveles de presión de Open-Meteo. La cota es una banda
        porque los niveles que la encierran están a ~500 m entre sí.
      </Text>
    </Section>
  )
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: color.fg,
    marginTop: 10,
    marginBottom: 4,
  },
  hi: { fontFamily: font.semibold, color: color.amber },
  here: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: color.fg,
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: color.amber,
  },
  foot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.faint,
    marginTop: 12,
  },
})
