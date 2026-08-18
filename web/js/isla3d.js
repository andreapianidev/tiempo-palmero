/* ═══════════════════════════════════════════════════════════════════════════
   LA ISLA EN TRES DIMENSIONES

   La Palma levantada de verdad —malla de 209×333 cotas, 138.000 triángulos—
   con la cámara colgada del desplazamiento: se gira alrededor de la isla y se
   baja hacia la cumbre según se va leyendo, se cruza el mar de nubes a la cota
   a la que está, y el sol recorre el cielo de la mañana a la tarde.

   ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
   De `web/img/relieve.png`, que no es una imagen sino una tabla de cotas: cada
   píxel lleva una altura en sus canales rojo y verde. La escribe
   `scripts/web-terreno.ts` desde `public/dem/`, el mismo modelo de elevación
   con el que la aplicación corrige la temperatura por altitud. Las tres
   constantes de la decodificación son un contrato con ese script.

   ── POR QUÉ NO HAY NINGUNA BIBLIOTECA ──────────────────────────────────────
   La CSP del sitio es `default-src 'none'` con todo lo demás en `'self'`, y el
   sitio no le pide un byte a nadie. Meter three.js serían 600 kB para dibujar
   una malla y tres planos, así que aquí hay WebGL a pelo y sesenta líneas de
   álgebra de matrices. Lo que hace falta y nada más.

   ── CÓMO FALLA ─────────────────────────────────────────────────────────────
   Si no hay WebGL, si la tarjeta no admite índices de 32 bits, si el relieve no
   carga o si el sistema pide no animar, esto no arranca y la página se queda
   con las curvas de nivel en SVG que ya trae — que es un plano de la misma
   isla sacado del mismo modelo. No hay pantalla en blanco por ningún camino.
   ═══════════════════════════════════════════════════════════════════════════ */

