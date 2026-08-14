/**
 * Ningún marcador puede declarar su propio `position`.
 *
 * QUÉ PASÓ. La capa de webcams salió con `position: relative` en el CSS de su
 * pin. MapLibre le añade a ese mismo elemento su clase `.maplibregl-marker`,
 * que trae `position:absolute; top:0; left:0`, y después escribe la posición en
 * pantalla como `transform: translate(...)`. Nuestras hojas se cargan después
 * que la suya y con la misma especificidad —una clase contra una clase—, así
 * que el `relative` ganaba y devolvía el botón al flujo normal del contenedor.
 *
 * El `translate` seguía aplicándose, pero sobre un origen que ya no era la
 * esquina del mapa sino el hueco del elemento en el flujo, distinto para cada
 * marcador. En vista plana apenas se apreciaba; al inclinar la cámara y
 * arrastrar, las webcams patinaban sobre el relieve en lugar de quedarse
 * clavadas en su punto. Los demás marcadores no lo hacían por una razón muy
 * poco tranquilizadora: ninguno declaraba `position`, y nadie lo había escrito.
 *
 * POR QUÉ ESTE TEST Y NO UNO DE NAVEGADOR. Reproducir el patinazo de verdad
 * pide un navegador con WebGL, terreno cargado y un arrastre — es lo que hace
 * `checks/occlusion-margin.ts`, que por eso necesita Playwright y se ejecuta a
 * mano. La CAUSA, en cambio, es una línea de CSS, y eso se lee sin abrir nada.
 * Se comprueba la causa, que es lo que se puede comprobar en cada `npm test`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const STYLES = join(__dirname, '../../styles')
const ROOT = join(__dirname, '../../styles.css')

/** Las clases que MapLibre monta como elemento de un `Marker`. */
const MARKER_SELECTOR = /^\.mk-[a-z0-9-]+$/

function sheets(): { name: string; css: string }[] {
  const partials = readdirSync(STYLES)
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ name: `styles/${f}`, css: readFileSync(join(STYLES, f), 'utf8') }))
  return [{ name: 'styles.css', css: readFileSync(ROOT, 'utf8') }, ...partials]
}

/**
 * Reglas cuyo selector es exactamente una clase `.mk-…`, con su bloque. Se
 * ignoran los selectores compuestos (`.mk-cam .mk-cam-lens`, `.mk-a.mk-b`):
 * el que le llega a MapLibre es el elemento raíz, y es el suyo el que no puede
 * llevar `position`. Un hijo puede y debe llevarlo.
 */
function rootMarkerRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  // Sin comentarios: uno que contenga la palabra `position` no es una regla.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of m[1].split(',').map((s) => s.trim())) {
      if (MARKER_SELECTOR.test(selector)) out.push({ selector, body: m[2] })
    }
  }
  return out
}

describe('CSS de los marcadores', () => {
  it('encuentra las reglas que tiene que vigilar', () => {
    // Si un cambio de rutas dejara esto en cero, el test pasaría sin mirar nada.
    const total = sheets().reduce((n, s) => n + rootMarkerRules(s.css).length, 0)
    expect(total).toBeGreaterThan(5)
  })

  it('no le quita a ningún pin el `position:absolute` de MapLibre', () => {
    const offenders: string[] = []
    for (const { name, css } of sheets()) {
      for (const { selector, body } of rootMarkerRules(css)) {
        const decl = /(^|;)\s*position\s*:\s*([a-z-]+)/i.exec(body)
        if (decl && decl[2].toLowerCase() !== 'absolute') {
          offenders.push(`${name} → ${selector} { position: ${decl[2]} }`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
