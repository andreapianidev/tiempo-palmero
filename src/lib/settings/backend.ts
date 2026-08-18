/**
 * Dónde se guardan los ajustes en el navegador: `localStorage`.
 *
 * Es la mitad web de un reparto: la lógica de qué se guarda vive entera en
 * `store.ts` y lo único que cambia de una plataforma a otra es quién sabe abrir
 * el cajón. Quien no tenga `localStorage` pone el suyo al lado sin tocar nada de
 * `store.ts`.
 *
 * Los dos `try` no son prudencia decorativa. `localStorage` **lanza al
 * tocarlo** en Safari con navegación privada y con cookies de terceros
 * bloqueadas, y al escribir cuando el origen ha llenado su cuota. Ninguna de
 * esas tres cosas es motivo para que la isla no aparezca: si el cajón no se
 * puede abrir, la aplicación arranca de fábrica y sigue funcionando.
 *
 * El `catch` cubre también el `ReferenceError` de un entorno sin DOM, que es
 * como corren las pruebas: ahí `localStorage` no existe y esto se comporta como
 * un cajón vacío, sin necesidad de simular un navegador entero.
 */

import type { SettingsBackend } from './store'

const KEY = 'tiempo-palmero:ajustes'

export const backend: SettingsBackend = {
  read() {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  write(text) {
    try {
      localStorage.setItem(KEY, text)
    } catch {
      // Cuota llena o almacenamiento bloqueado. Los ajustes de esta sesión
      // siguen en memoria; lo único que se pierde es que duren hasta la
      // siguiente, y eso no justifica interrumpir a quien está mirando el mapa.
    }
  },
}
