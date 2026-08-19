/**
 * La luna: un disco con su fase de verdad.
 *
 * NO ES UNA TEXTURA NI UN SPRITE. La fase se calcula por píxel, y la razón es
 * que un sprite obliga a elegir entre tener 28 imágenes de luna —una por día del
 * mes, todas mal orientadas— o girar una sola, que es peor: la línea del
 * terminador NO es un diámetro girado, es media elipse cuyo eje menor vale
 * `cos α`. Con un sprite girado, la luna de cuarto sale bien y todas las demás
 * salen con el cuerno demasiado gordo o demasiado fino. Aquí sale la curva
 * exacta y ocupa cuatro líneas.
 *
 * LA CUENTA. En coordenadas del disco —`p`, con el borde en |p| = 1— la
 * componente hacia el observador es `z = √(1 − |p|²)`, que es la esfera. Con el
 * eje x apuntando al sol y el ángulo de fase α, la dirección del sol es
 * `(sen α, 0, cos α)` y el coseno de incidencia en cada punto es
 * `μ₀ = x·sen α + z·cos α`. Lo iluminado es `μ₀ > 0`, y esa condición dibuja
 * ella sola la media elipse: no hay ninguna fórmula del terminador escrita
 * aparte que se pueda desincronizar de la iluminación.
 *
 * EL SOMBREADO ES LOMMEL-SEELIGER Y NO LAMBERT, y ésta es la diferencia entre
 * una luna y una bola de billar. Con Lambert —el coseno a secas— el disco sale
 * brillante en el centro y apagado en los bordes: una esfera iluminada. La luna
 * llena de verdad se ve PLANA, como un disco recortado, y por eso en las fotos
 * parece una moneda. La razón es que su superficie es polvo retrorreflectante:
 * `I ∝ μ₀ / (μ₀ + μ)`, que con el sol detrás del observador vale 0,5 en todo el
 * disco, borde incluido. Ese medio, normalizado, es el disco plano que se ve.
 *
 * LA PARTE OSCURA ES OPACA, no transparente. La luna tapa lo que tiene detrás,
 * y de noche eso significa que muerde el campo de estrellas: es correcto y es lo
 * que hace una ocultación lunar. De día se vuelve transparente, y ésa sí es la
 * única concesión de este fichero: la parte no iluminada de una luna diurna no
 * se ve, y dibujarla como un mordisco azul oscuro en el cielo habría sido
 * dibujar algo que nadie ha visto nunca.
 *
 * LA MEZCLA es la premultiplicada del resto de la aplicación —`ONE,
 * ONE_MINUS_SRC_ALPHA`— y no la aditiva de las estrellas. Una estrella suma luz
 * a un cielo que se sigue viendo detrás; la luna es un cuerpo sólido que lo
 * tapa. Con mezcla aditiva, la luna sobre el resplandor de Los Llanos salía
 * verdosa.
 */

export const MOON_VERTEX_SHADER = `
attribute vec2 a_quad;

// Dónde cae la luna en pantalla, coordenadas normalizadas [-1,1].
uniform vec2 u_center;
// Medio lado del cuadrilátero, con la x ya dividida por la relación de aspecto
// para que el disco salga redondo y no ovalado.
uniform vec2 u_radius;

varying vec2 v_offset;

void main() {
  v_offset = a_quad;
  // Profundidad 1, el fondo del búfer: con LEQUAL, el relieve la tapa por estar
  // delante. Es la misma solución que el disco del sol y las estrellas, y no
  // hay ningún cálculo de oclusión que pueda desincronizarse de lo que se ve.
  gl_Position = vec4(u_center + a_quad * u_radius, 1.0, 1.0);
}
`

export const MOON_FRAGMENT_SHADER = `
precision highp float;

// Color del disco iluminado, ya enrojecido por el aire que tiene delante.
uniform vec3 u_color;
// Luminancia del lado iluminado y de la parte que alumbra la Tierra.
uniform float u_luminance;
uniform float u_earthshine;
// Qué fracción del cuadrilátero ocupa el disco. El resto es la aureola.
uniform float u_disc;
// Dirección del cuerno brillante en el espacio del cuadrilátero, unitaria.
uniform vec2 u_limb;
// Ángulo de fase: 0 es llena, 180 es nueva. Llegan ya el seno y el coseno.
uniform float u_cosPhase;
uniform float u_sinPhase;
// 0 de noche cerrada, 1 con el sol alto.
uniform float u_dayness;
// Medio píxel en unidades del cuadrilátero, para el borde.
uniform float u_soft;

varying vec2 v_offset;

void main() {
  float q = length(v_offset);
  if (q > 1.0) discard;

  // LA AUREOLA es el halo del propio disco en el aire de delante. Cae rápido y
  // solo existe de noche: de día no se distingue de un cielo claro. Es mucho
  // más discreta que la del sol —0,10 contra 0,35— porque la luna es cien mil
  // veces más débil y un halo lunar marcado es cosa de cirros, no de aire.
  float glow = pow(max(0.0, 1.0 - q), 4.0) * 0.10 * (1.0 - u_dayness) * u_luminance;

  vec2 p = v_offset / u_disc;
  float rr = length(p);
  float w = u_soft / u_disc;
  float inside = 1.0 - smoothstep(1.0 - w, 1.0 + w, rr);

  if (inside <= 0.0) {
    if (glow < 0.002) discard;
    // Fuera del disco solo hay aureola: alfa cero, o sea suma pura.
    gl_FragColor = vec4(u_color * glow, 0.0);
    return;
  }

  // La esfera. z es la componente hacia quien mira.
  float z = sqrt(max(0.0, 1.0 - rr * rr));
  // Coseno de incidencia del sol en este punto del suelo lunar.
  float mu0 = dot(p, u_limb) * u_sinPhase + z * u_cosPhase;

  // El terminador con un poco de anchura: la de verdad la tiene, porque es una
  // franja de sombras largas sobre un relieve, no una línea.
  float lit = smoothstep(-0.03, 0.03, mu0);

  // Lommel-Seeliger, normalizado a 1 en el centro de la luna llena.
  float shade = max(0.0, mu0) / max(1e-3, max(0.0, mu0) + z);
  float surface = clamp(shade * 2.0, 0.0, 1.0);

  // LA CENIZA ES MÁS AZUL QUE LA LUNA, y no por gusto: la luz que la ilumina ha
  // rebotado en los océanos y en la atmósfera de la Tierra antes de llegar allí.
  // Va multiplicada por el color del disco para que el aire de aquí se la
  // enrojezca igual que al resto: una luna baja tiene la ceniza tan naranja
  // como el cuerno.
  vec3 ash = u_color * vec3(0.78, 0.88, 1.05) * u_earthshine;
  vec3 rgb = mix(ash, u_color * u_luminance * surface, lit);

  // La cara oscura tapa de noche y desaparece de día. Ver la cabecera.
  float alpha = inside * mix(mix(1.0, 0.0, u_dayness), 1.0, lit);

  gl_FragColor = vec4(rgb * alpha + u_color * glow, alpha);
}
`
