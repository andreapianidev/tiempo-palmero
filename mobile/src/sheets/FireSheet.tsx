/**
 * Ficha de una cámara de incendios.
 *
 * Dos avisos que no se quitan nunca: esta red no publica ninguna marca de
 * tiempo —la antigüedad que se enseña es la de NUESTRA consulta, no la del
 * dato— y solo hay cuatro cámaras en toda la isla, así que «sin alerta» no
 * prueba que no haya fuego. Una app del tiempo que enseñe un triángulo apagado
 * sin decir eso está afirmando algo que no sabe.
 */

import { StyleSheet, Text, View } from 'react-native'
import type { FireCamera } from '@core/hooks/useIslandData'
import { humanAge, n, t } from '@core/i18n'
import { color, font } from '../theme'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'
import { Note } from './Note'

interface Props {
  camera: FireCamera
  polledAt: number | null
  now: number
}

export function FireSheet({ camera, polledAt, now }: Props) {
  const rows: { label: string; value: string }[] = []
  if (camera.maxTemperature !== null) {
    rows.push({ label: 'Temperatura máxima', value: `${n(camera.maxTemperature, 1)} ${t.units.celsius}` })
  }
  if (camera.minTemperature !== null) {
    rows.push({ label: 'Temperatura mínima', value: `${n(camera.minTemperature, 1)} ${t.units.celsius}` })
  }
  if (polledAt) rows.push({ label: t.fire.lastPolled, value: humanAge(now - polledAt) })

  return (
    <>
      <Text style={[styles.state, camera.hasAlert ? styles.alert : styles.calm]}>
        {camera.hasAlert ? t.fire.alert : t.fire.noAlert}
      </Text>

      <Section title={t.fire.title}>
        <View style={{ marginTop: 8 }}>
          {rows.map((row, i) => (
            <Row key={row.label} label={row.label} value={row.value} last={i === rows.length - 1} />
          ))}
        </View>
        <Note>{t.fire.noTimestamp}</Note>
        <Note warn>{t.fire.onlyFour}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  state: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, marginTop: 8 },
  alert: { color: color.bad },
  calm: { color: color.dim },
})
