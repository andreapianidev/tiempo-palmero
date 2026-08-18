/* ═══════════════════════════════════════════════════════════════════════════
   LOS CUATRO REGÍMENES · qué tiempo hace en la isla de la portada

   La isla no solo gira: cambia de tiempo. Según se baja por la página pasa por
   cuatro regímenes reales de La Palma —calima, alisio con mar de nubes, temporal
   del suroeste y noche despejada— y cada uno REPINTA EL RELIEVE, porque cada uno
   trae su propio campo de temperatura.

   ── POR QUÉ ESTO ES EL ARGUMENTO DE LA PÁGINA Y NO UN ADORNO ────────────────
   Porque el gradiente altitudinal no es una constante de la isla: es la huella
   del régimen. Medido con el motor de la aplicación sobre la red del Cabildo,
   el mismo ajuste da:

     temporal del suroeste   7,9 °C/km   R² 0,96   una recta explica la isla
     alisio                  8,0 °C/km   R² 0,89   una recta, y buena
     noche despejada         6,0 °C/km   R² 0,60   dos capas: R² 0,77
     calima                 −2,4 °C/km   R² 0,11   se CALIENTA al subir

   Cuatro números que no se parecen en nada, sacados del mismo sitio y con el
   mismo código. Eso es lo que la isla de la portada enseña al girar.

   ── DE DÓNDE SALE CADA CIFRA ───────────────────────────────────────────────
   De `scripts/checks/regimenes.ts`, que las mide contra el archivo público del
   Cabildo (`bi.lapalma.es`) pasando por el motor de la aplicación: diagnóstico
   de averías para apartar los sensores rotos, cubos de 30 min para juntar una
   red que no está sincronizada, y `buildModel()` para ajustar. Las cotas, del
   DEM de `public/dem/`. Volver a medirlas es un comando:

       npx tsx scripts/checks/regimenes.ts 2025-11-06 2026-08-08 2026-03-21 2025-12-07

   Los días no se eligieron a ojo: los ordenó el reanálisis de Open-Meteo por la
   firma de cada régimen —polvo en suspensión para la calima, lluvia y viento del
   suroeste para el temporal, nube baja para el alisio, cielo raso y viento flojo
   para la noche— y solo los finalistas se midieron contra la red.

   ── LO QUE ESTO NO ES ──────────────────────────────────────────────────────
   No es el tiempo de ahora y no se presenta como tal: cada régimen lleva SU
   FECHA escrita en la etiqueta. Son cuatro días concretos de La Palma, medidos,
   con su número de estaciones y su R² al lado. El tiempo de ahora está en la
   aplicación, que es donde lleva el botón.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un régimen.
 *
 * CAMPO DE TEMPERATURA. Dos rectas y un salto, que es la forma que tiene de
 * verdad la atmósfera de esta isla:
 *
 *   cota < corte:  T = tCosta − gradAbajo · cota
 *   cota ≥ corte:  T = T(corte) + salto − gradArriba · (cota − corte)
 *
 * Con `salto = 0` y `gradArriba = gradAbajo` queda una sola recta, que es lo que
 * les toca al alisio y al temporal: ahí una recta explica la isla y meter un
 * corte sería inventarse una frontera que los datos no piden.
 *
 * ASPECTO. Todo lo demás son los parámetros que el sombreador necesita para que
 * ese aire se vea: el color y la fuerza de la luz, el color y el alcance de la
 * extinción, si la roca está mojada, dónde está la tapa de nubes y cuánto tapa,
 * si llueve y de dónde viene el flujo que amontona la nube contra una vertiente.
 */

/**
 * De dónde viene el flujo, como vector sobre el terreno.
 *
 * En la malla +x es este y +z es sur, así que un viento del azimut A —los grados
 * de los que VIENE, como los da la red— apunta a (sin A, −cos A). Sirve para que
 * la nube se amontone contra la vertiente que le toca: la del nordeste con el
 * alisio, la del oeste con el temporal. Sin esto la nube se pegaba siempre al
 * mismo flanco y el temporal parecía un alisio gris.
 */
