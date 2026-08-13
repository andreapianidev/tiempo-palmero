/**
 * Los dos shaders de la capa de vapor.
 *
 * SE DIBUJA CON `gl.POINTS`, no con triángulos. Una gota de bruma es un disco
 * con los bordes deshechos y nada más: un cuadrilátero por partícula sería
 * cuatro veces los vértices para dibujar exactamente lo mismo. El límite de
 * `gl_PointSize` —64 px garantizados por la especificación de WebGL 1, mucho
 * más en la práctica— sobra para lo que aquí se pinta, porque una columna de
 * vapor son muchas motas pequeñas y no cuatro manchas grandes.
 *
 * EL TAMAÑO SE MIDE EN METROS, no en unidades de la matriz de MapLibre. El
 * primer intento dividía `gl_PointSize` directamente por la `w` del vértice, y
 * no dibujaba nada: esa `w` está en las unidades de una matriz que mapea
 * Mercator normalizado a espacio de recorte, así que vale del orden de miles y
 * cualquier tamaño razonable se convertía en menos de un píxel. Se veía —con la
 * prueba forzada a 8 px salían las 5.143 motas en su sitio— pero como polvo.
 *
 * Lo que se pasa ahora es el tamaño **en píxeles que le corresponde a una mota
 * en el centro del mapa**, calculado en la CPU con los metros por píxel de ese
 * zoom, y la profundidad entra solo como una PROPORCIÓN respecto a la `w` de
 * ese mismo centro. Así el tamaño está atado a una longitud real y la
 * perspectiva sigue funcionando: la bruma del primer plano es gorda y suave, la
 * del fondo es un punto.
 */

export const VERTEX_SHADER = `
attribute vec3 a_pos;
attribute vec3 a_style;

uniform mat4 u_matrix;
uniform float u_pixelRatio;
// Píxeles que mide una mota de tamaño 1 a la profundidad del centro.
uniform float u_basePx;
// La w del centro del mapa. Es la referencia de la proporción.
uniform float u_refW;

varying float v_alpha;
varying float v_tint;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  // Proporción de profundidad respecto al centro: 1 en el centro, mayor delante
  // y menor detrás. Se acota por arriba para que una mota que pase muy cerca de
  // la cámara no llene media pantalla de blanco.
  float depth = clamp(u_refW / max(gl_Position.w, 0.0001), 0.15, 6.0);
  gl_PointSize = clamp(a_style.y * u_basePx * depth * u_pixelRatio, 1.5, 110.0);
  v_alpha = a_style.x;
  v_tint = a_style.z;
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

varying float v_alpha;
varying float v_tint;

void main() {
  // Distancia al centro del punto, de 0 a 1 en el borde.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;

  // Caída al cuadrado: un disco de borde duro se lee como un confeti, y lo que
  // se quiere es que las motas se sumen entre ellas hasta parecer una sola masa.
  float falloff = 1.0 - r;
  float a = falloff * falloff * v_alpha;
  if (a < 0.004) discard;

  // Frío abajo, cálido arriba. No es decoración: el vapor recién levantado del
  // suelo está en sombra de ladera y el que llega al techo de condensación es
  // el que le da la luz, que es como se ve una mañana de verdad.
  vec3 cold = vec3(0.72, 0.82, 0.95);
  vec3 warm = vec3(1.0, 0.98, 0.94);
  vec3 c = mix(cold, warm, v_tint);

  // Alfa premultiplicado, que es lo que espera el compositor de MapLibre.
  gl_FragColor = vec4(c * a, a);
}
`
