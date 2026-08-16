/**
 * Sombreador de vértices del océano.
 *
 * Hace dos cosas, en este orden:
 *
 *  1. DESPROYECTA. Cada vértice llega como un punto fijo de la PANTALLA. Se
 *     lanza el rayo que pasa por él y se corta con el plano del agua —que no
 *     está en cero, sino en la marea del momento—. Ahí es donde nace el nivel
 *     de detalle automático: un cuadro de la rejilla mide siempre lo mismo en
 *     píxeles, así que sobre el agua mide metros cerca y kilómetros lejos.
 *
 *  2. LEVANTA LA OLA. Con la posición ya en el mundo se leen la batimetría, la
 *     costa y los dos trenes de olas, y se desplaza el vértice.
 *
 * EL DESPLAZAMIENTO SE APAGA AL ALEJARSE (`u_geomScale`), y no por ahorrar: a
 * poco zoom una ola de 47 m mide un píxel y medio, así que moverla no la hace
 * visible —la convierte en ruido que centellea al arrastrar el mapa—. De lejos,
 * el mar se mueve con la luz; de cerca, con la geometría. Es exactamente lo que
 * hace la vista humana con el mar de verdad.
 */

import { BIAS_M, MAX_LEAK_M } from '../../../lib/ocean/depth'
import { CONSTANTS, UNIFORMS, WAVE_FUNCTIONS } from './waves'

export const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec2 a_ndc;

${UNIFORMS}
${CONSTANTS}

// Los del sesgo de profundidad. Salen de \`lib/ocean/depth.ts\`, que es donde se
// miden. \`u_depthSlack\` —los escalones del búfer que hay que ganar— viene de
// allí también, pero por uniforme: depende de la GPU, no del código.
const float BIAS_M = ${BIAS_M.toFixed(2)};
const float MAX_LEAK_M = ${MAX_LEAK_M.toFixed(2)};

/**
 * Cuánto se aparta la sonda del sesgo, en fracción de la distancia.
 *
 * Un 2 %. La sonda existe para medir cuánto NDC gana el agua por metro de
 * acercamiento, y se mide restando dos profundidades: si la sonda es corta, esa
 * resta se queda dentro del error de un \`float\` de 32 bits —a 300 km dos
 * puntos separados un metro tienen la misma z hasta el último bit— y el sesgo
 * sale de ruido. Con un 2 % de la distancia la diferencia es cuatro órdenes de
 * magnitud mayor que el épsilon, cerca y lejos, porque la sonda crece con lo
 * mismo que la pérdida de precisión.
 */
const float PROBE_SHARE = 0.02;

varying vec4 v_posDepth;
varying vec4 v_normalCrest;
varying vec4 v_shore;
varying vec2 v_range;

${WAVE_FUNCTIONS}