function flujoDesde(azimutGrados) {
  var r = (azimutGrados * Math.PI) / 180
  return [Math.sin(r), -Math.cos(r)]
}

export var REGIMENES = [
  {
    clave: 'calima',
    nombre: 'Calima',
    fecha: '8 ago 2026',
    /* MEDIDO · 2026-08-08 09:00Z, 33 estaciones tras apartar Ecofinca Nogales
       (publicaba 70,0 °C clavados a 183 m).

       Una recta da −2,4 °C/km con R² 0,11: la temperatura NO sigue la altitud,
       y encima al revés. Dos capas suben el R² a 0,25 con el corte en 650 m,
       +1,1 °C/km por debajo, +1,6 por encima y un SALTO DE +3,6 °C al cruzarlo.
       Eso es la masa sahariana sentada encima: más caliente y más seca que el
       aire marino de abajo. La humedad lo confirma —80 % en la costa, 44 % en
       las medianías, 30 % en la cumbre—.

       Que ni con dos capas se pase de R² 0,25 no es un defecto de la medida: es
       lo que hay. Con calima, la altitud explica una cuarta parte de la
       temperatura de la isla y las tres cuartas partes que faltan son en qué
       ladera está cada uno. */
    tCosta: 25.4,
    corteKm: 0.65,
    gradAbajo: 1.1,
    gradArriba: 1.6,
    salto: 3.6,
    nota: '+3,6 °C al cruzar los 650 m · R² 0,25',

    luz: [1.0, 0.82, 0.55],
    luzFuerza: 0.66,
    ambiente: [0.26, 0.19, 0.12],
    /* El polvo no se ve: se ve lo que le hace a lo que hay detrás. Alcance
       corto y color de la propia calima, el mismo ámbar que `--amber-deep`. */
    extincion: [0.757, 0.573, 0.298],
    /* ALCANCE Y ESPESOR SON DOS COSAS, y hubo que separarlas. Al principio el
       espesor se deducía del alcance —un aire que cierra la vista es un aire que
       se ve— y con `alcance: 0,5` la calima no atenuaba la isla: LA BORRABA. La
       cuenta: la niebla se pone a `radio · 1,15 · alcance`, y como la isla está
       más o menos a `radio` de la cámara, con 0,5 quedaba a 0,83 del desvanecido
       y salía al 7 % de opacidad. Un manchón ámbar sin isla dentro.
       Así que el alcance se queda en 1,0 —la isla se ve, más cerrada que con
       alisio— y el color del polvo lo pone el espesor, que ahora es suyo. */
    alcance: 1.0,
    espesor: 0.85,
    mojado: 0,
    /* La calima tiene tapa, pero es de polvo y se ve poco: una lámina fina a la
       cota del corte, para que la masa sahariana tenga borde. */
    nubeKm: 0.65,
    nubeDensidad: 0.3,
    nubeColor: [0.72, 0.58, 0.36],
    nubeSombra: 0.15,
    lluvia: 0,
    flujo: flujoDesde(45),
    luces: 0,
    lunar: 0,
    mar: [0.1, 0.1, 0.1],
  },

  {
    clave: 'alisio',
    nombre: 'Alisio',
    fecha: '6 nov 2025',
    /* MEDIDO · 2025-11-06 09:00Z, 29 estaciones de 31 (DepLasCuevas apartada).

       Aquí una recta SÍ explica la isla: 8,0 °C/km con R² 0,89 y σ 0,93 °C
       desde una costa a 22,4 °C. Dos capas apenas mejoran (0,91), así que se
       queda en una: el corte que encontraría el ajuste no sería la inversión.

       Y LA INVERSIÓN ESTÁ, la enseña la humedad estación por estación:

         539–1.085 m   80 · 92 · 100 · 96 · 97 %   dentro de la nube
         1.561 m       11,8 %, y 1,6 °C MÁS CALIENTE que a 1.085 m

       Eso acota la tapa entre 1.085 y 1.561 m, y por eso el mar de nubes de la
       escena se pone a 1,2 km: es la cifra del hito del altímetro y cae dentro
       de lo medido. No se puede afinar más con esta red —entre esas dos cotas no
       hay ninguna estación más—, y decir 1.200 m clavados sería inventar una
       precisión que no existe. */
    tCosta: 22.4,
    corteKm: 2.5,
    gradAbajo: 8.0,
    gradArriba: 8.0,
    salto: 0,
    nota: '8,0 °C/km · R² 0,89 · una sola recta',

    luz: [1.0, 0.96, 0.88],
    luzFuerza: 0.92,
    ambiente: [0.11, 0.15, 0.22],
    extincion: [0.42, 0.5, 0.58],
    alcance: 1.35,
    espesor: 0.05,
    mojado: 0,
    nubeKm: 1.2,
    nubeDensidad: 0.95,
    nubeColor: [0.82, 0.82, 0.81],
    nubeSombra: 0.7,
    lluvia: 0,
    flujo: flujoDesde(45),
    luces: 0,
    lunar: 0,
    mar: [0.055, 0.094, 0.125],
  },

  {
    clave: 'temporal',
    nombre: 'Temporal del suroeste',
    fecha: '21 mar 2026',
    /* MEDIDO · 2026-03-21 14:00Z, 15 estaciones de 16. Ese día cayeron 55 mm en
       el valle y el viento sopló del OSO con rachas de 37 m/s.

       ES EL RÉGIMEN EN EL QUE EL MODELO ACIERTA, y es contraintuitivo: con la
       isla tapada de agua, una sola recta la explica entera. 7,9 °C/km, R² 0,96,
       σ 0,74 °C desde una costa a 18,8 °C. Dos capas no mejoran nada (0,97).

       El motivo está en la humedad: 78 % abajo, 89 % en las medianías, 99,2 % en
       la cumbre. Con el aire saturado y revuelto por el viento no hay masas
       apiladas ni inversión que romper —hay una sola atmósfera—, y entonces la
       altitud sí manda. */
    tCosta: 18.8,
    corteKm: 2.5,
    gradAbajo: 7.9,
    gradArriba: 7.9,
    salto: 0,
    nota: '7,9 °C/km · R² 0,96 · σ 0,74 °C',

    /* Luz de temporal: no hay sol, hay techo. Fuerza baja, color plano y frío, y
       casi todo lo que ilumina viene del ambiente. */
    luz: [0.72, 0.75, 0.8],
    luzFuerza: 0.3,
    ambiente: [0.2, 0.22, 0.26],
    extincion: [0.36, 0.38, 0.42],
    alcance: 1.0,
    espesor: 0.55,
    /* La roca mojada es más oscura y refleja distinto. Con esto el temporal deja
       de ser «lo mismo pero gris». */
    mojado: 0.85,
    /* La base baja hasta tapar las cumbres: 0,7 km está por debajo de la Cumbre
       Nueva, así que la isla se queda dentro de la nube, que es lo que pasa. */
    nubeKm: 0.7,
    nubeDensidad: 1,
    nubeColor: [0.4, 0.42, 0.46],
    nubeSombra: 0.95,
    lluvia: 0.85,
    /* Del OSO, 240°: la lluvia se amontona contra la vertiente de poniente. Es
       el giro que hace que este régimen no se confunda con el alisio. */
    flujo: flujoDesde(240),
    luces: 0,
    lunar: 0,
    mar: [0.07, 0.08, 0.09],
  },

  {
    clave: 'noche',
    nombre: 'Noche despejada',
    fecha: '7 dic 2025',
    /* MEDIDO · 2025-12-07 05:00Z, 29 estaciones tras apartar cinco que marcaban
       una temperatura clavada —galerías y túneles: el sitio es el que está
       quieto, no el sensor—.

       Una recta da 6,0 °C/km con R² 0,60 y σ 2,0 °C. Dos capas lo suben a 0,77
       con el corte en 750 m: +5,6 °C/km por debajo y −3,4 POR ENCIMA, con un
       salto de −4,9 °C al cruzarlo. Es la inversión nocturna de manual: sin sol,
       el suelo se enfría por radiación, el aire frío pesa y se encharca en los
       barrancos, y a media ladera se está más frío que 800 m más arriba.

       En el relieve se ve como una banda azul a media altura con la cumbre
       templada otra vez encima. No es un efecto: es dónde hace frío esa noche. */
    tCosta: 17.4,
    corteKm: 0.75,
    gradAbajo: 5.6,
    gradArriba: -3.4,
    salto: -4.9,
    nota: '−4,9 °C al cruzar los 750 m · R² 0,77',

    /* Luz de luna: fría, floja y desde otro sitio. No hay sol bajo el horizonte
       que valga —a estas alturas del ascenso el sol ya se ha puesto—. */
    luz: [0.62, 0.7, 0.9],
    luzFuerza: 0.26,
    ambiente: [0.05, 0.07, 0.13],
    extincion: [0.1, 0.13, 0.2],
    alcance: 1.5,
    espesor: 0.12,
    mojado: 0.2,
    nubeKm: 1.2,
    nubeDensidad: 0,
    nubeColor: [0.3, 0.34, 0.42],
    nubeSombra: 0,
    lluvia: 0,
    flujo: flujoDesde(45),
    /* LAS LUCES DE LA COSTA, ÁMBAR. No es una licencia: en La Palma el alumbrado
       público es ámbar por ley —la Ley del Cielo de 1988, la que protege al
       observatorio del Roque— y por eso los pueblos se ven de ese color desde
       arriba mientras la cumbre se queda negra. Es el argumento de la Reserva
       Starlight dicho en una imagen, y cae justo donde la página enciende las
       estrellas. */
    luces: 1,
    /* La luz deja de venir del sol y viene de la luna, que está en otro sitio.
       El cruce interpola las DOS direcciones, así que se ve el sol ponerse por
       un lado mientras la luna levanta por el otro. */
    lunar: 1,
    mar: [0.02, 0.03, 0.05],
  },
]

