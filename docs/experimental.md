# La sección experimental

Las seis funciones que dibujan más de lo que miden: qué parte es dato, qué
parte es representación, y qué las mantiene fuera de las variables normales.

← Volver al [README](../README.md)

---


Hay un sitio aparte en la barra lateral, **«Experimental»**, plegado y detrás de
un aviso, para las funciones que no se sostienen igual que el resto de la
aplicación. Van ahí y no entre las variables normales porque ponerlas al lado de
la temperatura las igualaría con una medida. Hoy hay **seis**, y todas tienen
en común lo mismo: dibujan más de lo que miden.

Dos de ellas no nacieron aquí, se mudaron:

- **El viento animado** estaba en la lista de capas, el primero, entre las
  estaciones meteorológicas y los sensores de CO₂. Esa vecindad decía algo que
  no es cierto: que lo que se dibuja son medidas. Las partículas siguen un campo
  continuo que no existe en ningún sensor —se construye mezclando las estaciones
  que publican dirección con una rejilla del modelo donde no llega ninguna—, y
  en una isla donde dos puntos a 5 km pueden soplar al revés ese relleno es una
  parte grande de lo que se ve. La cifra que lo sostiene sigue en su sección
  «Viento», con el reparto entre lo medido y lo modelado.
- **El mar en movimiento** estaba en «Océano», compartiendo lista con el
  balizamiento de OpenSeaMap y la batimetría de EMODnet. Pero esas dos son
  cartografía ajena, publicada, que se pide y se dibuja tal cual, y esto es una
  superficie CALCULADA: la altura de ola, el periodo, la marea y la profundidad
  son dato, pero la ola que se ve romper en un punto la pone un sombreador.

Y al mudarse el mar, las dos cartas **han dejado de depender de él**. Estaban
deshabilitadas mientras el océano estuviera apagado, razonando que sin agua
debajo serían dos capas sueltas sobre el color de fondo. No es cierto —se
dibujan sobre cualquier fondo, y sobre la ortofoto la batimetría se lee
perfectamente— y el precio era absurdo: para ver una carta publicada por EMODnet
había que encender antes una simulación que no tiene nada que ver con ella, y
que además se lleva el fondo al satélite cuando la carta topográfica no dibuja
mar.

### El cielo estrellado: 8920 estrellas y un fotómetro que decide cuántas se ven

Dibuja el cielo real de este instante sobre la isla. Es la función de esta
sección que **más se parece a un dato y menos lo es**, y a la vez la que tiene
el ancla medida más limpia de todas — las dos cosas a la vez, y conviene separar
cuál es cuál.

| Dato | Dibujo |
|---|---|
| La dirección de cada estrella (ICRS, catálogo HYG) | Cuántos píxeles mide |
| Su magnitud y su índice de color B−V | El centelleo |
| El brillo de fondo del cielo, mag/arcsec², **medido** | El halo alrededor del punto |
| La presión y la temperatura, para la refracción | Lo blanqueado que sale el color |
| La altitud del observador, del DEM | Las líneas de las constelaciones |

**Lo que decide cuántas estrellas hay no es una constante: es la red de
fotómetros del Cabildo.** El portal publica `skyobservation_lastdata`, 59
estaciones que miden el brillo del fondo de cielo en magnitudes por segundo de
arco cuadrado. De ahí sale la magnitud límite a simple vista por la relación de
Schaefer (1990), y de la magnitud límite sale un corte sobre el catálogo. Lo que
eso significa en esta isla, con lecturas reales del 19 de agosto de 2026:

| Sitio | Brillo medido | Magnitud límite | Estrellas dibujadas |
|---|---|---|---|
| SkyPalma (Garafía) | 21,52 | 6,39 | **7885** |
| Centro de Visitantes del Roque | 21,13 | 6,19 | 6180 |
| Mirador Las Toscas | 20,60 | 5,88 | 4420 |
| Colegio La Palmita | 19,50 | 5,14 | 1930 |
| Cementerio de Santa Cruz | 18,00 | 3,97 | 504 |
| CEIP Santo Domingo (Los Llanos) | 16,19 | 2,37 | **83** |

De 7885 a 83 en 34 km. La contaminación lumínica no se enseña con un mapa de
colores: se enseña con las estrellas que faltan.

**El denominador se dice entero.** De las 59 registradas, el 19 de agosto de
2026 a las 20:35 UTC habían publicado algo 15 en el último mes, 13 en el último
día y **7 en la última hora**. El panel dice «7 de 59».

**Los tres valores que no son medidas, y cómo se distinguen sin adivinar.**
Medido sobre una **lunación entera** —203 918 lecturas de 15 estaciones entre el
21 de julio y el 19 de agosto de 2026, que baja `scripts/checks/sqm-archivo.ts`—
hay tres formas de «no hay dato» disfrazadas de número: el centinela `−1000`, el
`0` exacto que ponen los TESS-W de día (101 923 lecturas), y el suelo de
saturación del hardware «Smart» entre 9,02 y 9,99 (14 889), que es el peligroso
porque tiene decimales y desviación y parece una medida. Entre las tres,
**116 812 artefactos contra 87 106 medidas reales: más de la mitad de lo que
publica la red no es una medida.**

No se filtran por el valor sino por la física — **un fotómetro de cielo nocturno
no mide nada mientras el sol esté arriba**—, y ese criterio se lleva 116 714 de
los 116 812: el 99,92 %.

**Pero no los 116 812, y esto corrige lo que aquí ponía.** Sobre dos días de
archivo el criterio solar parecía llevárselos «sin excepción». Sobre la lunación
entera se le escapan **98**, y tienen nombre: `stars403` publica 68 ceros
exactos con el sol hasta −27,4°, y tres estaciones «Smart» publican el suelo
9,5 con el sol hasta −46,2°. O sea que ese suelo no es solo saturación de día:
también es lo que el sensor emite cuando falla de noche. Los caza el umbral de
valor en 11,0, que por tanto **no es un cinturón de repuesto sino el único
filtro que los ve**. Con los dos juntos: 116 812 de 116 812, cero fugas, y cero
de las 81 365 medidas reales de noche perdidas.

La medida real más brillante de la lunación con el sol puesto son **12,43**; el
artefacto más oscuro, **9,99**. Entre los dos hay 2,44 magnitudes de nada, y el
umbral cae a 1,01 del artefacto y a 1,43 de la medida.

**Lo que el criterio solar sí se lleva y no es basura**, dicho con precisión:
2380 lecturas de valor plausible con el sol por encima de −6°. Unas 1700 son
crepúsculos civiles reales de dos estaciones urbanas —el colegio de Los Llanos,
con el sol hasta −2,3° y valores de 11,0 a 15,0— y el resto son imposibles
(`stars394` publica 16,9 con el sol a +24,7°). Las primeras se pierden y da
igual: con el sol a −3° no hay ni una estrella que contar. La frase correcta es
«no se lleva ninguna lectura que sirva para esto», no «ninguna lectura buena».

Y hay un cuarto caso, el sensor **congelado**: el fotómetro del Centro de
Visitantes del Roque publicó cuatro veces, el 17 y el 18 de agosto, exactamente
la misma terna —21,126 de brillo, −10,09 de temperatura de cielo, «Despejado»—
a las 05:32, 13:15, 07:31 y 14:14. La hora avanzaba y la medida no. Se descarta
a la tercera repetición, no a la segunda: republicar una vez el último dato
antes de tener uno nuevo es normal.

**Cuando no hay fotómetro cerca, se modela y se dice.** El límite son 12 km, y
la razón cambió al medirla. Antes era «el percentil 90 de la distancia al
fotómetro más cercano barriendo el recuadro del mapa»; repetida hoy esa cuenta
da 15,2 km de percentil 90 y un 78,6 % de cobertura, no el 90 % que decía. Pero
el problema no es que la cifra envejeciera: es que cubrir un recuadro que es
medio océano no dice nada.

