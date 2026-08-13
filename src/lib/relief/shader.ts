/**
 * El shader del relieve: sombreado propio a partir del modelo de elevación.
 *
 * Sustituye al `hillshade` de MapLibre, que en esta isla se quedaba corto por
 * tres motivos concretos, y cada uno tiene aquí su respuesta:
 *
 *  1. **Una sola luz.** Con el sol en el noroeste, toda ladera orientada al
 *     sureste cae al negro y dentro de ese negro no se distingue un barranco
 *     de una pared. En La Palma eso es media isla: la vertiente de Mazo y
 *     Fuencaliente entera. Aquí la luz es **multidireccional** —cuatro focos
 *     con pesos, la escuela de Mark (1992)—: manda el noroeste, y los otros
 *     tres rellenan lo justo para que la forma siga estando donde el principal
 *     no llega.
 *
 *  2. **Nada entre muestra y muestra.** MapLibre lee el modelo en su malla y
 *     ahí se queda; a partir de z11 la tesela se amplía como una imagen y el
 *     relieve se convierte en manchas. Aquí la superficie se reconstruye
 *     **bicúbica (Catmull-Rom)** y —esto es lo que cambia el resultado— la
 *     pendiente sale de la DERIVADA ANALÍTICA de esa superficie, no de restar
 *     píxeles vecinos. Una malla de 33,5 m derivada por diferencias produce
 *     escalones de sombra; derivada de verdad, produce laderas.
 *
 *  3. **Sin profundidad.** Un barranco de 400 m y un surco de 20 se sombrean
 *     igual porque la pendiente de sus paredes es parecida. Se añaden dos
 *     términos que sí conocen la escala:
 *
 *       - **Oclusión** (aproximación del factor de vista de cielo): se mira el
 *         horizonte en ocho direcciones y a dos distancias. Lo que está metido
 *         en un tajo recibe menos cielo y se oscurece. Es lo que hunde la
 *         Caldera de Taburiente en vez de dibujarla.
 *       - **Textura** (la idea de Leland Brown): la altitud menos su propia
 *         versión suavizada. Es un realce de las formas pequeñas —cada
 *         barranquera de la vertiente de Puntagorda— que no depende de por
 *         dónde venga la luz, así que aparece también en la cara oscura.
 *
 * NO SE DESCARGA NADA NUEVO. Son las mismas teselas terrarium de `public/dem/`
 * que ya sombreaban el mapa, que ya dan las cotas del motor y que ya son la
 * geometría de la vista 3D. Lo único que cambia es cuánto se les saca.
 *
 * Y NO SE INVENTA TERRENO. Por encima del zoom del modelo la superficie se
 * sigue interpolando —que es dibujar suave lo que se sabe—, pero el término de
 * textura y el de oclusión se miden en pasos de la malla REAL, así que al
 * acercarse no aparecen barrancos nuevos: aparece el mismo barranco mejor
 * dibujado. Es la misma regla que ya sigue el motor cuando interpola
 * temperatura: suavizar entre datos, nunca fabricarlos.
 */

export const RELIEF_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_dem;      // mosaico 3 × 3 de teselas terrarium
uniform vec2 u_demSize;       // su tamaño en píxeles
uniform vec3 u_window;        // origen x, origen y y lado del trozo que se pinta
uniform float u_out;          // lado de la imagen que sale, en píxeles
uniform float u_mpp;          // metros por píxel del modelo, a esta latitud

uniform vec4 u_azimuth;       // los cuatro focos, en grados desde el norte
uniform vec4 u_weight;        // y lo que pesa cada uno (suman 1)
uniform float u_altitude;     // altura del sol sobre el horizonte, en grados
uniform float u_sky;          // cuánto manda la oclusión
uniform float u_texture;      // cuánto manda el realce de textura
uniform float u_textureScale; // a cuántos metros de resalte satura ese realce
uniform float u_accentAt;     // pendiente (tangente) donde entra el acento
uniform float u_accent;       // y cuánto

uniform vec3 c_shadow;
uniform vec3 c_highlight;
uniform vec3 c_accent;
uniform vec3 c_warm;          // tinte de costa
uniform vec3 c_cool;          // tinte de cumbre
uniform float u_tint;
uniform float u_summit;       // la cota que da el tinte frío entero

out vec4 fragColor;

const float PI = 3.14159265;
const float DEG = PI / 180.0;

/** Terrarium: altura = R·256 + G + B/256 − 32768. */
float elev(vec2 px) {
  vec3 c = texture(u_dem, (floor(px) + 0.5) / u_demSize).rgb * 255.0;
  return c.r * 256.0 + c.g + c.b / 256.0 - 32768.0;
}

/* Catmull-Rom: pesos y sus derivadas, escritos juntos para que no se
   desincronicen la superficie y su pendiente. */
vec4 crWeights(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(
    -0.5 * t3 + t2 - 0.5 * t,
     1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
     0.5 * t3 - 0.5 * t2);
}

vec4 crDeriv(float t) {
  float t2 = t * t;
  return vec4(
    -1.5 * t2 + 2.0 * t - 0.5,
     4.5 * t2 - 5.0 * t,
    -4.5 * t2 + 4.0 * t + 0.5,
     1.5 * t2 - t);
}

