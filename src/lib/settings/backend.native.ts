/**
 * Dónde se guardan los ajustes en iOS y Android: un archivo en el directorio
 * de documentos.
 *
 * Un archivo y no `AsyncStorage`, que es lo habitual, por dos razones. La
 * primera es que `expo-file-system` **ya está en el proyecto** —lo usa el caché
 * de teselas del DEM— y `AsyncStorage` sería un módulo nativo más, con su
 * recompilación del binario; para guardar medio kilobyte de interruptores no
 * sale a cuenta. La segunda pesa más: `AsyncStorage` es asíncrono, así que la
 * pantalla tendría que montarse con los valores de fábrica y corregirse un
 * fotograma después. Eso se ve —la malla entraría en temperatura y saltaría a
 * lo que el usuario tenía elegido— y no hay forma de esconderlo sin retrasar el
 * arranque. `textSync()` se lee antes del primer render y no hay salto.
 *
 * El directorio de documentos y no el de caché a propósito: lo de `Paths.cache`
 * el sistema lo puede borrar cuando tenga apuro de espacio, y ahí están las
 * teselas del DEM justamente porque volver a bajarlas solo cuesta tiempo. Un
 * ajuste borrado no se puede volver a deducir de ningún sitio.
 */

import { File, Paths } from 'expo-file-system'
import type { SettingsBackend } from './store'

const NAME = 'ajustes.json'

export const backend: SettingsBackend = {
  read() {
    try {
      const file = new File(Paths.document, NAME)
      return file.exists ? file.textSync() : null
    } catch {
      // Archivo ilegible o corrupto: se arranca de fábrica y la primera
      // escritura lo deja sano otra vez.
      return null
    }
  },
  write(text) {
    try {
      const file = new File(Paths.document, NAME)
      // Mismo gesto que el caché del DEM: `create` con `overwrite` y luego
      // escribir, en vez de comprobar antes si existe.
      file.create({ overwrite: true })
      file.write(text)
    } catch {
      // Disco lleno o sin permiso. Los ajustes de esta sesión siguen en
      // memoria; solo se pierde que duren hasta la siguiente.
    }
  },
}
