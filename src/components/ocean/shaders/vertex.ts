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

import { CONSTANTS, UNIFORMS, WAVE_FUNCTIONS } from './waves'

export const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec2 a_ndc;

${UNIFORMS}
${CONSTANTS}

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

  gl_Position = u_matrix * vec4(p + offset, u_seaLevel + height, 1.0);
}
`