/** Altura y pendiente de la superficie bicúbica, con una sola lectura del 4 × 4. */
void surface(vec2 p, out float h, out vec2 grad) {
  vec2 f = p - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  vec4 wx = crWeights(t.x), wy = crWeights(t.y);
  vec4 dx = crDeriv(t.x),   dy = crDeriv(t.y);

  h = 0.0;
  grad = vec2(0.0);
  for (int j = 0; j < 4; j++) {
    float rowH = 0.0, rowD = 0.0;
    for (int k = 0; k < 4; k++) {
      float e = elev(i + vec2(float(k) - 1.0, float(j) - 1.0) + 0.5);
      rowH += wx[k] * e;
      rowD += dx[k] * e;
    }
    h += wy[j] * rowH;
    grad.x += wy[j] * rowD;
    grad.y += dy[j] * rowH;
  }
}

/**
 * La altura interpolada linealmente entre las cuatro muestras que la rodean.
 *
 * NO es un lujo: es lo que evita una rejilla. Los dos términos que se le RESTAN
 * a la superficie —la textura y la oclusión— tienen que ser tan continuos como
 * ella. Con lectura a vecino más cercano son constantes dentro de cada muestra
 * del modelo y saltan en sus bordes, y esa diferencia contra una superficie
 * bicúbica que sí es continua dibuja un damero de un píxel de paso justo donde
 * más se mira: por encima del zoom del modelo. Se vio en el banco de pruebas
 * (dev/relieve.html) a z13 y z14 antes de que llegara a producción.
 */
float elevLinear(vec2 p) {
  vec2 f = p - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  float a = elev(i + vec2(0.5, 0.5));
  float b = elev(i + vec2(1.5, 0.5));
  float c = elev(i + vec2(0.5, 1.5));
  float d = elev(i + vec2(1.5, 1.5));
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

/** La misma altura, suavizada: 5 × 5 con paso 2, o sea σ ≈ 2,8 píxeles del modelo. */
float lowpass(vec2 p) {
  float acc = 0.0, wsum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int k = -2; k <= 2; k++) {
      float w = exp(-0.25 * float(j * j + k * k));
      acc += w * elevLinear(p + vec2(float(k), float(j)) * 2.0);
      wsum += w;
    }
  }
  return acc / wsum;
}

/** Cuánto cielo ve este punto. 1 = llano abierto, 0 = fondo de tajo. */
float skyView(vec2 p, float h) {
  float blocked = 0.0;
  for (int d = 0; d < 8; d++) {
    float a = float(d) * PI / 4.0;
    vec2 dir = vec2(cos(a), sin(a));
    float worst = 0.0;
    for (int r = 0; r < 2; r++) {
      float dist = r == 0 ? 4.0 : 11.0;
      float dh = elevLinear(p + dir * dist) - h;
      worst = max(worst, dh / (dist * u_mpp));
    }
    blocked += clamp(worst, 0.0, 1.0);
  }
  return 1.0 - blocked / 8.0;
}

/** Luz de un foco sobre una normal, en el marco este–norte–arriba. */
float lamp(vec3 n, float azimuthDeg) {
  float a = azimuthDeg * DEG;
  float alt = u_altitude * DEG;
  vec3 l = vec3(sin(a) * cos(alt), cos(a) * cos(alt), sin(alt));
  return max(dot(n, l), 0.0);
}

void main() {
  // El eje Y del lienzo va al revés que el de la tesela.
  vec2 t = vec2(gl_FragCoord.x, u_out - gl_FragCoord.y) / u_out;
  vec2 p = u_window.xy + t * u_window.z;

  float h;
  vec2 grad;
  surface(p, h, grad);

  // La pendiente, en metros por metro. El gradiente en Y va hacia el sur, así
  // que en el marco este–norte cambia de signo.
  vec2 s = grad / u_mpp;
  vec3 n = normalize(vec3(-s.x, s.y, 1.0));

  float shade =
      u_weight.x * lamp(n, u_azimuth.x) +
      u_weight.y * lamp(n, u_azimuth.y) +
      u_weight.z * lamp(n, u_azimuth.z) +
      u_weight.w * lamp(n, u_azimuth.w);

  // La altura lisa, que es contra la que se miden los dos términos de relleno.
  // Restarle a la superficie bicúbica una lectura a saltos deja rejilla.
  float hs = elevLinear(p);
  float light = shade * mix(1.0, skyView(p, hs), u_sky);
  light += u_texture * clamp((hs - lowpass(p)) / u_textureScale, -1.0, 1.0);
  light = clamp(light, 0.0, 1.0);

  vec3 col = mix(c_shadow, c_highlight, light);
  col = mix(col, c_accent, smoothstep(u_accentAt, u_accentAt * 3.0, length(s)) * u_accent);
  col = mix(col, mix(c_warm, c_cool, clamp(h / u_summit, 0.0, 1.0)), u_tint);

  // El mar no es relieve: se deja pasar el fondo que hay debajo.
  //
  // La transición ARRANCA EN CERO, no antes. En terrarium el océano vale
  // exactamente 0 m, y con una rampa centrada en cero —de −2 a +2— el mar
  // entero salía a media opacidad: un rectángulo gris claro alrededor de la
  // isla, del tamaño de la cobertura del modelo. Se vio en dev/mapa.html.
  // Los 2,5 m de arriba son el mismo nivel del mar que usa el motor (1,5 m)
  // con margen para que la costa no salga dentada a 33 m de muestra.
  float a = smoothstep(0.0, 2.5, h);
  fragColor = vec4(col * a, a);
}`
