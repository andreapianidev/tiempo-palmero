/**
 * Ficha de una parada de guagua.
 *
 * Las tres preguntas de quien toca una parada, en este orden: qué líneas paran
 * aquí, cuánto servicio tenía —con la fecha de caducidad delante— y si se puede
 * subir en silla de ruedas. La que nunca responde es «a qué hora pasa»: eso lo
 * tiene TILP, y la ficha lleva allí.
 *
 * Tocar una línea la resalta en el mapa y cierra la hoja, que es la versión de
 * teléfono de lo que en el escritorio hacen la ficha y el mapa a la vez: aquí
 * la hoja tapa media isla, así que enseñar el recorrido y quedarse encima sería
 * enseñarlo a medias.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  compareLines,
  serviceLevel,
  type GuaguaNetwork,
  type GuaguaStopPoint,
} from '@core/lib/guagua/network'
import { n, t } from '@core/i18n'
import { color, font } from '../theme'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { Note } from './Note'
import { ServiceRows } from './ServiceRows'

interface Props {
  stop: GuaguaStopPoint
  net: GuaguaNetwork | null
  onRoute: (routeId: string) => void
  onWeather: (lon: number, lat: number, label: string) => void
}

export function StopSheet({ stop, net, onRoute, onWeather }: Props) {
  const service = net?.stops[stop.stopId] ?? null
  const routes = [...(service?.routes ?? [])].sort((a, b) => compareLines(net, a, b))
  const level = service ? serviceLevel(service.departures) : null

  return (
    <>
      <Pressable onPress={() => onWeather(stop.lon, stop.lat, stop.name)}>
        <Text style={styles.action}>{t.guagua.weatherHere} →</Text>
      </Pressable>

      <Section title={t.guagua.linesHere} first>
        {routes.length ? (
          <View style={styles.lines}>
            {routes.map((id) => {
              const route = net?.routes[id]
              return (
                <Pressable
                  key={id}
                  onPress={() => onRoute(id)}
                  accessibilityRole="button"
                  accessibilityHint={t.guagua.showRoute}
                  style={({ pressed }) => [styles.line, pressed && styles.down]}
                >
                  <Text style={styles.lineNo}>{route?.name ?? id}</Text>
                  <Text style={styles.lineName} numberOfLines={1}>
                    {route?.longName ?? ''}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Note>{t.guagua.noLines}</Note>
        )}
        {level ? <Chips labels={[t.guagua.levels[level] ?? level]} /> : null}
      </Section>

      {service && (
        <ServiceRows
          label={t.guagua.departures}
          counts={service.departures}
          first={service.first}
          last={service.last}
          net={net}
        />
      )}

      <Section title={t.guagua.wheelchair}>
        <Text style={styles.value}>{t.guagua.wheelchairStates[stop.wheelchair]}</Text>
        <Note>{t.guagua.wheelchairNote}</Note>
      </Section>

      <Section title={t.poi.coords}>
        <View style={{ marginTop: 8 }}>
          {stop.code ? <Row label={t.guagua.stopCode} value={stop.code} /> : null}
          <Row label={t.poi.coords} value={`${n(stop.lat, 5)}, ${n(stop.lon, 5)}`} last />
        </View>
        <Note>{t.guagua.source}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  action: { fontFamily: font.medium, fontSize: 14, color: color.amber, paddingVertical: 4 },
  lines: { marginTop: 10, gap: 6 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.line,
  },
  down: { opacity: 0.6 },
  lineNo: { fontFamily: font.monoSemibold, fontSize: 13, color: color.amber, minWidth: 34 },
  lineName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.fg },
  value: { fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: color.fg, marginTop: 8 },
})
