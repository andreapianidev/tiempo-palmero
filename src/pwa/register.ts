/**
 * Enciende el service worker, que es lo que hace instalable la aplicación.
 *
 * SOLO EN PRODUCCIÓN, y no por prudencia genérica: en `npm run dev` no existe
 * `/sw.js` —lo compila `dev/swBuild.ts`, que solo corre al construir— y, sobre
 * todo, un service worker sirviendo ficheros de su caché por delante del
 * servidor de desarrollo convierte cada recarga en una partida a los dados
 * sobre qué versión del código se está mirando.
 *
 * NO ESPERA A `load`. Con `type="module"` el script de la aplicación ya se
 * ejecuta después de analizar el documento, y retrasar el registro a `load`
 * —receta de hace diez años, cuando el registro competía con la descarga de la
 * página— aquí solo retrasaría la primera instalación hasta después de bajar el
 * DEM entero.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
    // Que falle no puede tumbar la aplicación: sin service worker se pierde la
    // instalación y el modo sin cobertura, no el mapa.
    console.warn('El service worker no se ha podido registrar:', err)
  })
}