**La pregunta buena es a partir de qué distancia un fotómetro deja de predecir a
otro**, y eso se mide con parejas de lecturas simultáneas de noche cerrada y sin
luna. Sobre la lunación, 14 016 parejas:

| Distancia | Parejas | \|Δ\| mediana |
|---|---:|---:|
| 0–1 km | 516 | **0,60** ← dos aparatos en el mismo sitio |
| 2–4 km | 762 | 0,22 |
| 6–8 km | 1195 | 0,16 |
| 8–10 km | 1520 | 0,71 |
| 10–12 km | 185 | 0,26 |
| **12–15 km** | 2105 | **1,13** |
| 15–20 km | 2414 | 1,14 |
| 20–40 km | 3762 | 0,90 |

Hay un escalón y cae justo en 12. Por debajo, un fotómetro predice a otro tan
bien o mejor que dos aparatos plantados en el mismo sitio —que ya discrepan
0,60 mag, el suelo de ruido de esta red—. A partir de 12 km la discrepancia se
dobla y deja de cambiar con la distancia, que es la firma de haber dejado de
predecir. Sobre un cielo de 21,1, 1,13 mag de error son **el 54 % de las
estrellas**: de 6076 a 2783.

Más lejos, el brillo sale de un modelo y el panel cambia de frase. **No se
interpola**: entre el Roque a 21,13 y un colegio de Los Llanos a 16,19 hay
12 km, y un campo interpolado pondría 18,7 en mitad de la Caldera de
Taburiente, donde no hay ni una luz. La discontinuidad ES el fenómeno.

La ley del crepúsculo de ese modelo también está medida aquí, y sale igual en
cinco estaciones repartidas entre los 300 y los 2382 m: el flujo del cielo es el
del cielo oscuro más `10^(a + 0,438·h)`, con `h` la altura del sol. En
magnitudes son **1,10 mag de cielo por cada grado que el sol baja**, con 0,13 de
residuo medio sobre 832 lecturas.

**La luna ya no arrastra un sesgo declarado: está calibrada, y el motivo para no
hacerlo antes resultó estar equivocado.** Krisciunas y Schaefer (1991) daba el
cielo 0,64 mag más oscuro del que la red mide sobre dos noches con la luna al
29-39 %. Un factor de 3,5 sobre el flujo lunar lo arreglaba, y se descartó con
este argumento: llevado a luna llena daría 16,3-17,4 mag/arcsec² «cuando la
bibliografía publica 17,5-18,5 para un sitio oscuro».

Ese argumento comparaba el modelo con un artículo teniendo la red delante.
**Medido sobre 987 lecturas con la luna llena por encima de 40° en los seis
sitios oscuros de la isla, lo que los fotómetros del Cabildo miden es
16,18-17,26, mediana 16,62.** El cielo de La Palma con luna llena es más de una
magnitud más claro que el sitio oscuro de manual —lo más probable es el polvo
sahariano, que dispersa la luz de la luna mucho mejor que la atmósfera para la
que K&S se calibró—. O sea que el factor no rompía la luna llena: la rompía la
referencia.

Y con la lunación entera se puede ver algo que dos noches no dicen: **el sesgo
crece con la fase**, de 0,15 mag en la creciente fina a 1,12 en la llena. Eso no
es un desplazamiento —restar una constante deja −1,09 en la nueva y +0,27 en la
llena— sino la amplitud del término lunar. Multiplicar el flujo por 3 lo aplana
en todas las fases: sesgo global −0,03 y error absoluto medio de 1,01 a
**0,54 mag**, la mitad.

Es una **calibración local** y se llama así: el mismo tipo de ajuste que ya
llevaba la ley del crepúsculo, medido en esta red y válido para esta isla. Quien
lleve esto a otro sitio tiene que volver a medirlo.

**Dónde están las estrellas: cuatro efectos, y cuánto vale cada uno.** El
catálogo da direcciones en un sistema fijo; lo que se dibuja es dónde están
vistas desde aquí ahora.

| Efecto | Cuánto mueve | ¿Entra? |
|---|---|---|
| Precesión J2000 → hoy | **22 minutos de arco** en 26 años | Sí, es el grande |
| Refracción atmosférica | **34 minutos** en el horizonte | Sí, es el otro grande |
| Nutación | 17 segundos | Sí, sale gratis |
| Aberración anual | 20,5 segundos | Sí, son tres líneas |

Los dos grandes son los que se ven: 22' son dos tercios de la luna llena, y en
el horizonte el aire levanta un astro un diámetro lunar entero. Todo eso va en
**una matriz de 3 × 3 que se calcula una vez por fotograma**, y el sombreador la
aplica a las 8920 estrellas: medio millón de conversiones por segundo que en
JavaScript no cabrían en un teléfono y en la GPU son una llamada de dibujo.
Comparada contra `astronomy-engine` —que implementa VSOP87 y NOVAS C 3.1— sobre
64 posiciones repartidas por todo el cielo y por veinte años, la cadena coincide
con una mediana de **0,31 segundos de arco** y un peor caso de 0,54.

**La refracción se calcula con la presión medida, no con la de manual.** Es
proporcional a la densidad del aire: en el Roque, a 757 hPa, vale un 25 % menos
que al nivel del mar — 8 minutos de arco en el horizonte, que es lo que separa
ver salir una estrella de no verla. Y el horizonte de una cumbre no está en
cero: desde 2387 m está **1,43° por debajo**, así que desde ahí arriba se ven
estrellas que desde la costa están puestas.

**Las figuras de las constelaciones no son un dato astronómico**, son una
convención cultural, y por eso llevan su propio interruptor. Se guardan como
parejas de índices al catálogo y no como coordenadas: los 893 vértices del
fichero de origen se enganchan a la estrella más cercana con una mediana de
**0,16 segundos de arco** —el peor caso, 30,6, es α Centauri, que es doble—, así
que precesan con sus estrellas y ninguna puede quedar colgando de un punto
vacío. Se apagan solas cuando el cielo está tan claro que unirían estrellas que
ya no se ven.

**El centelleo tiene exponente.** La amplitud crece como `X^1,75` —la masa de
aire elevada al exponente de Young (1967)— y por eso Sirio recién salido tiembla
y Vega en el cenit no. Cada estrella lleva su fase, para que no titilen a la vez.

**El corte por magnitud es un prefijo del fichero.** El catálogo viene ordenado
de más brillante a más débil desde `prepare-cielo.ts`, así que «¿cuáles se ven
esta noche?» es una búsqueda binaria y un `drawArrays` de `[0, k)`. Sin ese
orden habría que recorrer las 8920 cada fotograma para descartar las que sobran.

#### Y la luna, que es lo primero que se mira

Con el cielo encendido se dibuja también **el disco lunar, con su fase de
verdad**: la posición, el tamaño, la orientación del cuerno y la luz que echa
salen de una efeméride, no de una imagen girada.

**Hubo que cambiar la luna antes de poder dibujarla.** La que había —un término
de la serie de Meeus, geocéntrica, con UTC por Tiempo Terrestre— servía para lo
único que se le pedía hasta entonces, que era mover el reflejo sobre el agua.
Medida contra `astronomy-engine` a lo largo de dos años cada tres horas desde el
Roque, se equivocaba en **70,7 minutos de arco de mediana y 216 en el peor
caso**: la luna llena mide 31'. Dibujarla así habría sido poner una luna
perfectamente plausible a más de dos diámetros de donde está.

| | mediana | p95 | peor caso |
|---|---:|---:|---:|
| La serie de un término, geocéntrica | 70,7′ | 152,1′ | 216,3′ |
| **La de ahora, topocéntrica** | **0,06′** | **0,13′** | **0,17′** |

Los tres errores eran tres, y hubo que arreglar los tres:

1. **La serie.** Entran las tablas 47.A y 47.B de Meeus completas —60 términos de
   longitud y distancia, 60 de latitud— más los aditivos de Venus, Júpiter y el
   achatamiento. Un término solo se deja fuera la evección (1,27°), la variación
   (0,66°) y la ecuación anual (0,19°).
