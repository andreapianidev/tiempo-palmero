/**
 * Los dos sombreadores de la Vía Láctea.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL VÉRTICE ES EL DE LAS ESTRELLAS, RECORTADO. Misma matriz `u_sky`, misma
 * refracción de Bennett con la corrección de Sæmundsson, misma entrada a la
 * matriz de vista con el norte cambiado de signo, misma profundidad `z = w`
 * para que el relieve la tape sin cálculo de oclusión. Lo que no lleva es la
 * aberración: son 20 segundos de arco sobre una banda de decenas de grados que
 * no tiene bordes: ponerla sería copiar una línea para no usarla.
 *
 * LA ALTURA REFRACTADA VIAJA AL FRAGMENTO en vez de resolverse en el vértice, y
 * de ahí salen las dos cosas que hace el fragmento con ella: el horizonte —que
 * queda con la precisión de la interpolación, minutos de arco, en vez de con la
 * de la malla, dos grados— y la masa de aire, que así es continua por dentro de
 * cada celda en vez de a escalones.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL FRAGMENTO NO TIENE NINGÚN NÚMERO PROPIO. Todo lo que decide el brillo
 * —`u_peakMag`, `u_gain`, el color— entra por uniformes desde
 * `lib/sky/vialactea.ts`, que es donde está escrito de dónde sale cada uno y
 * dónde una prueba los comprueba sin navegador. Un sombreador con la constante
 * copiada dentro es un segundo cielo que puede separarse del primero, y ya pasó
 * con la refracción: hay un gemelo en TypeScript y una prueba que no los deja.
 *
 * LA CUENTA, QUE ES LA MISMA DE `milkyWayFraction` SIN EL LOGARITMO:
 *
 *     razón = v · 10^(−0,4 · (m_pico + k·X − m_cielo))
 *
 * Sale de sustituir `m = m_pico − 2,5·log10(v)` dentro de `10^(−0,4·(m − …))`:
 * el logaritmo y la potencia se cancelan y queda `v` multiplicando. No es un
 * atajo aproximado, es la misma expresión — y evita evaluar `log10` de un
 * número que vale cero en cuatro quintas partes del cielo.
 */

export const MILKYWAY_VERTEX_SHADER = `
attribute vec4 a_vertex;   // ascensión recta, declinación (rad), s, t

uniform mat3 u_sky;        // ICRS → este, norte, arriba
uniform mat4 u_view;       // matriz de vista de MapLibre
uniform float u_density;   // densidad relativa del aire, para la refracción

varying vec2 v_uv;
varying float v_elev;      // altura APARENTE, grados

const float DEG = 57.2957795130823;

void main() {
  float ra = a_vertex.x;
  float dec = a_vertex.y;
  v_uv = a_vertex.zw;

  float cd = cos(dec);
  vec3 h = u_sky * vec3(cd * cos(ra), cd * sin(ra), sin(dec));

  float elDeg = asin(clamp(h.z, -1.0, 1.0)) * DEG;

  // Refracción de Bennett con la corrección de Sæmundsson, Meeus 16.3. Es la
  // MISMA expresión que el sombreador de las estrellas y que
  // lib/stars/refraction.ts, saturada en −1° por el mismo motivo: por debajo
  // Bennett deja de valer, tiene un polo en −5,11.
  float eB = max(elDeg, -1.0);
  float refr = max(0.0, (1.02 / tan((eB + 10.3 / (eB + 5.11)) / DEG)) * u_density / 60.0);
  v_elev = elDeg + refr;

  // Rehacer la dirección con la altura corregida, conservando el acimut.
  float elR = v_elev / DEG;
  vec2 flat2 = h.xy;
  vec3 dir = length(flat2) > 1e-6
    ? vec3(normalize(flat2) * cos(elR), sin(elR))
    : vec3(0.0, 0.0, 1.0);

  // En Mercator la y crece hacia el SUR: por eso el norte entra con el signo
  // cambiado. Es el error que pondría el cielo espejado y plausible.
  //
  // AQUÍ NO SE DESCARTA NADA POR w ≤ 0, al revés que en las estrellas. Aquello
  // son puntos sueltos y el recorte de la tarjeta no los trata bien; esto son
  // triángulos, y con z = w el recortador del hardware corta contra el plano
  // w = 0 él solo. Mandar un vértice a (2,2,2) partiría el triángulo entero.
  vec4 clip = u_view * vec4(dir.x, -dir.y, dir.z, 0.0);
  gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);
}
`

export const MILKYWAY_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_map;
uniform float u_peakValue;    // el valor del mapa que vale u_peakMag: 200/255
uniform float u_peakMag;      // brillo superficial de ese nivel, mag/arcsec²
uniform float u_skyMag;       // el fondo de cielo MEDIDO, mag/arcsec²
uniform float u_extinction;   // k del sitio, magnitudes por masa de aire
uniform float u_floorDeg;     // horizonte visible del observador
uniform float u_gain;         // ganancia de pantalla, la única cifra elegida
uniform vec3 u_color;         // el B−V integrado pasado por starColor

varying vec2 v_uv;
varying float v_elev;

const float DEG = 57.2957795130823;

void main() {
  // Debajo del horizonte del observador no hay cielo. Se corta aquí y no en el
  // vértice para que la línea quede con la precisión de la interpolación.
  if (v_elev < u_floorDeg) discard;

  float v = texture2D(u_map, v_uv).r / u_peakValue;
  if (v <= 0.0) discard;

  // Masa de aire de Kasten y Young (1989), la misma que las estrellas, el sol
  // y la luna. La ingenua 1/sen(h) se va a infinito en el horizonte.
  float elClamped = max(v_elev, -0.5);
  float airmass = 1.0 / (sin(elClamped / DEG) + 0.50572 * pow(elClamped + 6.07995, -1.6364));
  airmass = clamp(airmass, 1.0, 40.0);

  float ratio = v * pow(10.0, -0.4 * (u_peakMag + u_extinction * airmass - u_skyMag));
  float fraction = ratio / (1.0 + ratio);
  float alpha = min(1.0, u_gain * fraction);
  if (alpha < 0.004) discard;

  // Mezcla ADITIVA, igual que las estrellas: la Vía Láctea no tapa el cielo, le
  // suma luz. Por eso el color va multiplicado por alfa y el alfa sale a 1.
  gl_FragColor = vec4(u_color * alpha, 1.0);
}
`