void main() {
  // --- 1. de la pantalla al plano del agua -------------------------------
  vec4 nearH = u_invMatrix * vec4(a_ndc, -1.0, 1.0);
  vec4 farH = u_invMatrix * vec4(a_ndc, 1.0, 1.0);
  vec3 nearP = nearH.xyz / nearH.w;
  vec3 dir = farH.xyz / farH.w - nearP;

  float beyond = 0.0;
  float dz = dir.z;
  float t = (u_seaLevel - nearP.z) / (abs(dz) < 1e-12 ? 1e-12 : dz);
  vec2 p;
  if (t < 0.0 || t > 1.0) {
    // El rayo no corta el agua por delante de la cámara: es cielo. El vértice
    // se manda al alcance máximo siguiendo su propia dirección, para que el
    // borde de la rejilla caiga en el horizonte en vez de en cualquier sitio.
    beyond = 1.0;
    vec2 h = length(dir.xy) > 1e-12 ? normalize(dir.xy) : vec2(0.0, 1.0);
    p = u_camera.xy + h * u_maxRange;
  } else {
    p = nearP.xy + dir.xy * t;
    vec2 rel = p - u_camera.xy;
    float d = length(rel);
    if (d > u_maxRange) {
      // Mar más allá del alcance útil. Se recorta al mismo radio: sin esto, un
      // rayo casi rasante devuelve puntos a miles de kilómetros y la fase de la
      // ola se sale de la precisión del float.
      p = u_camera.xy + rel / d * u_maxRange;
      beyond = 1.0;
    }
  }

  // --- 2. el mar en ese punto --------------------------------------------
  float depth = depthAt(p);
  vec4 shore = shoreAt(p);
  vec2 posM = p * u_metersPerMerc;

  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  float ampSum = 0.0;
  float breaking = 0.0;

  addTrain(trainAt(u_swellTex, p), posM, depth, shore.zw, u_time, 1.0,
           disp, nrm, crest, ampSum, breaking);
  addTrain(trainAt(u_windSeaTex, p), posM, depth, shore.zw, u_time, 1.0,
           disp, nrm, crest, ampSum, breaking);

  // El desplazamiento va en metros y el mapa en unidades Mercator.
  vec2 offset = disp.xy * u_geomScale / u_metersPerMerc;
  float height = disp.z * u_geomScale / u_metersPerMerc;

  v_posDepth = vec4(p + offset, depth, beyond);
  v_normalCrest = vec4(normalize(nrm), ampSum > 0.0 ? crest / ampSum : 0.0);
  v_shore = shore;
  v_range = vec2(length(p - u_camera.xy) * u_metersPerMerc, breaking);

  // --- 3. y un pelo hacia la cámara ---------------------------------------
  //
  // El agua compite con la malla del terreno de MapLibre, que sobre el mar está
  // aplanada a cero y escribe profundidad. Los dos metros de \`SEA_LIFT_M\`
  // ganan esa carrera en el mundo, pero no siempre en el búfer: a unos
  // kilómetros de la cámara dos metros no llegan a un escalón y el mar
  // desaparece de golpe a partir de una línea recta.
  //
  // EL EMPUJÓN VA POR EL RAYO, y no con \`polygonOffset\` ni restándole una
  // constante a la z de recorte. Las dos alternativas se probaron y las dos
  // están mal por el mismo motivo, cada una por su lado: \`polygonOffset\`
  // escala con la pendiente del triángulo, y en una rejilla proyectada los del
  // horizonte abarcan kilómetros; y una constante en NDC es constante EN EL
  // BÚFER, que guarda 1/z, o sea que vale cada vez más metros cuanto más lejos
  // cae el vértice —crece con el cuadrado de la distancia—. Aquella constante
  // de \`1e-4\` valía 3,6 m con la costa en primer plano y 404 m con la isla
  // entera en pantalla, y esos 404 m son los que subían el mar 840 m ladera
  // arriba sobre las plataneras. Está medido en \`lib/ocean/depth.ts\`.
  //
  // Moviendo el vértice hacia la cámara POR SU PROPIO RAYO, en cambio, el
  // empujón se mide en metros de mundo y su posición en pantalla no cambia: el
  // punto sigue estando en la misma línea de visión, solo que un metro más
  // cerca. Eso es lo que hace que el sesgo signifique lo mismo a 200 m que a
  // 60 km.
  vec3 world = vec3(p + offset, u_seaLevel + height);
  vec4 clipA = u_matrix * vec4(world, 1.0);

  vec3 toCam = u_camera - world;
  float dist = max(length(toCam), 1e-9);
  float meter = 1.0 / u_metersPerMerc;

  // La sonda, y la segunda proyección. Como la matriz es afín, la recta que une
  // las dos proyecciones ES la del rayo: acercarse \`m\` metros equivale a
  // interpolar \`m / probe\` entre ellas, sin una tercera multiplicación.
  float probe = max(meter, dist * PROBE_SHARE);
  vec4 clipB = u_matrix * vec4(world + (toCam / dist) * probe, 1.0);

  // El seno del picado del rayo, que es el cambio de moneda entre «metros de
  // empujón» y «metros de ladera que el agua puede cubrir».
  float sinDown = max(abs(toCam.z) / dist, 1e-6);

  // LO QUE LE FALTA AL AGUA PARA ALCANZAR LA LÁMINA PLANA DE MAPLIBRE, que
  // está en cero y escribe profundidad. Con la marea baja el plano del agua
  // queda por debajo —hasta 1,18 m, medido sobre 31 días frente a Tazacorte— y
  // sin ganarle esa diferencia el mar desaparece entero. Se gana AQUÍ, por el
  // rayo, y no levantando el plano: levantarlo movería el corte del rayo hacia
  // el mar y con él la consulta del mapa de orilla. Ver \`OceanLayer.ts\`.
  float need = max(0.0, -u_seaLevel) / sinDown;

  float push = max(BIAS_M * meter, need);
  if (clipA.w > 0.0 && clipB.w > 0.0) {
    // Cuánto NDC gana la sonda entera. De ahí salen los metros que hacen falta
    // para ganar los escalones de búfer que pide \`u_depthSlack\`.
    float gain = (clipA.z / clipA.w) - (clipB.z / clipB.w);
    if (gain > 1e-9) {
      float steps = (u_depthSlack / gain) * probe;
      // Y el techo, que no se mide en metros de empujón sino en lo único que
      // importa: cuánta ladera se come. Es mayor que \`need\` por construcción
      // —\`MAX_LEAK_M\` supera la marea más baja que hay—, así que nunca puede
      // borrar el mar por apretar el techo.
      float ceiling = (MAX_LEAK_M * meter) / sinDown;
      push = min(max(push, steps), max(push, ceiling));
    }
  }
  // Y nunca tanto como para cruzar la cámara.
  push = min(push, dist * 0.25);

  gl_Position = clipA + (push / probe) * (clipB - clipA);
  // El \`max\` es para no empujar el vértice por detrás del plano cercano, que
  // lo recortaría.
  gl_Position.z = max(gl_Position.z, -gl_Position.w);
}
`