/**
 * DÓNDE MANDA CADA RÉGIMEN, en unidades de `--asc`.
 *
 * Cada uno tiene un tramo en el que manda entero, y entre dos tramos hay un
 * CRUCE CORTO —`CRUCE` de ancho— en el que se mezcla todo: el campo de
 * temperatura, la luz, la nube, la lluvia y la dirección de la luz. Lo que se ve
 * en el cruce es un régimen convirtiéndose en el siguiente.
 *
 * LOS CRUCES SON CORTOS A PROPÓSITO. La primera versión repartía la página entre
 * los centros de los cuatro regímenes, y el resultado era que casi todo el
 * recorrido era una mezcla y casi nada era un régimen: a `--asc` 0,68 la etiqueta
 * ya decía «Noche despejada» mientras seguía lloviendo y el sol estaba a medio
 * poner. Con 0,09 de cruce, cada régimen se sostiene tres veces más de lo que
 * tarda en irse.
 *
 * Los límites van pegados a lo que la página ya hacía en cada tramo, porque el
 * fondo de CSS y la isla se ven a la vez y no pueden contar cosas distintas:
 *
 *   calima    0,00–0,22  la calima ámbar de `.c-costa` está a tope en 0 y se
 *                        apaga sobre 0,55; el hito dice «0 m · el mar»
 *   alisio    0,31–0,46  el mar de nubes de `.c-nubes` entra a 0,08 y cruza en
 *                        0,47, que es donde acaba este tramo
 *   temporal  0,55–0,70  cae en la sección 02, la que explica el error del
 *                        modelo: el régimen en el que una recta acierta es justo
 *                        el sitio donde la página habla de acertar
 *   noche     0,79–1,00  `.c-estrellas` empieza a 0,60 y llega a 1 sobre 0,89
 */
