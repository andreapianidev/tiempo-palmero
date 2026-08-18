/* ═══════════════════════════════════════════════════════════════════════════
   LA ISLA EN TRES DIMENSIONES, Y EL TIEMPO QUE HACE EN ELLA

   La Palma levantada de verdad —malla de 209×333 cotas, 138.000 triángulos— con
   la cámara colgada del desplazamiento: se gira alrededor de la isla y se baja
   hacia la cumbre según se va leyendo.

   Y MIENTRAS GIRA, CAMBIA DE TIEMPO. Pasa por cuatro regímenes reales de La
   Palma —calima, alisio con mar de nubes, temporal del suroeste y noche
   despejada—, y no cambia solo la luz: cambia el RELIEVE, porque cada régimen
   trae su propio campo de temperatura medido y el color del terreno es ese campo.
   Con calima la isla se calienta al subir; de noche el frío se encharca a media
   ladera y la cumbre queda templada por encima. Las cifras y de dónde salen están
   en `isla3d/regimenes.js`; los sombreadores, en `isla3d/glsl.js`.

   Este fichero es solo el renderizador: el contexto, la malla, la cámara, el
   bucle y el freno.

   ── DE DÓNDE SALE LA MALLA ─────────────────────────────────────────────────
   De `web/img/relieve.png`, que no es una imagen sino una tabla de cotas: cada
   píxel lleva una altura en sus canales rojo y verde. La escribe
   `scripts/web-terreno.ts` desde `public/dem/`, el mismo modelo de elevación con
   el que la aplicación corrige la temperatura por altitud. Las tres constantes de
   la decodificación son un contrato con ese script.

   ── CÓMO FALLA ─────────────────────────────────────────────────────────────
   Si no hay WebGL, si la tarjeta no admite índices de 32 bits, si el relieve no
   carga o si el sistema pide no animar, esto no arranca y la página se queda con
   las curvas de nivel en SVG que ya trae — que es un plano de la misma isla
   sacado del mismo modelo. No hay pantalla en blanco por ningún camino.

   ── POR QUÉ ES UN MÓDULO Y LOS OTROS TRES SCRIPTS NO ───────────────────────
   Porque este creció hasta necesitar tres ficheros y la alternativa era un
   global compartido a mano. `script-src 'self'` de la CSP admite módulos sin
   tocar nada, y un navegador tan viejo que no los entienda tampoco tiene los
   índices de 32 bits que la malla necesita: se queda con el SVG, que es el mismo
   camino de respaldo que ya había.
   ═══════════════════════════════════════════════════════════════════════════ */

import { VS_TERRENO, fsTerreno, VS_PLANO, FS_MAR, FS_NUBES, VS_LLUVIA, FS_LLUVIA } from './isla3d/glsl.js'
import { regimenEn } from './isla3d/regimenes.js'
import { crearEtiqueta } from './isla3d/etiqueta.js'

/* ── el contrato con `scripts/web-terreno.ts` ───────────────────────────── */
var LADO_M = 140 // lado de cada muestra sobre el terreno
var OFFSET_M = 500 // cota_m = (R·256 + G) / PASOS − OFFSET
var PASOS_POR_METRO = 10

/**
 * Exageración vertical. La Palma sube 2,4 km en 29 de ancho: a escala 1:1 y
 * vista desde una órbita parece una tortita, y lo que hace reconocible a esta
 * isla es justo lo contrario. 1,9 es lo que hace falta para que la Caldera se lea
 * como un circo y la Cumbre Vieja como una cresta, sin que el Roque acabe
 * pareciendo un Himalaya.
 */
var EXAGERACION = 1.9

var lienzo = document.querySelector('[data-isla3d]')
if (lienzo && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) arrancar(lienzo)

