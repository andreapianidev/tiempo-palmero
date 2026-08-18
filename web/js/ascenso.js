/* ═══════════════════════════════════════════════════════════════════════════
   ASCENSO · dónde estás de la costa al Roque

   Este fichero escribe UNA variable, `--asc`, de 0 en el mar a 1 en la cumbre.
   De ella cuelgan el cielo, el mar de nubes, las estrellas, la barra de
   progreso y qué curva de nivel de la isla está encendida: todo eso es CSS y no
   vuelve a pasar por aquí.

   Además pone el número del altímetro y el paralaje, que son las dos cosas que
   el CSS no puede sacar solo de `--asc` —una es texto y la otra depende de
   dónde está cada elemento dentro de la ventana, no de la página—.

   Un solo oyente de `scroll` pasivo y un `requestAnimationFrame` por fotograma
   como mucho. Dentro del fotograma se mide primero y se escribe después: al
   revés, cada `getBoundingClientRect()` obligaría al navegador a rehacer la
   disposición que se acaba de invalidar.
   ═══════════════════════════════════════════════════════════════════════════ */

;(function () {
  'use strict'

  var raiz = document.documentElement
  var lecturas = document.querySelectorAll('[data-altimetro]')
  var paralajes = document.querySelectorAll('[data-par]')

  /** El Roque de los Muchachos. La página entera vale ese desnivel. */
  var CUMBRE_M = 2426

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var pedido = false
  var cotaEscrita = -1

  function fotograma() {
    pedido = false

    /* ── medir ── */
    var alto = raiz.scrollHeight - window.innerHeight
    var asc = alto > 0 ? window.scrollY / alto : 0
    if (asc < 0) asc = 0
    else if (asc > 1) asc = 1

    var vh = window.innerHeight
    var desplazos = null
    if (!quieto && paralajes.length) {
      desplazos = []
      for (var i = 0; i < paralajes.length; i++) {
        var r = paralajes[i].getBoundingClientRect()
        // Fuera de la ventana no se toca: ni se calcula ni se escribe.
        if (r.bottom < -240 || r.top > vh + 240) {
          desplazos.push(null)
          continue
        }
        var centro = (r.top + r.height / 2) / vh
        desplazos.push((centro - 0.5) * 2)
      }
    }

    /* ── escribir ── */
    raiz.style.setProperty('--asc', asc.toFixed(4))

    var cota = Math.round(asc * CUMBRE_M)
    if (cota !== cotaEscrita) {
      cotaEscrita = cota
      for (var j = 0; j < lecturas.length; j++) lecturas[j].textContent = String(cota)
    }

    if (desplazos) {
      for (var k = 0; k < desplazos.length; k++) {
        if (desplazos[k] !== null) paralajes[k].style.setProperty('--p', desplazos[k].toFixed(3))
      }
    }
  }

  function pedir() {
    if (pedido) return
    pedido = true
    requestAnimationFrame(fotograma)
  }

  window.addEventListener('scroll', pedir, { passive: true })
  window.addEventListener('resize', pedir, { passive: true })
  window.addEventListener('orientationchange', pedir)
  fotograma()
})()
