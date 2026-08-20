/* ═══════════════════════════════════════════════════════════════════════════
   REVELAR · lo que pasa cuando algo entra en la ventana

   Tres cosas, todas colgadas del mismo IntersectionObserver:

     · los bloques suben y se enfocan          (clase `.vista`)
     · las cifras cuentan hasta su valor       (`data-cuenta`)
     · el raíl enciende el hito del tramo (`.hito`)

   CÓMO FALLA. El estado escondido de los revelados vive detrás de `html.mov`,
   que está puesta en el marcado. Si no hay JavaScript, el `<noscript>` de la
   página retira esa clase con una hoja de estilo y todo aparece quieto y
   entero. Si LO HAY pero este fichero revienta, el `catch` de abajo hace lo
   mismo: una página sin animación es un contratiempo, una página en blanco es
   un sitio roto.
   ═══════════════════════════════════════════════════════════════════════════ */

;(function () {
  'use strict'

  var raiz = document.documentElement

  try {
    if (!('IntersectionObserver' in window)) throw new Error('sin IntersectionObserver')

    var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* ── cifras que cuentan ──────────────────────────────────────────────── */

    /** «7,24» → 7.24. Los números de la página se escriben con coma. */
    function aNumero(texto) {
      return parseFloat(String(texto).replace(',', '.'))
    }

    /** …y se vuelven a escribir con coma para pintarlos. */
    function aTexto(valor, decimales) {
      return valor.toFixed(decimales).replace('.', ',')
    }

    function contar(el) {
      var destino = aNumero(el.dataset.cuenta)
      if (!isFinite(destino)) return
      var punto = el.dataset.cuenta.indexOf(',')
      var decimales = punto < 0 ? 0 : el.dataset.cuenta.length - punto - 1

      if (quieto) {
        el.textContent = aTexto(destino, decimales)
        return
      }

      var DURACION = 1150
      var desde = null
      function paso(ahora) {
        if (desde === null) desde = ahora
        var t = (ahora - desde) / DURACION
        if (t > 1) t = 1
        // Frenada larga: la cifra llega a su sitio y se queda, no rebota.
        var e = 1 - Math.pow(1 - t, 4)
        el.textContent = aTexto(destino * e, decimales)
        if (t < 1) requestAnimationFrame(paso)
      }
      requestAnimationFrame(paso)
    }

    /* ── el observador ───────────────────────────────────────────────────── */

    var mirados = document.querySelectorAll('.sube,.escalona,.modelo,.marco,.viento,.tira')

    var obs = new IntersectionObserver(
      function (entradas) {
        for (var i = 0; i < entradas.length; i++) {
          var e = entradas[i]
          if (!e.isIntersecting) continue
          e.target.classList.add('vista')

          // Las barritas de las filas del modelo: `data-barra` es un tanto por
          // ciento y se convierte en la escala horizontal de la barra.
          var barras = e.target.querySelectorAll('[data-barra]')
          for (var b = 0; b < barras.length; b++) {
            barras[b].style.setProperty('--v', aNumero(barras[b].dataset.barra) / 100)
          }

          var cifras = e.target.querySelectorAll('[data-cuenta]')
          for (var c = 0; c < cifras.length; c++) contar(cifras[c])

          // Una vez visto, ya no interesa: cada bloque entra una sola vez.
          obs.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )

    for (var m = 0; m < mirados.length; m++) obs.observe(mirados[m])

    /* ── el hito encendido del raíl ──────────────────────────────────────── */

    var hitos = document.querySelectorAll('.hito')
    if (hitos.length) {
      var porId = {}
      for (var h = 0; h < hitos.length; h++) porId[hitos[h].dataset.tramo] = hitos[h]

      var obsTramo = new IntersectionObserver(
        function (entradas) {
          for (var i = 0; i < entradas.length; i++) {
            var hito = porId[entradas[i].target.id]
            if (hito) hito.classList.toggle('on', entradas[i].isIntersecting)
          }
        },
        // Solo cuenta la banda central de la pantalla: lo que se está leyendo.
        { rootMargin: '-42% 0px -42% 0px' },
      )
      for (var id in porId) {
        var seccion = document.getElementById(id)
        if (seccion) obsTramo.observe(seccion)
      }
    }
  } catch (err) {
    raiz.classList.remove('mov')
  }
})()
