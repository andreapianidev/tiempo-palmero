/* ═══════════════════════════════════════════════════════════════════════════
   LOS SOMBREADORES DE LA ISLA

   Cinco programas: el relieve, el mar, el mar de nubes, la lluvia y nada más.
   WebGL a pelo, sin biblioteca —three.js serían 600 kB para dibujar una malla y
   tres planos, y este sitio no le pide un byte a nadie—.

   Están en su propio fichero porque no son lo mismo que el renderizador: aquí
   está QUÉ dibuja la tarjeta, y en `../isla3d.js` está cómo se le da de comer.
   Se tocan por motivos distintos y ya sumaban 250 líneas dentro del otro.

   Todos los uniformes de régimen —el campo de temperatura, la luz, la extinción,
   la nube, la lluvia— los rellena `regimenes.js`, que es donde están las cifras
   medidas y de dónde salen.
   ═══════════════════════════════════════════════════════════════════════════ */

var CABECERA = 'precision highp float;\n'

/**
 * La rampa de temperatura de la aplicación (`src/lib/palette.ts`), de 2 a 27 °C.
 * Es la misma escala con la que la aplicación pinta el mapa, así que el relieve
 * de la portada y el mapa que se abre al pulsar el botón hablan en el mismo
 * color. Los seis topes son los de allí, en el mismo orden.
 */
var RAMPA =
  'vec3 rampa(float t){\n' +
  '  vec3 c0=vec3(0.231,0.294,0.549); vec3 c1=vec3(0.290,0.498,0.710);\n' + // 2 y 8 °C
  '  vec3 c2=vec3(0.435,0.690,0.722); vec3 c3=vec3(0.561,0.780,0.604);\n' + // 13 y 18
  '  vec3 c4=vec3(0.886,0.773,0.416); vec3 c5=vec3(0.878,0.522,0.290);\n' + // 22 y 27
  '  if(t<0.2) return mix(c0,c1,t/0.2);\n' +
  '  if(t<0.4) return mix(c1,c2,(t-0.2)/0.2);\n' +
  '  if(t<0.6) return mix(c2,c3,(t-0.4)/0.2);\n' +
  '  if(t<0.8) return mix(c3,c4,(t-0.6)/0.2);\n' +
  '  return mix(c4,c5,(t-0.8)/0.2);\n' +
  '}\n'

export var VS_TERRENO =
  'attribute vec3 aPos; attribute vec3 aNor;\n' +
  'uniform mat4 uMVP; varying vec3 vNor; varying vec3 vPos;\n' +
  'void main(){ vNor = aNor; vPos = aPos; gl_Position = uMVP * vec4(aPos,1.0); }'

/**
 * EL RELIEVE, PINTADO CON EL CAMPO DE TEMPERATURA DEL RÉGIMEN.
 *
 * `uCampo` es el campo medido: (temperatura de costa, gradiente por debajo del
 * corte, cota del corte en km, salto al cruzarlo) y `uCampoArriba` el gradiente
 * de encima. Dos rectas y un escalón, que es la forma que tiene la atmósfera de
 * esta isla —ver `regimenes.js` para de dónde sale cada número—.
 *
 * EL ESCALÓN SE DEJA CASI SECO A PROPÓSITO, suavizado en ±30 m y nada más. Con
 * calima y de noche hay un salto de verdad en la atmósfera, y difuminarlo en 300
 * metros para que quede «bonito» sería dibujar una transición que no existe: lo
 * que se ve es una línea de nivel alrededor de la isla a la cota de la inversión,
 * y esa línea es el dato.
 *
 * @param exageracion La misma que usa la malla, para deshacerla y recuperar la
 *   cota real en kilómetros. Va incrustada como literal porque es una constante
 *   de compilación y no cambia en toda la vida del programa.
 */
