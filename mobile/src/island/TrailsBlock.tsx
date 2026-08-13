/**
 * Avisos por sendero, en el teléfono.
 *
 * Aquí importa más que en la web decir lo que esto NO es, porque es la
 * pantalla que alguien mira en el aparcamiento antes de echar a andar: no es
 * el estado del sendero —los cierres los publica el Cabildo— y no hay aviso de
 * lluvia, porque la red no la mide de forma utilizable.
 *
 * Se enseñan diez y se despliegan las 49. Las rutas tranquilas se quedan al
 * final, no se tiran: saber que hoy una ruta está sin nada es exactamente lo
 * que se quiere saber antes de elegirla.
 */

import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { n, n0 } from '@core/i18n'
import type { TrailAlert, TrailReport } from '@core/lib/trails/alerts'
import { Section } from '../detail/Section'
import { color, font } from '../theme'

const KIND_ICON: Record<TrailAlert['kind'], string> = {
  wind: '≋',
  cold: '❄',
  heat: '☀',
  fog: '☁',
}

function alertText(a: TrailAlert): string {
  const share = Math.round(a.share * 100)
  if (a.kind === 'fog') return `${share} % dentro del mar de nubes`
  if (a.kind === 'wind') {
    return `Viento de ${n(a.value, 0)} m/s a ${n0(a.atElevationM)} m · ${share} %`
  }
  return `${n(a.value, 0)} °C a ${n0(a.atElevationM)} m · ${share} %`
}

const VISIBLE = 10

export function TrailsBlock({ reports }: { reports: TrailReport[] }) {
  const [all, setAll] = useState(false)

  if (!reports.length) {
    return (
      <Section
        title="Senderos"
        note="Aún no hay modelo con el que recorrer los senderos."
      />
    )
  }

  const withAlerts = reports.filter((r) => r.worst !== null)
  const shown = all ? reports : reports.slice(0, VISIBLE)

  return (
    <Section
      title="Senderos"
      note={`${withAlerts.length} de ${reports.length} con algún aviso ahora mismo.`}
    >
      {shown.map((r) => (
        <View
          key={r.profile.trail.id}
          style={[
            styles.trail,
            r.worst === 'warning' && styles.warning,
            r.worst === 'notice' && styles.notice,
          ]}
        >
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={1}>
              {r.profile.label}
            </Text>
            <Text style={styles.meta}>
              {n(r.profile.trail.longitudKm, 1)} km · {n0(r.profile.minElevationM)}–
              {n0(r.profile.maxElevationM)} m
            </Text>
          </View>
          {r.alerts.length ? (
            r.alerts.map((a) => (
              <Text
                key={a.kind}
                style={[styles.alert, a.severity === 'warning' && styles.alertBad]}
              >
                {KIND_ICON[a.kind]} {alertText(a)}
                {/* En una cresta el viento casi siempre lo pone el modelo. */}
                {a.stationShare !== undefined && a.stationShare < 0.5
                  ? ` · ${Math.round((1 - a.stationShare) * 100)} % modelo`
                  : ''}
              </Text>
            ))
          ) : (
            <Text style={styles.calm}>Sin avisos</Text>
          )}
        </View>
      ))}

      {reports.length > VISIBLE && (
        <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button">
          <Text style={styles.more}>
            {all ? 'Ver menos' : `Ver los ${reports.length} senderos`}
          </Text>
        </Pressable>
      )}

      <Text style={styles.foot}>
        Calculado recorriendo cada trazado con el modelo, un punto cada 200 m.
        No es el estado del sendero: los cierres por derrumbe u obra los publica
        el Cabildo. Y no hay aviso de lluvia — la red no la mide de forma
        utilizable.
      </Text>
    </Section>
  )
}

const styles = StyleSheet.create({
  trail: {
    paddingVertical: 8,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: color.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  warning: { borderLeftColor: color.bad },
  notice: { borderLeftColor: color.amber },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' },
  name: { flex: 1, fontFamily: font.medium, fontSize: 13.5, color: color.fg },
  meta: { fontFamily: font.mono, fontSize: 10, color: color.faint },
  alert: { fontFamily: font.regular, fontSize: 12, lineHeight: 18, color: color.dim, marginTop: 3 },
  alertBad: { color: color.bad },
  calm: { fontFamily: font.regular, fontSize: 11.5, color: color.faint, marginTop: 3 },
  more: { fontFamily: font.medium, fontSize: 13, color: color.amber, marginTop: 12 },
  foot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.faint,
    marginTop: 12,
  },
})
