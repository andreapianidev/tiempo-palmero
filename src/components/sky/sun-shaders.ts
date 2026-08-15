/**
 * El sol: un disco y su aureola.
 *
 * SE DIBUJA EN EL FONDO DE LA ESCENA, literalmente: el cuadrilátero va a
 * profundidad 1, el fondo del búfer, así que CUALQUIER cosa que se haya
 * dibujado con profundidad —el relieve, y las nubes que la escriben— lo tapa. No
 * hace falta ningún cálculo de oclusión: el sol se esconde detrás de la Cumbre
 * porque la Cumbre está delante, igual que en la realidad.
 *
 * NO ES UN PUNTO EN EL MAPA. El sol está a 150 millones de kilómetros: no tiene
 * posición sobre la isla, tiene DIRECCIÓN. Su sitio en pantalla es el punto de
 * fuga de esa dirección, que sale de multiplicar el vector por la matriz de
 * vista con la componente w a cero. Eso es exacto, no una aproximación: es lo
 * mismo que ya se hace con la luz de las nubes, un paso más allá.
 *
 * EL DISCO TAPA Y LA AUREOLA SUMA, y son dos cosas distintas a propósito. El
 * disco solar es del orden de cien mil veces más brillante que el cielo que
 * tiene al lado: no se suma a él, lo borra —por eso una foto del sol sale
 * quemada—. La aureola sí es luz añadida al aire que hay alrededor.
 *
 * Se hace con la mezcla premultiplicada de siempre —`ONE, ONE_MINUS_SRC_ALPHA`,
 * la que usa el resto de la aplicación— poniendo el alfa a 1 dentro del disco y
 * a 0 fuera: dentro, el cielo se va y queda el sol; fuera, lo que se escribe se
 * suma. Con la mezcla aditiva a secas, el disco salía blanco azulado a 9° de
 * altura —el naranja se mezclaba con el azul del cielo que seguía debajo— que es
 * justo lo que no hace un sol poniente.
 */

export const SUN_VERTEX_SHADER = `
attribute vec2 a_quad;

// Dónde cae el sol en pantalla, en coordenadas normalizadas [-1,1].
uniform vec2 u_center;
// Radio del cuadrilátero: el del disco, ya con sitio para la aureola.
uniform vec2 u_radius;

varying vec2 v_offset;

void main() {
  v_offset = a_quad;
  // Profundidad 1: el fondo de la escena. Con LEQUAL, todo lo que tenga
  // profundidad escrita gana.
  gl_Position = vec4(u_center + a_quad * u_radius, 1.0, 1.0);
}
`

export const SUN_FRAGMENT_SHADER = `
precision mediump float;

// Color del sol a esta altura: blanco arriba, naranja rozando el horizonte. Sale
// del mismo modelo que pinta el reflejo sobre el agua.
uniform vec3 u_color;
// Cuánta luz llega de verdad: la transmitancia del haz directo a través de la
// atmósfera que tiene delante. A 2° de altura queda menos de la mitad.
uniform float u_intensity;
// Qué fracción del cuadrilátero ocupa el disco. El resto es aureola.
uniform float u_disc;

varying vec2 v_offset;

void main() {
  float r = length(v_offset);
  if (r > 1.0) discard;

  // EL DISCO tiene borde, y el borde es de un píxel: el sol no está difuminado,
  // está recortado. Difuminarlo lo convierte en una mancha de luz cualquiera.
  float disc = 1.0 - smoothstep(u_disc * 0.85, u_disc, r);

  // LA AUREOLA es la luz del propio sol dispersada por el aire que hay entre él
  // y quien mira. Cae muy rápido —una potencia alta— porque si no se lee como un
  // halo pintado en vez de como resplandor. Ésta SÍ se apaga con la masa de aire
  // que el rayo atraviesa: es la parte que un sol bajo pierde.
  float glow = pow(max(0.0, 1.0 - r), 3.0) * 0.35 * u_intensity;

  if (disc + glow < 0.002) discard;

  // El disco NO se atenúa con la masa de aire: lo que la atmósfera le hace a un
  // sol bajo es enrojecerlo, y eso ya viene en u_color. Atenuar además el
  // disco lo dejaría más oscuro que el cielo que tiene detrás, que es lo
  // contrario de un sol.
  gl_FragColor = vec4(u_color * (disc + glow), disc);
}
`