export var LIMITES = [0.22, 0.46, 0.7]
export var CRUCE = 0.09

function mezcla(a, b, t) {
  return a + (b - a) * t
}

function mezclaVec(a, b, t) {
  return [mezcla(a[0], b[0], t), mezcla(a[1], b[1], t), mezcla(a[2], b[2], t)]
}

function suave(t) {
  return t * t * (3 - 2 * t)
}

/**
 * El régimen que toca en `asc`, ya mezclado con el siguiente.
 *
 * Devuelve un objeto plano con los números listos para subir a la tarjeta, más
 * `nombre`, `fecha` y `nota` del régimen que más pesa —la etiqueta no se puede
 * interpolar, así que cambia de golpe al pasar la mitad del cruce—.
 *
 * Se reutiliza el mismo objeto en cada llamada: esto corre 60 veces por segundo
 * y no hay ninguna razón para dejarle basura al recolector.
 */
var salida = {
  clave: '',
  nombre: '',
  fecha: '',
  nota: '',
  tCosta: 0,
  corteKm: 0,
  gradAbajo: 0,
  gradArriba: 0,
  salto: 0,
  luz: [0, 0, 0],
  luzFuerza: 0,
  ambiente: [0, 0, 0],
  extincion: [0, 0, 0],
  alcance: 0,
  espesor: 0,
  mojado: 0,
  nubeKm: 0,
  nubeDensidad: 0,
  nubeColor: [0, 0, 0],
  nubeSombra: 0,
  lluvia: 0,
  flujo: [0, 0],
  luces: 0,
  lunar: 0,
  mar: [0, 0, 0],
}

