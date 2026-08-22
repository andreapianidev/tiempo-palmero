/**
 * Pedirle al navegador que NO tire la caché cuando le falte sitio.
 *
 * Sin esto, todo lo que guarda esta aplicación —el IndexedDB de las teselas y
 * la caché del service worker— vive en almacenamiento «best-effort»: el
 * navegador lo puede vaciar entero cuando el disco se llene, sin avisar y sin
 * que haga falta ninguna acción del usuario. Con almacenamiento persistente
 * concedido, deja de hacerlo; para borrarlo hay que ir a los datos del sitio.
 *
 * QUIÉN LO CONCEDE Y CÓMO, que es la parte que decide si esto sirve de algo:
 *
 *  - **Chrome y derivados** lo conceden sin preguntar si el sitio está
 *    instalado, tiene permiso de notificaciones o acumula suficiente
 *    interacción; si no, lo deniegan también sin preguntar. Nunca sale un
 *    diálogo, así que llamarlo no interrumpe a nadie.
 *  - **Firefox** sí puede preguntar. Por eso NO se llama al abrir la página
 *    —ver dónde se llama en `hooks/useTileCache.ts`—: el momento es cuando
 *    alguien ya está usando el mapa, no antes de que aparezca.
 *  - **Safari**, en iOS y en el escritorio, resuelve `true` de fábrica para
 *    orígenes con interacción; su cuota y su desalojo van por otro camino
 *    (siete días sin visitar el sitio y lo tira igual, y eso no lo evita esta
 *    llamada ni ninguna otra).
 *
 * Un `false` no es un error ni hay que reaccionar a él: la caché sigue
 * funcionando exactamente igual, solo que expuesta al desalojo. Por eso esto no
 * se enseña en ninguna pantalla.
 *
 * La aritmética que sí depende de la respuesta está en `budget.ts`: la mitad de
 * la cuota declarada se puede pedir porque antes se ha pedido esto.
 */

/** Lo que hace falta de `navigator.storage`, para poder probarlo sin navegador. */
export interface StorageLike {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

/**
 * Pregunta primero y pide después.
 *
 * El `persisted()` no es un adorno: en un navegador que ya lo concedió, volver
 * a llamar a `persist()` es pedir un permiso que ya se tiene, y en Firefox eso
 * es un diálogo de más. Y todo va envuelto porque un `SecurityError` en un
 * contexto sin permisos —un iframe de otro origen— no puede tumbar el arranque
 * del mapa.
 */
export async function askPersistence(storage: StorageLike | undefined): Promise<boolean> {
  if (!storage?.persist) return false
  try {
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/** Ya se ha preguntado en esta página. Se pregunta una vez y no más. */
let asked = false

export function requestPersistence(): Promise<boolean> {
  if (asked) return Promise.resolve(false)
  asked = true
  return askPersistence(
    (globalThis as { navigator?: { storage?: StorageLike } }).navigator?.storage,
  )
}