function arrancar(lienzo) {
  /* ── álgebra ────────────────────────────────────────────────────────────── */

  function multiplicar(a, b) {
    var o = new Float32Array(16)
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        o[i * 4 + j] =
          a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3]
      }
    }
    return o
  }

  /**
   * Perspectiva con desplazamiento de eje. `sesgo` mueve la imagen en pantalla
   * SIN girar la cámara —lo que en un objetivo de arquitectura es el
   * descentramiento—, y es lo que deja la isla a la derecha y la columna de texto
   * despejada a la izquierda sin torcer el punto de vista.
   */
  function perspectiva(fovY, aspecto, cerca, lejos, sesgo) {
    var f = 1 / Math.tan(fovY / 2)
    var m = new Float32Array(16)
    m[0] = f / aspecto
    m[5] = f
    m[8] = -sesgo
    m[10] = (lejos + cerca) / (cerca - lejos)
    m[11] = -1
    m[14] = (2 * lejos * cerca) / (cerca - lejos)
    return m
  }

  function mirarDesde(ojo, objetivo) {
    var zx = ojo[0] - objetivo[0]
    var zy = ojo[1] - objetivo[1]
    var zz = ojo[2] - objetivo[2]
    var n = Math.hypot(zx, zy, zz) || 1
    zx /= n; zy /= n; zz /= n
    // x = arriba × z, con arriba = (0,1,0). Desarrollado a mano: no compensa
    // montar un vec3 para tres productos de los que dos son cero.
    var xx = zz
    var xy = 0
    var xz = -zx
    n = Math.hypot(xx, xy, xz) || 1
    xx /= n; xy /= n; xz /= n
    var yx = zy * xz - zz * xy
    var yy = zz * xx - zx * xz
    var yz = zx * xy - zy * xx
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * ojo[0] + xy * ojo[1] + xz * ojo[2]),
      -(yx * ojo[0] + yy * ojo[1] + yz * ojo[2]),
      -(zx * ojo[0] + zy * ojo[1] + zz * ojo[2]),
      1,
    ])
  }

  /* ── contexto ───────────────────────────────────────────────────────────── */

  var opciones = {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  }
  var gl = lienzo.getContext('webgl2', opciones)
  if (!gl) {
    gl = lienzo.getContext('webgl', opciones) || lienzo.getContext('experimental-webgl', opciones)
    // La malla pasa de 65.535 vértices: sin índices de 32 bits no hay isla.
    if (!gl || !gl.getExtension('OES_element_index_uint')) return
  }

  function compilar(tipo, fuente) {
    var s = gl.createShader(tipo)
    gl.shaderSource(s, fuente)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }

  /**
   * Compila, enlaza y BUSCA LAS POSICIONES DE LOS UNIFORMES UNA SOLA VEZ.
   *
   * La versión anterior llamaba a `getUniformLocation` dentro del bucle, y con
   * los uniformes de régimen serían más de treinta consultas por fotograma —dos
   * mil por segundo— para preguntar algo que no cambia desde que se enlaza el
   * programa. Se resuelven aquí y el bucle solo escribe.
   */
  function programa(vs, fs, uniformes, atributos) {
    var p = gl.createProgram()
    gl.attachShader(p, compilar(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    var u = {}
    for (var i = 0; i < uniformes.length; i++) u[uniformes[i]] = gl.getUniformLocation(p, uniformes[i])
    var a = {}
    for (var j = 0; j < atributos.length; j++) a[atributos[j]] = gl.getAttribLocation(p, atributos[j])
    return { id: p, u: u, a: a }
  }

  /* ── malla ──────────────────────────────────────────────────────────────── */

  var progTerreno = null
  var progMar = null
  var progNubes = null
  var progLluvia = null
  var bufPos = null
  var bufNor = null
  var bufIdx = null
  var bufPlano = null
  var nIndices = 0
  var listo = false

  function construir(imagen) {
    var W = imagen.width
    var H = imagen.height
    var c = document.createElement('canvas')
    c.width = W
    c.height = H
    var g2 = c.getContext('2d', { willReadFrequently: true })
    g2.drawImage(imagen, 0, 0)
    var px = g2.getImageData(0, 0, W, H).data

    var cotas = new Float32Array(W * H)
    for (var k = 0; k < W * H; k++) {
      cotas[k] = (px[k * 4] * 256 + px[k * 4 + 1]) / PASOS_POR_METRO - OFFSET_M
    }

    var lado = LADO_M / 1000 // km
    var pos = new Float32Array(W * H * 3)
    var nor = new Float32Array(W * H * 3)
    for (var j = 0; j < H; j++) {
      for (var i = 0; i < W; i++) {
        var p = (j * W + i) * 3
        pos[p] = (i - (W - 1) / 2) * lado
        pos[p + 1] = (cotas[j * W + i] / 1000) * EXAGERACION
        pos[p + 2] = (j - (H - 1) / 2) * lado

        // Normal por diferencias centrales. Sin esto no hay relieve: la malla se
        // ve como una mancha de color plana.
        var iz = cotas[j * W + Math.max(0, i - 1)]
        var de = cotas[j * W + Math.min(W - 1, i + 1)]
        var ar = cotas[Math.max(0, j - 1) * W + i]
        var ab = cotas[Math.min(H - 1, j + 1) * W + i]
        var dx = ((de - iz) / 1000) * EXAGERACION
        var dz = ((ab - ar) / 1000) * EXAGERACION
        var ex = 2 * lado
        var nx = -dx * ex
        var ny = ex * ex
        var nz = -dz * ex
        var n = Math.hypot(nx, ny, nz) || 1
        nor[p] = nx / n
        nor[p + 1] = ny / n
        nor[p + 2] = nz / n
      }
    }

    var idx = new Uint32Array((W - 1) * (H - 1) * 6)
    var t = 0
    for (var jj = 0; jj < H - 1; jj++) {
      for (var ii = 0; ii < W - 1; ii++) {
        var a = jj * W + ii
        var b = a + 1
        var c2 = a + W
        var d = c2 + 1
        idx[t++] = a; idx[t++] = c2; idx[t++] = b
        idx[t++] = b; idx[t++] = c2; idx[t++] = d
      }
    }
    nIndices = idx.length

    bufPos = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW)
    bufNor = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
    gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW)
    bufIdx = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)

    // Un cuadrado que sirve de mar, de mar de nubes y de lienzo de la lluvia. Los
    // dos primeros lo escalan por uniforme; la lluvia lo usa tal cual, que en
    // coordenadas de pantalla ya es la pantalla entera.
    bufPlano = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    )

    progTerreno = programa(
      VS_TERRENO,
      fsTerreno(EXAGERACION),
      ['uMVP', 'uSol', 'uOjo', 'uCampo', 'uCampoArriba', 'uLuz', 'uLuzFuerza', 'uAmbiente',
       'uExtincion', 'uNiebla', 'uEspesor', 'uMojado', 'uLuces', 'uNubeY', 'uNubeSombra'],
      ['aPos', 'aNor'],
    )
    progMar = programa(
      VS_PLANO,
      FS_MAR,
      ['uMVP', 'uY', 'uEsc', 'uOjo', 'uSol', 'uNiebla', 'uMar', 'uLuz', 'uLuzFuerza'],
      ['aXZ'],
    )
    progNubes = programa(
      VS_PLANO,
      FS_NUBES,
      ['uMVP', 'uY', 'uEsc', 'uOjo', 'uDensidad', 'uTiempo', 'uNiebla', 'uColor', 'uFlujo'],
      ['aXZ'],
    )
    progLluvia = programa(
      VS_LLUVIA,
      FS_LLUVIA,
      ['uTiempo', 'uDensidad', 'uAspecto', 'uInclina', 'uColor'],
      ['aXZ'],
    )

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    listo = true
  }

  /* ── cámara y luz ───────────────────────────────────────────────────────── */

  function mezcla(a, b, t) { return a + (b - a) * t }
  function suave(t) { return t * t * (3 - 2 * t) }

  /**
   * El recorrido. De una vista alta y lejana del norte a un vuelo bajo sobre la
   * Cumbre Vieja, girando 110° por el camino. Todo cuelga de `--asc`, igual que
   * el resto de la página.
   *
   * LA LUZ ES UN ARCO DE DÍA COMPLETO, y acaba por debajo del horizonte: la
   * elevación es `0,62 · sen(π · (0,15 + asc·0,95))`, que sale a 16° al empezar,
   * llega a 35° a media página y cruza el horizonte sobre `--asc` 0,84. No es un
   * apaño para que la noche salga oscura: es lo que deja que el último tramo
   * tenga luna en vez de un sol imposible, justo donde el fondo de CSS enciende
   * las estrellas del Roque (`.c-estrellas`, de 0,60 a 0,89).
   *
   * La luna no es el sol apagado: está en otro sitio. `lunar` mezcla las dos
   * direcciones, así que en el cruce se ve el sol ponerse por un lado mientras la
   * luna levanta por el otro.
   */
  function camara(asc, lunar) {
    var s = suave(asc)
    var radio = mezcla(98, 36, s)
    var azimut = mezcla(-0.62, 1.28, s)
    var altura = mezcla(0.8, 0.15, s * s) // radianes sobre el horizonte
    var objetivoY = mezcla(0.25, 1.4, s)

    var ojo = [
      Math.cos(altura) * Math.sin(azimut) * radio,
      Math.sin(altura) * radio + objetivoY,
      Math.cos(altura) * Math.cos(azimut) * radio,
    ]

    var solAz = mezcla(1.9, -1.5, asc)
    var solAl = 0.62 * Math.sin(Math.PI * (0.15 + asc * 0.95))
    var sol = [
      Math.cos(solAl) * Math.sin(solAz),
      Math.sin(solAl),
      Math.cos(solAl) * Math.cos(solAz),
    ]

    if (lunar > 0.001) {
      // La luna, alta y por el nordeste: enfrente del sol poniente y del lado por
      // el que la cámara ya no mira, para que la cumbre se recorte contra ella.
      var luna = [
        Math.cos(0.62) * Math.sin(2.3),
        Math.sin(0.62),
        Math.cos(0.62) * Math.cos(2.3),
      ]
      sol[0] = mezcla(sol[0], luna[0], lunar)
      sol[1] = mezcla(sol[1], luna[1], lunar)
      sol[2] = mezcla(sol[2], luna[2], lunar)
      var m = Math.hypot(sol[0], sol[1], sol[2]) || 1
      sol[0] /= m; sol[1] /= m; sol[2] /= m
    }

    return { ojo: ojo, objetivo: [0, objetivoY, 0], sol: sol, radio: radio }
  }

  /* ── bucle ──────────────────────────────────────────────────────────────── */

  var ancho = 0
  var alto = 0
  var visible = false
  var mano = 0

  var nodoEtiqueta = document.querySelector('[data-regimen]')
  var etiqueta = nodoEtiqueta ? crearEtiqueta(nodoEtiqueta) : null

  /** El ancho de la banda de la derecha, o 0 si esta pantalla no la tiene. */
  function anchoBanda() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--banda')
    return parseFloat(v) || 0
  }

  /**
   * EL FRENO. Este relieve son 138.000 triángulos, y en una tarjeta de verdad no
   * cuesta nada; en un rasterizador por software —una máquina sin aceleración,
   * una máquina virtual, un navegador con la GPU en lista negra— medido aquí
   * mismo se queda en 15 fps, y una página que va a tirones es peor que una
   * página sin isla.
   *
   * QUÉ SE MIDE, Y POR QUÉ ESTOS DOS NÚMEROS. Se mide el hueco entre fotogramas,
   * que es lo único que se puede medir de verdad: cronometrar el tiempo dentro
   * del dibujado no sirve en este navegador —las órdenes de WebGL se encolan
   * hacia otro proceso y `gl.finish()` vuelve enseguida—, y comprobado aquí mismo
   * daba 0,1 ms mientras la página iba a 9 fps.
   *
   * El problema del hueco es que va atado al refresco de la pantalla: en un
   * monitor a 30 Hz son 33 ms aunque la tarjeta esté sobrada, y no hay manera de
   * separar una cosa de la otra sin dejar de dibujar unos fotogramas, que se
   * vería como un parpadeo. Así que los cortes se ponen POR ENCIMA de cualquier
   * refresco plausible: 38 ms está por encima de los 33 de una pantalla a 30 Hz,
   * y 55 ms por encima incluso de una a 24. Lo que caiga ahí ya no es el monitor.
   * Con rasterizado por software, medido aquí, el hueco se va a 110 ms.
   */
  var LIMITE_BAJAR_MS = 38
  var LIMITE_RENDIRSE_MS = 55
  var techoDpr = 1.75
  var tiempos = []
  var ultimoMs = 0
  var revisiones = 0

  function mediana(v) {
    var o = v.slice().sort(function (a, b) { return a - b })
    return o[o.length >> 1]
  }

  function vigilar(ms) {
    if (ultimoMs) tiempos.push(ms - ultimoMs)
    ultimoMs = ms
    if (tiempos.length < 40) return
    var m = mediana(tiempos)
    tiempos.length = 0
    revisiones++
    if (revisiones === 1 && m > LIMITE_BAJAR_MS && techoDpr > 1) {
      techoDpr = 1
      ancho = 0 // fuerza el redimensionado en el siguiente `medir()`
      return
    }
    if (revisiones >= 2 && m > LIMITE_RENDIRSE_MS) rendirse()
  }

  function rendirse() {
    visible = false
    if (mano) cancelAnimationFrame(mano)
    lienzo.classList.remove('viva')
    document.documentElement.classList.remove('isla3d-ok')
  }

  function medir() {
    var dpr = Math.min(window.devicePixelRatio || 1, techoDpr)
    var w = Math.round(lienzo.clientWidth * dpr)
    var h = Math.round(lienzo.clientHeight * dpr)
    if (w === ancho && h === alto) return
    ancho = w
    alto = h
    lienzo.width = w
    lienzo.height = h
  }

  function pintar(ms) {
    mano = requestAnimationFrame(pintar)
    if (!listo || !visible) return
    vigilar(ms)
    if (!visible) return
    medir()
    if (!ancho || !alto) return

    var asc = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--asc')) || 0
    var reg = regimenEn(asc)
    if (etiqueta) etiqueta.pon(reg)

    var cam = camara(asc, reg.lunar)
    var aspecto = ancho / alto
    // El lienzo va anclado al canto derecho y es más ancho que la banda: el
    // descentramiento empuja la isla hacia esa banda, que es la parte del lienzo
    // que el velo deja ver. Por debajo de 1180 px no hay banda y la isla se
    // centra, de fondo.
    var sesgo = anchoBanda() > 0 ? 0.36 : 0
    var proj = perspectiva((34 * Math.PI) / 180, aspecto, 0.35, 400, sesgo)
    var mvp = multiplicar(proj, mirarDesde(cam.ojo, cam.objetivo))

    // La distancia a la que el aire se come la isla, y cuánto la tiñe antes de
    // comérsela. Los dos son del régimen y son independientes a propósito: ver el
    // comentario de `alcance` en `regimenes.js`, que es donde está la cuenta de
    // por qué deducir uno del otro dejaba la calima sin isla.
    var niebla = cam.radio * 1.15 * reg.alcance
    var nubeY = reg.nubeKm * EXAGERACION
    var densidad = densidadNube(asc, reg)

    gl.viewport(0, 0, ancho, alto)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    /* ── el mar, primero y con escritura de profundidad ── */
    gl.useProgram(progMar.id)
    gl.depthMask(true)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
    gl.enableVertexAttribArray(progMar.a.aXZ)
    gl.vertexAttribPointer(progMar.a.aXZ, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix4fv(progMar.u.uMVP, false, mvp)
    // EL MAR VA 6 m POR ENCIMA DE LA COTA CERO, no en cero.
    //
    // `web-terreno.ts` recorta el fondo marino a cero, así que toda la malla
    // fuera de la isla es una meseta plana a la misma altura exacta que este
    // plano. Con los dos en y = 0, la profundidad no puede decidir cuál está
    // delante y sale la criba de moiré clásica —y encima con el color que la
    // rampa da a 24 °C, que es un tostado de playa cubriendo medio océano—. Seis
    // metros bastan para que el agua gane siempre; lo único que inunda es la
    // franja de costa por debajo de esa cota, que a 140 m de muestreo no llega a
    // un píxel.
    gl.uniform1f(progMar.u.uY, 0.006 * EXAGERACION)
    gl.uniform1f(progMar.u.uEsc, 110)
    gl.uniform3fv(progMar.u.uOjo, cam.ojo)
    gl.uniform3fv(progMar.u.uSol, cam.sol)
    gl.uniform1f(progMar.u.uNiebla, niebla)
    gl.uniform3fv(progMar.u.uMar, reg.mar)
    gl.uniform3fv(progMar.u.uLuz, reg.luz)
    gl.uniform1f(progMar.u.uLuzFuerza, reg.luzFuerza)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    /* ── el relieve, pintado con el campo de temperatura del régimen ── */
    gl.useProgram(progTerreno.id)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
    gl.enableVertexAttribArray(progTerreno.a.aPos)
    gl.vertexAttribPointer(progTerreno.a.aPos, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
    gl.enableVertexAttribArray(progTerreno.a.aNor)
    gl.vertexAttribPointer(progTerreno.a.aNor, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
    gl.uniformMatrix4fv(progTerreno.u.uMVP, false, mvp)
    gl.uniform3fv(progTerreno.u.uSol, cam.sol)
    gl.uniform3fv(progTerreno.u.uOjo, cam.ojo)
    gl.uniform4f(progTerreno.u.uCampo, reg.tCosta, reg.gradAbajo, reg.corteKm, reg.salto)
    gl.uniform1f(progTerreno.u.uCampoArriba, reg.gradArriba)
    gl.uniform3fv(progTerreno.u.uLuz, reg.luz)
    gl.uniform1f(progTerreno.u.uLuzFuerza, reg.luzFuerza)
    gl.uniform3fv(progTerreno.u.uAmbiente, reg.ambiente)
    gl.uniform3fv(progTerreno.u.uExtincion, reg.extincion)
    gl.uniform1f(progTerreno.u.uNiebla, niebla)
    gl.uniform1f(progTerreno.u.uEspesor, reg.espesor)
    gl.uniform1f(progTerreno.u.uMojado, reg.mojado)
    gl.uniform1f(progTerreno.u.uLuces, reg.luces)
    gl.uniform1f(progTerreno.u.uNubeY, nubeY)
    gl.uniform1f(progTerreno.u.uNubeSombra, reg.nubeSombra * densidad)
    gl.drawElements(gl.TRIANGLES, nIndices, gl.UNSIGNED_INT, 0)

    /* ── la tapa de nubes, sin escribir profundidad para que no se recorte
          contra sí misma cuando la cámara la atraviesa ── */
    if (densidad > 0.01) {
      gl.useProgram(progNubes.id)
      gl.depthMask(false)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
      gl.enableVertexAttribArray(progNubes.a.aXZ)
      gl.vertexAttribPointer(progNubes.a.aXZ, 2, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix4fv(progNubes.u.uMVP, false, mvp)
      gl.uniform1f(progNubes.u.uY, nubeY)
      // MÁS PEQUEÑA QUE EL MAR, y es lo que la hace un mar de nubes en vez de un
      // telón. Con 110 —la escala del océano— el plano llegaba de canto a canto
      // de la banda y no se veía ni su borde ni su textura: una pared clara con
      // la isla pegada delante. A 58 el borde cae dentro del encuadre, la nube
      // tiene contorno, y la isla emerge de ella en vez de flotar sobre ella.
      gl.uniform1f(progNubes.u.uEsc, 58)
      gl.uniform3fv(progNubes.u.uOjo, cam.ojo)
      gl.uniform1f(progNubes.u.uDensidad, densidad)
      gl.uniform1f(progNubes.u.uTiempo, ms / 1000)
      gl.uniform1f(progNubes.u.uNiebla, niebla)
      gl.uniform3fv(progNubes.u.uColor, reg.nubeColor)
      gl.uniform2fv(progNubes.u.uFlujo, reg.flujo)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.depthMask(true)
    }

    /* ── y la lluvia, en el plano de la pantalla y encima de todo ── */
    if (reg.lluvia > 0.01) {
      gl.useProgram(progLluvia.id)
      // SIN PROFUNDIDAD. La lluvia se dibuja en el plano de la pantalla, con
      // `gl_Position.z = 0`, que en profundidad cae a media escena: con el test
      // puesto, el relieve que estuviera más cerca la rechazaba entera y solo
      // sobrevivían las gotas sobre el cielo vacío, donde además el desvanecido
      // de arriba se las come. Es decir: no se veía llover.
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
      gl.enableVertexAttribArray(progLluvia.a.aXZ)
      gl.vertexAttribPointer(progLluvia.a.aXZ, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(progLluvia.u.uTiempo, ms / 1000)
      gl.uniform1f(progLluvia.u.uDensidad, reg.lluvia * 0.72)
      gl.uniform1f(progLluvia.u.uAspecto, aspecto)
      // La inclinación la manda el viento del régimen: con el temporal del OSO
      // el agua cae torcida, no a plomo.
      gl.uniform1f(progLluvia.u.uInclina, reg.flujo[0] * 0.42)
      gl.uniform3fv(progLluvia.u.uColor, reg.nubeColor)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.depthMask(true)
      gl.enable(gl.DEPTH_TEST)
    }
  }

  /**
   * La tapa se apaga en los dos extremos del ascenso.
   *
   * Arriba porque la cámara ya está por encima de todo y un plano infinito visto
   * desde arriba tapa la isla entera; abajo porque en los primeros píxeles de la
   * página la cámara está lejísimos y la nube se ve como una losa. Los dos
   * desvanecidos son los que ya había, y ahora multiplican además la densidad del
   * régimen —que es 0 en la noche despejada, donde no hay tapa ninguna—.
   */
  function densidadNube(asc, reg) {
    var entra = Math.max(0, Math.min(1, (asc - 0.08) * 3))
    var sale = Math.max(0, Math.min(1, (1.05 - asc) * 4))
    return entra * sale * reg.nubeDensidad
  }

  /* ── arranque ───────────────────────────────────────────────────────────── */

  var img = new Image()
  img.decoding = 'async'
  img.onload = function () {
    try {
      construir(img)
    } catch (e) {
      return // se queda el plano de curvas de nivel
    }
    document.documentElement.classList.add('isla3d-ok')
    lienzo.classList.add('viva')
    visible = true
    mano = requestAnimationFrame(pintar)

    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden
    })
  }
  img.onerror = function () {}
  img.src = '/img/relieve.png'
}