export function regimenEn(asc) {
  // En qué cruce cae, si cae en alguno. Fuera de los cruces, `t` es 0 y el
  // régimen manda solo: ni una multiplicación de más.
  var i = 0
  var t = 0
  for (var k = 0; k < LIMITES.length; k++) {
    if (asc >= LIMITES[k] + CRUCE) {
      i = k + 1
    } else if (asc > LIMITES[k]) {
      i = k
      t = suave((asc - LIMITES[k]) / CRUCE)
      break
    } else {
      break
    }
  }

  var a = REGIMENES[i]
  var b = REGIMENES[Math.min(i + 1, REGIMENES.length - 1)]

  var manda = t < 0.5 ? a : b
  salida.clave = manda.clave
  salida.nombre = manda.nombre
  salida.fecha = manda.fecha
  salida.nota = manda.nota

  salida.tCosta = mezcla(a.tCosta, b.tCosta, t)
  salida.corteKm = mezcla(a.corteKm, b.corteKm, t)
  salida.gradAbajo = mezcla(a.gradAbajo, b.gradAbajo, t)
  salida.gradArriba = mezcla(a.gradArriba, b.gradArriba, t)
  salida.salto = mezcla(a.salto, b.salto, t)

  salida.luz = mezclaVec(a.luz, b.luz, t)
  salida.luzFuerza = mezcla(a.luzFuerza, b.luzFuerza, t)
  salida.ambiente = mezclaVec(a.ambiente, b.ambiente, t)
  salida.extincion = mezclaVec(a.extincion, b.extincion, t)
  salida.alcance = mezcla(a.alcance, b.alcance, t)
  salida.espesor = mezcla(a.espesor, b.espesor, t)
  salida.mojado = mezcla(a.mojado, b.mojado, t)
  salida.nubeKm = mezcla(a.nubeKm, b.nubeKm, t)
  salida.nubeDensidad = mezcla(a.nubeDensidad, b.nubeDensidad, t)
  salida.nubeColor = mezclaVec(a.nubeColor, b.nubeColor, t)
  salida.nubeSombra = mezcla(a.nubeSombra, b.nubeSombra, t)
  salida.lluvia = mezcla(a.lluvia, b.lluvia, t)
  salida.flujo[0] = mezcla(a.flujo[0], b.flujo[0], t)
  salida.flujo[1] = mezcla(a.flujo[1], b.flujo[1], t)
  salida.luces = mezcla(a.luces, b.luces, t)
  salida.lunar = mezcla(a.lunar, b.lunar, t)
  salida.mar = mezclaVec(a.mar, b.mar, t)

  return salida
}
