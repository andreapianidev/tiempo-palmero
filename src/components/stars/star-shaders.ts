/**
 * Las estrellas, en la tarjeta gráfica.
 *
 * TODO EL TRABAJO POR ESTRELLA VIVE AQUÍ, y ése es el diseño: la CPU calcula
 * una matriz de 3 × 3 por fotograma —precesión, nutación, rotación de la Tierra
 * y latitud, en `lib/stars/frame.ts`— y el sombreador la aplica 8920 veces.
 * Medio millón de conversiones por segundo que en JavaScript no cabrían en el
 * presupuesto de un teléfono y en la GPU son una llamada de dibujo.
 *
 * LO QUE HACE CADA ESTRELLA, en orden, y ninguno de los pasos es decorativo:
 *
 *  1. **Aberración**: se suma el vector velocidad de la Tierra partido por c y
 *     se renormaliza. 20,5" como mucho.
 *  2. **Marco**: la matriz la lleva de ICRS a este/norte/arriba.
 *  3. **Refracción**: el aire la levanta. En el horizonte son 34', **más que el
 *     diámetro de la luna llena**, así que sin este paso todos los ortos salen
 *     dos minutos tarde. La fórmula es la misma de `lib/stars/refraction.ts`,
 *     escrita dos veces a propósito y vigilada por una prueba que compara las
 *     dos sobre una rejilla de alturas.
 *  4. **Horizonte del observador**: por debajo del suelo visible no se dibuja.
 *     Ese suelo es NEGATIVO desde una cumbre —1,43° bajo la horizontal desde el
 *     Roque— y por eso desde arriba se ven estrellas que desde la costa están
 *     puestas.
 *  5. **Extinción**: la magnitud crece con la masa de aire. Kasten y Young, la
 *     misma que usa el resto de la aplicación para el sol.
 *  6. **Corte y desvanecido**: contra la magnitud límite que sale del fotómetro.
 *     No es un corte duro: una estrella justo en el límite se dibuja tenue y se
 *     apaga al pasarlo. Un corte binario haría aparecer y desaparecer estrellas
 *     de golpe al girar el mapa.
 *  7. **Centelleo**: amplitud proporcional a `X^1,75`, el exponente de Young
 *     (1967) para la centelleo atmosférica. Por eso Sirio recién salido tiembla
 *     y Vega en el cenit no.
 *  8. **Proyección**: el punto de fuga de la dirección, con w = 0. Exacto, no
 *     una aproximación — la misma cuenta que ya hace el disco del sol.
 *
 * EL BLANQUEO DEL COLOR (paso 6 bis) es lo que separa un cielo creíble de un
 * cartel: a simple vista solo las estrellas más brillantes activan la visión en
 * color, y las demás las ven los bastones, que son ciegos al color. Se mezcla
 * hacia el blanco según lo cerca que esté la estrella del límite.
 */

