/**
 * La espuma que arrancan el mar y el viento, en un solo sitio.
 *
 * Es el trozo de GLSL que comparten dos programas: el del océano —que lo usa
 * directamente cuando no hay campo de espuma persistente, y como referencia
 * de lo que ese campo acumula cuando sí— y el pase de espuma (`FoamField.ts`),
 * que pinta las fuentes a la textura del mundo para que la estela de una ola
 * le sobreviva. Con una copia en cada programa, la cobertura de borreguillos
 * de Monahan se retocaría en un sitio y no en el otro, y un mar blanquearía
 * antes que su reflejo.
 *
 * Todo lo de aquí sale de la misma física que el resto del océano: la
 * rompiente la calcula el vértice con la batimetría, los borreguillos siguen
 * la ley de Monahan y O'Muircheartaigh de \`sea-state.ts\`, y los regueros
 * solo existen con la espuma de viento encendida (`SPINDRIFT`).
 */

export const FOAM_SOURCE_GLSL = /* glsl */ `
/**
 * Cuánta espuma nace aquí y ahora, de 0 a 1. Son las tres fuentes que pueden
 * dejar huella —la rompiente, los borreguillos y los regueros del viento—;
 * la espuma de la orilla no entra, porque esa sigue a la lengua del agua y
 * no puede acumularse: es del instante.
 */
float foamSource(
  float crest, float breaking, vec2 windDir, float windSpeed,
  vec2 posM, float time, float detailMeters, sampler2D detailTex
) {
  float f = 0.0;

  // (a) la rompiente, calculada con la batimetría de verdad.
  f += breaking * smoothstep(-0.15, 0.5, crest);

  // (c) borreguillos: la cobertura sale de Monahan y O'Muircheartaigh (1980),
  //     W = 3,84·10⁻⁶·U^3,41, la misma ley que usa sea-state.ts. A 8 m/s
  //     es medio por ciento del mar; a 20, un diez por ciento.
  float whitecap = min(1.0, 3.84e-6 * pow(max(windSpeed, 0.0), 3.41));
  float speckle = texture2D(detailTex, posM / (detailMeters * 0.6) - windDir * time * 0.9).b;
  f += smoothstep(0.62, 0.98, speckle * (0.4 + 0.9 * max(crest, 0.0))) *
       smoothstep(0.0, 0.06, whitecap) * (0.35 + 3.0 * whitecap);

#ifdef SPINDRIFT
  // (d) con viento fuerte, el mar deja de tener crestas: las tiene arrancadas.
  //     Los regueros salen de la cresta y se van a sotavento.
  float streak = texture2D(detailTex,
    (posM + windDir * (time * (2.0 + windSpeed * 0.6))) / (detailMeters * 2.6)).b;
  f += smoothstep(0.55, 1.0, streak) * smoothstep(0.02, 0.12, whitecap) * 0.55;
#endif

  return clamp(f, 0.0, 1.0);
}
`
