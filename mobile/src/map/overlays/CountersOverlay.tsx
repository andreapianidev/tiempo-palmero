/**
 * Los aforos de tráfico y de senderos: la cifra del día sobre el mapa.
 *
 * Son diecisiete emplazamientos, así que caben como marcadores con el número
 * dentro —igual que las estaciones, y por el mismo motivo: una cifra sobre el
 * mapa se lee sin abrir nada—. La cifra es la del DÍA, del archivo diario que
 * incluye el día en curso, y no el pulso de cinco minutos que devuelve el
 * endpoint llamado «de hoy»: confundirlos es contar trece coches en la entrada
 * de Santa Cruz.
 *
 * Un aforo que hoy no ha publicado nada sale igual, en hueco. Tres de los
 * diecisiete han enmudecido, y esconderlos haría parecer que la isla se ha
 * quedado sin tráfico justo ahí.
 */

import { Marker } from '@maplibre/maplibre-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { compactCount, type CounterSite } from '@core/lib/counters/model'
import { t } from '@core/i18n'
import { color, font, pillShadow } from '../../theme'

/** Los mismos dos colores que la web: la vía en cálido, el sendero en verde. */
const KIND_COLOR: Record<CounterSite['kind'], string> = {
  road: '#c98f5a',
  trail: '#7fa86a',
}

interface Props {
  sites: CounterSite[]
  visible: boolean
  onSite: (site: CounterSite) => void
}

export function CountersOverlay({ sites, visible, onSite }: Props) {
  if (!visible) return null
  return (
    <>
      {sites.map((site) => {
        const silent = site.todayTotal === null
        return (
          <Marker key={`aforo-${site.id}`} lngLat={[site.lon, site.lat]}>
            <Pressable
              onPress={() => onSite(site)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${site.name}, ${t.counters.kinds[site.kind] ?? site.kind}`}
            >
              <View
                style={[
                  styles.pill,
                  pillShadow,
                  silent
                    ? styles.silent
                    : { backgroundColor: KIND_COLOR[site.kind], borderColor: 'rgba(0,0,0,0.45)' },
                ]}
              >
                <Text style={[styles.label, silent ? styles.silentLabel : styles.solidLabel]}>
                  {silent ? '—' : compactCount(site.todayTotal!)}
                </Text>
              </View>
            </Pressable>
          </Marker>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  silent: { backgroundColor: color.pillDim, borderColor: color.line },
  label: { fontFamily: font.monoSemibold, fontSize: 12, lineHeight: 15 },
  solidLabel: { color: color.onLight },
  silentLabel: { color: color.pillDimText },
})
