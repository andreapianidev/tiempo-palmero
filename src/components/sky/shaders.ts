/**
 * Los dos shaders de las nubes.
 *
 * SE DIBUJA CON `gl.POINTS`, como el vapor, y por lo mismo: una mota de nube es
 * un volumen redondo y un cuadrilátero por mota sería cuatro veces los vértices
 * para pintar exactamente lo mismo. La diferencia con el vapor está en el
 * fragmento: allí una mota es un disco que se desvanece, aquí es una **esfera
 * iluminada**.
 *
 * EL TRUCO DEL IMPOSTOR, que es lo que hace que esto parezca volumen y no
 * confeti. A cada punto se le inventa la normal de una esfera a partir de la
 * coordenada dentro del propio punto: en el centro la normal apunta hacia la
 * cámara, en el borde apunta hacia afuera. Con esa normal se ilumina como se
 * iluminaría una esfera de verdad, y como el punto siempre mira a la cámara, el
 * resultado es indistinguible de una esfera desde cualquier ángulo. Miles de
 * esferas solapadas leen como una masa con relieve — que es lo que es una nube.
 *
 * LA LUZ NO ESTÁ FALSEADA. `u_sunDir` llega ya en la base de la cámara —derecha
 * de la pantalla, arriba de la pantalla, hacia el observador— y esa conversión
 * la hace la capa con el rumbo y la inclinación reales del mapa a partir de la
 * posición astronómica del sol. Una luz direccional está en el infinito, así que
 * proyectarla a la base de la cámara es exacto, no una aproximación: cuando el
 * sol está bajo por el oeste, las nubes se encienden por su cara oeste y se
 * ensombrecen por la este, en la pantalla, gire el mapa como gire.
 *
 * LA BASE VA OSCURA. Es el otro cincuenta por ciento del efecto y no es un
 * adorno: una nube es ópticamente espesa, así que a su parte de abajo no le
 * llega la luz que ya se ha dispersado arriba. Sin esto, una nube iluminada por
 * igual arriba y abajo se lee como una bola de algodón flotando; con esto, se
 * lee como una nube vista desde debajo, que es desde donde se las ve.
 */

export const VERTEX_SHADER = `
attribute vec3 a_pos;
// radio en metros, opacidad, sombreado vertical (0 base oscura, 1 cima), semilla
attribute vec4 a_shape;

uniform mat4 u_matrix;
uniform float u_pixelRatio;
// Píxeles que mide un metro de terreno en el centro del mapa.
uniform float u_pxPerMeter;
// La w del centro del mapa. Es la referencia de la perspectiva.
uniform float u_refW;

varying float v_alpha;
varying float v_shade;
varying float v_seed;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);

  // Proporción de profundidad respecto al centro: 1 en el centro, mayor delante
  // y menor detrás. Mismo criterio que la capa de vapor, y por el mismo motivo:
  // el tamaño queda atado a una longitud real en metros y la perspectiva entra
  // solo como proporción, sin depender de en qué unidades esté la w de MapLibre.
  float depth = clamp(u_refW / max(gl_Position.w, 0.0001), 0.05, 8.0);

  // El diámetro, que es el doble del radio. El tope de 380 px no es estético:
  // WebGL 1 solo garantiza 64 px de gl_PointSize y las tarjetas reales dan
  // entre 255 y 1024. Pasado ese tope el punto se recorta de golpe, así que se
  // corta antes y a un valor que ninguna implementación en uso rechaza. La
  // consecuencia es que a zoom muy alto —dentro de una nube— las motas dejan de
  // crecer; la escena está pensada para ver la isla, no para meterse en ella.
  gl_PointSize = clamp(2.0 * a_shape.x * u_pxPerMeter * depth * u_pixelRatio, 2.0, 380.0);

  v_alpha = a_shape.y;
  v_shade = a_shape.z;
  v_seed = a_shape.w;
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

// Dirección del sol en la base de la cámara: x a la derecha de la pantalla,
// y hacia arriba, z hacia el observador.
uniform vec3 u_sunDir;
// 1 de día, 0 de noche cerrada, con el crepúsculo por el medio.
uniform float u_day;

varying float v_alpha;
// Cuánta luz le llega a esta mota por estar donde está dentro de su nube: 0 en
// la base, 1 en la cima. Viene resuelto de la CPU y no calculado aquí porque
// **cuánto** oscurece la base depende de la nube —la que llueve es más espesa y
// más negra por debajo— y todas las nubes se dibujan en una sola llamada, así
// que no puede ser un uniform: tiene que viajar con cada vértice.
varying float v_shade;
varying float v_seed;

void main() {
  // Coordenada dentro del punto, centrada, con la y hacia arriba como en
  // pantalla. gl_PointCoord la da con la y hacia abajo.
  vec2 d = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;

  // La normal de la esfera que el punto finge ser.
  vec3 n = vec3(d, sqrt(1.0 - r2));

  // Iluminación difusa, envuelta: en vez de cortar en cero, se remapea de
  // [-1,1] a [0,1]. Es el modelo «wrapped diffuse», y aquí no es un atajo — una
  // nube dispersa la luz por dentro, así que su lado en sombra no es negro sino
  // considerablemente más claro de lo que sería una esfera opaca.
  float lambert = dot(n, u_sunDir) * 0.5 + 0.5;
  lambert = pow(lambert, 1.4);

  vec3 lit = vec3(1.0, 0.985, 0.955);
  // El lado en sombra de una nube no es gris oscuro. Una nube dispersa la luz
  // muchísimas veces por dentro, así que su cara opuesta al sol sigue estando
  // clara: mirando un cúmulo de buen tiempo, la diferencia entre su cara
  // iluminada y la que no lo está es mucho menor de lo que sugiere la
  // intuición de esfera opaca. Con 0,46 salían nubes de plomo un día de sol.
  vec3 shadow = vec3(0.60, 0.65, 0.74);
  vec3 c = mix(shadow, lit, lambert) * v_shade;

  // De noche la nube no desaparece: se apaga a un gris azulado y sigue tapando
  // las estrellas, que es lo que hace una nube de noche. Apagarla del todo
  // dejaría la escena mintiendo —cielo raso— justo la mitad de las horas.
  vec3 night = vec3(0.13, 0.16, 0.24) * (0.55 + 0.45 * v_shade);
  c = mix(night, c, u_day);

  // El borde se deshace y el centro es macizo. smoothstep invertido: opaco
  // hasta el 45 % del radio y desvanecido de ahí al borde. Un borde duro
  // convierte la masa en un montón de bolas contables.
  float r = sqrt(r2);
  float edge = 1.0 - smoothstep(0.45, 1.0, r);
  // Un pelo de variación por mota, para que dos motas superpuestas no den
  // exactamente el mismo tono y la masa no se vea plana.
  float a = edge * v_alpha * (0.92 + 0.16 * v_seed);
  if (a < 0.004) discard;

  // Alfa premultiplicado, que es lo que espera el compositor de MapLibre.
  gl_FragColor = vec4(c * a, a);
}
`
