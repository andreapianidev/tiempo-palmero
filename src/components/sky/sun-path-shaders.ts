/**
 * La línea del camino del sol: un núcleo del color del sol y un reborde oscuro.
 *
 * VA AL FONDO DE LA ESCENA, a profundidad 1, igual que el disco: así el relieve
 * —que sí escribe profundidad— la tapa donde se pone delante, sin ningún cálculo
 * de oclusión. Esa es justamente la parte que más dice del dibujo: el trozo de
 * camino que la Cumbre esconde es el rato que el sol tarda en asomar por encima
 * del filo después de haber salido, y en La Palma es más de una hora.
 *
 * EL REBORDE NO ES ADORNO. La línea se dibuja sobre el cielo, y el cielo va del
 * casi negro de la noche al azul claro de mediodía —o al blanco lechoso de un
 * día de calima—. Una línea clara sin reborde desaparece contra el cielo claro
 * justo a la hora en que más se mira. Con un borde oscuro se lee sobre
 * cualquier fondo, que es el mismo truco de los topónimos del mapa.
 *
 * LOS DOS SE PINTAN EN UNA PASADA gracias al atributo «través», que vale −1 en
 * un borde de la cinta y +1 en el otro: el núcleo es el centro y el reborde, lo
 * que queda a los lados. Dos pasadas con dos anchos habrían costado el doble de
 * geometría para el mismo resultado.
 */

export const SUN_PATH_VERTEX_SHADER = `
attribute vec2 a_pos;
// Dónde cae este vértice a lo ancho de la cinta: −1 un borde, +1 el otro.
attribute float a_across;
attribute vec3 a_color;

varying float v_across;
varying vec3 v_color;

void main() {
  v_across = a_across;
  v_color = a_color;
  // Ya viene en coordenadas de pantalla: la proyección la hizo la CPU, porque
  // lo que se dibuja no está en el mapa sino en el infinito. Profundidad 1, el
  // fondo del búfer, para que el relieve mande.
  gl_Position = vec4(a_pos, 1.0, 1.0);
}
`

export const SUN_PATH_FRAGMENT_SHADER = `
precision mediump float;

// Qué fracción del semiancho es núcleo. El resto, reborde.
uniform float u_core;
// Suavizado del borde, en las mismas unidades del través: un píxel.
uniform float u_aa;
uniform float u_opacity;

varying float v_across;
varying vec3 v_color;

void main() {
  float d = abs(v_across);
  float edge = 1.0 - smoothstep(1.0 - u_aa, 1.0, d);
  if (edge < 0.004) discard;
  float core = 1.0 - smoothstep(u_core - u_aa, u_core + u_aa, d);

  // Fuera del núcleo el color se va a negro: eso es el reborde. Y va a menos de
  // la mitad de opacidad, lo justo para separar la línea del cielo sin dibujar
  // un segundo trazo negro al lado del bueno.
  float a = edge * mix(0.45, 1.0, core) * u_opacity;
  vec3 rgb = v_color * core;

  // Premultiplicada, como el resto de la aplicación (ONE, ONE_MINUS_SRC_ALPHA).
  gl_FragColor = vec4(rgb * a, a);
}
`