2. **La paralaje.** La luna está a 60 radios terrestres: mirarla desde la
   superficie y no desde el centro de la Tierra la corre **22,8' de mediana**
   sobre La Palma y hasta 57' en el horizonte. Es el único astro de la
   aplicación donde eso importa —para el sol son 8,8" y para una estrella, cero—
   y de ahí sale además que la luna del cenit se vea un 1,7 % más grande que la
   del horizonte, que es la única parte de la «ilusión lunar» que es verdad.
3. **El reloj.** Las efemérides van en Tiempo Terrestre y la aplicación en UTC.
   Son 69 segundos, y la luna corre 0,55" por segundo: **38"**. Es el único
   sitio del repositorio donde esa diferencia deja de ser despreciable, y se vio
   porque dejaba un sesgo constante de −41" en longitud con la latitud y la
   distancia clavadas — la firma de un error de reloj y no de un término que
   falte.

**La fase se calcula por píxel y no es un sprite girado.** El terminador no es
un diámetro rotado: es media elipse cuyo eje menor vale `cos α`. En coordenadas
del disco, la parte iluminada es simplemente `x·sen α + z·cos α > 0`, y esa
condición dibuja la curva ella sola — no hay una fórmula del terminador escrita
aparte que pueda discrepar de la iluminación. El sombreado es **Lommel-Seeliger**
y no Lambert, que es la diferencia entre una luna y una bola de billar: la llena
de verdad se ve plana como una moneda porque su suelo es polvo
retrorreflectante.

**Media luna no alumbra la mitad: alumbra el 9 %.** Es la curva de fase de
Krisciunas y Schaefer, la misma con la que se calcula cuánto cielo tapa la luna,
y hasta este cambio el mar no la usaba — dibujaba la columna de reflejo
proporcional a la fracción iluminada, o sea **cinco veces y media más brillante
de la cuenta en cuarto creciente**.

| Fracción iluminada | Luz que echa | Veces menos que lo lineal |
|---:|---:|---:|
| 1,00 | 100 % | — |
| 0,75 | 22,7 % | 3,3 |
| 0,50 | **9,1 %** | **5,5** |
| 0,25 | 2,6 % | 9,5 |
| 0,10 | 0,7 % | 14,5 |

**Y lo que es dibujo va dicho.** El enrojecimiento al bajar sale de la extinción
medida del sitio repartida por canal —desde el Roque la razón azul/rojo pasa de
0,75 a 60° de altura a 0,089 a 3°, que es la luna de color ladrillo que sale por
el mar—. El brillo del disco no: la luna llena es dieciocho magnitudes más
brillante que el cielo que tiene al lado y eso en un monitor no cabe. La luz
cenicienta tiene la forma física exacta —proporcional a `1 − k`, que es la
fracción iluminada de la Tierra vista desde la luna— y la amplitud dibujada, un
2,2 % contra las diez milésimas de verdad.

#### Y los planetas, y una tabla que sobraba

Los cinco de siempre más Urano, que con un cielo de 21,5 entra por poco. Hubo
que decidir de dónde salen sus posiciones, y aquí la primera respuesta fue la
equivocada — está contada entera porque el modo de equivocarse es reutilizable.

**Lo que había.** Escribir la serie VSOP87 a mano son varios miles de
coeficientes transcritos, y con la luna fueron 120 y ya era el límite. La
alternativa, `astronomy-engine` en el navegador, se descartó porque «son 200 KB
de JavaScript que se descargan mire alguien el cielo o no». Así que se hizo lo
que hacen las efemérides de verdad: ajustar polinomios de Chebyshev a la
posición heliocéntrica y servirlos como `planetas.bin`, igual que un fichero SPK
del JPL en pequeño.

**Los 200 KB eran el fichero sin minificar leído del disco.** No es lo que viaja
por el cable, y la decisión entera colgaba de esa cifra. Medido contra el build
de este repositorio, con un `import()` dinámico que Rollup separa en su propio
fragmento:

| | en el cable | caduca |
|---|---:|---|
| `planetas.bin` (la tabla) | 35,85 KB gz | 1 ene 2036 |
| `astronomy-engine` (el fragmento) | **19,61 KB gz** | nunca |

La tabla de coeficientes pesaba **casi el doble** que la biblioteca que se
escribió para no descargar: son flotantes binarios y no comprimen, mientras que
el JavaScript sí. Y el bundle principal no crece, que es la condición de la que
depende todo lo demás — hay una prueba que falla si alguien mete un `import`
estático y funde el fragmento con el principal.

**El coste por fotograma era el argumento de verdad**, porque la capa recalcula
los seis planetas en cada `render`, y se midió antes de tocar nada: VSOP87
entero cuesta **0,0735 ms** por fotograma contra los **0,0103 ms** del
polinomio. Siete veces más, y el 0,44 % de un fotograma de 16,7 ms.

**Y la precisión no se movió**, que es el dato que cierra el caso. Contra
`astronomy-engine`, sobre tres años cada 36 horas: **mediana de 0,10″ a 0,36″
según el planeta y peor caso 0,57″** — las mismas cifras con la tabla y sin
ella, hasta la milésima de segundo de arco. El ajuste se había apretado a 100 km
de error, y ese término nunca llegó a asomar por encima del resto de la cadena:
la precesión, la nutación, la aberración y el tiempo de luz que pone `sight.ts`
dominan el residuo enteros. La tabla compraba una precisión que no se podía
usar, y la cobraba a 35,85 KB.

Lo que se fue con ella: `table.ts`, `scripts/prepare-planetas.ts`, el binario, el
aviso de «fuera de rango» del panel y una prueba de calendario que iba a fallar
en 2034 para recordar que había que regenerarlo. Las magnitudes se quedan como
estaban, las del *Astronomical Almanac*, con los anillos de Saturno dentro
—valen 0,9 magnitudes según su inclinación, y sin ese término Saturno se
equivocaba 0,50 de mediana en vez de 0,12—.

**Se dibujan con el sombreador de las estrellas, no con uno propio.** Un planeta
a simple vista es lo mismo que una estrella —Júpiter mide 50 segundos de arco y
el ojo resuelve 60— y tiene que recibir el mismo trato en aberración,
precesión, nutación, refracción, extinción y desvanecido. Un segundo sombreador
con esas seis cuentas otra vez habría abierto la puerta a que Júpiter y la
estrella de al lado se refracten distinto: un error que nadie ve y que está ahí
todas las noches.

**La única diferencia es que no centellean**, y eso es física: una estrella es un
punto y la turbulencia le mueve todo el haz a la vez; un planeta es un disco de
muchos puntos cuyos parpadeos se promedian. Es la forma clásica de distinguirlos
sin saber nada de astronomía, y dibujarlos temblando habría borrado la única
pista que tiene alguien a simple vista.

**Un error que este trabajo cazó y merece quedar escrito.** La primera versión
pasaba la tabla por una rotación de la oblicuidad «para llevarla a ecuatorial»,
sin mirar que `HelioVector` ya devuelve el ecuador medio de J2000. El resultado
era el cielo entero girado 23° —14° de error de mediana— con los planetas en
posiciones perfectamente plausibles, mientras las distancias, las magnitudes y
los diámetros salían **exactos**, porque una rotación no cambia el módulo.
Mirando el mapa no se habría notado nunca; lo cazó la comparación contra la
efeméride.

---

### La escena atmosférica: nubes y lluvia en volumen

Dibuja el tiempo que hay ahora mismo **como volumen sobre el relieve**: bancos
de nubes a su cota, moviéndose, y cortinas de lluvia colgando de las que llueven
hasta el suelo que tienen debajo.

**Qué es dato y qué es dibujo**, que es la distinción que sostiene toda la
función:

