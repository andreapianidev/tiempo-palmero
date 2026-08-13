/**
 * Shaders de la capa de viento. GLSL 1.00, que es lo que acepta el contexto que
 * crea MapLibre.
 *
 * El color dice la VELOCIDAD y la opacidad dice la PROCEDENCIA. Son dos cosas
 * distintas y no se pueden mezclar en el mismo canal: si lo modelado se pintara
 * de otro color, un viento fuerte estimado y uno flojo medido saldrían del
 * mismo tono y el mapa mentiría sobre lo único que de verdad está midiendo.
 *
 * DOS PASADAS, UNA DE HALO Y UNA DE TRAZO. Pintar el trazo directamente con el
 * tono de la velocidad no se ve: la rampa de la velocidad y la de la
 * temperatura son casi la misma, así que el viento se camuflaba justo en la
 * capa sobre la que más falta hace verlo. La solución es la de cualquier mapa
 * con líneas sobre fondo variable —Windy incluido—: un halo debajo y un trazo
 * encima, en contrastes opuestos. El halo se dibuja con este mismo programa
 * desplazando el vértice un píxel, sin geometría extra: `u_offset` va en
 * espacio de recorte y se multiplica por `w` para que el desplazamiento sea
 * constante en pantalla.
 *
 * QUÉ ES CLARO Y QUÉ ES OSCURO NO SE DECIDE AQUÍ NI EN LA INTERFAZ: SE MIRA.
 * Un halo negro con trazo claro se lee sobre el relieve sombreado y desaparece
 * sobre la carta topográfica de GRAFCAN, que es papel casi blanco. Y no vale
 * decidirlo por fondo de mapa, porque la malla de temperatura pinta encima
 * naranjas de sobra claros (#e0854a, luminancia 0,60) y azules oscuros
 * (#3b4b8c, 0,31) en la misma pantalla, y el mar en el fondo claro es más claro
 * que el papel. `u_background` trae el mapa ya dibujado bajo esta capa, y cada
 * fragmento invierte su tinta según lo que tiene justo detrás.
 */

export const VERTEX_SHADER = `
precision mediump float;

/**
 * x, y en Mercator normalizado y z en la MISMA unidad: con renderingMode 3d la
 * Z de la matriz de MapLibre es conforme, así que la altura no va en metros
 * sino en fracción de la circunferencia a esa latitud. La cuenta está en
 * lib/wind/altitude.ts, comparada contra la de MapLibre.
 * En el mapa plano z vale cero y esto se comporta como se comportaba.
 */
attribute vec3 a_pos;
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
  gl_Position = u_matrix * vec4(a_pos, 1.0);
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
/** El mapa ya dibujado debajo de esta capa. */
uniform sampler2D u_background;
/** Tamaño del lienzo en píxeles de dibujo, para leer esa textura. */
uniform vec2 u_resolution;

// Calma → azul, moderado → ámbar, fuerte → rojo. Son los tres tonos de la
// interfaz a plena saturación: el shader los aclara o los oscurece después,
// según el fondo, pero el TONO —que es lo que dice la velocidad— no cambia.
vec3 ramp(float t) {
  vec3 calm   = vec3(0.373, 0.639, 0.851);
  vec3 medium = vec3(0.937, 0.714, 0.263);
  vec3 strong = vec3(0.867, 0.290, 0.220);
  return t < 0.5
    ? mix(calm, medium, t * 2.0)
    : mix(medium, strong, (t - 0.5) * 2.0);
}

void main() {
  vec3 behind = texture2D(u_background, gl_FragCoord.xy / u_resolution).rgb;
  // Luminancia perceptual (Rec. 601): el verde pesa cinco veces más que el
  // azul, y con la media aritmética un azul saturado pasaría por claro.
  float lum = dot(behind, vec3(0.299, 0.587, 0.114));
  // La transición es estrecha a propósito. Ancha, los fondos de luminancia
  // media reciben una tinta a medio camino —gris— que no contrasta con nada;
  // así solo la reciben los que están a menos de 0,03 del punto de corte, y el
  // resto se lleva su polaridad entera. No es un escalón puro porque el fondo
  // cambia al mover el mapa y un escalón parpadearía en el borde.
  float onLight = smoothstep(0.47, 0.53, lum);

  vec3 hue = ramp(v_speed);
  vec3 pale = mix(hue, vec3(1.0), 0.55);
  vec3 deep = mix(hue, vec3(0.0), 0.60);
  // Sobre fondo claro manda el trazo oscuro con halo blanco; sobre fondo
  // oscuro, el de siempre.
  vec3 ink = mix(pale, deep, onLight);
  vec3 halo = mix(vec3(0.02, 0.02, 0.03), vec3(1.0, 1.0, 1.0), onLight);

  // Lo que solo sostiene el modelo se dibuja más tenue. No es decoración: es
  // la diferencia entre una medida y una estimación, dicha en el propio trazo.
  // La cifra exacta de cuánto sostiene el modelo la da el panel, que es donde
  // se puede afirmar con un número en vez de con un tono.
  float provenance = mix(0.55, 1.0, v_station);
  vec3 color = mix(ink, halo, u_casing);
  // El halo pesa menos que el trazo: cuatro pasadas de contraste a plena
  // opacidad taparían el mapa que hay debajo, que es el que sitúa el viento.
  float alpha = v_alpha * provenance * u_opacity * mix(0.6, 0.32, u_casing);
  gl_FragColor = vec4(color, alpha);
  gl_FragColor.rgb *= gl_FragColor.a;
}
`
