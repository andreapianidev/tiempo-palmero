/**
 * Sombreador de fragmentos del océano: de qué color es cada píxel de agua.
 *
 * EL ORDEN NO ES ARBITRARIO. Se calcula primero si hay agua en este píxel
 * (la orilla se mueve con cada ola), luego cómo está inclinada la superficie,
 * después qué se ve a través de ella y qué se ve reflejado en ella, y solo al
 * final la espuma, que va encima de todo porque la espuma es lo único del mar
 * que no es agua transparente.
 *
 * LAS SEIS COSAS QUE HACEN QUE ESTO PAREZCA AGUA, en orden de importancia:
 *
 *  1. FRESNEL. El agua mirada de arriba es transparente y mirada de canto es un
 *     espejo. No es un efecto: es LA propiedad óptica del agua, y sin ella
 *     ninguna otra cosa la salva. Por eso el mar cambia por completo entre la
 *     vista plana y la vista 3D.
 *  2. LA NORMAL FINA. El rizado que no cabe en la geometría (`detail.ts`).
 *  3. LA ABSORCIÓN POR PROFUNDIDAD. El rojo desaparece en cuatro metros de
 *     agua, el verde en quince y el azul aguanta cuarenta: por eso el agua
 *     somera es turquesa y la honda es azul marino, y por eso aquí la costa se
 *     ve turquesa exactamente donde la batimetría dice que hay un bajío.
 *  4. EL BRILLO DEL SOL, ancho o estrecho según el viento y la calima.
 *  5. LA ESPUMA, en los tres sitios donde existe: donde rompe, en la orilla y
 *     en las crestas cuando el viento arrecia.
 *  6. LA LUZ QUE ATRAVIESA LA CRESTA por detrás, que es lo que hace que una ola
 *     a contraluz se vea verde y encendida.
 */

import {
  FOAM_MOON,
  FOAM_SUN,
  FORWARD_SCATTER_POWER,
  FORWARD_SCATTER_STRENGTH,
  LIT_FLOOR,
  NIGHT_OPACITY,
} from '../../../lib/ocean/light'
import {
  CLIFF_BAND_M,
  CLIFF_RUNUP_SHARE,
  RUNUP_FACTOR,
  RUNUP_MAX_M,
  RUNUP_MIN_M,
} from '../../../lib/ocean/coverage'
import { CONSTANTS, UNIFORMS, WAVE_FUNCTIONS } from './waves'
import { SKY_GLSL } from './sky'
import { FOAM_SOURCE_GLSL } from './foam'

export const FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

${UNIFORMS}
${CONSTANTS}

// Los de la orilla. Salen de \`lib/ocean/coverage.ts\`, que es donde se prueban.
const float RUNUP_FACTOR = ${RUNUP_FACTOR.toFixed(4)};
const float RUNUP_MIN_M = ${RUNUP_MIN_M.toFixed(2)};
const float RUNUP_MAX_M = ${RUNUP_MAX_M.toFixed(2)};
const float CLIFF_RUNUP_SHARE = ${CLIFF_RUNUP_SHARE.toFixed(4)};
const float CLIFF_BAND_M = ${CLIFF_BAND_M.toFixed(2)};
// Y los de la luz, de \`lib/ocean/light.ts\`.
const float LIT_FLOOR = ${LIT_FLOOR.toFixed(4)};
const float NIGHT_OPACITY = ${NIGHT_OPACITY.toFixed(4)};
const float FORWARD_SCATTER_STRENGTH = ${FORWARD_SCATTER_STRENGTH.toFixed(4)};
const float FORWARD_SCATTER_POWER = ${FORWARD_SCATTER_POWER.toFixed(2)};

uniform sampler2D u_detailTex;
uniform sampler2D u_backgroundTex;
uniform vec2 u_resolution;
uniform float u_metersPerPixel;
/** El mapa de cielo con las nubes de la escena. 0 = reflejar el cielo analítico. */
uniform sampler2D u_envTex;
uniform float u_envOn;
/** El campo de espuma persistente del mundo. 0 = espuma instantánea. */
uniform sampler2D u_foamTex;
uniform float u_foamOn;