export function fsTerreno(exageracion) {
  return (
    CABECERA +
    'varying vec3 vNor; varying vec3 vPos;\n' +
    'uniform vec3 uSol; uniform vec3 uOjo;\n' +
    'uniform vec4 uCampo; uniform float uCampoArriba;\n' +
    'uniform vec3 uLuz; uniform float uLuzFuerza; uniform vec3 uAmbiente;\n' +
    'uniform vec3 uExtincion; uniform vec2 uNiebla; uniform float uEspesor;\n' +
    'uniform float uMojado; uniform float uLuces;\n' +
    'uniform float uNubeY; uniform float uNubeSombra;\n' +
    RAMPA +
    'void main(){\n' +
    '  vec3 n = normalize(vNor);\n' +
    '  float cota = vPos.y / ' +
    exageracion.toFixed(3) +
    ';\n' +
    // El campo: dos rectas, con el escalón en uCampo.z.
    '  float tAbajo = uCampo.x - uCampo.y * cota;\n' +
    '  float enCorte = uCampo.x - uCampo.y * uCampo.z;\n' +
    '  float tArriba = enCorte + uCampo.w - uCampoArriba * (cota - uCampo.z);\n' +
    '  float k = smoothstep(uCampo.z - 0.03, uCampo.z + 0.03, cota);\n' +
    '  float tempC = mix(tAbajo, tArriba, k);\n' +
    '  vec3 base = rampa(clamp((tempC - 2.0) / 25.0, 0.0, 1.0));\n' +
    // La roca mojada es más oscura: no es un filtro gris, es menos albedo.
    '  vec3 albedo = base * mix(1.0, 0.52, uMojado);\n' +
    '  float lam = max(dot(n, uSol), 0.0);\n' +
    '  float cielo = 0.5 + 0.5 * n.y;\n' +
    '  vec3 col = albedo * uLuz * uLuzFuerza * lam + albedo * uAmbiente * cielo;\n' +
    // Y lo que sí hace la roca mojada: reflejar. Lóbulo ancho, que a esta
    // distancia un lóbulo estrecho no se puede muestrear sin criba de moiré.
    '  vec3 v = normalize(uOjo - vPos);\n' +
    '  vec3 h = normalize(v + uSol);\n' +
    '  col += uLuz * pow(max(dot(n, h), 0.0), 20.0) * uMojado * 0.30 * step(0.01, lam);\n' +
    // Filo: las cumbres y las aristas se recortan a contraluz, con el color de
    // la luz que haya —ámbar con calima, azul de luna por la noche—.
    '  float filo = pow(1.0 - max(dot(n, v), 0.0), 3.0);\n' +
    '  col += uLuz * filo * 0.26 * lam;\n' +
    // Lo que queda por debajo de la tapa de nubes se apaga y se lava.
    '  float bajoNube = smoothstep(uNubeY + 0.12, uNubeY - 0.30, vPos.y);\n' +
    '  col = mix(col, col * 0.55 + uAmbiente * 0.8, bajoNube * uNubeSombra * 0.75);\n' +
    // LAS LUCES DE LOS PUEBLOS, solo de noche y solo abajo. Ámbar porque en La
    // Palma el alumbrado es ámbar por la Ley del Cielo, y a manchas porque los
    // pueblos son manchas: dos senos cruzados bastan para que no sea un anillo.
    '  if (uLuces > 0.01) {\n' +
    // Tres senos y no dos: con dos, las manchas salían alargadas en la misma
    // diagonal y las luces de la costa parecían rayas de neón en vez de pueblos.
    // El tercero, cruzado y de otra frecuencia, las rompe en grumos.
    '    float manchas = 0.5 + 0.5 * sin(vPos.x * 3.1 + vPos.z * 2.3);\n' +
    '    manchas *= 0.6 + 0.4 * sin(vPos.x * 7.7 - vPos.z * 5.1);\n' +
    '    manchas *= 0.55 + 0.45 * sin(vPos.x * 1.7 + vPos.z * 9.3);\n' +
    '    float costa = 1.0 - smoothstep(0.04, 0.42, cota);\n' +
    '    col += vec3(0.886,0.706,0.361) * uLuces * costa * smoothstep(0.30, 0.78, manchas) * 0.46;\n' +
    '  }\n' +
    // EXTINCIÓN. Dos cosas distintas: el color del aire que se mete por delante
    // —el polvo de la calima, la lluvia del temporal— y el borde donde la malla
    // se acaba sin que se vea el corte. La primera tiñe, la segunda desvanece.
    '  float d = length(uOjo - vPos);\n' +
    '  float f = clamp(d / (uNiebla.x * 1.6), 0.0, 1.0);\n' +
    '  col = mix(col, uExtincion * max(uLuzFuerza, 0.25), f * f * uEspesor);\n' +
    '  float a = 1.0 - smoothstep(uNiebla.x, uNiebla.x * 1.9, d);\n' +
    '  gl_FragColor = vec4(col * a, a);\n' +
    '}'
  )
}

export var VS_PLANO =
  'attribute vec2 aXZ; uniform mat4 uMVP; uniform float uY; uniform float uEsc;\n' +
  'varying vec3 vPos;\n' +
  'void main(){ vec3 p = vec3(aXZ.x * uEsc, uY, aXZ.y * uEsc); vPos = p; gl_Position = uMVP * vec4(p,1.0); }'

/** El mar, con el color del régimen y el reflejo del sol o de la luna. */
export var FS_MAR =
  CABECERA +
  'varying vec3 vPos; uniform vec3 uOjo; uniform vec3 uSol; uniform float uNiebla;\n' +
  'uniform vec3 uMar; uniform vec3 uLuz; uniform float uLuzFuerza;\n' +
  'void main(){\n' +
  '  vec3 v = normalize(uOjo - vPos);\n' +
  '  float fres = pow(1.0 - max(v.y, 0.0), 4.0);\n' +
  '  vec3 col = mix(uMar, uMar * 2.6 + vec3(0.06,0.08,0.10), fres);\n' +
  // Reflejo ancho y bajo. Con exponente 90 el brillo cabía entre dos píxeles y
  // el mar entero salía como una criba de moiré: a esta distancia y sin textura
  // de olas, un lóbulo estrecho no se puede muestrear.
  '  vec3 r = reflect(-v, vec3(0.0,1.0,0.0));\n' +
  '  float bri = pow(max(dot(r, uSol), 0.0), 16.0);\n' +
  '  float d = length(uOjo - vPos);\n' +
  '  float cerca = 1.0 - smoothstep(uNiebla * 0.2, uNiebla * 1.1, d);\n' +
  '  col += uLuz * bri * 0.22 * uLuzFuerza * cerca;\n' +
  '  float a = (1.0 - smoothstep(uNiebla * 0.45, uNiebla * 1.15, d)) * 0.9;\n' +
  '  gl_FragColor = vec4(col * a, a);\n' +
  '}'

