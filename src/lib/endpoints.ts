/**
 * De dónde cuelgan las rutas de datos.
 *
 * En el navegador la app se sirve desde el mismo origen que `/api/*`, `/dem/*`
 * y `/layers/*`, así que la base es la cadena vacía y todo sigue siendo
 * relativo, exactamente como antes.
 *
 * En una aplicación empaquetada no hay origen: el binario del escritorio de UE5
 * no se sirve desde ninguna parte y los datos siguen viviendo en el despliegue
 * de producción. Quien esté en ese caso llama una vez a `setDataOrigin()` al
 * arrancar y el resto del núcleo —`api.ts`, el DEM, las capas, la red de
 * guaguas— no se entera de nada. Lo estrenó la app de iOS y Android, que ya vive
 * en su propio repositorio; el escritorio hereda el mismo mecanismo.
 *
 * Es deliberado que esto sea un módulo y no un parámetro más en cada función:
 * la alternativa era pasar un origen por trece sitios distintos, y el origen no
 * cambia nunca a mitad de sesión.
 */

let origin = ''

/**
 * Fija el origen de los datos. Se llama una sola vez, antes de la primera
 * petición. Sin barra final: las rutas ya la traen.
 */
export function setDataOrigin(value: string): void {
  origin = value.replace(/\/+$/, '')
}

export function dataOrigin(): string {
  return origin
}

/** Convierte una ruta absoluta del sitio en una URL pedible desde donde sea. */
export function dataUrl(path: string): string {
  return origin + path
}
