/**
 * Shaders de la capa de viento. GLSL 1.00, que es lo que acepta el contexto que
 * crea MapLibre.
 *
 * El color dice la VELOCIDAD y la opacidad dice la PROCEDENCIA. Son dos cosas
 * distintas y no se pueden mezclar en el mismo canal: si lo modelado se pintara
 * de otro color, un viento fuerte estimado y uno flojo medido saldrían del
 * mismo tono y el mapa mentiría sobre lo único que de verdad está midiendo.
 *
 * DOS PASADAS, UNA OSCURA Y UNA CLARA. La primera versión pintaba el trazo
 * directamente con el tono de la velocidad y sobre la malla interpolada no se
 * veía nada: la rampa de la velocidad (azul pálido → ámbar → rojo) y la de la
 * temperatura son casi la misma, así que el viento se camuflaba justo en la
 * capa sobre la que más falta hace verlo. La solución es la de cualquier mapa
 * con líneas sobre fondo variable —Windy incluido—: un halo oscuro debajo y un
 * trazo claro encima. El halo se dibuja con este mismo programa desplazando el
 * vértice un píxel, sin geometría extra: `u_offset` va en espacio de recorte y
 * se multiplica por `w` para que el desplazamiento sea constante en pantalla.
 */

export const VERTEX_SHADER = `
precision mediump float;

attribute vec2 a_pos;
// x: opacidad por posición en la estela, y: velocidad normalizada 0–1,
// z: cuánto de esa lectura la sostienen estaciones reales, 0–1.
attribute vec3 a_style;

uniform mat4 u_matrix;
/** Desplazamiento en espacio de recorte, para el halo. Cero en la pasada clara. */
uniform vec2 u_offset;

varying float v_alpha;
varying float v_speed;
varying float v_station;

void main() {
  v_alpha = a_style.x;
  v_speed = a_style.y;
  v_station = a_style.z;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  gl_Position.xy += u_offset * gl_Position.w;
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

varying float v_alpha;
varying float v_speed;
varying float v_station;

uniform float u_opacity;
/** 1 en la pasada del halo, 0 en la del trazo. */
uniform float u_casing;

// Calma → azul claro, moderado → ámbar claro, fuerte → rojo claro. Los tres
// tonos de la interfaz, subidos de luminosidad: sobre el halo oscuro se leen
// igual encima de la malla de temperatura que sobre el mar negro, que es la
// prueba que la versión anterior no pasaba.
vec3 ramp(float t) {
  vec3 calm   = vec3(0.812, 0.902, 0.961);
  vec3 medium = vec3(1.000, 0.914, 0.706);
  vec3 strong = vec3(1.000, 0.678, 0.612);
  return t < 0.5
    ? mix(calm, medium, t * 2.0)
    : mix(medium, strong, (t - 0.5) * 2.0);
}

void main() {
  // Lo que solo sostiene el modelo se dibuja más tenue. No es decoración: es
  // la diferencia entre una medida y una estimación, dicha en el propio trazo.
  // La cifra exacta de cuánto sostiene el modelo la da el panel, que es donde
  // se puede afirmar con un número en vez de con un tono.
  float provenance = mix(0.55, 1.0, v_station);
  vec3 color = mix(ramp(v_speed), vec3(0.02, 0.02, 0.03), u_casing);
  // El halo pesa menos que el trazo: cuatro pasadas de sombra a plena opacidad
  // taparían el mapa que hay debajo, que es el que sitúa el viento.
  float alpha = v_alpha * provenance * u_opacity * mix(0.55, 0.3, u_casing);
  gl_FragColor = vec4(color, alpha);
  gl_FragColor.rgb *= gl_FragColor.a;
}
`
