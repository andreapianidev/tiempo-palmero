/**
 * La hoja del detalle en el móvil: siempre en pantalla, y se sube arrastrando.
 *
 * Arranca asomando (`peek`) y NUNCA se cierra. Esa es toda la idea: al abrir la
 * app se ve la isla entera y una sola fila abajo con la cifra del sitio donde
 * estás; quien quiera el resto tira de ella hacia arriba, y al soltarla el mapa
 * vuelve a estar entero. Antes esto era un panel que ocupaba dos tercios de la
 * pantalla en cuanto se tocaba algo, y tapaba justo el punto que se acababa de
 * tocar, que es la mitad de la información.
 *
 * El reparto entre ARRASTRAR y DESPLAZAR es la única parte delicada, y son dos
 * gestos separados a propósito:
 *
 * - En la cabecera se arrastra siempre. Es el asa; no hay nada que desplazar.
 * - En el cuerpo se arrastra SOLO si la lista está arriba del todo, y no hacia
 *   arriba cuando la hoja ya está abierta del todo. Con una sola regla para las
 *   dos zonas, tirar de la cabecera con la lista a media altura no hacía nada.
 *
 * Mientras el dedo está en la pantalla la hoja se mueve escribiendo el
 * `transform` en el nodo, no con estado de React: la ficha que lleva dentro
 * tiene tablas y una gráfica, y volver a dibujarla sesenta veces por segundo se
 * nota en cualquier teléfono que no sea el último.
 *
 * Las alturas viven en `snaps.ts`, que es donde se pueden leer y probar sin
 * montar un navegador.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { SheetHead, type HeadContent } from './SheetHead'
import {
  clampDrag,
  nextSnap,
  settleSnap,
  snapOffsets,
  SNAP,
  type SnapIndex,
  type SnapOffsets,
} from './snaps'
import { t } from '../../i18n'

interface Props {
  head: HeadContent
  /** Cambia al elegir otra cosa: devuelve el cuerpo a su origen. */
  contentKey: string
  /**
   * A qué escalón subir cuando cambia lo elegido, y solo si está más abajo:
   * quien haya subido la hoja del todo no quiere que un toque se la baje.
   */
  openTo?: SnapIndex
  /** Cuánto asoma la hoja en reposo. Los botones redondos se apoyan encima. */
  onPeekHeight?: (height: number) => void
  children: ReactNode
}

export function Sheet({ head, contentKey, openTo, onPeekHeight, children }: Props) {
  const sheetRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Mide `env(safe-area-inset-top)`, que en CSS se sabe y en JS no. */
  const insetRef = useRef<HTMLSpanElement>(null)

  const [snap, setSnap] = useState<SnapIndex>(SNAP.peek)
  // Empieza fuera de la pantalla y sube a su sitio en cuanto se mide: así no
  // se ve un salto desde media pantalla en el primer fotograma.
  const [offsets, setOffsets] = useState<SnapOffsets>([9999, 9999, 0])
  const [dragging, setDragging] = useState(false)

  /** Escribe la posición en el nodo. Es lo que se usa mientras se arrastra. */
  const applyY = useCallback((y: number) => {
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${y}px)`
  }, [])

  // Las medidas cambian con el teclado, al girar el teléfono y cuando la barra
  // del navegador se esconde. Un ResizeObserver sobre la propia hoja las coge
  // todas; `innerHeight` no coge la última.
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const handle = el.querySelector<HTMLElement>('.msheet-handle')
    const measure = () =>
      setOffsets(
        snapOffsets({
          height: el.offsetHeight,
          headHeight: handle?.offsetHeight ?? 96,
          topInset: insetRef.current?.offsetHeight ?? 12,
        }),
      )
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (handle) ro.observe(handle)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    applyY(offsets[snap])
    onPeekHeight?.(Math.max(0, (sheetRef.current?.offsetHeight ?? 0) - offsets[SNAP.peek]))
  }, [offsets, snap, applyY, onPeekHeight])

  // Elegir algo en el mapa sube la hoja, pero solo si estaba por debajo: subir
  // a la fuerza una hoja que ya está arriba es quitarle al lector el sitio por
  // el que iba.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    if (openTo === undefined) return
    setSnap((s) => (s < openTo ? openTo : s))
  }, [contentKey, openTo])

  // --- arrastre ------------------------------------------------------------

  const drag = useRef<{
    id: number
    y0: number
    t0: number
    base: number
    fromBody: boolean
  } | null>(null)
  /**
   * El último gesto sobre la cabecera movió la hoja.
   *
   * Hace falta porque soltar el dedo encima del botón dispara un `click`
   * aunque se haya arrastrado: sin esto, arrastrar la hoja hasta la mitad y
   * soltarla la subía otro escalón de propina.
   */
  const moved = useRef(false)

  const start = useCallback(
    (e: ReactPointerEvent, fromBody: boolean) => {
      // Dentro del cuerpo solo se arrastra desde arriba del todo: si no, lo que
      // el dedo quiere es leer.
      if (fromBody && (bodyRef.current?.scrollTop ?? 0) > 0) return
      drag.current = {
        id: e.pointerId,
        y0: e.clientY,
        t0: e.timeStamp,
        base: offsets[snap],
        fromBody,
      }
      setDragging(true)
    },
    [offsets, snap],
  )

  const move = useCallback(
    (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      const dy = e.clientY - d.y0
      // Abierta del todo y tirando hacia arriba desde el cuerpo: eso es
      // desplazar la ficha, no mover la hoja.
      if (d.fromBody && dy < 0 && snap === SNAP.full) {
        drag.current = null
        setDragging(false)
        applyY(offsets[snap])
        return
      }
      applyY(clampDrag(offsets, d.base + dy))
    },
    [offsets, snap, applyY],
  )

  const end = useCallback(
    (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      drag.current = null
      setDragging(false)
      const dy = e.clientY - d.y0
      moved.current = Math.abs(dy) > 6
      const next = settleSnap(offsets, snap, d.base + dy, dy / Math.max(1, e.timeStamp - d.t0))
      // Se escribe aquí además de en el efecto: si el escalón no cambia, React
      // no vuelve a tocar el `style` y la hoja se quedaría donde el dedo la
      // dejó.
      applyY(offsets[next])
      setSnap(next)
    },
    [offsets, snap, applyY],
  )

  // Los manejadores van en la ventana y no en la hoja: el dedo se sale de ella
  // constantemente al arrastrar, y sin `pointercancel` la hoja se quedaba
  // pegada al dedo después de soltar.
  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging, move, end])

  return (
    <section
      ref={sheetRef}
      className={`msheet${dragging ? ' msheet-dragging' : ''} msheet-snap-${snap}`}
      style={{ transform: `translateY(${offsets[snap]}px)` }}
      aria-label={t.point.title}
    >
      <span ref={insetRef} className="msheet-inset" aria-hidden />

      <SheetHead
        {...head}
        label={snap === SNAP.full ? t.mobile.collapse : t.mobile.expand}
        onCycle={() => {
          if (moved.current) {
            moved.current = false
            return
          }
          setSnap((s) => nextSnap(s))
        }}
        onPointerDown={(e) => start(e, false)}
      />

      <div ref={bodyRef} className="msheet-body" onPointerDown={(e) => start(e, true)}>
        {children}
      </div>
    </section>
  )
}
