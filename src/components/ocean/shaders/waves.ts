/**
 * La física del oleaje, en GLSL.
 *
 * ES EL GEMELO DE `lib/ocean/sea-state.ts`. Las mismas fórmulas, con los mismos
 * nombres, porque la GPU no puede llamar a TypeScript y el panel no puede
 * llamar a la GPU. Lo que sí se puede —y se hace— es que las dos versiones
 * salgan de las mismas constantes: los números que hay más abajo NO están
 * escritos a mano, se interpolan desde los módulos de `lib/ocean/`, así que el
 * día que se corrija un umbral se corrige en los dos sitios o no compila.
 *
 * Si algo de aquí cambia de fórmula, `sea-state.test.ts` es el que dice cuál es
 * la respuesta correcta.
 */

import { BREAKING_INDEX, G, MAX_STEEPNESS } from '../../../lib/ocean/sea-state'
import { MAX_WAVE_HEIGHT_M, MAX_WAVE_PERIOD_S, MAX_WIND_MS } from '../../../lib/ocean/field'
import { SHORE_MAX_ELEVATION_M, SHORE_MAX_M } from '../../../lib/ocean/shoreline'
import { DETAIL_MAX_SLOPE } from '../../../lib/ocean/detail'

/** Declaraciones que comparten el vértice y el fragmento. Un solo sitio. */
export const UNIFORMS = /* glsl */ `
uniform mat4 u_matrix;
uniform mat4 u_invMatrix;
uniform float u_time;
uniform float u_seaLevel;
uniform float u_metersPerMerc;
uniform float u_maxRange;
uniform vec3 u_camera;

uniform vec4 u_fieldBox;
uniform vec4 u_bathyBox;
uniform vec4 u_shoreBox;
uniform float u_maxDepth;

uniform sampler2D u_swellTex;
uniform sampler2D u_windSeaTex;
uniform sampler2D u_windTex;
uniform sampler2D u_bathyTex;
uniform sampler2D u_shoreTex;

uniform float u_geomScale;

/**
 * Lo que hay que ganarle al terreno en el búfer de profundidad, en NDC.
 *
 * Son \`BIAS_STEPS\` escalones del búfer que tenga esta GPU, y por eso viene de
 * fuera: 1,2e-7 con 24 bits y 3,1e-5 con 16. Ver \`lib/ocean/depth.ts\`.
 */
uniform float u_depthSlack;
`

export const CONSTANTS = /* glsl */ `
const float PI = 3.14159265;
const float TAU = 6.28318531;
const float G = ${G.toFixed(4)};
const float BREAKING_INDEX = ${BREAKING_INDEX.toFixed(4)};
const float MAX_STEEPNESS = ${MAX_STEEPNESS.toFixed(6)};
const float MAX_WAVE_HEIGHT_M = ${MAX_WAVE_HEIGHT_M.toFixed(1)};
const float MAX_WAVE_PERIOD_S = ${MAX_WAVE_PERIOD_S.toFixed(1)};
const float MAX_WIND_MS = ${MAX_WIND_MS.toFixed(1)};
const float SHORE_MAX_M = ${SHORE_MAX_M.toFixed(1)};
const float SHORE_MAX_ELEVATION_M = ${SHORE_MAX_ELEVATION_M.toFixed(1)};
const float DETAIL_MAX_SLOPE = ${DETAIL_MAX_SLOPE.toFixed(3)};
`

/**
 * Lectura de los campos y funciones de onda.
 *
 * GLSL ES 1.00 —que es lo que hay que escribir para que esto funcione también
 * en un contexto WebGL 1— no trae funciones hiperbólicas. Van a mano: no son
 * ninguna proeza, pero su ausencia es la clase de detalle que hace que un
 * sombreador compile en un navegador y no en otro.
 */
