/* ═══════════════════════════════════════════════════════════════════════════
   LA ETIQUETA DEL RÉGIMEN

   Un relieve que cambia de color sin decir por qué es un adorno. Diciéndolo, es
   una lectura: «Alisio · 6 nov 2025 · 8,0 °C/km · R² 0,89». Esta es la pieza que
   convierte la isla de la portada en el argumento de la página, y la que impide
   que cuatro días medidos pasen por el tiempo de ahora.

   ── POR QUÉ ESTÁ `aria-hidden` ─────────────────────────────────────────────
   Porque acompaña a un lienzo que también lo está, y porque cambia de texto
   mientras se rueda la página: leído en voz alta sería una letanía encima del
   contenido. Lo que dice en cifras está en la columna de texto, que es donde la
   página cuenta las cosas de verdad. Mismo criterio que el raíl.

   ── EL CAMBIO ES DE GOLPE, NO INTERPOLADO ──────────────────────────────────
   Los números sí se mezclan en el sombreador —el relieve se convierte poco a
   poco en el del siguiente régimen—, pero el texto no puede: «8,0 °C/km» a
   medio camino de «−2,4 °C/km» daría una cifra que nadie ha medido nunca. Así
   que la etiqueta espera a que el régimen nuevo sea el que manda y entonces
   cruza, con un desvanecido corto que es lo único que se interpola aquí.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {HTMLElement} nodo El contenedor, con `[data-regimen]`.
 * @returns {{ pon: (r: { clave: string, nombre: string, fecha: string, nota: string }) => void }}
 */
export function crearEtiqueta(nodo) {
  var elNombre = document.createElement('b')
  var elFecha = document.createElement('span')
  var elNota = document.createElement('small')
  elFecha.className = 'reg-fecha'
  elNota.className = 'reg-nota'
  nodo.append(elNombre, elFecha, elNota)

  var puesto = ''

  return {
    pon: function (r) {
      if (r.clave === puesto) return
      puesto = r.clave
      elNombre.textContent = r.nombre
      elFecha.textContent = r.fecha
      elNota.textContent = r.nota
      // Se reinicia la animación quitando y devolviendo la clase en el mismo
      // fotograma: sin el `offsetWidth` de por medio el navegador agrupa las dos
      // escrituras y no hay transición ninguna.
      nodo.classList.remove('viva')
      void nodo.offsetWidth
      nodo.classList.add('viva')
      nodo.dataset.regimen = r.clave
    },
  }
}
