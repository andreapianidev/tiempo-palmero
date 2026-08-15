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
 * LO QUE LA NUBE SE TAPA A SÍ MISMA. Es el otro cincuenta por ciento del efecto
 * y no es un adorno: una nube es ópticamente espesa, así que a la parte que
 * queda detrás no le llega la luz que la de delante ya se ha llevado. Sin esto,
 * una nube iluminada por igual por todos lados se lee como una bola de algodón
 * flotando.
 *
 * Y NO ES SIEMPRE LA PANZA. Aquí había una rampa con la altura —base oscura,
 * cima encendida— que es lo que se ve con el sol en lo alto y falso el resto del
 * día: con el sol rasante lo oscuro de una nube es el lado contrario al sol. Lo
 * que llega ahora en `v_shade` es el barrido de verdad, de cada mota hacia el
 * sol a través de las demás de su nube (`lib/sky/selfshade.ts`).
 */

export const VERTEX_SHADER = `
attribute vec3 a_pos;
// radio en metros, opacidad, luz que le llega a la mota, semilla
attribute vec4 a_shape;

uniform mat4 u_matrix;
uniform float u_pixelRatio;
// Píxeles que mide un metro de terreno en el centro del mapa.
uniform float u_pxPerMeter;
// La w del centro del mapa. Es la referencia de la perspectiva.
uniform float u_refW;
// Dónde está el ojo, en Mercator, y cuántos metros mide una unidad Mercator.
uniform vec3 u_camera;
uniform float u_metersPerMerc;
// Extinción del aire, por metro. Ver lib/sky/haze.ts.
uniform float u_extinction;

varying float v_alpha;
varying float v_shade;
varying float v_seed;
varying float v_haze;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);

  // EL AIRE QUE HAY DELANTE. La bruma de MapLibre solo llega a las capas que
  // drapea sobre el terreno, así que esta capa se la aplica ella misma, con la
  // misma ley y hacia el mismo color: sin esto, una nube a 40 km se dibuja tan
  // nítida como la que está encima de la cabeza y la escena se lee plana.
  //
  // La distancia se mide en Mercator y se pasa a metros con la escala de la
  // latitud del centro, que es la misma conversión que usa el mar.
  float dist = distance(a_pos, u_camera) * u_metersPerMerc;
  v_haze = 1.0 - exp(-u_extinction * dist);

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
// El color al que se desvanece la distancia: el del horizonte, el mismo al que
// se desvanece el relieve.
uniform vec3 u_hazeColor;
// La luz que hay de noche —la que ilumina lo que no ve el sol—, calculada por
// ocean/light.ts con la hora y la luna de verdad.
uniform vec3 u_night;

varying float v_alpha;
// Cuánta luz le llega a esta mota después de atravesar su propia nube: 1 si el
// sol la ve sin nada delante, y hacia el suelo de dispersión múltiple según lo
// enterrada que esté. Viene resuelto de la CPU —lib/sky/selfshade.ts— porque
// es un barrido de cada mota contra todas las de su nube, cuesta n² y solo
// cambia cuando se mueve el sol; recalcularlo aquí sería hacerlo por píxel y
// por fotograma. Viaja con el vértice y no como uniform porque todas las nubes
// se dibujan en una sola llamada.
varying float v_shade;
varying float v_seed;
// Cuánto aire hay entre esta mota y el ojo, de 0 a 1.
varying float v_haze;

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

  // De noche la nube no desaparece: se apaga y sigue tapando las estrellas, que
  // es lo que hace una nube de noche. Apagarla del todo dejaría la escena
  // mintiendo —cielo raso— justo la mitad de las horas.
  //
  // El color de esa noche ya no es una constante: es la luz ambiente que
  // ocean/light.ts calcula con la hora y la luna, la misma que ilumina el
  // agua. Con luna llena alta una nube nocturna se ve; sin luna, apenas.
  vec3 night = u_night * (0.55 + 0.45 * v_shade);
  c = mix(night, c, u_day);

  float r = sqrt(r2);

  // EL RIBETE DE PLATA. Cuando el sol está DETRÁS de la nube respecto a quien
  // mira, sus bordes se encienden: la luz atraviesa la parte delgada de la masa
  // y sale dispersada hacia adelante. Es el mismo fenómeno por el que una hoja a
  // contraluz brilla por el canto, y es de las cosas más reconocibles de una
  // nube de verdad — de las que se echan en falta sin saber decir qué falta.
  //
  // u_sunDir.z es la componente hacia el observador: negativa quiere decir que
  // el sol está al otro lado. Y el ribete solo existe donde la masa es delgada,
  // o sea en el borde del impostor, que es lo que pone el smoothstep del radio.
  float backlit = max(0.0, -u_sunDir.z);
  c += vec3(1.0, 0.97, 0.90) * backlit * smoothstep(0.35, 1.0, r) * 0.8 * u_day;

  // Y por último el aire que hay hasta aquí. Va DESPUÉS del ribete y de la
  // noche porque la bruma se suma a lo que salga: es lo último que le pasa a la
  // luz antes de llegar al ojo, y lo que hace que dos nubes iguales a distinta
  // distancia se distingan.
  c = mix(c, u_hazeColor, v_haze);

  // El borde se deshace. Dónde empieza a deshacerse es el único mando que hay
  // entre dos defectos opuestos, y los dos se han visto:
  //
  //   - al 45 %, con el núcleo macizo hasta casi la mitad, cada mota se lee como
  //     una BOLA y la nube sale como un puñado de bolas contables;
  //   - al 25 % se funden bien pero la masa pierde el contorno y queda como un
  //     algodón deshilachado, más niebla suspendida que cúmulo.
  //
  // 0,35 es donde se ven los lóbulos sin ver las bolas.
  float edge = 1.0 - smoothstep(0.35, 1.0, r);
  // Un pelo de variación por mota, para que dos motas superpuestas no den
  // exactamente el mismo tono y la masa no se vea plana.
  float a = edge * v_alpha * (0.92 + 0.16 * v_seed);
  if (a < 0.004) discard;

  // Alfa premultiplicado, que es lo que espera el compositor de MapLibre.
  gl_FragColor = vec4(c * a, a);
}
`