;(function () {
  'use strict'

  /* ── el contrato con `scripts/web-terreno.ts` ───────────────────────────── */
  var LADO_M = 140 // lado de cada muestra sobre el terreno
  var OFFSET_M = 500 // cota_m = (R·256 + G) / PASOS − OFFSET
  var PASOS_POR_METRO = 10

  /**
   * Exageración vertical. La Palma sube 2,4 km en 29 de ancho: a escala 1:1 y
   * vista desde una órbita parece una tortita, y lo que hace reconocible a esta
   * isla es justo lo contrario. 1,9 es lo que hace falta para que la Caldera se
   * lea como un circo y la Cumbre Vieja como una cresta, sin que el Roque
   * acabe pareciendo un Himalaya.
   */
  var EXAGERACION = 1.9

  /** Cota del mar de nubes. La inversión del alisio, en kilómetros. */
  var NUBES_KM = 1.2

  var lienzo = document.querySelector('[data-isla3d]')
  if (!lienzo) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

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
   * descentramiento—, y es lo que deja la isla a la derecha y la columna de
   * texto despejada a la izquierda sin torcer el punto de vista.
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

  var opciones = { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, powerPreference: 'low-power' }
  var gl = lienzo.getContext('webgl2', opciones)
  var indices32 = !!gl
  if (!gl) {
    gl = lienzo.getContext('webgl', opciones) || lienzo.getContext('experimental-webgl', opciones)
    if (!gl) return
    indices32 = !!gl.getExtension('OES_element_index_uint')
    // La malla pasa de 65.535 vértices: sin índices de 32 bits no hay isla.
    if (!indices32) return
  }

  function compilar(tipo, fuente) {
    var s = gl.createShader(tipo)
    gl.shaderSource(s, fuente)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }

  function programa(vs, fs) {
    var p = gl.createProgram()
    gl.attachShader(p, compilar(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    return p
  }

  /* ── sombreadores ───────────────────────────────────────────────────────── */

  var CABECERA = 'precision highp float;\n'

  var VS_TERRENO =
    'attribute vec3 aPos; attribute vec3 aNor;\n' +
    'uniform mat4 uMVP; varying vec3 vNor; varying vec3 vPos;\n' +
    'void main(){ vNor = aNor; vPos = aPos; gl_Position = uMVP * vec4(aPos,1.0); }'

  /**
   * El color del terreno es la escala de temperatura de la aplicación
   * (`src/lib/palette.ts`) aplicada a la cota con el gradiente que el propio
   * modelo mide, 7,24 °C/km, desde una costa a 24 °C. NO es una lectura en
   * directo y no se presenta como tal: es el aspecto que tiene la isla en la
   * aplicación una tarde cualquiera, que es de lo que habla la página.
   */
  var FS_TERRENO =
    CABECERA +
    'varying vec3 vNor; varying vec3 vPos;\n' +
    'uniform vec3 uSol; uniform vec3 uOjo; uniform float uNubes; uniform vec2 uNiebla;\n' +
    'vec3 rampa(float t){\n' +
    '  vec3 c0=vec3(0.231,0.294,0.549); vec3 c1=vec3(0.290,0.498,0.710);\n' + // 2 y 8 °C
    '  vec3 c2=vec3(0.435,0.690,0.722); vec3 c3=vec3(0.561,0.780,0.604);\n' + // 13 y 18
    '  vec3 c4=vec3(0.886,0.773,0.416); vec3 c5=vec3(0.878,0.522,0.290);\n' + // 22 y 27
    '  if(t<0.2) return mix(c0,c1,t/0.2);\n' +
    '  if(t<0.4) return mix(c1,c2,(t-0.2)/0.2);\n' +
    '  if(t<0.6) return mix(c2,c3,(t-0.4)/0.2);\n' +
    '  if(t<0.8) return mix(c3,c4,(t-0.6)/0.2);\n' +
    '  return mix(c4,c5,(t-0.8)/0.2);\n' +
    '}\n' +
    'void main(){\n' +
    '  vec3 n = normalize(vNor);\n' +
    '  float cota = vPos.y / ' +
    EXAGERACION.toFixed(3) +
    ';\n' +
    '  float tempC = 24.0 - cota * 7.24;\n' +
    '  float t = clamp((tempC - 2.0) / 25.0, 0.0, 1.0);\n' +
    '  vec3 base = rampa(t);\n' +
    // Sombreado: el sol cálido de frente, el cielo frío de relleno.
    '  float lam = max(dot(n, uSol), 0.0);\n' +
    '  float cielo = 0.5 + 0.5 * n.y;\n' +
    '  vec3 col = base * (0.22 + 0.72 * lam) + vec3(0.09,0.12,0.18) * cielo * 0.40;\n' +
    // Filo: las cumbres y las aristas se recortan en ámbar a contraluz.
    '  vec3 v = normalize(uOjo - vPos);\n' +
    '  float filo = pow(1.0 - max(dot(n, v), 0.0), 3.0);\n' +
    '  col += vec3(0.886,0.706,0.361) * filo * 0.28 * lam;\n' +
    // Lo que queda por debajo del mar de nubes se apaga y se lava.
    '  float bajoNube = smoothstep(uNubes + 0.12, uNubes - 0.30, vPos.y);\n' +
    '  col = mix(col, col * 0.55 + vec3(0.20,0.21,0.22), bajoNube * uNiebla.y * 0.7);\n' +
    '  float d = length(uOjo - vPos);\n' +
    '  float a = 1.0 - smoothstep(uNiebla.x, uNiebla.x * 1.9, d);\n' +
    '  gl_FragColor = vec4(col * a, a);\n' +
    '}'

  var VS_PLANO =
    'attribute vec2 aXZ; uniform mat4 uMVP; uniform float uY; uniform float uEsc;\n' +
    'varying vec3 vPos;\n' +
    'void main(){ vec3 p = vec3(aXZ.x * uEsc, uY, aXZ.y * uEsc); vPos = p; gl_Position = uMVP * vec4(p,1.0); }'

  var FS_MAR =
    CABECERA +
    'varying vec3 vPos; uniform vec3 uOjo; uniform vec3 uSol; uniform float uNiebla;\n' +
    'void main(){\n' +
    '  vec3 v = normalize(uOjo - vPos);\n' +
    '  float fres = pow(1.0 - max(v.y, 0.0), 4.0);\n' +
    '  vec3 col = mix(vec3(0.055,0.094,0.125), vec3(0.20,0.27,0.33), fres);\n' +
    // Reflejo del sol sobre el agua, alargado como corresponde a un mar picado.
    // El reflejo, ancho y bajo. Con exponente 90 el brillo cabía entre dos
    // píxeles y el mar entero salía como una criba de moiré: a esta distancia
    // y sin textura de olas, un lóbulo estrecho no se puede muestrear.
    '  vec3 r = reflect(-v, vec3(0.0,1.0,0.0));\n' +
    '  float bri = pow(max(dot(r, uSol), 0.0), 16.0);\n' +
    '  float d = length(uOjo - vPos);\n' +
    '  float cerca = 1.0 - smoothstep(uNiebla * 0.2, uNiebla * 1.1, d);\n' +
    '  col += vec3(0.95,0.78,0.45) * bri * 0.18 * cerca;\n' +
    '  float a = (1.0 - smoothstep(uNiebla * 0.45, uNiebla * 1.15, d)) * 0.9;\n' +
    '  gl_FragColor = vec4(col * a, a);\n' +
    '}'

  var FS_NUBES =
    CABECERA +
    'varying vec3 vPos; uniform vec3 uOjo; uniform float uDensidad; uniform float uTiempo;\n' +
    'uniform float uNiebla;\n' +
    // Ruido barato: tres senos cruzados. No es fbm, pero a esta escala y con la
    // nube desenfocada por su propia transparencia, se comporta igual.
    'float ondas(vec2 p){\n' +
    '  float s = sin(p.x * 0.13 + uTiempo * 0.05) * cos(p.y * 0.10 - uTiempo * 0.035);\n' +
    '  s += 0.55 * sin(p.x * 0.27 - p.y * 0.22 + uTiempo * 0.07);\n' +
    '  s += 0.25 * cos(p.x * 0.52 + p.y * 0.44 - uTiempo * 0.09);\n' +
    '  return s / 1.8;\n' +
    '}\n' +
    'void main(){\n' +
    '  float n = ondas(vPos.xz);\n' +
    // El alisio amontona la nube contra el nordeste: más espesa cuanto más al
    // norte y al este, que es donde rompe contra la vertiente de barlovento.
    '  float barlovento = smoothstep(-16.0, 12.0, -vPos.z + vPos.x * 0.5);\n' +
    '  float a = smoothstep(-0.30, 0.80, n * 0.65 + barlovento * 0.6) * uDensidad;\n' +
    // Espesor óptico: un plano visto de canto atraviesa más nube que visto
    // desde arriba. Sin esto el mar de nubes se lee como una calcomanía.
    '  vec3 v = normalize(uOjo - vPos);\n' +
    '  a = min(1.0, a * mix(1.0, 2.4, 1.0 - min(abs(v.y) * 2.2, 1.0)));\n' +
    '  float d = length(uOjo - vPos);\n' +
    '  a *= 1.0 - smoothstep(uNiebla * 0.4, uNiebla * 1.25, d);\n' +
    '  vec3 col = vec3(0.80,0.80,0.79);\n' +
    '  gl_FragColor = vec4(col * a, a);\n' +
    '}'

  /* ── malla ──────────────────────────────────────────────────────────────── */

  var progTerreno = null
  var progMar = null
  var progNubes = null
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

        // Normal por diferencias centrales. Sin esto no hay relieve: la malla
        // se ve como una mancha de color plana.
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

    // Un cuadrado que sirve de mar y de mar de nubes, escalado por uniforme.
    bufPlano = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    )

    progTerreno = programa(VS_TERRENO, FS_TERRENO)
    progMar = programa(VS_PLANO, FS_MAR)
    progNubes = programa(VS_PLANO, FS_NUBES)

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    listo = true
  }

  /* ── cámara ─────────────────────────────────────────────────────────────── */

  function mezcla(a, b, t) { return a + (b - a) * t }
  function suave(t) { return t * t * (3 - 2 * t) }

  /**
   * El recorrido. De una vista alta y lejana del norte a un vuelo bajo sobre la
   * Cumbre Vieja, girando 110° por el camino y con el sol cruzando el cielo.
   * Todo cuelga de `--asc`, igual que el resto de la página.
   */
  function camara(asc) {
    var s = suave(asc)
    var radio = mezcla(98, 36, s)
    var azimut = mezcla(-0.62, 1.28, s)
    var altura = mezcla(0.80, 0.15, s * s) // radianes sobre el horizonte
    var objetivoY = mezcla(0.25, 1.4, s)

    var ojo = [
      Math.cos(altura) * Math.sin(azimut) * radio,
      Math.sin(altura) * radio + objetivoY,
      Math.cos(altura) * Math.cos(azimut) * radio,
    ]

    var solAz = mezcla(1.9, -1.5, asc)
    var solAl = mezcla(0.22, 0.62, Math.sin(asc * Math.PI))
    return {
      ojo: ojo,
      objetivo: [0, objetivoY, 0],
      sol: [
        Math.cos(solAl) * Math.sin(solAz),
        Math.sin(solAl),
        Math.cos(solAl) * Math.cos(solAz),
      ],
      radio: radio,
    }
  }

  /* ── bucle ──────────────────────────────────────────────────────────────── */

  var ancho = 0
  var alto = 0
  var visible = false
  var mano = 0

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
   * hacia otro proceso y `gl.finish()` vuelve enseguida—, y comprobado aquí
   * mismo daba 0,1 ms mientras la página iba a 9 fps.
   *
   * El problema del hueco es que va atado al refresco de la pantalla: en un
   * monitor a 30 Hz son 33 ms aunque la tarjeta esté sobrada, y no hay manera de
   * separar una cosa de la otra sin dejar de dibujar unos fotogramas, que se
   * vería como un parpadeo. Así que los cortes se ponen POR ENCIMA de cualquier
   * refresco plausible: 38 ms está por encima de los 33 de una pantalla a 30 Hz,
   * y 55 ms por encima incluso de una a 24. Lo que caiga ahí ya no es el
   * monitor. Con rasterizado por software, medido aquí, el hueco se va a 110 ms.
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
    var cam = camara(asc)
    var aspecto = ancho / alto
    // A partir de 1080 px hay columna de texto a la izquierda que respetar; por
    // debajo, la isla se centra y se queda de fondo.
    // El lienzo va anclado al canto derecho y es más ancho que la banda: el
    // descentramiento empuja la isla hacia esa banda, que es la parte del
    // lienzo que el velo deja ver.
    var sesgo = anchoBanda() > 0 ? 0.36 : 0.0
    var proj = perspectiva((34 * Math.PI) / 180, aspecto, 0.35, 400, sesgo)
    var mvp = multiplicar(proj, mirarDesde(cam.ojo, cam.objetivo))
    var niebla = cam.radio * 1.15

    gl.viewport(0, 0, ancho, alto)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // El mar, primero y con escritura de profundidad.
    gl.useProgram(progMar)
    gl.depthMask(true)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
    var aXZ = gl.getAttribLocation(progMar, 'aXZ')
    gl.enableVertexAttribArray(aXZ)
    gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix4fv(gl.getUniformLocation(progMar, 'uMVP'), false, mvp)
    // EL MAR VA 6 m POR ENCIMA DE LA COTA CERO, no en cero.
    //
    // `web-terreno.ts` recorta el fondo marino a cero, así que toda la malla
    // fuera de la isla es una meseta plana a la misma altura exacta que este
    // plano. Con los dos en y = 0, la profundidad no puede decidir cuál está
    // delante y sale la criba de moiré clásica —y encima con el color que la
    // rampa da a 24 °C, que es un tostado de playa cubriendo medio océano—.
    // Seis metros bastan para que el agua gane siempre; lo único que inunda es
    // la franja de costa por debajo de esa cota, que a 140 m de muestreo no
    // llega a un píxel.
    gl.uniform1f(gl.getUniformLocation(progMar, 'uY'), 0.006 * 1.9)
    gl.uniform1f(gl.getUniformLocation(progMar, 'uEsc'), 110)
    gl.uniform3fv(gl.getUniformLocation(progMar, 'uOjo'), cam.ojo)
    gl.uniform3fv(gl.getUniformLocation(progMar, 'uSol'), cam.sol)
    gl.uniform1f(gl.getUniformLocation(progMar, 'uNiebla'), niebla)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // El relieve.
    gl.useProgram(progTerreno)
    var aPos = gl.getAttribLocation(progTerreno, 'aPos')
    var aNor = gl.getAttribLocation(progTerreno, 'aNor')
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
    gl.enableVertexAttribArray(aNor)
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
    gl.uniformMatrix4fv(gl.getUniformLocation(progTerreno, 'uMVP'), false, mvp)
    gl.uniform3fv(gl.getUniformLocation(progTerreno, 'uSol'), cam.sol)
    gl.uniform3fv(gl.getUniformLocation(progTerreno, 'uOjo'), cam.ojo)
    gl.uniform1f(gl.getUniformLocation(progTerreno, 'uNubes'), NUBES_KM * EXAGERACION)
    var densidad = Math.max(0, Math.min(1, (asc - 0.08) * 3)) * Math.max(0, Math.min(1, (1.05 - asc) * 4))
    gl.uniform2f(gl.getUniformLocation(progTerreno, 'uNiebla'), niebla, densidad)
    gl.drawElements(gl.TRIANGLES, nIndices, gl.UNSIGNED_INT, 0)

    // Y el mar de nubes encima, sin escribir profundidad para que no se recorte
    // contra sí mismo cuando la cámara lo atraviesa.
    if (densidad > 0.01) {
      gl.useProgram(progNubes)
      gl.depthMask(false)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPlano)
      var aXZ2 = gl.getAttribLocation(progNubes, 'aXZ')
      gl.enableVertexAttribArray(aXZ2)
      gl.vertexAttribPointer(aXZ2, 2, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix4fv(gl.getUniformLocation(progNubes, 'uMVP'), false, mvp)
      gl.uniform1f(gl.getUniformLocation(progNubes, 'uY'), NUBES_KM * EXAGERACION)
      gl.uniform1f(gl.getUniformLocation(progNubes, 'uEsc'), 110)
      gl.uniform3fv(gl.getUniformLocation(progNubes, 'uOjo'), cam.ojo)
      gl.uniform1f(gl.getUniformLocation(progNubes, 'uDensidad'), densidad * 0.9)
      gl.uniform1f(gl.getUniformLocation(progNubes, 'uTiempo'), ms / 1000)
      gl.uniform1f(gl.getUniformLocation(progNubes, 'uNiebla'), niebla)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.depthMask(true)
    }
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
})()
