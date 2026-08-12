/**
 * «Cerca de aquí».
 *
 * Reutiliza `findNearby()` tal cual: senderos, puntos del sendero, zonas
 * recreativas, patrimonio, paradas de guagua y recarga eléctrica, ya ordenados
 * por distancia. Se carga bajo demanda —son varios megas de capas y la mayoría
 * de las consultas no llegan a abrir la ficha— y mientras tanto el resto de la
 * ficha ya está en pantalla.
 *
 * Si hay una parada cerca, se dice por qué no hay horarios: un horario caducado
 * leído como vigente es una guagua perdida.
 */

import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { findNearby, NEARBY_VISIBLE, type NearbyItem, type NearbyKind } from '@core/lib/nearby'
import { formatIsoDate, loadGuaguaNetwork, type GuaguaNetwork } from '@core/lib/guagua/network'
import { n, t } from '@core/i18n'
import { color, font } from '../theme'
import { Section } from './Section'

/** Un glifo por categoría. Sin fuentes de iconos: son caracteres. */
const KIND_ICON: Record<NearbyKind, string> = {
  trail: '⛰',
  trailPoi: '◆',
  recreation: '⛺',
  tourism: '★',
  culture: '❖',
  history: '⌂',
  busStop: '⬤',
  charging: '⚡',
}

export function Nearby({ lon, lat }: { lon: number; lat: number }) {
  const [items, setItems] = useState<NearbyItem[] | null>(null)
  const [guagua, setGuagua] = useState<GuaguaNetwork | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setExpanded(false)
    findNearby(lon, lat).then((r) => !cancelled && setItems(r))
    loadGuaguaNetwork().then((g) => !cancelled && setGuagua(g))
    return () => {
      cancelled = true
    }
  }, [lon, lat])

  const shown = items === null ? [] : expanded ? items : items.slice(0, NEARBY_VISIBLE)
  const hidden = (items?.length ?? 0) - shown.length
  const hasBusStop = shown.some((i) => i.kind === 'busStop')

  return (
    <Section title={t.nearby.title}>
      {items === null && <Text style={styles.empty}>{t.nearby.loading}</Text>}
      {items !== null && items.length === 0 && (
        <Text style={styles.empty}>{t.nearby.empty}</Text>
      )}

      {shown.map((it, i) => (
        <View key={`${it.kind}-${it.name}-${i}`} style={styles.poi}>
          <Text style={styles.icon}>{KIND_ICON[it.kind]}</Text>
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {it.name}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {t.nearby.kinds[it.kind]}
              {it.detail ? ` · ${it.detail}` : ''}
            </Text>
          </View>
          <Text style={styles.dist}>
            {it.distanceKm < 1
              ? `${Math.round(it.distanceKm * 1000)} m`
              : `${n(it.distanceKm, 1)} km`}
          </Text>
        </View>
      ))}

      {hidden > 0 && (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button">
          <Text style={styles.more}>{t.nearby.showMore(hidden)}</Text>
        </Pressable>
      )}

      {hasBusStop && guagua?.expired && guagua.validUntil && (
        <Text style={styles.warn}>
          {t.nearby.guaguaNoTimetable(formatIsoDate(guagua.validUntil))}{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL(t.nearby.guaguaSourceUrl)}
          >
            {t.nearby.guaguaSource} →
          </Text>
        </Text>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  empty: { fontFamily: font.regular, fontSize: 12.5, color: color.faint, paddingVertical: 6 },
  poi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  icon: { width: 22, textAlign: 'center', fontSize: 13, color: color.amber },
  body: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: color.fg },
  detail: { fontFamily: font.mono, fontSize: 10, lineHeight: 14, color: color.faint },
  dist: { fontFamily: font.mono, fontSize: 11.5, color: color.dim },
  more: { fontFamily: font.medium, fontSize: 13, color: color.amber, paddingVertical: 10 },
  warn: { fontFamily: font.regular, fontSize: 12, lineHeight: 18, color: color.warn, marginTop: 10 },
  link: { color: color.amber },
})
