/**
 * Los dos shaders de la lluvia.
 *
 * SE DIBUJA CON `gl.LINES`, no con puntos. Una gota vista desde un kilómetro no
 * es un punto: es el trazo que deja mientras el ojo la integra, y ese trazo
 * tiene una dirección —la de la caída, inclinada por el viento— que un punto no
 * puede representar. Dos vértices por hilo, la cabeza y la cola.
 *
 * EL GROSOR ES DE UN PÍXEL Y NO SE PUEDE ELEGIR. `gl.lineWidth` está limitado a
 * 1 en prácticamente todas las implementaciones de WebGL sobre escritorio, y no
 * es un descuido del navegador sino algo que la especificación permite. Aquí
 * resulta que es lo correcto: la lluvia a esta distancia es un velo de hilos
 * finísimos, y un trazo grueso la convertiría en una cortina de espaguetis. Lo
 * que da el cuerpo del velo es la CANTIDAD de hilos, que sí va atada a los
 * milímetros del modelo.
 *
 * LA COLA SE DESVANECE. Un segmento de opacidad uniforme se lee como una raya
 * de bolígrafo; con la cabeza marcada y la cola apagándose se lee como algo que
 * cae, aunque la posición sea la misma. Es un `varying` por vértice y no cuesta
 * nada.
 */

export const VERTEX_SHADER = `
attribute vec3 a_pos;
// opacidad del hilo, y si este vértice es la cabeza (1) o la cola (0)
attribute vec2 a_style;

uniform mat4 u_matrix;

varying float v_alpha;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  // La cola llega al 15 % de la cabeza. Cero del todo deja el extremo cortado
  // en un punto invisible y el hilo parece más corto de lo que es.
  v_alpha = a_style.x * mix(0.15, 1.0, a_style.y);
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

// 1 de día, 0 de noche. La lluvia también se apaga cuando no hay luz.
uniform float u_day;

varying float v_alpha;

void main() {
  // Gris azulado frío. La lluvia no es blanca: es el cielo visto a través del
  // agua, y sobre esta isla ese cielo es gris.
  vec3 day = vec3(0.74, 0.80, 0.88);
  vec3 night = vec3(0.22, 0.26, 0.34);
  vec3 c = mix(night, day, u_day);

  float a = v_alpha;
  if (a < 0.004) discard;

  // Alfa premultiplicado, como el resto de capas propias.
  gl_FragColor = vec4(c * a, a);
}
`
