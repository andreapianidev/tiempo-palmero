/**
 * Shaders de la capa de viento. GLSL 1.00, que es lo que acepta el contexto que
 * crea MapLibre.
 *
 * El color dice la VELOCIDAD y la opacidad dice la PROCEDENCIA. Son dos cosas
 * distintas y no se pueden mezclar en el mismo canal: si lo modelado se pintara
 * de otro color, un viento fuerte estimado y uno flojo medido saldrían del
 * mismo tono y el mapa mentiría sobre lo único que de verdad está midiendo.
 */

export const VERTEX_SHADER = `
precision mediump float;

attribute vec2 a_pos;
// x: opacidad por posición en la estela, y: velocidad normalizada 0–1,
// z: cuánto de esa lectura la sostienen estaciones reales, 0–1.
attribute vec3 a_style;

uniform mat4 u_matrix;

varying float v_alpha;
varying float v_speed;
varying float v_station;

void main() {
  v_alpha = a_style.x;
  v_speed = a_style.y;
  v_station = a_style.z;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

varying float v_alpha;
varying float v_speed;
varying float v_station;

uniform float u_opacity;

// Calma → azul pálido, moderado → ámbar, fuerte → rojo. Los mismos tres tonos
// que usa el resto de la interfaz, para que el mapa se lea como una sola cosa.
vec3 ramp(float t) {
  vec3 calm   = vec3(0.435, 0.702, 0.824);
  vec3 medium = vec3(0.886, 0.706, 0.361);
  vec3 strong = vec3(0.820, 0.282, 0.247);
  return t < 0.5
    ? mix(calm, medium, t * 2.0)
    : mix(medium, strong, (t - 0.5) * 2.0);
}

void main() {
  // Lo que solo sostiene el modelo se dibuja más tenue. No es decoración: es
  // la diferencia entre una medida y una estimación, dicha en el propio trazo.
  // 0,5 y no menos: sobre la malla interpolada —que es clara— un trazo de
  // 1 px por debajo de esa opacidad desaparece del todo, y una capa que no se
  // ve no informa de nada. La proporción 1:2 sigue distinguiéndose, y la cifra
  // exacta de cuánto sostiene el modelo la da el panel, que es donde se puede
  // afirmar con un número en vez de con un tono.
  float provenance = mix(0.5, 1.0, v_station);
  gl_FragColor = vec4(ramp(v_speed), v_alpha * provenance * u_opacity);
  gl_FragColor.rgb *= gl_FragColor.a;
}
`
