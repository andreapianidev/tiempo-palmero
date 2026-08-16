/**
 * El cielo que refleja el agua, en un solo sitio.
 *
 * Es el trozo de GLSL que comparten dos programas: el del océano —que lo usa
 * para pintar el reflejo del cielo cuando no hay escena atmosférica— y el del
 * mapa de cielo (`SkyEnv.ts`), que lo renderiza a una textura equirect cuando
 * sí la hay. Con una copia en cada programa, el día que se retoque el color
 * del ocaso un cielo y otro saldrían de dos tonos de naranja.
 *
 * `envUv` es el cambio de moneda entre una dirección del mundo —(este, norte,
 * arriba), el mismo sistema del resto del sombreador— y la textura equirect:
 * acimut repartido en la horizontal, elevación en la vertical, el horizonte en
 * la línea del medio. Quien escribe la textura y quien la lee usan la misma
 * función, así que no puede haber dos convenciones.
 */

export const SKY_GLSL = /* glsl */ `
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform vec3 u_moonDir;
uniform float u_moonIntensity;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform float u_haze;

/**
 * El cielo que el agua refleja.
 *
 * No es una fotografía: es el degradado que ya calcula lib/ocean/light.ts a
 * partir de dónde está el sol, cuánta radiación miden las estaciones y cuánto
 * polvo hay en el aire, más el disco del sol y el de la luna. Con calima el
 * disco se ensancha y pierde fuerza, que es justo lo que hace la calima: no
 * quita luz, la reparte por todo el cielo.
 */
vec3 skyColor(vec3 dir) {
  float up = clamp(dir.z, -1.0, 1.0);
  vec3 c = mix(u_horizon, u_zenith, pow(max(up, 0.0), 0.42));
  float s = max(dot(dir, u_sunDir), 0.0);
  float sharp = mix(600.0, 30.0, u_haze);
  c += u_sunColor * u_sunIntensity * pow(s, sharp) * (0.6 + 2.2 * (1.0 - u_haze));
  float m = max(dot(dir, u_moonDir), 0.0);
  c += vec3(0.72, 0.78, 0.95) * u_moonIntensity * pow(m, 800.0) * 1.6;
  return c;
}

/** De dirección del mundo a UV equirect 0-1, el gemelo de \`lib/ocean/sky-env.ts\`. */
vec2 envUv(vec3 dir) {
  // Azimut desde el norte hacia el este: el mismo convenio que el resto del
  // mapa. \`atan(x, y)\` es el ángulo de (y, x) contado desde el norte.
  float az = atan(dir.x, dir.y);
  float el = asin(clamp(dir.z, -1.0, 1.0));
  return vec2(az / TAU + 0.5, 0.5 - el / PI);
}
`