uniform vec3 u_deepColor;
uniform vec3 u_shallowColor;
uniform vec3 u_foamColor;
uniform float u_lit;
uniform vec3 u_ambient;
/** 1 si debajo del agua hay una fotografía; 0 si es una tinta lisa. */
uniform float u_baseReveal;

uniform float u_detailMeters;
uniform float u_detailAmp;
uniform float u_microVariance;
uniform float u_fade;

varying vec4 v_posDepth;
varying vec4 v_normalCrest;
varying vec4 v_shore;
varying vec2 v_range;

${WAVE_FUNCTIONS}

${FOAM_SOURCE_GLSL}

${SKY_GLSL}

/**
 * El cielo que refleja esta ola: el mapa con las nubes cuando existe, y el
 * degradado analítico cuando no —sin escena atmosférica, o en calidad ligera,
 * donde el mapa no se renderiza. Los dos cielos comparten colores y discos,
 * así que el cambio no se ve: lo que se ve es que de repente HAY nubes en el
 * agua.
 */
vec3 reflectSky(vec3 dir) {
  if (u_envOn < 0.5) return skyColor(dir);
  return texture2D(u_envTex, envUv(dir)).rgb;
}

/** Pendiente del rizado fino, ya girado hacia el viento y en marcha con él. */
vec2 detailSlope(vec2 posM, vec2 windDir, float windSpeed, float gust) {
  // La textura está generada con las crestas mirando al este, así que primero
  // se lleva el mundo al sistema del viento (giro de −θ) y después la pendiente
  // que sale de la textura se devuelve al mundo (giro de +θ). Con una sola de
  // las dos matrices el rizado se ve girado respecto a las olas grandes, y eso
  // salta a la vista aunque no se sepa por qué.
  mat2 toWind = mat2(windDir.x, -windDir.y, windDir.y, windDir.x);
  mat2 toWorld = mat2(windDir.x, windDir.y, -windDir.y, windDir.x);
  vec2 q = toWind * posM;
  float drift = u_time * (0.35 + 0.12 * windSpeed);
  vec2 slope = vec2(0.0);
  // El rizado no es igual en toda la isla: donde no sopla, el agua se queda
  // como un espejo, y ese contraste entre el barlovento picado y el sotavento
  // liso es la firma de La Palma vista desde el aire. El viento local sale de
  // la textura de campo, que en la costa son las estaciones del Cabildo.
  float force = clamp(windSpeed / 11.0, 0.06, 1.5);
  float meters = u_detailMeters * mix(0.65, 1.35, clamp(windSpeed / 14.0, 0.0, 1.0));
  float amp = u_detailAmp * gust * force;
  for (int i = 0; i < OCTAVES; i++) {
    vec2 uv = (q - vec2(drift, 0.0)) / meters;
    vec2 s = (texture2D(u_detailTex, uv).rg - 0.5) * 2.0 * DETAIL_MAX_SLOPE;
    slope += toWorld * s * amp;
    meters *= 0.37;
    amp *= 0.52;
    drift *= 1.9;
  }
  return slope;
}

