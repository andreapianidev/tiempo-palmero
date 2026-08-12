/**
 * Armazón de la aplicación.
 *
 * Tres cosas y ninguna más: decir dónde están los datos, esperar a las fuentes
 * y montar la pantalla del mapa. Todo lo demás cuelga de ahí.
 *
 * Las fuentes se esperan a propósito. Barlow e IBM Plex Mono no son un adorno:
 * la ficha alinea columnas de cifras contando con una monoespaciada, y con la
 * de sistema esa tabla baila y se lee peor.
 */

import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import { useFonts } from 'expo-font'
import { setDataOrigin } from '@core/lib/endpoints'
import { DATA_ORIGIN } from './src/config'
import { color } from './src/theme'
import { MapScreen } from './src/screens/MapScreen'

// Antes de cualquier petición y una sola vez: el núcleo compartido construye
// todas sus URLs contra este origen.
setDataOrigin(DATA_ORIGIN)

export default function App() {
  // Cada peso por su ruta exacta, no desde el índice del paquete. Importar
  // `@expo-google-fonts/barlow` arrastra las 18 variantes de Barlow y las 14 de
  // IBM Plex Mono al binario: 4 MB de itálicas y `Black` que esta app no usa.
  const [ready] = useFonts({
    Barlow_400Regular: require('@expo-google-fonts/barlow/400Regular/Barlow_400Regular.ttf'),
    Barlow_500Medium: require('@expo-google-fonts/barlow/500Medium/Barlow_500Medium.ttf'),
    Barlow_600SemiBold: require('@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf'),
    Barlow_700Bold: require('@expo-google-fonts/barlow/700Bold/Barlow_700Bold.ttf'),
    IBMPlexMono_400Regular: require('@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'),
    IBMPlexMono_500Medium: require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf'),
    IBMPlexMono_600SemiBold: require('@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf'),
  })

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.ink }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {ready ? <MapScreen /> : <View style={{ flex: 1, backgroundColor: color.ink }} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
