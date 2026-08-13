/**
 * El bloque de servicio, común a la ficha de parada y a la de línea.
 *
 * Igual que en la web y por el mismo motivo: existe para que el aviso de
 * caducidad y las cifras que describe no puedan separarse nunca. Van en el
 * mismo componente, así que cualquier ficha que enseñe volumen de servicio se
 * lleva el aviso consigo. El horario de TILP venció y no se ha renovado; una
 * cifra de salidas sin esa frase al lado es una guagua perdida.
 */

import { View } from 'react-native'
import { formatIsoDate, type DayCounts, type GuaguaNetwork } from '@core/lib/guagua/network'
import { n0, t } from '@core/i18n'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'
import { Note } from './Note'

interface Props {
  /** «Salidas» en una parada, «Viajes» en una línea: no es lo mismo. */
  label: string
  counts: DayCounts
  first: string | null
  last: string | null
  net: GuaguaNetwork | null
}

export function ServiceRows({ label, counts, first, last, net }: Props) {
  const until = formatIsoDate(net?.validUntil)
  return (
    <Section title={t.guagua.serviceTitle}>
      <View style={{ marginTop: 8 }}>
        <Row label={`${label} · ${t.guagua.weekday}`} value={n0(counts.weekday)} />
        <Row label={`${label} · ${t.guagua.saturday}`} value={n0(counts.saturday)} />
        <Row label={`${label} · ${t.guagua.sunday}`} value={n0(counts.sunday)} />
        <Row
          label={t.guagua.window}
          value={first && last ? t.guagua.windowValue(first, last) : t.guagua.noWindow}
          last
        />
      </View>
      <Note
        warn={net?.expired !== false}
        link={{ label: t.guagua.operatorLink, url: t.guagua.operatorUrl }}
      >
        {net?.expired === false ? t.guagua.notExpired(until) : t.guagua.expired(until)}
      </Note>
    </Section>
  )
}
