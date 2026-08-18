/* ═══════════════════════════════════════════════════════════════════════════
   VIENTO · el alisio sobre el héroe

   La capa de viento de la aplicación dibuja partículas que siguen el campo real
   sobre la isla. Esto no finge ser eso: es su gesto, no su dato. Sopla del
   nordeste al suroeste porque es lo que hace el alisio en Canarias trescientos
   días al año, y con eso basta para que la portada tenga aire.

   Lo que sí se cuida es el coste: la trama se apaga en cuanto el héroe sale de
   la ventana, no se dibuja con `prefers-reduced-motion`, y el rastro se borra
   con `destination-out` —bajarle el alfa a lo ya pintado— en vez de repintar un
   fondo opaco encima, que taparía el cielo que hay detrás.
   ═══════════════════════════════════════════════════════════════════════════ */

;(function () {
  'use strict'

  var lienzo = document.querySelector('[data-viento]')
  if (!lienzo) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  var ctx = lienzo.getContext('2d')
  if (!ctx) return

  var ancho = 0
  var alto = 0
  var dpr = 1
  var hebras = []
  var corriendo = false
  var mano = 0

  function medir() {
    var caja = lienzo.getBoundingClientRect()
    if (!caja.width || !caja.height) return false
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    ancho = Math.round(caja.width)
    alto = Math.round(caja.height)
    lienzo.width = Math.round(ancho * dpr)
    lienzo.height = Math.round(alto * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    var cuantas = Math.round((ancho * alto) / 15000)
    if (cuantas < 36) cuantas = 36
    else if (cuantas > 130) cuantas = 130

    hebras = []
    for (var i = 0; i < cuantas; i++) hebras.push(nueva(true))
    return true
  }

  /** Una hebra nace en cualquier sitio; las que renacen entran por el nordeste. */
  function nueva(dispersa) {
    return {
      x: dispersa ? Math.random() * ancho : ancho * (0.55 + Math.random() * 0.7),
      y: dispersa ? Math.random() * alto : -alto * 0.1 + Math.random() * alto * 0.55,
      vida: dispersa ? Math.random() * 260 : 0,
      max: 180 + Math.random() * 220,
      grosor: 0.5 + Math.random() * 0.9,
    }
  }

  /**
   * El campo. Nordeste-suroeste de base, y encima dos senos cruzados que le dan
   * la ondulación de una ladera. No es turbulencia de verdad, es lo bastante
   * irregular para que no se lean las líneas como una lluvia inclinada.
   */
  function soplo(x, y, t) {
    var a = Math.sin(y * 0.0055 + t * 0.00022) * 0.45
    var b = Math.cos(x * 0.0042 - t * 0.00017) * 0.35
    return { dx: -1.15 + b, dy: 0.62 + a }
  }

  function paso(ahora) {
    if (!corriendo) return
    mano = requestAnimationFrame(paso)

    // Borrar es bajarle el alfa a lo pintado, no tapar con un fondo.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,.055)'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.globalCompositeOperation = 'source-over'

    ctx.lineCap = 'round'
    for (var i = 0; i < hebras.length; i++) {
      var h = hebras[i]
      var v = soplo(h.x, h.y, ahora)
      var px = h.x
      var py = h.y
      h.x += v.dx * 1.5
      h.y += v.dy * 1.5
      h.vida++

      if (h.vida > h.max || h.x < -40 || h.y > alto + 40) {
        hebras[i] = nueva(false)
        continue
      }

      // Se enciende al nacer y se apaga al morir; nada aparece de golpe.
      var f = h.vida / h.max
      var alfa = Math.sin(Math.PI * f) * 0.34
      ctx.strokeStyle = 'rgba(226,180,92,' + alfa.toFixed(3) + ')'
      ctx.lineWidth = h.grosor
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(h.x, h.y)
      ctx.stroke()
    }
  }

  function arrancar() {
    if (corriendo) return
    if (!ancho && !medir()) return
    corriendo = true
    mano = requestAnimationFrame(paso)
  }

  function parar() {
    corriendo = false
    if (mano) cancelAnimationFrame(mano)
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      if (entradas[0].isIntersecting) arrancar()
      else parar()
    }).observe(lienzo)
  } else {
    arrancar()
  }

  var reloj = 0
  window.addEventListener(
    'resize',
    function () {
      clearTimeout(reloj)
      reloj = setTimeout(function () {
        var seguia = corriendo
        parar()
        ctx.clearRect(0, 0, ancho, alto)
        if (medir() && seguia) arrancar()
      }, 180)
    },
    { passive: true },
  )
})()