export const STAR_VERTEX_SHADER = `
attribute vec3 a_star;    // ascensión recta, declinación (rad), magnitud
attribute vec3 a_color;   // color ya resuelto del índice B−V

uniform mat3 u_sky;          // ICRS → este, norte, arriba
uniform vec3 u_aberration;   // v_Tierra / c, se suma antes de normalizar
uniform mat4 u_view;         // matriz de vista de MapLibre
uniform float u_limitMag;    // magnitud límite de esta noche
uniform float u_extinction;  // k, magnitudes por masa de aire
uniform float u_floorDeg;    // horizonte visible del observador, grados
uniform float u_density;     // densidad relativa del aire, para la refracción
uniform float u_pixelRatio;
uniform float u_time;        // segundos, para el centelleo
uniform float u_twinkle;     // 0 apaga el centelleo, 1 lo deja al natural

varying vec3 v_color;
varying float v_alpha;

const float PI = 3.14159265358979;
const float DEG = 57.2957795130823;

void main() {
  float ra = a_star.x;
  float dec = a_star.y;
  float mag = a_star.z;

  float cd = cos(dec);
  vec3 p = vec3(cd * cos(ra), cd * sin(ra), sin(dec)) + u_aberration;
  vec3 h = u_sky * normalize(p);

  float elDeg = asin(clamp(h.z, -1.0, 1.0)) * DEG;

  // Refracción de Bennett con la corrección de Sæmundsson, Meeus 16.3. El
  // gemelo en TypeScript está en lib/stars/refraction.ts y hay una prueba que
  // no deja que se separen.
  // Se satura en −1°: por debajo, Bennett deja de valer (tiene un polo en
  // −5,11) y el horizonte de una cumbre está justo ahí. Ver refraction.ts.
  float eB = max(elDeg, -1.0);
  float refr = max(0.0, (1.02 / tan((eB + 10.3 / (eB + 5.11)) / DEG)) * u_density / 60.0);
  float elRef = elDeg + refr;

  // Debajo del horizonte del observador no hay nada que dibujar. El punto se
  // manda fuera del volumen de vista en vez de descartarse en el fragmento:
  // así no llega ni a rasterizar.
  if (elRef < u_floorDeg) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    v_alpha = 0.0;
    v_color = vec3(0.0);
    return;
  }

  // Rehacer la dirección con la altura corregida, conservando el acimut.
  float elR = elRef / DEG;
  vec2 flat2 = h.xy;
  float flatLen = length(flat2);
  vec3 dir = flatLen > 1e-6
    ? vec3(normalize(flat2) * cos(elR), sin(elR))
    : vec3(0.0, 0.0, 1.0);

  // Masa de aire de Kasten y Young (1989). La ingenua 1/sen(h) se va a infinito
  // en el horizonte; ésta vale 38 y es finita.
  float elClamped = max(elRef, -0.5);
  float airmass = 1.0 / (sin(elClamped / DEG) + 0.50572 * pow(elClamped + 6.07995, -1.6364));
  airmass = clamp(airmass, 1.0, 40.0);

  float apparent = mag + u_extinction * airmass;

  // Centelleo. La amplitud crece como X^1,75 (Young 1967): en el cenit es un
  // temblor de nada y a 5° de altura es lo que hace que una estrella baja
  // parpadee de colores. Cada estrella lleva su propia fase, sacada de su
  // posición, para que no titilen todas a la vez.
  float seed = fract(sin(ra * 12.9898 + dec * 78.233) * 43758.5453);
  float amp = u_twinkle * 0.10 * pow(airmass, 1.75);
  float flicker =
    sin(u_time * (2.7 + 3.1 * seed) + seed * 6.283) * 0.6 +
    sin(u_time * (6.1 + 4.3 * seed) + seed * 2.399) * 0.4;
  apparent += amp * flicker;

  // Cuánta luz llega en relación con el límite de esta noche. 1,0 es justo el
  // límite; por encima, más brillante.
  float flux = pow(10.0, -0.4 * (apparent - u_limitMag));

  // Se apaga suavemente en el último tramo. Un corte duro haría aparecer y
  // desaparecer estrellas al mover el mapa.
  v_alpha = clamp(flux, 0.0, 1.0);
  if (v_alpha < 0.004) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    v_color = vec3(0.0);
    return;
  }

  // El blanqueo: solo lo más brillante conserva su color.
  float chroma = clamp((flux - 1.0) / 60.0, 0.0, 1.0);
  v_color = mix(vec3(1.0), a_color, chroma);

  // Tamaño. La raíz cuarta del flujo es lo que hace que Sirio se lea como un
  // punto grande sin convertirse en un disco: entre la estrella del límite y la
  // más brillante del cielo hay un factor 1400 de luz y solo 6 de tamaño.
  float size = 1.1 + 2.6 * pow(min(flux, 3000.0), 0.25);
  gl_PointSize = size * u_pixelRatio;

  // En Mercator la y crece hacia el SUR: por eso el norte entra con el signo
  // cambiado. Es el error que pondría el cielo espejado y plausible.
  vec4 clip = u_view * vec4(dir.x, -dir.y, dir.z, 0.0);
  if (clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    v_alpha = 0.0;
    return;
  }
  // z = w deja la profundidad en 1, el fondo del búfer, para que el relieve la
  // tape sin ningún cálculo de oclusión. Igual que el disco del sol.
  gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);
}
`

export const STAR_FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_color;
varying float v_alpha;

void main() {
  // Una estrella real es un punto sin dimensión: lo que se ve es la respuesta
  // del ojo y del aire, que es una campana. Una gaussiana estrecha se lee como
  // estrella; un disco plano, como un píxel encendido.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  float glow = exp(-r2 * 1.6) * 0.25;
  float i = (core + glow) * v_alpha;
  if (i < 0.003) discard;
  // Aditiva: la luz de una estrella se SUMA al cielo que tiene detrás, no lo
  // tapa. Por eso una estrella sobre el resplandor del pueblo se ve menos.
  gl_FragColor = vec4(v_color * i, i);
}
`

/**
 * Las figuras de las constelaciones comparten el transporte pero no el
 * tratamiento: no se les aplica ni extinción ni centelleo, porque una línea no
 * es un objeto físico. Sí se les aplica el marco y la refracción, porque tienen
 * que quedar clavadas sobre sus estrellas.
 */
export const FIGURE_VERTEX_SHADER = `
attribute vec2 a_dir;   // ascensión recta, declinación

uniform mat3 u_sky;
uniform mat4 u_view;
uniform float u_floorDeg;
uniform float u_density;

varying float v_visible;

const float DEG = 57.2957795130823;

void main() {
  float cd = cos(a_dir.y);
  vec3 h = u_sky * vec3(cd * cos(a_dir.x), cd * sin(a_dir.x), sin(a_dir.y));
  float elDeg = asin(clamp(h.z, -1.0, 1.0)) * DEG;
  float eB = max(elDeg, -1.0);
  float refr = max(0.0, (1.02 / tan((eB + 10.3 / (eB + 5.11)) / DEG)) * u_density / 60.0);
  float elRef = elDeg + refr;
  v_visible = elRef < u_floorDeg ? 0.0 : 1.0;

  float elR = elRef / DEG;
  vec2 flat2 = h.xy;
  vec3 dir = length(flat2) > 1e-6
    ? vec3(normalize(flat2) * cos(elR), sin(elR))
    : vec3(0.0, 0.0, 1.0);

  vec4 clip = u_view * vec4(dir.x, -dir.y, dir.z, 0.0);
  if (clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_visible = 0.0;
    return;
  }
  gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);
}
`

export const FIGURE_FRAGMENT_SHADER = `
precision mediump float;
uniform float u_opacity;
varying float v_visible;
void main() {
  if (v_visible < 0.5) discard;
  gl_FragColor = vec4(0.45, 0.62, 0.85, 1.0) * u_opacity;
}
`