void main() {
  vec2 p = v_posDepth.xy;
  float depth = v_posDepth.z;
  float beyond = v_posDepth.w;
  float shoreDist = v_shore.x;
  float landHeight = v_shore.y;
  float crest = v_normalCrest.w;
  float distanceM = v_range.x;
  float breaking = v_range.y;

  vec2 posM = p * u_metersPerMerc;
  vec2 wind = windAt(p);
  float windSpeed = length(wind);
  vec2 windDir = windSpeed > 0.15 ? wind / windSpeed : vec2(1.0, 0.0);

  // --- 1. ¿hay agua aquí? La orilla no está quieta ------------------------
  //
  // El agua sube y baja por la playa con cada ola: es el *swash*, y sin él la
  // línea de costa se ve pintada. La excursión es del orden de la altura de la
  // ola, y la fase la marca la propia cresta que está llegando.
  //
  // Es el gemelo exacto de \`lib/ocean/coverage.ts\`, de donde salen estos
  // números y donde está medido lo que decide: que el mar llegue a la costa y
  // que no se suba al acantilado. Si esto cambia, cambia allí.
  vec4 swell = trainAt(u_swellTex, p);
  vec4 chop = trainAt(u_windSeaTex, p);
  float waveHeight = max(swell.z, chop.z);
  float runup = clamp(waveHeight * RUNUP_FACTOR, RUNUP_MIN_M, RUNUP_MAX_M);
  float push = runup * max(crest, 0.0);
  float soft = max(1.0, u_metersPerPixel * 1.2);
  float coverage = smoothstep(-push, -push + soft, shoreDist);
  // Y no trepa por un acantilado: contra pared, el agua rebota, no sube. SOLO
  // EN TIERRA: \`ashore\` vale 1 en la roca y 0 en cuanto se sale al mar, y sin
  // él la cota del texel de al lado —34 m de lado, interpolada— secaba una
  // franja de mar de hasta 43 m pegada a la costa.
  float ashore = 1.0 - smoothstep(0.0, soft, shoreDist);
  coverage *= 1.0 - ashore *
    smoothstep(runup * CLIFF_RUNUP_SHARE, runup * CLIFF_RUNUP_SHARE + CLIFF_BAND_M, landHeight);
  if (coverage <= 0.001) discard;

  // --- 2. la superficie ---------------------------------------------------
  //
  // Las rachas: manchas de mar más rizado que viajan con el viento. Es el
  // detalle que da escala al océano —sin ellas, un mar matemáticamente perfecto
  // parece pequeño— y en la isla se ven de verdad, saliendo por los canales
  // entre las montañas.
  float gust = texture2D(u_detailTex, posM * 0.00035 - windDir * u_time * 0.0009).b;
  gust = 0.55 + 1.1 * gust;

  vec3 n = normalize(v_normalCrest.xyz);
  vec2 slope = detailSlope(posM, windDir, windSpeed, gust);
  // En aguas someras el rizado se aplasta: hay menos fetch y el fondo frena.
  slope *= mix(0.45, 1.0, smoothstep(0.0, 8.0, depth));
  n = normalize(vec3(n.xy - slope, n.z));

  vec3 toCamera = vec3((u_camera.xy - p) * u_metersPerMerc, (u_camera.z - u_seaLevel) * u_metersPerMerc);
  vec3 view = normalize(toCamera);
  vec3 refl = reflect(-view, n);
  refl.z = abs(refl.z); // un reflejo que apunta al agua no existe

  // --- 3. lo que se ve DENTRO del agua ------------------------------------
  //
  // Absorción de Beer-Lambert con los coeficientes del agua de mar limpia: el
  // rojo se extingue veinte veces más rápido que el azul. Se aplica al doble de
  // la profundidad porque la luz hace el camino dos veces, de bajada y de
  // subida.
  vec3 absorb = exp(-min(depth, 60.0) * 2.0 * vec3(0.085, 0.019, 0.009));
  float clarity = absorb.g;
  vec3 body = mix(u_deepColor, u_shallowColor, clarity);

#ifdef REFRACT
  // El fondo de verdad: lo que el mapa ya había pintado debajo del agua —la
  // ortofoto, la carta náutica o el relieve— desviado por la propia ola. Es lo
  // que hace que sobre la ortofoto se vean los bajos de Tazacorte moverse con
  // el oleaje en vez de quedarse planos debajo del agua.
  vec2 screen = gl_FragCoord.xy / u_resolution;
  float bend = 0.035 * clarity / (1.0 + distanceM * 0.0004);
  vec2 offset = n.xy * bend;
  vec3 bottom = texture2D(u_backgroundTex, clamp(screen + offset, vec2(0.002), vec2(0.998))).rgb;

  // Y se apaga con la luz que hay AHORA. Lo que el mapa ha pintado debajo del
  // agua es una ortofoto de un vuelo de mediodía, y sin esto el mar se llevaba
  // puesta la luz de aquel día: a medianoche el agua somera salía con la
  // claridad de las doce mientras el resto de la escena estaba a oscuras, y
  // cualquier cosa iluminada de verdad —la espuma, la primera— quedaba encima
  // como una mancha. Es la misma claridad que apaga el azul y el turquesa en
  // waterColors: 1 a mediodía despejado, 0,22 en una noche cerrada.
  bottom *= u_lit;

  // Cáusticas: los reticulados de luz que el sol dibuja en el fondo al pasar
  // por las olas. Solo donde el fondo se ve y solo con sol.
  float c1 = texture2D(u_detailTex, (posM + windDir * u_time * 0.35) / (u_detailMeters * 1.7)).b;
  float c2 = texture2D(u_detailTex, (posM * 1.31 - windDir * u_time * 0.22) / (u_detailMeters * 1.9)).b;
  float caustics = pow(max(0.0, 1.0 - abs(c1 - c2) * 3.4), 6.0);
  bottom += u_sunColor * caustics * u_sunIntensity * clarity * 0.55;

  body = mix(body, bottom * mix(vec3(0.35, 0.72, 0.78), vec3(1.0), clarity), clarity * 0.85);
#endif

  // La luz que atraviesa la cresta por detrás. Es lo que enciende de verde una
  // ola a contraluz, y solo pasa cuando el sol está del otro lado.
  float through = max(0.0, -dot(view.xy, u_sunDir.xy)) * max(0.0, crest);
  body += vec3(0.10, 0.32, 0.26) * through * through * u_sunIntensity * 1.4;
  body += u_ambient * 0.35;

  // La luz que viaja POR EL AGUA hacia la cámara. Con el sol al otro lado del
  // punto que se mira, el agua brilla por delante —el mismo bajío se enciende
  // mirando hacia el sol y se apaga dándole la espalda—, y de espaldas no
  // cambia nada. Es lo que hace que una costa no se lea igual por la mañana
  // que por la tarde. Los números son de \`lib/ocean/light.ts\`, donde se
  // miden las dos orillas: que hacia el sol se note y que de espaldas no
  // toque nada.
  float toward = max(0.0, -dot(view.xy, u_sunDir.xy));
  body += u_shallowColor *
    (FORWARD_SCATTER_STRENGTH * pow(toward, FORWARD_SCATTER_POWER) * clarity * u_sunIntensity);

  // --- 4. lo que se REFLEJA ------------------------------------------------
  float cosTheta = clamp(dot(n, view), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  vec3 color = mix(body, reflectSky(refl), fresnel);

  // El brillo especular del sol. El exponente baja con el viento —más rizado,
  // reflejo más ancho— y también con la varianza de pendiente que a este zoom
  // ya no se resuelve: es lo que convierte el destello puntual de cerca en la
  // alfombra de brillos que se ve de lejos, en vez de en un parpadeo.
  //
  // VA MULTIPLICADO POR FRESNEL, y esto no es un ajuste estético: el brillo del
  // sol en el agua ES el reflejo del sol, así que obedece la misma ley que
  // cualquier otro reflejo —2 % mirando a plomo, casi todo mirando de canto—.
  // Sumado por fuera del término de Fresnel, como suele hacerse en los
  // sombreadores de videojuego, el mar visto desde arriba sale con una mancha
  // blanca reventada de varios kilómetros: medido en pantalla el 13 de agosto
  // de 2026, con el sol a 20°, esa mancha llegaba a 2,3 veces el blanco.
  //
  // La palabra half es reservada en GLSL ES: el nombre completo no es capricho.
  vec3 halfSun = normalize(u_sunDir + view);
  float rough = clamp(windSpeed / 16.0, 0.0, 1.0);
  float shine = mix(1400.0, 45.0, rough) / (1.0 + u_microVariance * 300.0);
  float spec = pow(max(dot(n, halfSun), 0.0), shine);
  color += fresnel * u_sunColor * u_sunIntensity * spec * (0.8 + 1.2 * (1.0 - u_haze));

  vec3 halfMoon = normalize(u_moonDir + view);
  color += fresnel * vec3(0.78, 0.83, 1.0) * u_moonIntensity *
           pow(max(dot(n, halfMoon), 0.0), mix(900.0, 60.0, rough)) * 1.2;

  // --- 5. espuma -----------------------------------------------------------
  //
  // Tres espumas distintas y con tres motivos distintos:
  float foam = 0.0;

  // (a) la rompiente, (c) los borreguillos y (d) los regueros: las que dejan
  //     huella. Cuando el campo de espuma persistente existe, llegan desde
  //     él —acumuladas y decayendo, que es lo que hace la espuma de verdad—;
  //     sin él se calculan aquí, instantáneas, como siempre. Ver \`FoamField\`.
  if (u_foamOn > 0.5) {
    foam += inBox(u_shoreBox, p)
      ? texture2D(u_foamTex, clamp((p - u_shoreBox.xy) / u_shoreBox.zw, 0.0, 1.0)).r
      : 0.0;
  } else {
    foam += foamSource(crest, breaking, windDir, windSpeed, posM, u_time, u_detailMeters, u_detailTex);
  }

  // (b) la orilla: la lengua que sube, y la resaca que baja dejando la arena
  //     brillando. La franja mide lo que la ola empuja. No se acumula: sigue
  //     a la lengua del agua y es del instante.
  float band = max(2.5, runup * 2.6);
  float edge = 1.0 - smoothstep(0.0, band, shoreDist + push);
  foam += edge * (0.35 + 0.65 * max(crest, 0.0));

  foam = clamp(foam, 0.0, 1.0);
  // La espuma es aire en agua: dispersa toda la luz que le llega, así que no
  // tiene color propio, tiene el de la luz del momento.
  //
  // u_foamColor ES UN ALBEDO —0,86/0,89/0,92, ver light.ts— y la luz se le
  // pone AQUÍ, una sola vez. Antes venía ya multiplicada por la claridad del
  // momento y esta línea la volvía a multiplicar: apagada dos veces, en una
  // noche sin luna la rompiente marcaba 0,017 de luminancia contra los 0,027
  // del agua de debajo. Una espuma más oscura que su agua no existe —el aire
  // atrapado devuelve diez veces más luz que el agua— y en pantalla salía como
  // lo que era, una mancha de tinta pegada a la costa.
  vec3 foamLit = u_foamColor * (u_ambient + u_sunColor * u_sunIntensity * ${FOAM_SUN.toFixed(4)} +
                                vec3(${FOAM_MOON.toFixed(4)}) * u_moonIntensity);
  color = mix(color, foamLit, foam);

  // --- 6. distancia --------------------------------------------------------
  //
  // La bruma del horizonte, con el mismo color que el cielo de MapLibre: sin
  // esto, el mar llega al borde de la pantalla con el mismo contraste que el de
  // debajo de la cámara y la escena se queda plana.
  float fog = smoothstep(0.22, 0.92, distanceM / max(1.0, u_maxRange * u_metersPerMerc));
  color = mix(color, u_horizon, fog * 0.9);

  float alpha = coverage * u_fade * (1.0 - beyond * 0.85) * (1.0 - fog * 0.35);

  // Y de noche el agua deja ver el mapa que hay debajo en vez de taparlo. No es
  // un truco de transparencia: es que las dos capas no viven a la misma hora
  // —esta se dibuja con la luz de ahora y el fondo es una ortofoto de mediodía—
  // y un agua nocturna opaca convierte medio mapa en una plancha lisa. Está
  // medido en \`light.ts\`, en NIGHT_OPACITY. La espuma no entra: esa sí es
  // opaca a cualquier hora.
  //
  // Solo cuando debajo hay una foto (\`u_baseReveal\`): sobre la tinta lisa del
  // relieve no hay nada que destapar y translucir el agua solo la apaga.
  float day = clamp((u_lit - LIT_FLOOR) / (1.0 - LIT_FLOOR), 0.0, 1.0);
  float translucent = NIGHT_OPACITY + (1.0 - NIGHT_OPACITY) * max(day, foam);
  alpha *= mix(1.0, translucent, u_baseReveal);

#ifndef REFRACT
  // Sin refracción el agua no lleva dentro lo que hay debajo, así que se deja
  // ver a través de ella en el bajío: es la única forma de que la ortofoto siga
  // enseñando el fondo donde de verdad se ve.
  alpha *= mix(1.0, 0.55, clarity);
#endif

  gl_FragColor = vec4(color * alpha, alpha);
}
`