| Dato | Dibujo |
|---|---|
| Nubosidad de cada piso (bajo, medio, alto), % | La silueta concreta de cada nube |
| Precipitación, mm en la última hora | Cuántos hilos tiene una cortina de lluvia |
| Viento que arrastra cada piso | El tamaño de cada mota |
| La cota a la que va cada capa | — |

El modelo dice que hay un 40 % de cielo cubierto a 1200 m. No dice —ni puede—
que haya un cúmulo concreto en un punto concreto con esa forma. Esa parte es una
representación plausible de una cifra real, y el panel lo dice con esas palabras:
**no es un radar ni una observación**.

**Cuántas nubes hay no se elige: se despeja.** Repartiendo discos de radio `R` al
azar sobre un área `A`, la fracción de suelo que tapan es `1 − exp(−λ·πR²)`
—modelo booleano de discos—. Despejando, para tapar una fracción `c` hacen falta
`N = −(A/πR²)·ln(1−c)` discos. Así, cuando el modelo dice 40 %, lo que se dibuja
tapa un 40 % del cielo **contando el solape**, que es lo que hace que la regla
ingenua `N ∝ c` se quede corta en cuanto se pasa de la mitad. Hay una prueba que
lo mide por Monte Carlo —tira 4000 puntos y cuenta en cuántos cae una mota— y
comprueba que lo dibujado cae a menos de **cinco puntos** de lo que el modelo
dijo, barriendo el 10, el 20, el 50, el 80 y el 95 %. Medido, el peor caso real
es de 2,9 puntos, y se queda corto por abajo y largo por arriba:

| pedido | 10 % | 20 % | 50 % | 80 % | 95 % |
|---|---|---|---|---|---|
| dibujado | 8,4 % | 17,2 % | 48,4 % | 81,3 % | 97,4 % |

Esa tolerancia empezó en diez puntos y era el agujero: cuando las motas pasaron
a tener dos tamaños, el error real se fue a doce y el test no se enteró. Ahora
está en cinco, que es lo que la geometría sostiene de verdad.

Y el radio crece con la cobertura, que es la otra mitad de la idea: un cielo al
10 % son cúmulos sueltos de buen tiempo y uno al 95 % es una **manta**, que es lo
que se ve desde la Cumbre cuando el alisio aprieta. Hacer crecer `R` con `c`
convierte una cosa en la otra de forma continua.

**El viento no se escala: se pide a su altura.** La solución fácil era coger los
10 m que la aplicación ya descarga y multiplicarlos por un factor. Medido en el
centro de la isla el 15 de agosto de 2026 a las 08:30 UTC, en la misma petición:

| Nivel | Velocidad | Dirección |
|---|---|---|
| 10 m | 3,3 m/s | **51°** (alisio del noreste) |
| 900 hPa (~1000 m) | 5,3 m/s | **44°** (el mismo alisio, más arriba) |
| 700 hPa (~3000 m) | 6,2 m/s | **275°** (del oeste — casi el contrario) |
| 300 hPa (~9200 m) | 6,4 m/s | 21° |

Los 231° que separan el piso bajo del medio son un cizallamiento normal, y
significan que cualquier factor aplicado al viento de superficie habría
arrastrado las nubes medias **justo hacia el lado contrario** al que van. No es
un error de matiz en la velocidad: es la dirección al revés. Así que cada piso
pide el viento de su nivel de presión, en la misma llamada.