export const WAVE_FUNCTIONS = /* glsl */ `
float sinh_(float x) { return 0.5 * (exp(x) - exp(-x)); }
float tanh_(float x) { float e = exp(-2.0 * min(x, 12.0)); return (1.0 - e) / (1.0 + e); }

vec2 boxUv(vec4 box, vec2 p) {
  return clamp((p - box.xy) / box.zw, vec2(0.0005), vec2(0.9995));
}

bool inBox(vec4 box, vec2 p) {
  vec2 uv = (p - box.xy) / box.zw;
  return uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
}

/** Profundidad en metros. Fuera del recuadro con batimetría, mar abierto. */
float depthAt(vec2 p) {
  if (!inBox(u_bathyBox, p)) return u_maxDepth;
  float e = texture2D(u_bathyTex, boxUv(u_bathyBox, p)).r;
  return e * e * u_maxDepth;
}

/**
 * Orilla: (distancia con signo en m, cota del terreno en m, normal este,
 * normal norte). Lejos de la isla no hay costa que valga.
 */
vec4 shoreAt(vec2 p) {
  if (!inBox(u_shoreBox, p)) return vec4(SHORE_MAX_M, 0.0, 0.0, 0.0);
  vec4 t = texture2D(u_shoreTex, boxUv(u_shoreBox, p));
  float s = (t.r - 0.5) * 2.0;
  return vec4(
    sign(s) * s * s * SHORE_MAX_M,
    t.g * SHORE_MAX_ELEVATION_M,
    (t.b - 0.5) * 2.0,
    (t.a - 0.5) * 2.0
  );
}

/** Un tren de olas: (dirección de avance x, y, altura en m, período en s). */
vec4 trainAt(sampler2D tex, vec2 p) {
  vec4 t = texture2D(tex, boxUv(u_fieldBox, p));
  return vec4((t.xy - 0.5) * 2.0, t.z * MAX_WAVE_HEIGHT_M, t.w * MAX_WAVE_PERIOD_S);
}

/** Viento a 10 m sobre el agua, en m/s. */
vec2 windAt(vec2 p) {
  vec2 w = texture2D(u_windTex, boxUv(u_fieldBox, p)).xy;
  return (w - 0.5) * 2.0 * MAX_WIND_MS;
}

/**
 * k·d resolviendo la dispersión. Aproximación explícita de Guo (2002); ver
 * \`sea-state.ts\`, donde está medida contra los dos casos exactos.
 */
float waveNumberDepth(float T, float d) {
  float omega = TAU / max(0.1, T);
  d = max(0.05, d);
  float x = omega * sqrt(d / G);
  return x * x * pow(1.0 - exp(-pow(x, 2.4908)), -0.4015);
}

/** Coeficiente de asomeramiento: cuánto crece la ola al pisar el bajío. */
float shoaling(float T, float d) {
  float kd = waveNumberDepth(T, d);
  if (kd > 10.0) return 1.0;
  float n = 0.5 * (1.0 + 2.0 * kd / sinh_(2.0 * kd));
  float c = G * tanh_(kd) / (TAU / T);
  return sqrt((G * T / (4.0 * PI)) / (n * c));
}

/**
 * Un tren de olas de Gerstner, sumado al desplazamiento y a la normal.
 *
 * Gerstner y no una simple sinusoide porque una ola de verdad no sube y baja:
 * también empuja hacia delante. Ese desplazamiento horizontal —el término de
 * \`steep\`— es lo que apunta las crestas y ensancha los senos, y es la razón
 * por la que un mar de Gerstner se ve como agua y uno de senos se ve como una
 * sábana ondulando.
 *
 * \`crest\` sale de vuelta con la fase: +1 en la cresta, −1 en el seno. Lo usa
 * la espuma, que solo existe arriba.
 */
void addWave(
  vec2 dir, float k, float amp, float steep, float omega, vec2 posM, float t,
  inout vec3 disp, inout vec3 nrm, inout float crest, inout float ampSum
) {
  float phase = k * dot(dir, posM) - omega * t;
  float s = sin(phase);
  float c = cos(phase);
  disp.xy += dir * (steep * amp * c);
  disp.z += amp * s;
  float wa = k * amp;
  nrm.xy -= dir * (wa * c);
  nrm.z -= steep * wa * s;
  crest += amp * s;
  ampSum += amp;
}

/**
 * El tren completo, con asomeramiento, rotura, refracción y dos componentes.
 *
 * DOS COMPONENTES y no uno porque un solo Gerstner es una sinusoide perfecta y
 * el ojo la caza enseguida: se ve una tela corrugada. Con dos, separados 11° y
 * con longitudes distintas, aparece el batido largo que tiene el mar de verdad.
 * Tres ya no se distingue de dos y cuesta otro seno por vértice.
 *
 * \`amount\` devuelve, por referencia, cuánta rotura hay aquí: 0 mar adentro y
 * 1 donde la ola ya no se sostiene. Es lo que dibuja la línea de rompiente.
 */
void addTrain(
  vec4 train, vec2 posM, float depth, vec2 shoreNormal, float t, float scale,
  inout vec3 disp, inout vec3 nrm, inout float crest, inout float ampSum,
  inout float breaking
) {
  float H = train.z;
  if (H < 0.02) return;
  float T = max(1.0, train.w);
  float kd = waveNumberDepth(T, depth);
  float k = kd / max(0.05, depth);
  float L = TAU / k;

  // Asomeramiento y rotura: la ola crece al pisar el bajío y no puede superar
  // 0,78 veces la profundidad. Por encima de eso, rompe.
  float shoaled = H * shoaling(T, depth);
  float limit = BREAKING_INDEX * depth;
  // La espuma no empieza en la rotura exacta: la ola ya viene peraltada y
  // rompiendo por trozos desde bastante antes. 0,55 es donde se abre la franja
  // de rompiente, y 1,0 donde ya es toda blanca.
  breaking = max(breaking, smoothstep(0.55, 1.0, shoaled / max(0.15, limit)));
  H = min(shoaled, limit);
  // Y tampoco puede pasar del límite de Stokes: una ola más alta que un
  // séptimo de su longitud rompe sola, sin fondo ninguno.
  H = min(H, L * MAX_STEEPNESS);

  // Refracción: en el bajío la ola gira hasta entrar de frente a la costa. Es
  // por lo que las olas llegan paralelas a la playa aunque vengan de través.
  //
  // La dirección se normaliza aquí y no se da por unitaria: mientras dura la
  // transición entre dos estados del mar, el campo interpola las dos
  // componentes por separado y el vector se acorta. Sin esta normalización, la
  // longitud de onda encogería durante esos dos segundos.
  vec2 dir = normalize(train.xy + vec2(1e-6, 0.0));
  float turn = clamp(depth / 45.0, 0.0, 1.0);
  if (dot(shoreNormal, shoreNormal) > 0.01) {
    dir = normalize(mix(-normalize(shoreNormal), dir, turn) + vec2(1e-6, 0.0));
  }

  float amp = 0.5 * H * scale;
  float omega = TAU / T;
  // El peralte de Gerstner. Q·k·A = 1 es el punto exacto en el que la cresta se
  // dobla sobre sí misma y la superficie se cruza consigo misma; con dos
  // componentes, el límite se reparte entre los dos. Mientras la ola sea suave
  // (k·A pequeño) vale 1 —el empuje horizontal completo— y solo se recorta en
  // las olas que ya están al borde de romper.
  float steep = min(1.0, 1.0 / max(1e-4, k * amp * 2.0));

  float a1 = cos(0.19), b1 = sin(0.19);
  vec2 d1 = vec2(dir.x * a1 - dir.y * b1, dir.x * b1 + dir.y * a1);
  vec2 d2 = vec2(dir.x * a1 + dir.y * b1, -dir.x * b1 + dir.y * a1);

  addWave(d1, k, amp * 0.62, steep, omega, posM, t, disp, nrm, crest, ampSum);
  addWave(d2, k * 1.31, amp * 0.38, steep, omega * 1.14, posM, t, disp, nrm, crest, ampSum);
}
`
