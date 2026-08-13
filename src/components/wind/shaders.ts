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
 * desplazando el vértice, sin geometría extra: `u_offset` son píxeles CSS y el
 * shader los convierte a espacio de recorte multiplicando por `w`, para que el
 * desplazamiento sea constante en pantalla.
 *
 * EL DESPLAZAMIENTO VA PERPENDICULAR AL SEGMENTO, Y ESA ES LA DIFERENCIA ENTRE
 * UNA ESTELA Y UNA CRUZ. Hasta el 13 de agosto de 2026 el halo se dibujaba
 * cuatro veces en las cuatro direcciones de la pantalla —arriba, abajo,
 * izquierda, derecha— y el trazo cinco veces en las diagonales. Sobre el mar
 * eso pasa por un engrosamiento, porque la estela mide veinte píxeles y las
 * cuatro copias se solapan casi enteras. Sobre el relieve NO: ahí el fondo es
 * de luminancia media y muy texturado, la polaridad cambia de un píxel al de al
 * lado y de la estela solo sobrevive el halo blanco a trozos —más la prueba de
 * profundidad, que entierra los tramos que quedan bajo la malla del terreno—.
 * Un trozo corto dibujado en las cuatro direcciones es exactamente una CRUZ, y
 * el mapa se llenaba de crucecitas blancas que no se parecían a ningún viento.
 * Con la perpendicular, un trozo corto es un trazo corto en la dirección del
 * viento: lo peor que puede pasar es que la estela se vea entrecortada, que es
 * un defecto de continuidad y no un dibujo de otra cosa.
 *
 * La perpendicular se calcula aquí y no en la CPU porque depende de la
 * PROYECCIÓN: con la cámara inclinada, dos segmentos con el mismo rumbo
 * geográfico salen en pantalla con ángulos distintos según lo lejos que estén.
 * Cada vértice trae el otro extremo de su segmento en `a_other` y el ángulo se
 * mide ya proyectado.
 *
 * QUÉ ES CLARO Y QUÉ ES OSCURO NO SE DECIDE AQUÍ NI EN LA INTERFAZ: SE MIRA.
 * Un halo negro con trazo claro se lee sobre el relieve sombreado y desaparece
 * sobre la carta topográfica de GRAFCAN, que es papel casi blanco. Y no vale
 * decidirlo por fondo de mapa, porque la malla de temperatura pinta encima
 * naranjas de sobra claros (#e0854a, luminancia 0,60) y azules oscuros
 * (#3b4b8c, 0,31) en la misma pantalla, y el mar en el fondo claro es más claro
 * que el papel. `u_background` trae el mapa ya dibujado bajo esta capa, y cada
 * fragmento invierte su tinta según lo que tiene justo detrás.
 *
 * PERO SE MIRA UNA MANCHA, NO UN PÍXEL. Leer el fondo en el píxel exacto
 * funciona sobre el mar y sobre la malla de color, que son lisos, y se rompe
 * sobre el sombreado del relieve, que tiene detalle a escala de dos o tres
 * píxeles y cruza el punto de corte constantemente: la misma estela cambiaba de
 * polaridad a lo largo de sí misma y salía a parches. La decisión se toma ahora
 * sobre el promedio de un entorno de `u_lumaRadius`, y así una estela entera se
 * lleva una sola polaridad.
 */

export const VERTEX_SHADER = `
/**
 * highp y no mediump, que es lo que había. La especificación de GLSL ES
 * 1.00 obliga a que el vértice soporte highp —el fragmento no—, así que no se
 * arriesga nada, y aquí ya no se transforma un punto y se acabó: se restan dos
 * posiciones proyectadas para medir el rumbo del segmento en pantalla. Esa
 * resta es entre dos números casi iguales, que es justo donde diez bits de
 * mantisa se notan: en un segmento de un píxel, el rumbo salía con un tercio de
 * error y el halo se cambiaba de lado solo.
 */
precision highp float;

/**
 * x, y en Mercator normalizado y z en la MISMA unidad: con renderingMode 3d la
 * Z de la matriz de MapLibre es conforme, así que la altura no va en metros
 * sino en fracción de la circunferencia a esa latitud. La cuenta está en
 * lib/wind/altitude.ts, comparada contra la de MapLibre.
 * En el mapa plano z vale cero y esto se comporta como se comportaba.
 */
attribute vec3 a_pos;
/**
 * xyz: el OTRO extremo del segmento, en las mismas unidades. Sirve para saber
 * hacia dónde va la estela una vez proyectada, que es hacia donde NO se
 * desplaza el halo.
 *
 * w: +1 en el primer vértice del segmento y −1 en el segundo, Y NO ES UN
 * ADORNO. Cada vértice mira hacia el contrario, así que los dos calculan la
 * misma perpendicular con el signo cambiado: sin corregirlo, un extremo se iría
 * a un lado y el otro al otro, y en vez de una línea desplazada saldría una
 * línea GIRADA —una aspa, que es justo el dibujo del que se viene huyendo—.
 */
attribute vec4 a_other;
// x: opacidad por posición en la estela, y: velocidad normalizada 0–1,
// z: cuánto de esa lectura la sostienen estaciones reales, 0–1.
attribute vec3 a_style;

uniform mat4 u_matrix;
/** Desplazamiento perpendicular, en píxeles CSS con signo. Cero en la pasada
 *  central del trazo. */
uniform float u_offset;
/** De un píxel CSS a unidades de recorte normalizadas: (2/ancho, 2/alto). */
uniform vec2 u_pxToNdc;

varying float v_alpha;
varying float v_speed;
varying float v_station;

void main() {
  v_alpha = a_style.x;
  v_speed = a_style.y;
  v_station = a_style.z;

  vec4 here = u_matrix * vec4(a_pos, 1.0);
  gl_Position = here;
  if (u_offset == 0.0) return;

  vec4 there = u_matrix * vec4(a_other.xyz, 1.0);
  // Detrás de la cámara la división por w cambia de signo y la perpendicular
  // saldría al revés. Ahí se dibuja sin ensanchar: es un vértice que MapLibre
  // va a recortar de todas formas.
  if (here.w <= 0.0 || there.w <= 0.0) return;

  // La dirección del segmento EN PÍXELES: normalizar en unidades de recorte
  // daría una perpendicular sesgada, porque la ventana no es cuadrada.
  vec2 dir = (there.xy / there.w - here.xy / here.w) / u_pxToNdc;
  float len = length(dir);
  if (len < 0.0001) return;

  vec2 perp = vec2(-dir.y, dir.x) * (a_other.w / len);
  gl_Position.xy += perp * u_offset * u_pxToNdc * here.w;
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
/** Radio con el que se promedia ese fondo, ya en unidades de textura. */
uniform vec2 u_lumaRadius;

// Luminancia perceptual (Rec. 601): el verde pesa cinco veces más que el azul,
// y con la media aritmética un azul saturado pasaría por claro.
const vec3 REC601 = vec3(0.299, 0.587, 0.114);

/**
 * Luminancia media de un entorno del fondo: el centro y ocho muestras en anillo.
 *
 * Nueve lecturas y no una porque lo que se decide con esto —si el trazo va
 * oscuro o claro— tiene que valer para la estela ENTERA, y el sombreado del
 * relieve cambia de claro a oscuro cada dos o tres píxeles. Cuestan poco: esta
 * capa son líneas de dos píxeles de ancho, así que los fragmentos que llegan
 * aquí son una fracción mínima de la pantalla.
 */
float backgroundLuma(vec2 uv) {
  vec2 r = u_lumaRadius;
  // Las diagonales a 0,7 del radio: así las nueve muestras quedan repartidas
  // por el disco en vez de amontonadas en el borde de un cuadrado.
  vec2 d = r * 0.7071;
  float sum = dot(texture2D(u_background, uv).rgb, REC601);
  sum += dot(texture2D(u_background, uv + vec2(r.x, 0.0)).rgb, REC601);
  sum += dot(texture2D(u_background, uv - vec2(r.x, 0.0)).rgb, REC601);
  sum += dot(texture2D(u_background, uv + vec2(0.0, r.y)).rgb, REC601);
  sum += dot(texture2D(u_background, uv - vec2(0.0, r.y)).rgb, REC601);
  sum += dot(texture2D(u_background, uv + d).rgb, REC601);
  sum += dot(texture2D(u_background, uv - d).rgb, REC601);
  sum += dot(texture2D(u_background, uv + vec2(d.x, -d.y)).rgb, REC601);
  sum += dot(texture2D(u_background, uv + vec2(-d.x, d.y)).rgb, REC601);
  return sum / 9.0;
}

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
  float lum = backgroundLuma(gl_FragCoord.xy / u_resolution);
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
  // El halo pesa menos que el trazo: unas pasadas de contraste a plena opacidad
  // taparían el mapa que hay debajo, que es el que sitúa el viento.
  //
  // 0,55 y no el 0,32 de cuando el desplazamiento iba en cruz: entonces el halo
  // eran cuatro pasadas de las que dos caían sobre el mismo píxel —las que
  // desplazaban A LO LARGO de la estela no la ensanchaban— y el contraste que
  // se veía era el de las dos sumadas. Ahora cada pasada cae en su lado y no se
  // suma con nadie, así que para que el contorno se vea igual de firme cada una
  // tiene que traer lo que antes traían dos.
  float alpha = v_alpha * provenance * u_opacity * mix(0.6, 0.55, u_casing);
  gl_FragColor = vec4(color, alpha);
  gl_FragColor.rgb *= gl_FragColor.a;
}
`
