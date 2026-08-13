/**
 * Ficha de una línea de guagua.
 *
 * Se abre desde el trazado o desde la ficha de una parada, y mientras está
 * elegida el mapa resalta el recorrido entero y sus paradas —esas desde más
 * lejos que el resto, porque al elegir una línea lo que se quiere ver es dónde
 * para—. Al cerrar la ficha el resaltado se va con ella.
 */

import { View } from 'react-native'
import type { GuaguaNetwork } from '@core/lib/guagua/network'
import { n, n0, t } from '@core/i18n'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { Note } from './Note'
import { ServiceRows } from './ServiceRows'

interface Props {
  routeId: string
  net: GuaguaNetwork | null
}

export function RouteSheet({ routeId, net }: Props) {
  const route = net?.routes[routeId]
  if (!route) return <Note>{t.guagua.noLines}</Note>

  return (
    <>
      {route.destinations.length > 0 && (
        <Section title={t.guagua.destinations} first>
          <Chips labels={route.destinations} />
        </Section>
      )}

      <Section title={t.guagua.routeTitle} first={route.destinations.length === 0}>
        <View style={{ marginTop: 8 }}>
          <Row label={t.guagua.stopsCount} value={n0(route.stops)} />
          {route.lengthKm > 0 && (
            <Row label={t.guagua.length} value={`${n(route.lengthKm, 1)} ${t.units.km}`} last />
          )}
        </View>
        <Note>{t.guagua.lengthHint}</Note>
      </Section>

      <ServiceRows
        label={t.guagua.trips}
        counts={route.trips}
        first={route.first}
        last={route.last}
        net={net}
      />

      <Section title={t.guagua.operator}>
        <Note>{t.guagua.source}</Note>
      </Section>
    </>
  )
}