**La cota de la capa baja sale de la medida cuando la hay.** Los 3 km con los que
Open-Meteo define `cloud_cover_low` son un techo de clasificación, no una altura:
una nube de alisio está pegada a la inversión, que en esta isla anda por los
1000-1600 m. Esa cota ya la mide el
[mar de nubes](datos-del-cabildo.md#el-mar-de-nubes-la-cumbre-y-los-senderos-agosto-2026) contra los
sondeos, así que cuando hay manta diagnosticada la capa baja se dibuja **en
ella**; si no, en el nivel de condensación por ascenso; y si tampoco, en una cota
por defecto que el panel etiqueta como la menos fiable de las tres. El panel
siempre dice cuál de los tres casos está viendo.

**Los umbrales de lluvia están medidos contra esta isla, no copiados.** El
criterio clásico de lluvia fuerte —7,6 mm/h— es de climas continentales y aquí no
describe nada. Sobre dos años de archivo horario (ago 2024 – ago 2026) en tres
puntos —barlovento, cumbre y sotavento—:

| | Barlovento | Cumbre | Sotavento |
|---|---|---|---|
| Horas con lluvia | 23,3 % | 17,9 % | 10,4 % |
| Mediana de esas horas | 0,20 mm/h | 0,20 | 0,20 |
| Percentil 99 | 3,6 mm/h | 3,9 | 5,1 |
| Máximo en dos años | 11,1 mm/h | 14,2 | 11,4 |

Con el umbral en 7,6 la escena habría enseñado lluvia intensa un puñado de horas
en dos años: un estado que no se ve nunca es un estado que no está. Está en
**3,5 mm/h**, justo por debajo del percentil 99, y el mínimo para dibujar algo en
0,05 —porque la lluvia normal de La Palma es la lluvia fina, y un umbral cómodo
de 0,5 se habría comido la mitad de las veces que de verdad llueve.

**Y la lluvia cae a 7 m/s**, que es la velocidad terminal de una gota de 2 mm a
nivel del mar. No se ha acelerado para que se note más: desde una base a 1200 m
sobre un suelo a 400, un hilo tarda unos dos minutos en llegar, y eso es lo que
hace que se lea como una cortina que cuelga y no como lluvia de videojuego. Cada
hilo conoce la cota del terreno bajo él —el mismo DEM que sombrea el mapa— y
muere al alcanzarla, para que no se vea llover por dentro de la montaña.

**Las nubes hierven, no solo se desplazan.** Una masa arrastrada rígida por el
viento se lee como una calcomanía deslizándose sobre el mapa: la silueta no
cambia nunca y el ojo lo nota, aunque no sepa decir qué falla. Un cúmulo real
tiene circulación interna —el aire sube por el centro, se desborda por la cima y
baja por los lados— y lo que se ve desde fuera son lóbulos que crecen y se
deshacen. Cada mota oscila alrededor de su sitio con una fase propia y estable,
un 9 % del radio de la nube, con periodos repartidos entre 34 y 90 s. No es un
modelo de esa circulación —es dibujo, y del descarado—, pero las escalas están
tomadas de lo real: por debajo de ~20 s la nube vibra en vez de hervir, y por
encima de ~2 min no se aprecia movimiento en el rato que alguien mira el mapa.
Las motas de una misma nube **no** comparten fase; si la compartieran, la nube se
balancearía en bloque, que es el mismo defecto con más pasos.

**Cómo se dibuja.** Cada nube es un racimo de motas de dos tamaños —un cuerpo
grande y un grano fino hacia el borde, que es la mezcla de escalas que distingue
una nube de un montón de esferas— y cada mota es un punto de
`gl.POINTS` al que el fragmento le inventa la normal de una esfera: en el centro
mira a la cámara, en el borde apunta hacia afuera. Con esa normal se ilumina como
se iluminaría una esfera —el truco del *impostor*—, y miles de esferas solapadas
leen como una masa con relieve. Cuando el sol queda **detrás** de la nube, sus
bordes se encienden: es el ribete de plata, la luz que atraviesa la parte delgada
de la masa y sale dispersada hacia adelante. La luz **no está falseada**: la dirección del sol
sale de su posición astronómica real y se pasa a los ejes de la cámara con el
rumbo y la inclinación del mapa, lo cual es exacto para una luz direccional. Se
gire el mapa como se gire, las nubes se encienden por la cara que da al sol.

**Y cada nube se hace sombra a sí misma.** Aquí había una constante por estrato
—0,45 la manta baja, 0,32 la media, 0,10 el cirro— con una rampa de altura
debajo: la panza oscura, la cima encendida, siempre y en la misma dirección. Es
cierto con el sol en lo alto y falso el resto del día: con el sol rasante lo
oscuro de una nube no es la panza, es **el lado contrario al sol**. Ahora, desde
cada mota se marcha hacia el sol contando la nube que tiene delante —la cuerda
dentro de cada esfera que el rayo atraviesa— y de ahí sale la transmitancia.

No hay ninguna constante de extinción nueva: un rayo que cruza una mota por su
centro se apaga exactamente lo que esa mota tapa al dibujarse, así que la nube se
sombrea con la misma opacidad con la que se pinta. Dos detalles que sí costaron
medirlos:

- **El rayo sale de la cara de la mota, no de su centro.** Lo que hay que saber
  es cuánta luz llega a la superficie iluminada, que es lo que se ve. Con el
  origen en el centro, cada mota se entierra bajo la mitad de sus vecinas y hasta
  la cima de una manta salía a media luz: 0,41 contra el 0,93 que da bien puesta.
- **El suelo de dispersión múltiple, 0,22.** Una nube se reparte la luz por
  dentro muchísimas veces, y por eso la panza de un cúmulo es gris claro y no
  negra. Cuánto vale eso no sale de ningún dato de este repositorio, así que se
  acota: por debajo, no dejar agujeros —el sombreador multiplica el color por
  este número, y con 0 la cara en sombra se dibuja negra, que es el mismo
  argumento con el que el mar tiene su `LIT_FLOOR`—; por arriba, que cada punto
  de suelo se come el contraste que es la razón de ser del cambio. Con 0,22 lo
  más oscuro que se ve es 0,231 y se conserva el 78 % del contraste direccional.

El barrido es n² por nube —900 operaciones con las 30 motas de una nube baja— y
**no se hace por fotograma**: solo cuando el sol se mueve medio grado, que son
unos dos minutos de reloj. Medido sobre la peor escena posible, 290 nubes y 7.074
motas: **1,8 ms de mediana**, contra los 16,7 ms que dura un fotograma a 60 Hz.
La deriva no lo invalida —una nube se traslada rígida— y el hervido tampoco.

Una consecuencia que conviene decir: **el mediodía sale más claro que antes**,
0,96 contra 0,81 pesando cada mota por lo que se la ve. No es una deriva; la
constante oscurecía la base de todas las nubes estuviera o no a la vista, y ésta
solo oscurece lo que de verdad está enterrado. Una manta de mediodía vista desde
arriba es blanca. Todo esto vive dentro de la escena atmosférica y **no lleva
interruptor propio**: la constante era una simplificación, no una opción que
ofrecerle a nadie.

La capa va en `renderingMode: '3d'`, así que comparte el búfer de profundidad con
el relieve: la Cumbre tapa la nube que queda detrás, una manta a 1200 m sale
cortada por las paredes de la Caldera por donde las corta de verdad, y los picos
de más de 1600 m asoman por encima. Cuando la base de la capa cae por debajo del
terreno, eso que se ve pegado a la ladera es exactamente lo que en la isla se
llama niebla.

**Encenderla inclina la cámara.** Es la misma regla que ya sigue el interruptor
del mar, que se lleva el fondo al satélite porque sobre la carta topográfica no
se dibujaría: un interruptor que no hace nada es peor que uno que hace de más.
Aquí la razón es más fuerte todavía — en plano, una nube a 1200 m y el terreno
que tiene debajo caen en el mismo píxel, y se pierde justo lo que distingue a
esta capa de una textura: que la nube está a una altura, que la Cumbre la corta y
que las cimas de más de 1600 m asoman por encima. Apagarla no devuelve la vista
al plano: para entonces quien mira ya ha visto la isla en relieve y puede querer
quedarse ahí.

No pide nada mientras está apagada, que es como llega: son 70 puntos con once
variables cada uno.

### La luz del sol sobre el relieve

El sombreado del relieve llevaba desde el principio una luz **fija en el 315°**,
el noroeste. Es la convención cartográfica de siempre —se ilumina desde arriba a
la izquierda porque el ojo humano interpreta al revés un relieve iluminado desde
abajo, el efecto del cráter— y como convención está bien. El problema es que esta
aplicación dibuja además un mar con el reflejo del sol en su sitio real y unas
nubes encendidas por la cara que les da la luz: a las ocho de la mañana el mar
brillaba por el este, las nubes se iluminaban por el este, y la isla que había en
medio seguía iluminada desde el noroeste. **Tres soles distintos en la misma
pantalla.**

Con el interruptor puesto, el relieve se ilumina desde donde está el sol, con las
mismas efemérides que ya usaban el mar y las nubes.

**Lo que MapLibre puede y lo que no.** Su capa `hillshade` acepta cinco cosas: la
dirección de la luz, una exageración de 0 a 1 y los colores de luz, sombra y
acento. **No acepta la altura del sol**, que es la otra mitad de la información,
así que la altura se traduce a lo que sí hay:

- a la **exageración**, porque un sol rasante alarga las sombras y marca cada
  barranco mientras uno en la vertical aplana el relieve. Eso es literalmente el
  coseno de la elevación en un sombreado Lambert, así que la exageración va con
  el coseno y no con una rampa inventada. El valor fijo de siempre, 0,50, cae en
  esa escala a unos 54° de elevación: la convención venía a ser un mediodía de
  primavera permanente;
- a los **colores**, porque un sol a 5° es naranja y uno a 70° es blanco. Los dos
  extremos son los mismos que usa el mar para su reflejo — son la misma luz, y
  verlas de dos colores distintos era parte del problema.

**`hillshade` no dibuja sombras arrojadas, así que las pone otra capa.** La capa
de MapLibre sabe hacia dónde mira cada ladera, pero no sabe que la pared de la
Caldera le tapa el sol al barranco de al lado, y una ladera orientada al sol con
una montaña por medio le salía iluminada. Eso es media escena de cualquier
atardecer real, así que **desde agosto de 2026 hay un interruptor propio**,
«Sombras arrojadas», que lo resuelve encima.

No con un mapa de horizonte precalculado —la idea obvia, y 33 MB de tabla que se
descartaron antes de escribirla— sino con **un barrido sobre el DEM que ya está
en memoria**: recorriendo la malla en contra del sol, el horizonte de cada celda
sale del de su vecina con una resta. Un pase por posición solar, sin marchas.
Medido sobre el DEM real de 1792 × 2304: **80,6 ms a resolución completa y
21,0 ms a la mitad**, que es la que se usa, porque la sombra no puede salir más
afilada que las celdas de 33,54 m que la proyectan y a 67 m el borde se corre
una celda como mucho.

En el mismo interruptor entran las **sombras de las nubes** sobre el suelo:
antes flotaban sobre un terreno al que no le quitaban el sol.

**De noche manda la luna**, y es de verdad: la misma efeméride que mueve el
reflejo del mar y que coloca el disco en el cielo — serie completa de Meeus con
paralaje topocéntrica, 0,17′ de error en el peor caso de dos años. Una luna llena alta ilumina desde donde está, con luz fría
y sombras suaves; una nueva no ilumina nada y queda un relieve apenas insinuado.
Se le deja un mínimo de sombreado a propósito, porque el mapa se sigue usando de
noche para leer temperaturas y un relieve sin forma se lee peor.

**Y sobre la ortofoto, otra vez.** La capa `hillshade` del estilo va debajo de
los fondos de GRAFCAN y la ortofoto es opaca: con el fondo «Satélite» puesto,
este interruptor no cambiaba un solo píxel, mientras que las sombras arrojadas
—que van encima de los fondos— sí se veían. Media función encendida y media
apagada, sin nada que lo explicara. Así que sobre los fondos fotográficos el
mismo sombreado se repite por encima, translúcido: misma fuente `raster-dem`,
misma dirección, misma exageración, ninguna tesela nueva.

Lo único que hay que decidir ahí es **con cuánta fuerza**, porque la foto ya
viene iluminada: trae dentro el sol del día del vuelo, y ese no se apaga. Está
medido con `scripts/checks/foto-hillshade.ts`, que reescribe los dos shaders de
MapLibre línea a línea y los compone sobre teselas pedidas en vivo — tres
recuadros de 6,4 km, la foto a 8,4 m por píxel, tres alturas de sol. En el caso
peor, sol a 10° sobre la pared de la Caldera:

| opacidad | separación luz/sombra | textura de la foto |
|---:|---:|---:|
| 0,20 | +0,036 | 81 % |
| 0,30 | +0,082 | 73 % |
| **0,35** | **+0,105** | **69 %** |
| 0,40 | +0,128 | 65 % |
| 1,00 | +0,392 | 34 % |

Las dos orillas. **Abajo**, la luz del vuelo, que a esa hora tira en contra: las
laderas que miran al sol de ahora salen 0,053 más oscuras que las que le dan la
espalda, así que con 0,20 —que solo consigue +0,036— la luz nueva ni siquiera le
da la vuelta a la vieja. **Arriba**, un presupuesto declarado: en el caso peor
tiene que sobrevivir más de dos tercios de la textura propia de la ortofoto. El
0,35 es la opacidad más fuerte que cabe ahí, y con ella la luz nueva manda 1,98
veces sobre la del vuelo. Donde hay foto que mirar en vez de pared vertical la
deja casi entera: 83 % en la colada de Tajogaite, 89 % en el llano de Aridane.

Sobre la **carta topográfica** no se dibuja, y no por descuido: es la misma razón
por la que tampoco lleva mar. Es papel, ya cuenta el relieve con sus curvas de
nivel, y un sombreado azul oscuro sobre papel blanco las ensucia en vez de añadir
nada.

#### Y el resto de lo que estaba parado

Encontrado el cuarto sol, se vieron los que quedaban detrás. Todos son la misma
clase de defecto —un color fijo donde debería haber una hora— y todos se
arreglan con la luz que ya se calcula:

**El fondo, que es la superficie más grande de la pantalla.** A 55° el horizonte
no ha entrado todavía, así que lo que llena la parte de arriba no es la cúpula:
es la capa `background`, un `#080b10` fijo. Con la luz real encendida esa banda
cambiaba −0,002 de luminancia, o sea nada. Ahora se pinta con el color del agua
profunda bajo la luz de ahora —el mismo `waterColors` del sombreador del océano—
y no con un tercer azul inventado. No con el color del horizonte, que es lo
fácil y sería falso: un mar de mediodía no es del color del cielo de mediodía,
porque el agua absorbe el rojo y devuelve muy poco de lo que le entra.

**El aire entre la cámara y las nubes.** La bruma de MapLibre se aplica a las
capas que drapea sobre el terreno y no a las personalizadas, así que el relieve
lejano se desvanecía y las nubes no: una a 40 km se dibujaba tan nítida como la
de encima de la cabeza. El coeficiente no es un ajuste — es **dispersión de
Rayleigh**: espesor óptico vertical 0,10 a 550 nm sobre 8 km de altura de
escala, o sea 1,25·10⁻⁵ por metro. Da un 6 % de bruma a 5 km, un 22 % a 20 y un
**43 % a 45 km**, que es la isla de punta a punta. La calima lo multiplica por
ocho —con el PM10 medido, no con un número de dibujo— y entonces a 45 km queda
el 97 %: el horizonte desaparece, que es lo que se ve un día de calima.

**Las nubes entre ellas.** La autosombra resolvía lo que una nube se tapa a sí
misma y ahí se paraba: cada una se iluminaba como si estuviera sola. Ahora hay un
segundo barrido, nube contra nube, con cada una como un elipsoide —2,6 km de
radio y 500 m de espesor: tratarla como esfera le haría dar sombra a dos
kilómetros por encima de donde está—. Medido: con **un solo estrato y el sol
alto no pasa nada** (1,000 de luz media, y ese número es la prueba de que el rayo
sale de la superficie de la nube y no de su centro), y con **tres estratos el
37-43 % de las nubes queda a la sombra de las de arriba**. El barrido entero
—cross más autosombra, 290 nubes y 7.074 motas— cuesta 4,4 ms, una vez cada dos
minutos de reloj.

**El color de la noche de las nubes**, que era `vec3(0.13, 0.16, 0.24)` escrito
en el sombreador. Ahora es la luz ambiente que `ocean/light.ts` calcula con la
hora y la luna: con luna llena alta una nube nocturna se ve, y sin luna, apenas.

**La cámara, que no llegaba donde está el cielo.** El tope de inclinación eran
65° por dos motivos escritos, y uno de los dos —las teselas de GRAFCAN— no se
aplica al relieve de casa, que no le pide nada a nadie. Con ese fondo el tope
sube a **75°**, medido sobre la Caldera a z12,5: a 75 la cámara sigue fuera del
terreno y a 80 el relieve de delante ya sale deformado. Con las cartas de
GRAFCAN se queda en 65 y, si se cambia de fondo mirando rasante, la cámara baja
sola.

**Y el sol, que no estaba dibujado.** Disco de `0,53°` —lo que mide de verdad; un
sol más grande es el error más repetido de las escenas 3D—, del color que le toca
a su altura, con la aureola apagándose según la masa de aire que atraviesa el
rayo. Va al fondo del búfer de profundidad, así que **el relieve lo tapa sin que
haya que calcular ninguna oclusión**. El disco borra el cielo que tiene detrás y
la aureola se suma: con la mezcla aditiva a secas salía blanco azulado a 9° de
altura, que es justo lo que no hace un sol poniente. Tiene casilla propia porque
dibujar un sol sobre un mapa de datos es una decisión de quien mira, no del
programa.

Y una limitación que conviene decir: con la vista al tope, el borde de arriba de
la pantalla queda a **3,4° sobre el horizonte** —75° de inclinación y 18,4° de
medio campo de visión—, así que el disco solo entra en cuadro con el sol más bajo
que eso y mirando hacia él. El resto del día está ahí, encima de la pantalla,
iluminando todo lo demás.

**La carrera del sol**, que es la respuesta a esa limitación. El disco se
enciende a las cuatro de la tarde y no dibuja nada, porque el sol está a 68° y la
pantalla llega a 3,4: una casilla marcada sin efecto no se distingue de una
averiada. El camino que el sol recorre hoy, en cambio, **baja hasta el horizonte
por los dos extremos**, que además es donde está la pregunta que se hace delante
de un mapa de La Palma: por dónde sale y por dónde se pone, hoy —30° más al norte
en junio que en diciembre—.

Se dibuja del orto al ocaso oficiales (**−0,833°**: 16′ de semidiámetro más 34′
de refracción), muestreado cada **20 minutos**. Ese paso está medido, no elegido:
contra un muestreo de un minuto el 21 de junio —el día más largo—, la polilínea
se separa del arco 0,020°, que con 24 píxeles por grado es medio píxel. A 30
minutos serían 1,1 px y a 60, 4,4: un arco hecho de trozos rectos. Lleva **una
marca por cada hora en punto** del reloj de la isla —contar marcas hasta el
horizonte es contar la luz que queda— y una marca larga donde está el sol ahora.

**Lo que no se ve es la mitad del dato.** La línea va al fondo del búfer de
profundidad, igual que el disco, así que el relieve la tapa: el trozo escondido
detrás de la Cumbre es exactamente el rato que el sol tarda en asomar por encima
del filo después de haber salido. En el valle de Aridane eso es más de una hora
entre el orto del almanaque y el amanecer de verdad, y sale dibujado sin calcular
nada.

**Encenderlas prepara la vista, en vez de explicar por qué no se ve.** Las dos
casillas que dibujan en el cielo necesitan cuatro cosas a la vez —la vista 3D,
un fondo que deje inclinar la cámara, la luz real y la cámara arriba— y faltando
cualquiera de ellas la casilla se queda marcada sin dibujar nada. Sobre la
ortofoto, además, es imposible: ahí el tope son 65° y el horizonte NO ENTRA en
pantalla, así que el techo del cielo sale negativo. Estaba escrito en el panel, en
presente y en su sitio, y no sirvió de nada: lo que se ve es una casilla puesta y
un cielo vacío, y eso se parece demasiado a una avería como para ponerse a leer.
Ahora el interruptor lo hace —misma regla que el mar, que se lleva el fondo al
satélite porque sobre la carta topográfica no se dibujaría— y el aviso trae el
botón que lo arregla. Ninguna de las cuatro es irreversible: siguen siendo
interruptores.

Y una de las cuatro tapaba un fallo de verdad: `SunLayer` se va sin dibujar si no
hay luz calculada —la necesita para saber de qué color es el sol a esta altura—,
y esa luz solo se calculaba con «Luz del sol real» o la escena atmosférica
encendidas. O sea que la casilla del disco, marcada a solas, no dibujaba el sol
**nunca**, ni al atardecer. De qué color es el sol y si el relieve se ilumina con
él son dos preguntas distintas, y ahora se calculan aparte.

Las horas se comprobaron contra un tercero, porque salen escritas en el panel:
Open-Meteo para 28,65 N 17,86 O, cuatro días de 2026 —14 de mayo, 21 de junio, 15
y 30 de agosto—. **Máxima diferencia, 1 minuto**, que es la resolución con la que
ellos las publican.

**Y por eso es experimental y no el comportamiento normal: se ve mejor y se lee
peor.** La luz fija no es un descuido, es una convención con dos siglos detrás
que deja el mapa igual de legible a cualquier hora; la real hunde media isla en
sombra al amanecer. Como esto es primero un instrumento para leer temperaturas y
después un mapa bonito, la convención se queda de fábrica y la verdad se ofrece.

#### El cuarto sol: el cielo de la vista 3D

Quedaba uno. El mar tenía su reflejo en el sitio real, las nubes su cara
encendida, el relieve su luz — y detrás de todo eso, la cúpula del cielo seguía
siendo `#070a12` de cenit, `#3a4152` de horizonte y una bruma `#141924`, a las
tres de la tarde igual que a medianoche. Un cielo nocturno permanente.

Con el interruptor puesto, esos tres colores salen de **`ocean/light.ts`, sin
recalcular nada**. Ese módulo ya computa el cenit y el horizonte para el agua, y
con más de lo que da la geometría: el índice de claridad de la radiación que
**miden** las estaciones y el PM10 de la calima. Reproducir aquí ese cálculo
habría sido un quinto sol, y de los caros — el mar refleja el cielo, así que dos
cielos distintos se ven contradiciéndose en el mismo fotograma, uno encima del
horizonte y otro debajo. De paso, las dos medianas que sacan esas medidas se han
salido del hook del océano a `lib/measured-light.ts`, porque si dependieran de
él, el mismo mediodía de calima saldría lechoso con el mar encendido y limpio con
el mar apagado.

Lo único que se añade es un **suelo**: de noche mandan los colores de casa, no
los físicos. El mar puede irse a negro porque debajo sigue estando el mapa; la
línea del horizonte no, porque es la que dice dónde acaba la isla. Se mezclan con
`dayFactor`, la misma rampa de crepúsculo que apaga las nubes, y la continuidad
sale por construcción: medido minuto a minuto sobre el orto, el color del
horizonte se mueve **5 niveles de 255 como mucho**, con mediana 0.

Y la bruma **es** el color del horizonte, no un tercer color que elegir: la
perspectiva aérea converge exactamente a la radiancia del cielo en la dirección
en que se mira. Cuánto llega a fundirse en los 45 km que mide la isla es
geometría —`fog-ground-blend`, `horizon-fog-blend`— y ésa no se toca.

**Dónde se ve, medido en el navegador**: el cielo de MapLibre solo pinta por
encima del horizonte, y con esta cámara el horizonte no entra en pantalla hasta
los ~63°. A la inclinación de entrada, 55°, lo que hay arriba del todo sigue
siendo el fondo `sea` (#080b10) y lo que cambia es la bruma sobre el relieve: el
9,8 % de los píxeles, +0,006 de luminancia media. Al tope de 65° cambia el 29,4 %
y la banda superior sube +0,325 — ahí el cielo es cielo. Que la cámara no pase de
65° tiene [dos motivos que no son estéticos](arquitectura.md#el-relieve-lo-dibuja-el-hillshade-de-maplibre-y-no-un-shader-propio),
y hasta que uno de los dos cambie, este cielo vive en los últimos dos grados de
inclinación.

### El índice de incendio

**Lo primero, lo que no es.** No es un aviso oficial ni sustituye a ninguno.
Los avisos de riesgo, las alertas y las prohibiciones las publican el Cabildo
Insular y el Gobierno de Canarias. No es una probabilidad de que algo arda hoy.
No dice dónde va a empezar un incendio. Y el número que enseña va de 0 a 100
**sin el signo de porcentaje**, precisamente porque un «40 %» sobre un mapa de
incendios se lee como «cuarenta posibilidades de cien», y no es eso.

Lo que sí es: el producto de dos cosas medidas por separado.

#### 1. Dónde se quema esta isla — un clasificador, y cinco incendios

La pregunta que el modelo contesta es estrecha a propósito: **dado que en La
Palma se declara un gran incendio, ¿qué probabilidad hay de que llegue a este
punto?** Es la geografía de lo ya quemado proyectada sobre el resto de la isla.

Se entrena con **los cinco incendios de los que existe perímetro publicado**, que
son todos los grandes del siglo XXI menos los que nadie cartografió:

| año | fuente | declarado | celdas de 201 m | AUC del pliegue |
|---|---|---:|---:|---:|
| 2009 | Cabildo, `Perimetro_incendio_2009` | 4.023 ha | 990 | 0,882 |
| 2012 | Cabildo, `Perimetro_incendio_2012` | 3.180 ha | 780 | 0,856 |
| 2016 | Copernicus EFFIS (El Paso) | 4.629 ha | 1.153 | 0,944 |
| 2020 | Copernicus EFFIS (Garafía) | 1.200 ha | 301 | **0,653** |
| 2023 | Copernicus EFFIS (Tijarafe) | 2.925 ha | 725 | 0,833 |

Rasterizar el perímetro y contar celdas devuelve la superficie declarada con un
error por debajo del 1 % en los cinco casos —4.009 ha contra 4.023, 3.159 contra
3.180, 4.669 contra 4.629, 1.219 contra 1.200 y 2.936 contra 2.925—, que es la
comprobación de que la malla, la proyección y el rasterizador están bien. En
total **3.219 celdas quemadas, el 18,3 % de la isla**.

Se dejan fuera dos cosas y conviene decir cuáles: el incendio de 2005, del que
hay 38 detecciones de satélite y ningún perímetro, y el de 2024, que son 5 ha —o
sea **una celda**, que no enseña nada espacial y sí mete una fila con peso
propio.

Los predictores son el modelo de combustible, la pendiente, hacia dónde mira la
ladera, la altitud y la distancia a la vía más cercana. La importancia que les
da el modelo, medida:

| predictor | peso |
|---|---:|
| altitud | 29,7 % |
| orientación al oeste | 23,9 % |
| combustible: hojarasca de pinar | 12,4 % |
| orientación al sur | 12,4 % |
| pendiente | 8,0 % |
| combustible: pasto | 7,5 % |
| combustible: matorral bajo arbolado | 3,7 % |
| distancia a una vía | **1,4 %** |

**La distancia a una vía casi no pesa, y eso es un resultado, no un fallo.** El
supuesto de partida era el contrario —los incendios los empieza alguien, así que
la proximidad humana debería mandar—, y esta isla lo desmiente por una razón
concreta: tiene 2.225 km de pistas agrícolas y forestales, y el **60,5 % de las
celdas tienen una vía dentro**. La mediana de la distancia es 0 m. Aquí casi
nada es remoto, así que la variable no separa nada.

#### 2. Cómo de excepcional es el día — un percentil, no un umbral

Los cinco incendios son cinco días. Con cinco días **no se ajusta un modelo
meteorológico**: se ajusta un recuerdo. Así que la parte del tiempo no se
entrena, se mide contra el clima.

Se calcula el índice de Fosberg —humedad de equilibrio del combustible fino, de
Simard (1968), más viento— y los días sin llover de **los 8.766 días de 2001 a
2024** sobre las seis celdas que el archivo de reanálisis resuelve en la isla, y
el peligro de hoy es su **percentil dentro de esa distribución**. Cuando la
interfaz dice 0,93 está diciendo «hoy es peor que el 93 % de los días de los
últimos veinticuatro años», que es una frase comprobable.

Los dos ingredientes se combinan con la **media geométrica**, que exige que los
dos estén altos: seco pero en calma, o ventoso sobre suelo mojado, es justo la
situación en la que no pasa nada.

Y esto es lo que salió al situar los cinco arranques en esa escala:

| incendio | Fosberg | percentil | días sin llover | percentil |
|---|---:|---:|---:|---:|
| 2009 | 44,6 | 98,4 | 126 | 90,6 |
| 2012 | 27,4 | 63,5 | 119 | 89,1 |
| 2016 | 35,4 | 88,4 | 87 | 81,2 |
| 2020 | 22,4 | **42,8** | 66 | 74,4 |
| 2023 | 32,5 | 81,3 | 24 | 50,0 |

**Cuatro de los cinco arrancaron con el tiempo en la mitad alta, y uno no.** El
de Garafía de 2020 empezó en un día del montón. Con cinco casos eso no valida la
escala ni la desmiente: la sitúa, y se publica tal cual en vez de quedarse con
los cuatro que quedan bien.

#### La validación es la parte seria

Es donde casi todos los mapas de riesgo de incendio que circulan hacen trampa
sin querer. Repartir las celdas al azar entre entrenamiento y prueba da un AUC
magnífico y **falso**: las celdas de un mismo incendio son vecinas, así que la
mitad de prueba está rodeada de celdas de entrenamiento y al modelo le basta con
interpolar.

Aquí se deja **un incendio entero fuera** cada vez, se entrena con los otros
cuatro y se puntúa sobre el que no vio. Medido con el mismo modelo:

| protocolo | AUC |
|---|---:|
| repartiendo celdas al azar | **0,903** ← la cifra que no se publica |
| escondiendo un incendio entero | **0,834** |
| el peor pliegue, Garafía 2020 | **0,653** |

Esas siete centésimas de diferencia son el tamaño del autoengaño. Y el peor
pliegue se publica en la propia interfaz en vez de esconderse tras la media:
**lo que el modelo aprendió del sur y del oeste no le sirvió del todo en el
noroeste**, y quien mire el mapa de Garafía tiene derecho a saberlo.

La sutileza que hace honesto el reparto: en el pliegue que esconde 2016, sus
celdas **no pueden contar como «no se quemó»** al entrenar. Se quemaron, solo
que el modelo no tiene derecho a saberlo todavía, así que se sacan del ajuste
por completo. Meterlas como negativas enseñaría que el sitio donde de verdad
ardió es un sitio que no arde.

#### Por qué árboles y no una recta

Se midió, con el mismo protocolo duro:

| familia | AUC media | peor pliegue |
|---|---:|---:|
| regresión logística | 0,735 | **0,513** |
| árboles con potenciación del gradiente | 0,834 | **0,653** |
| bosque aleatorio | 0,833 | 0,611 |

Un AUC de 0,513 es no distinguir nada. La razón se ve en el propio mapa: la
relación entre altitud y quemarse **no es monótona** —arde la banda del pinar,
entre unos 800 y 1.500 m, y no arde ni la costa regada ni la cumbre pelada—, y
una recta solo puede decir «cuanto más alto, más» o «cuanto más alto, menos»,
que son las dos falsas a la vez.

Se publica el conjunto de árboles y no el bosque aleatorio porque, empatados de
media, es mejor donde importa: 0,653 contra 0,611 en el peor pliegue. Y se elige
**profundidad 2**, aunque profundidad 4 saque 0,662, porque esa décima está
dentro del ruido de tener cinco pliegues mientras que las interacciones de
cuatro variables ajustadas sobre cinco incendios son exactamente cómo se
memoriza un perímetro.

#### Qué llega al navegador

Nada de todo eso. El entrenamiento vive en `scripts/ml/`, en Python con
scikit-learn, y se corre a mano; lo que se despliega son **dos ficheros**:

- `public/fire/static.png`, **26 KB** — 298 × 384, un píxel por celda de 201 m,
  con el modelo de combustible en el rojo, la distancia a la vía en el verde y
  la pendiente en el azul. Detrás hay 217.137 polígonos de cultivos y 14.153 de
  modelos de combustible que no llegan a salir del script.
- `public/fire/model.json`, **108 KB** — 150 árboles, 1.050 nodos, más las
  métricas de validación y las fuentes. El navegador lo recorre con dos
  comparaciones por árbol y sin ninguna biblioteca.

Es el mismo trato que este proyecto ya le da al DEM y al viario de
OpenStreetMap: lo pesado se congela en compilación.

**Y que las dos mitades digan lo mismo no se supone.** El entrenamiento congela
cuarenta celdas repartidas por la isla con sus entradas en crudo y la
probabilidad que les dio scikit-learn, y un test de vitest exige que el código
del navegador saque **la misma cifra hasta la sexta decimal**. Un umbral
comparado con `<` en vez de `<=`, la tasa de aprendizaje aplicada dos veces o el
orden de las columnas cambiado al reentrenar no rompen nada: producen un mapa
con la forma de la isla, colores verosímiles y cifras equivocadas.

#### El combustible, y el año que lleva pegado

La cartografía de **modelos de combustible de Canarias** que publica el Gobierno
de Canarias trae La Palma ya recortada: 14.153 polígonos a 25 m con la
clasificación estándar de Anderson (1982), los modelos NFFL. No es un mapa de
vegetación que haya que traducir —viene traducido—, y de los trece modelos, en
esta isla aparecen nueve. El más extenso es el 7, matorral bajo arbolado, con
18.965 ha; el pinar canario es el 9, con 7.561.

Esa cartografía cubre lo forestal y deja fuera la agricultura, así que el 24 %
restante se rellena con el mapa de cultivos de 2002–2008 traducido a los mismos
modelos. **Ese mapa es anterior a la erupción de 2021 y a quince años más de
abandono agrícola**, y la interfaz lo dice donde lo usa. Se equivoca hacia
abajo: el abandono solo ha ido a más.

Quedan **1.268 celdas —el 7,2 % de la isla— sin clasificar por ninguna de las
dos**, casi todas en el borde de la costa. Ahí no se pinta nada y la ficha lo
dice. «No lo sé» y «aquí no arde» son cosas distintas, y colapsarlas pintaría de
tranquilo justo lo que nadie ha mirado.

#### Lo que esta capa no puede hacer

- **No predice igniciones.** Aprende dónde llegan los incendios, no dónde
  empiezan.
- **Cinco episodios son cinco.** Las 3.219 celdas quemadas no son 3.219 datos
  independientes; el error real está dominado por tener cinco eventos, y por eso
  se publican los cinco pliegues en vez de una media sola.
- **La lluvia es de un modelo de 11 km.** Resuelve seis celdas sobre la isla, no
  un barranco. No se interpola entre ellas —cada punto toma la suya— porque la
  vertiente noreste recibe múltiplos de la suroeste y una superficie continua
  entre dos puntos sería inventada.
- **No hay cortafuegos, ni torres de vigilancia, ni hidrantes.** No están
  publicados: una búsqueda sobre los 793 servicios del visor del Cabildo no
  devuelve ni uno.