/**
 * EL MAR DE NUBES, o la tapa que toque.
 *
 * `uFlujo` es de dónde viene el aire, y es lo que decide contra qué vertiente se
 * amontona la nube: el nordeste con el alisio, el oeste con el temporal. Sin ese
 * uniforme la nube se pegaba siempre al mismo flanco y el temporal del suroeste
 * parecía un alisio pintado de gris.
 */
export var FS_NUBES =
  CABECERA +
  'varying vec3 vPos; uniform vec3 uOjo; uniform float uDensidad; uniform float uTiempo;\n' +
  'uniform float uNiebla; uniform vec3 uColor; uniform vec2 uFlujo;\n' +
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
  // Más espesa cuanto más se avanza hacia el flujo, que es donde rompe contra la
  // vertiente de barlovento.
  '  float barlovento = smoothstep(-16.0, 12.0, dot(vPos.xz, uFlujo) * 1.2);\n' +
  // El tramo del ruido que se convierte en nube. Iba de −0,30 a 0,80 y dejaba el
  // mar de nubes del alisio en un velo: la mitad del ruido caía por debajo del
  // pie del smoothstep y no llegaba a pintar nada. Corrido a −0,45..0,55, la
  // misma textura tapa de verdad donde hay nube y sigue abriendo claros donde no.
  '  float a = smoothstep(-0.45, 0.55, n * 0.65 + barlovento * 0.6) * uDensidad;\n' +
  // Espesor óptico: un plano visto de canto atraviesa más nube que visto desde
  // arriba. Sin esto el mar de nubes se lee como una calcomanía.
  '  vec3 v = normalize(uOjo - vPos);\n' +
  '  a = min(1.0, a * mix(1.0, 2.4, 1.0 - min(abs(v.y) * 2.2, 1.0)));\n' +
  '  float d = length(uOjo - vPos);\n' +
  '  a *= 1.0 - smoothstep(uNiebla * 0.55, uNiebla * 1.4, d);\n' +
  '  gl_FragColor = vec4(uColor * a, a);\n' +
  '}'

/**
 * LA LLUVIA, en el plano de la pantalla y no en el mundo.
 *
 * Es una decisión, no un atajo: la lluvia se ve a contraluz y a un metro de la
 * cara, no a treinta kilómetros. Modelarla en el mundo pedía geometría nueva y
 * salía peor —una cortina plana que gira con la cámara—, mientras que en la
 * pantalla son dos triángulos y doce operaciones.
 *
 * Tres capas a distinta escala y velocidad dan la profundidad. Las columnas se
 * encienden con un hash del índice, así que las gotas no van en formación.
 */
export var VS_LLUVIA =
  'attribute vec2 aXZ; varying vec2 vUv;\n' +
  'void main(){ vUv = aXZ * 0.5 + 0.5; gl_Position = vec4(aXZ, 0.0, 1.0); }'

export var FS_LLUVIA =
  CABECERA +
  'varying vec2 vUv; uniform float uTiempo; uniform float uDensidad;\n' +
  'uniform float uAspecto; uniform float uInclina; uniform vec3 uColor;\n' +
  'float azar(float x){ return fract(sin(x * 12.9898) * 43758.5453); }\n' +
  'float capa(vec2 p, float esc, float vel){\n' +
  '  vec2 q = vec2(p.x + p.y * uInclina, p.y - uTiempo * vel) * esc;\n' +
  '  float col = floor(q.x);\n' +
  '  float y = fract(q.y + azar(col));\n' +
  // Una gota corta —encendida un 7 % del paso— en una columna de cada seis.
  '  float gota = smoothstep(0.0, 0.02, y) * (1.0 - smoothstep(0.02, 0.09, y));\n' +
  '  return gota * step(0.83, azar(col + 41.7));\n' +
  '}\n' +
  'void main(){\n' +
  '  vec2 p = vec2(vUv.x * uAspecto, vUv.y);\n' +
  '  float a = capa(p, 38.0, 1.55) * 0.55;\n' +
  '  a += capa(p + vec2(0.37, 0.0), 26.0, 1.05) * 0.40;\n' +
  '  a += capa(p + vec2(0.71, 0.0), 17.0, 0.72) * 0.28;\n' +
  // Arriba no hay lluvia que ver: la escena se acaba y quedaría una trama sobre
  // el cielo, que se lee como una pantalla sucia y no como agua cayendo.
  '  a *= smoothstep(0.98, 0.55, vUv.y) * uDensidad;\n' +
  '  gl_FragColor = vec4(uColor * a, a);\n' +
  '}'
