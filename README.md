# Tiempo Palmero

**Meteorología interpolada a alta resolución para la isla de La Palma, a partir
exclusivamente de los datos abiertos del Cabildo Insular.**

Tocas cualquier punto del mapa y obtienes una estimación del tiempo **en ese
punto**, no la lectura de la estación más cercana. Es una distinción que en La
Palma no es un matiz: la isla sube de 0 a 2426 m en 42 km, y a esa escala la
altitud manda sobre la distancia en cualquier variable atmosférica.

**Probar la aplicación → [tiempo-palmero.vercel.app](https://tiempo-palmero.vercel.app)**
— en marcha, sin registro, sin clave de API y sin nada que instalar.

Hecho por **Andrea Piani** — [www.andreapiani.com](https://www.andreapiani.com)

![Tiempo Palmero: la isla con la malla interpolada sobre el relieve sombreado, y el panel de un punto consultado](docs/captura-tiempo-palmero.jpg)

En la captura, un punto cualquiera de El Paso a 509 m. La cifra grande es una
**estimación**, y la interfaz no lo disimula: lleva su margen al lado, el
municipio calculado por geometría, y las tres estaciones que sostienen el
cálculo con su distancia y su desnivel. La estación que más pesa está 251 m más
arriba y a 3,5 km; la segunda, 143 m más abajo. Sin corregir por altitud, esas
dos se promediarían como si estuvieran en el mismo sitio.

Debajo del margen, **cuándo se midió** lo que sostiene la cifra: «medido hace
19 min, la más antigua hace 38 min». Es un reloj distinto del de la descarga —
los datos pueden haberse pedido hace diez segundos y las lecturas ser de hace
hora y media, y es lo segundo lo que dice si el número sigue valiendo. La
antigüedad se pondera con el mismo peso que el valor: si el 80 % de la cifra
sale de una estación, la frescura que se anuncia es la de esa estación.

Abajo a la izquierda, el estado del modelo: **35 de 52 estaciones activas** —el
denominador real, no el del catálogo—, el gradiente medido en ese instante
(4,06 °C/km, no los 6,5 del manual), el R² del ajuste y el RMSE de validación.

---

## Índice

- [Por qué existe](#por-qué-existe) — el problema que resuelve, en números
- [Qué hace](#qué-hace)
- [Honestidad de los datos](#honestidad-de-los-datos) — las reglas que no se
  saltan, y [la capa de CO₂](#la-capa-de-co₂), que es la más estricta de todas
- [El motor de interpolación](#el-motor-de-interpolación) — los seis pasos y las
  decisiones que los sostienen · [Validación](#validación)
- [Qué más publica el Cabildo](#qué-más-publica-el-cabildo-y-qué-falta-por-aprovechar)
  — hoja de ruta sobre los 49 conjuntos del portal
- [La red de guaguas](#la-red-de-guaguas-y-los-sitios-que-ahora-se-pueden-encender)
  — la red en presente, el horario con su fecha delante ·
  [Los aforos](#los-aforos-y-el-endpoint-que-no-dice-lo-que-parece) — el
  endpoint que se llama «hoy» y publica cinco minutos
- [El mapa de viento](#el-mapa-de-viento) — la única capa donde un modelo pinta
  sobre la isla, y cómo se declara ·
  [El histórico](#el-histórico-y-por-qué-no-hay-base-de-datos) — 2 MB por día en
  origen, 124 KB en el navegador, cero almacenamiento propio
- [Licencias en tiempo de ejecución](#licencias-en-tiempo-de-ejecución) — qué se
  llama de verdad, y con qué permiso
- [Arquitectura](#arquitectura)
- [La aplicación de iOS y Android](#la-aplicación-de-ios-y-android) — Expo sobre
  el mismo motor, sin una línea de cálculo duplicada
- [Trampas de esta API](#trampas-de-esta-api-que-ya-están-resueltas-en-el-código)
  — un día de depuración cada una
- [Puesta en marcha](#puesta-en-marcha) · [Fuentes y licencias](#fuentes-y-licencias)

---

## Por qué existe

La red del Cabildo tiene 52 estaciones meteorológicas registradas. La respuesta
ingenua a «¿qué tiempo hace en El Pinar de Tijarafe?» es buscar la estación más
próxima y enseñar su número. En esta isla eso se equivoca por unos 2,5 °C, y
puede equivocarse mucho más: la estación más cercana a El Pinar está 321 m más
abajo, y una estación 321 m más abajo lee unos 2 °C de más.

La respuesta correcta es separar lo que explica la altitud de lo que es
variación local, interpolar solo la segunda parte y devolver la primera a la
altitud real del punto de destino. Bien hecho, el error baja a ~1,2 °C.

Y hay un detalle que resulta pesar más que todo el resto junto: **un solo sensor
descalibrado envenena el mapa entero.** Hay uno a 1561 m que en agosto marcaba
9,7 °C. Pasa el filtro de plausibilidad —a esa altitud no es un valor absurdo—
pero arrastra la pendiente del ajuste y con ella la estimación de toda la isla.
Detectarlo y descartarlo mejora el RMSE un **43,7 %**.

---

## Qué hace

- **Malla interpolada** de temperatura, humedad relativa y punto de rocío,
  recalculada sobre el retículo del modelo de elevación con celda de ~200 m.
- **Consulta punto a punto**: altitud del DEM, municipio calculado
  geométricamente, valor estimado **con su margen**, y las tres estaciones que
  más han contribuido, con su distancia y su desnivel.
- **Estaciones meteorológicas** con color por frescura del dato y todos sus
  valores en crudo.
- **Sensores de CO₂** de Puerto Naos y La Bombilla, con reglas de seguridad
  estrictas (ver abajo).
- Calidad del aire, calidad del cielo, cámaras de incendios, senderos y sus
  1190 puntos de interés.
- **Red de guaguas de TILP**: 23 líneas, 58 trazados y 913 paradas, con la ficha
  de cada parada —líneas, servicio, accesibilidad y las horas de paso de la
  última tabla publicada— y el recorrido de cada línea resaltado en el mapa (ver
  [la red de guaguas](#la-red-de-guaguas-y-los-sitios-que-ahora-se-pueden-encender)).
- **Sitios del Cabildo, uno a uno**: interés turístico, **miradores**, interés
  cultural e histórico, zonas recreativas y puntos de recarga eléctrica, cada
  capa con su interruptor y su icono, y la **red de carreteras** debajo de todo,
  que también se pincha para ver de dónde a dónde va cada tramo.
- **Aforos de tráfico y de senderos**: cuánta gente pasa hoy por cada cruce y
  por cada acceso a sendero, separando coches, motos, pesados, bicicletas y
  peatones, con los últimos ocho días en barras y el denominador de la red a la
  vista (ver [los aforos](#los-aforos-y-el-endpoint-que-no-dice-lo-que-parece)).
- **Relieve sombreado** generado del mismo modelo de elevación que alimenta el
  cálculo. La isla es un volcán: la sombra es lo que la hace legible.

Todo en castellano. La estructura de i18n está lista para más idiomas.

---

## Honestidad de los datos

Las reglas que la aplicación no se salta:

- **El denominador es el real.** Se lee «36 de 52 estaciones activas», nunca
  «52 estaciones». La diferencia son estaciones muertas, rotas o con las
  coordenadas en mitad del Atlántico.
- **Un valor interpolado no es una medida** y la interfaz lo dice, con su
  margen al lado.
- **La precipitación no se interpola.** La vertiente noreste recibe múltiplos de
  la suroeste a igual altitud. Se muestra la estación más cercana, declarada
  como tal, con su distancia y su desnivel.
- **El viento no se interpola entre estaciones: se rellena con un modelo.** La
  regla anterior decía «el viento tampoco se interpola» y se ha cambiado a
  conciencia, no relajado. Sigue prohibido estirar la estación más cercana:
  cada una manda solo en unos 3 km a su alrededor, que es lo que dura su
  representatividad antes de que un barranco o la divisoria cambien el régimen.
  Lo que ocupa el hueco no es una media de las lejanas, sino Open-Meteo, que sí
  resuelve la orografía; y cada celda lleva escrito cuál de los dos la sostiene.
  Ver «El mapa de viento» más abajo.
- **La calidad del aire y el CO₂ no se interpolan nunca.** Son medidas
  puntuales; dibujar una superficie entre ellas sería inventar lecturas donde
  no hay sensor.
- **Los valores implausibles se descartan, no se recortan.** Recortar un sensor
  que marca 70 °C a un máximo de 45 lo convertiría en un dato creíble. Vale
  igual para los valores *calculados*: CABLPA-BELLIDO publica 1 % de humedad a
  852 m —un higrómetro muerto— y de ahí salía un punto de rocío de −38,4 °C que
  se pintaba en el pin como cifra. Un valor derivado pasa el mismo filtro que
  uno medido.
- **Lo que viene de un modelo va etiquetado como modelo.** Por encima del techo
  de la red del Cabildo se usan anclas de Open-Meteo, y aparecen siempre con su
  nombre. Ver «El techo de la red» más abajo.

### La capa de CO₂

Los sensores de la red DEMASE miden hasta **69.301 ppm** — 6,9 %, letal en
minutos. Son el motivo por el que Puerto Naos fue evacuada. Esta pantalla está
escrita para fallar en cerrado:

- Solo se muestran valores medidos, con su hora explícita.
- **Si el dato tiene más de 15 minutos, se lee «sin datos».** Nunca un verde
  rancio, nunca la última lectura buena heredada.
- Si la red no responde, tampoco. No hay caché de respaldo en esta capa.
- No se interpola ni se colorea el área entre sensores.
- **No aparece la palabra «seguro»** en ningún sitio. Se da el valor y la hora;
  quien declara un lugar seguro es el Cabildo.
- No lleva publicidad ni muro de pago, y no los llevará.

---

## El motor de interpolación

`src/lib/interpolate.ts`. Seis pasos, en este orden:

| # | Paso | Qué hace |
|---|------|----------|
| 1 | **Filtro** | Descarta lecturas de más de 2 h, nulas, implausibles o con coordenadas fuera de la isla. Deduplica por `entityid`, nunca por nombre. |
| 2 | **Ajuste** | Regresión OLS de la variable sobre la altitud. El gradiente se **mide**, no se asume: el 12 ago 2026 salió 4,6 °C/km, no los 6,5 del manual. |
| 3 | **Rechazo** | Descarta residuos por encima de 2,5 escalas robustas y reajusta, hasta estabilizar. |
| 4 | **Detendencia** | `residuo = valor − b · altitud` en cada estación. |
| 5 | **IDW** | Interpola los residuos con peso 1/d², distancia haversine, corte a 15 km. |
| 6 | **Retendencia** | `valor = residuo interpolado + b · altitud_destino`, con la altitud del DEM por muestreo bilineal. |

Dos decisiones que merecen explicación, porque son las que hacen que esto
funcione:

**La escala del rechazo es robusta (MAD), no la desviación típica.** Con siete
sensores anómalos entre treinta y seis, la σ muestral se infla *por culpa de los
propios outliers* y acaba tapándolos: cazaba 2 de 7. La MAD no se deja arrastrar
y caza las cuatro grandes en una sola pasada. Es el efecto de enmascaramiento de
manual, y aquí es exactamente la diferencia entre cumplir los criterios y no
cumplirlos.

**La distancia del IDW cuenta el desnivel.** Después de quitar la tendencia
altitudinal los residuos no son ruido: conservan la estructura de la capa de
inversión (~800–1500 m), que separa el mar de nubes de la cumbre despejada. Dos
estaciones a la misma cota se parecen más entre sí que dos vecinas separadas por
la inversión. La distancia efectiva es `hypot(d, Δaltitud / 100)`, con 100 m de
desnivel pesando como 1 km horizontal — el valor que documenta el propio portal.
Bajar esa constante mejora las métricas de este conjunto de datos hasta α≈30, y
eso es precisamente la señal de que ahí ya se estaría ajustando al conjunto de
validación en vez de al problema.

**El punto de rocío se calcula, no se interpola.** Solo 10 de las 52 estaciones
lo publican, contra 30 que publican humedad y 36 temperatura. Un campo con diez
muestras sobre una isla de 2426 m se va a valores imposibles en cuanto el punto
se aleja de esas diez: se llegó a ver **99 % de humedad junto a un rocío de
−7,9 °C en el mismo punto**, que no es un valor impreciso sino uno que no puede
existir. Ahora se interpolan las dos variables bien muestreadas y el rocío sale
de ellas por Magnus-Tetens, así que la contradicción no puede darse por
construcción. Cuesta unos 0,2 °C de exactitud en las diez estaciones que sí lo
miden —y esas diez son justamente donde esa red es densa, o sea que el contraste
juega en contra del método derivado— a cambio de coherencia en toda la isla.

La fórmula no es un supuesto: contrastada contra las estaciones que publican las
tres variables a la vez, la humedad que implican su temperatura y su rocío se
desvía de la que ellas mismas declaran **0,99 % de media, 2,45 % como máximo**.

Y lo mismo vale **dentro de cada estación**. Temperatura, humedad y rocío no son
tres medidas independientes: dadas dos, la tercera está determinada. Una estación
que publica temperatura y humedad sí dice cuál es su punto de rocío aunque no
traiga esa columna —son 21 de las 37 vivas, contra 10 que la traen—, así que su
pin enseña la cifra, marcada con un subrayado de puntos para distinguirla de lo
publicado. Antes salían con un punto en vez de un número, encima de una malla
que sí estaba pintada y que se calcula exactamente igual. Las **6 estaciones sin
humedad ni rocío** siguen sin número: ahí no es una decisión de estilo, es que no
se sabe.

**La presión no se interpola, y el motivo no es el que parece.** Al meterla en
el motor salía un R² de 0,002 y un gradiente de +0,2 hPa/km, cuando la física
exige unos −125. La causa: `atmosphericpressure` mezcla **dos convenciones
distintas sin decirlo**. La familia `CABLPA-*` publica presión ya reducida al
nivel del mar; las `LaPalma WSAQPM *` publican presión absoluta de su altitud.
A 726 m la diferencia entre ambas es de **86 hPa**. La aplicación detecta cuál
es cuál —el discriminante es holgado por encima de 200 m, y por debajo las dos
convergen— y reduce las absolutas.

Pero incluso ya normalizada, la red va de **989 a 1028 hPa**. La presión
reducida al nivel del mar apenas varía una décima en 42 km de isla, así que
esos casi 40 hPa no son meteorología: son barómetros baratos desviados.
Interpolarlos dibujaría un mapa precioso de errores de calibración. Se da la
**mediana de la red**, que es robusta a los sensores descalibrados y es lo único
que de verdad se puede afirmar.

### El techo de la red, y las anclas de Open-Meteo

La Palma sube a 2426 m. **La red del Cabildo, no.** Tiene una estación
registrada en la cumbre —`Taburiente`, 2316 m— cuya última lectura es del
**10 de mayo de 2023**; `Tenerra` (1104 m) calla desde abril de 2024 y
`Cumbre Nueva` (1395 m) desde febrero de 2026. Lo que publica de verdad llega
como mucho a 1561 m, y tras el rechazo de anomalías el ajuste se sostiene hasta
1395 m en temperatura y 1085 m en humedad.

Medido sobre el DEM, **el 31 % de la isla (220 km²) queda por encima del techo
de humedad**. Ahí el motor dejaba de interpolar entre medidas y prolongaba una
recta — justo lo que la inversión del alisio rompe. Dejando fuera del ajuste la
estación de 1561 m y prediciéndola, decía **100 % de humedad contra el 11,3 %
que marcaba el sensor**: 89 puntos, con un margen declarado de ±10.

Por encima de ese techo se usan **anclas de [Open-Meteo](https://open-meteo.com/)**,
un modelo meteorológico. Las reglas:

1. **Las estaciones del Cabildo mandan siempre.** El gradiente, el rechazo de
   anomalías, el R² y el RMSE se calculan **solo** con ellas: `buildModel`
   ajusta la recta sin ver una sola ancla. Hay tests que lo fijan.
2. **Por debajo del techo el ancla pesa cero**, no poco. Su peso sube en rampa
   desde 0 en el techo hasta 1 a 300 m por encima, para que el campo no dé un
   salto en esa cota.
3. **Se etiquetan siempre como Open-Meteo**, en la lista de contribuyentes, en
   el panel del modelo y en Fuentes.

Los puntos no están cableados: se eligen sobre el propio DEM, los más altos
separados al menos 3 km entre sí. Medido el 12 ago 2026, en el Roque de los
Muchachos la humedad pasa de un imposible 100 % a 38 %, y a 900 y 300 m —donde
sí hay estaciones— el valor no se mueve ni una décima.

#### El ancla no es un valor de superficie: es un perfil vertical

Durante un tiempo el ancla fue `temperature_2m` pidiéndole a Open-Meteo el punto
con `elevation=` forzada. **Eso no es una medida en altura**, y el motivo está
en su propio código
(`Sources/App/Helper/Reader/GenericReader.swift`, líneas 194-197, leído el
12 ago 2026):

Es el valor de superficie de su celda trasladado con un gradiente **constante**
de −0,65 K/100 m. Y su celda no es la cumbre: ningún modelo global tiene el
Roque. El mejor, ICON, cree que está a 1055 m; GFS y ECMWF a 0,25° creen que
está **al nivel del mar**. Así que se calienta la superficie de una isla baja y
después se prolonga una recta hacia arriba **a través de la inversión del
alisio**, donde el gradiente real llega a ser positivo. No es aproximar: es
invertirle el signo al fenómeno.

Con la humedad era peor que un sesgo, y la guarda de la línea de arriba lo dice
todo:

```swift
if isElevationCorrectable && unit == .celsius && ... {
    // correct temperature by 0.65° per 100 m elevation
    data[i] += (modelElevation.numeric - targetElevation) * 0.0065
}
```

`unit == .celsius` deja fuera a la humedad relativa, cuya unidad es `%`: **no se
corrige en absoluto**. El punto de rocío sí es Celsius y se traslada en paralelo
a la temperatura, así que la humedad relativa sale **idéntica a 10, 900, 1560 y
2426 m** — comprobado también contra la API, no solo leído en el código. Las
anclas de humedad no llevaban ninguna información vertical: eran constantes.

Ahora el ancla se lee del **perfil vertical** (`profile.ts`): T y punto de rocío
en los niveles de presión de ICON —~165, 385, 608, 838, 1075, 1568, 2089 y
3223 m— interpolados linealmente en altura geopotencial, sin ningún gradiente
impuesto. Es el esquema de **TopoSCALE** (Fiddes y Gruber, «TopoSCALE v.1.0:
downscaling gridded climate data in complex terrain», *Geosci. Model Dev.* 7,
2014, [10.5194/gmd-7-387-2014](https://doi.org/10.5194/gmd-7-387-2014),
textual: «The method makes use of an interpolation of pressure-level data
according to topographic height of the subgrid»).

La humedad se recompone de T y rocío con Magnus-Tetens, **nunca se transporta**,
y la razón se sostiene sola: la humedad relativa es una razón entre la presión
de vapor y la de saturación, y la de saturación depende exponencialmente de la
temperatura, así que mover una humedad relativa en altura no conserva nada. El
rocío es casi lineal en la vertical y sí se deja mover. Es la misma elección que
hacen MicroMet (Liston y Elder, *J. Hydrometeor.* 7(2), 2006,
[10.1175/JHM486.1](https://doi.org/10.1175/JHM486.1)), PRISM y meteoland — de
esos tres se afirma aquí solo la elección, que es pública, y no una cita literal
del texto, porque los tres artículos están de pago y no he podido comprobarla.

**Contrastado contra una estación real a esa altura**, la del TNG en el
Observatorio del Roque de los Muchachos (2387 m), 25 horas seguidas el
12 ago 2026:

| a 2387 m | MAE antes (superficie) | MAE ahora (perfil) |
|---|---|---|
| temperatura | **8,20 K** | **1,34 K** |
| humedad | **36,9 puntos** | **17,5 puntos** |

Los 17,5 puntos que quedan no son ruido: el perfil describe el **aire libre**, y
la capa que toca el suelo de la cumbre es más húmeda que él por transporte
anabático. Eso no lo arregla ninguna interpolación — lo arregla una estación
allí arriba.

De paso, dos trampas de esa API que el perfil evita por construcción, las dos
medidas: con `elevation=2400` contesta 15,9 °C y con `elevation=2426` contesta
**13,0 °C**, porque cambia de celda —26 m, 2,9 K de salto, y la serie forzada ni
siquiera es monótona—; y `best_match` **mezcla modelos entre variables** (la
superficie de ECMWF, los niveles de ICON, el 875 hPa de GFS), lo que cose dos
atmósferas distintas en un mismo perfil. Se pide un modelo explícito.

#### El rechazo de anomalías tiene un testigo, y puede indultar

El rechazo mide el residuo contra una **recta** altitudinal, y sobre la
inversión esa recta no describe la atmósfera. Ahí la estación que está en lo
cierto es justo la que más se separa, y la MAD la caza **precisamente por eso**.

No es teórico. Medido el 12 ago 2026, dejando fuera del ajuste la estación de
1560 m y prediciéndola: el motor decía **75,1 % de humedad donde ella marcaba
36,4**, y el sondeo de Güímar de ese día daba 19 % a 1558 m. La estación tenía
razón, el modelo no. El filtro se llevaba las **cuatro estaciones de humedad por
encima de 1000 m**, que son las únicas que describen la capa seca: el motor se
quitaba la vista él solo.

Ahora una muestra marcada como anómala puede ser **indultada** si el perfil
vertical —un testigo independiente, que no es esta recta— respalda su valor. La
regla es estrecha a propósito:

1. Solo por **encima de la base de la inversión** diagnosticada. Debajo, la
   recta describe bien la atmósfera y el rechazo sigue igual que siempre: es el
   que mejora el RMSE un 43,7 %, y ese número no se toca.
2. Solo si el perfil **corrobora** el valor, con una tolerancia **asimétrica**.
   La capa que toca el suelo de una ladera es más cálida y más húmeda que el
   aire libre —transporte anabático, sol sobre la roca—, **nunca lo contrario**.
   Así que se admite separarse hacia arriba (+6 K, +35 puntos, que es donde
   están el sesgo medido del perfil y el caso real de la estación de 1560 m,
   +5,6 K por sol de tarde en ladera oeste) y muy poco hacia abajo (−2,7 K,
   −10 puntos), porque más frío o más seco que la atmósfera libre no lo explica
   la física del sitio, y sí un sensor roto. Con tolerancia **simétrica** el
   higrómetro muerto de CABLPA-BELLIDO, que marca 1 %, quedaba indultado; hay un
   test que lo fija.
3. Sin perfil o sin inversión diagnosticada **no se indulta a nadie**, y todo se
   comporta exactamente como antes.

El perfil no aporta ni una muestra al ajuste: solo vota sobre si se tira una
medida del Cabildo. Medido sobre la red viva del 12 ago 2026, mismos objetivos,
leave-one-out completo:

| | MAE | RMSE |
|---|---|---|
| temperatura | 1,882 → **1,706** (−9,3 %) | 2,703 → **2,274** (−15,9 %) |
| humedad | 11,698 → **11,192** (−4,3 %) | 16,931 → **15,927** (−5,9 %) |

Y el R² del ajuste de humedad **empeora**, de 0,437 a 0,256. Es la señal de que
va bien: la recta ajustaba bonito porque había tirado el dato incómodo.

#### La inversión del alisio se diagnostica, no se supone

El mismo perfil permite decir **dónde** está la inversión, con el criterio de la
literatura canaria: un tramo con gradiente ≥ −0,2 K/100 m **y** una caída de
humedad de más de 20 puntos entre base y cima (Torres, Cuevas, Guerra y Carreño,
2002). La caída de humedad no es un adorno: es lo que separa la inversión de
subsidencia de una capa isoterma nocturna cualquiera. Si aparece más de una se
queda la de mayor caída, y ése es un desempate **nuestro**, no una regla citada:
si lo que distingue al alisio es que seca el aire, la candidata que más lo seca
es la que mejor encaja. Hay literatura sobre las inversiones múltiples en el
Atlántico norte tropical —Ramseyer y Miller, «Historical trends in the trade
wind inversion in the tropical North Atlantic Ocean and Caribbean»,
*Int. J. Climatol.* 41, 2021,
[10.1002/joc.7151](https://doi.org/10.1002/joc.7151)— pero está de pago y no he
podido comprobar contra el texto que su desempate sea éste, así que no se le
atribuye.

Medido el 12 ago 2026 a las 16:45 UTC: **base 1074 m, cima 1567 m, ΔT +0,1 K
—isoterma— y ΔRH −35,7 puntos**. Junto a base y cima se publica siempre un
`±247 m`, que es la mitad del salto entre los dos niveles de presión que la
encierran: **este criterio detecta la inversión, no mide su espesor.** Para
medirla haría falta un radiosondeo, que es lo que se lanza dos veces al día en
Güímar.

Que el fenómeno es persistente **está medido aquí, no citado**. Sobre 329 horas
de histórico del Cabildo hay inversión térmica entre la costa y la banda de
1000–1600 m el **75 % de las horas**, y colapso de humedad el **83 %**; sobre
360 horas de sondeo de Open-Meteo, el gradiente 925→850 hPa está por encima de
−3 °C/km el **69 %** de las horas. Y no es un artefacto de sol sobre los
sensores: **de noche**, entre las 00 y las 08 UTC de media en 14 días, la
estación de 1177 m está **2,6 °C más caliente que la costa a 5 m**, y la de
1560 m mantiene un 14-15 % de humedad.

El reparto por día no es un ciclo diurno sino un régimen sinóptico: del 30 de
julio al 8 de agosto de 2026, 24 horas de cada 24 todos los días; del 9 al 12,
entre 0 y 4.

### La banda de incertidumbre está calibrada, no supuesta

El `±` que acompaña cada cifra salía antes de la σ de los residuos del ajuste
altitudinal. Pero esa σ mide la dispersión alrededor de la **recta**, y el
número que se enseña no sale de la recta: sale de la recta más el IDW de los
residuos, que explica una parte de esa dispersión. Medir el error del pipeline
entero con la σ del ajuste es medir otra cosa, y fallaba en las dos
direcciones: sobre el fixture del 12 ago 2026 cubría el 59 % de los casos en
temperatura —demasiado estrecha— y el 82 % en humedad —demasiado ancha—; sobre
los datos en vivo de esa misma tarde, la humedad se iba al 56 %.

Ahora se calibra con el mismo leave-one-out que valida el modelo: para cada
estación excluida se mide el error real y el término de forma, y la escala es
el **cuantil 68 del cociente**. Por construcción la banda contiene el error en
68 de cada 100 casos. Sobre el fixture: **69 % en temperatura y 68 % en
humedad**.

Por encima del techo de la red la cifra la sostiene un modelo, así que su
incertidumbre es la del modelo. Se mide preguntando a Open-Meteo por el punto
de **cada estación** y comparando con lo que esa estación mide. En vivo el
12 ago 2026, sobre 35 estaciones, Open-Meteo va **+2,4 °C y −20,6 puntos de
humedad** respecto a la red insular. De ahí que la banda en la cumbre salga
ancha: es ancha porque de verdad no se sabe mejor.

Las dos bandas se mezclan por el peso que las anclas tienen realmente en cada
punto, de modo que el relevo entre una y otra lo hace el mismo reparto que
decide el valor. El desvío medido se enseña en el bloque «Modelo».

### Validación

`npm test` corre leave-one-out sobre una lectura real congelada de la red.

| Criterio | Umbral | Medido |
|---|---|---|
| MAE | < 1,3 °C | **1,202 °C** |
| RMSE | < 1,8 °C | **1,578 °C** |
| Mejora del RMSE por el rechazo de outliers | ≥ 30 % | **43,7 %** |

En cada vuelta se reconstruye el modelo **entero** con las demás estaciones,
ajuste y rechazo incluidos: reutilizar el ajuste hecho con todas dejaría que la
estación excluida siguiera influyendo en el gradiente, y el error saldría
optimista.

Se puntúa contra el conjunto que el pipeline **conserva**, y las descartadas se
cuentan aparte. Pedirle al interpolador que acierte los 25,9 °C que un sensor
marca a 1194 m mide lo roto que está el sensor, no lo bueno que es el
interpolador — y el pipeline que rechaza outliers tampoco afirma poder
predecirlos: los marca como no fiables, que es su trabajo. La comparación con
`rejectOutliers: false` enfrenta dos pipelines completos, cada uno respondiendo
por lo que dice cubrir.

---

## Qué más publica el Cabildo, y qué falta por aprovechar

El portal tiene **49 conjuntos de datos reales y 22 endpoints IoT**. Esta
aplicación usa hoy **doce capas estáticas** —de las trece que descarga; la única
que no se lee en runtime es el inventario de sensores de CO₂, que llega en
directo de DEMASE— más el agregado del GTFS de guaguas. Lo que queda, ordenado
por lo que aportaría de verdad:

### Ya integrado (agosto 2026)

El panel del punto responde a «¿qué hay aquí?», no solo «¿qué tiempo hace?»:
senderos y sus puntos de interés, zonas recreativas y refugios, lugares de
interés turístico, cultural e histórico, puntos de recarga eléctrica y paradas
de guagua. Las capas se cargan **bajo demanda** —son 10 MB en total y la mayoría
de las visitas no llegan a tocar el mapa— y la lista se recorta a las ocho más
cercanas, con el resto plegado.

Desde esta tanda, además: la **evolución de 24 h y 7 días** de cada estación con
su máxima y su mínima, el **mapa de viento animado** con partículas en WebGL, y
tres columnas crudas que estaban en el payload sin enseñarse —sensación térmica,
iluminancia y visibilidad—. De las tres, `visibility` no llegará a pintarse
mientras el Cabildo no la rellene: es de tipo texto y está **vacía en las 4939
filas de un día de histórico y en las 52 de `_lastdata`**. Se parsea igualmente
para que aparezca sola el día que exista, y queda escrito aquí para que nadie la
persiga como si fuera un fallo de la aplicación.

### La red de guaguas, y los sitios que ahora se pueden encender

La red de TILP es ya una capa del mapa, con su interruptor propio: los **58
trazados** de las **23 líneas** y las **913 paradas**, apagada por defecto
porque son 1,5 MB que solo se descargan si alguien la enciende —y mientras
llegan, la barra lateral lo dice—. Al pinchar una parada sale su ficha —qué
líneas paran ahí, cuánto servicio tenía y si se puede subir en silla de
ruedas—; al pinchar una línea, o una de las líneas de esa ficha, el mapa
**encuadra** el recorrido entero y lo resalta con todas sus paradas mientras la
ficha está abierta.

Es **un solo interruptor** para trazados y paradas. Estuvieron separados, y
leídos seguidos en la lista parecían la misma entrada repetida. Lo que
justificaba separarlos —que encender la red tapara el mapa con 913 puntos— ya lo
resuelve el zoom mínimo de las paradas: a la distancia en la que molestarían no
se dibujan, así que a la vista de isla se ven los trazados y los puntos aparecen
al acercarse. Mientras no se han acercado, la barra lateral lo explica, porque
una casilla marcada sobre un mapa que no cambia se lee como una capa rota.

**Y las horas de paso salen, con una advertencia que no se quita.** El GTFS que
publica el Cabildo tiene los cinco calendarios de servicio caducados —el último,
el **25 de diciembre de 2025**— sin una sola excepción con fecha posterior
(comprobado el 12 ago 2026). El sitio de TILP está peor: su único documento de
líneas es un PDF de septiembre de 2020. Google Maps sí tiene horarios porque
TILP se los cede por acuerdo privado, pero esos datos no son redistribuibles y
usarlos exigiría una clave de Google en tiempo de ejecución, que es justo lo que
esta aplicación no tiene.

La primera versión de esta capa se callaba las horas por completo. Se ha
cambiado a conciencia, no relajado: **TILP no ha renovado el archivo, pero
tampoco ha cambiado el servicio**, así que esa tabla es la que está funcionando,
y ocultarla dejaba a la aplicación sin responder a la única pregunta que se hace
quien está de pie en una parada. Las condiciones con las que sale, que sí son
innegociables:

- va **plegada**, detrás de un botón que dice cuántas horas hay;
- lleva encima el rótulo «última tabla publicada», la fecha de caducidad y el
  enlace a TILP, en el mismo bloque —`ServiceTable` existe justo para que la
  cifra y el aviso no puedan separarse;
- **no se compara con el reloj**: no hay «próxima guagua» ni cuenta atrás, que
  es lo que convertiría una referencia en una promesa;
- y se agrupan **por línea y por sentido**. Esto no es cosmética: en la parada
  389 la línea 120 pasa a las 07:38 hacia Barlovento y a las 07:38 hacia Santo
  Domingo. Agrupando solo por línea, la mitad del servicio de esa parada
  desaparecía por deduplicación —15 salidas se quedaban en 8— y el propio panel
  se contradecía. Hay un test que compara las dos cifras parada por parada.

Junto a las horas se da el volumen —cuántas salidas tenía de lunes a viernes,
los sábados y los domingos, y entre qué horas—, que es lo que distingue una
parada de la línea 300 —348 salidas laborables en la estación de Santa Cruz— de
un apeadero con una al día.

De paso, el GTFS contesta algo que nadie más publica: **ninguna de las 913
paradas de la isla está declarada accesible**. 675 constan explícitamente como
no accesibles y 238 sin información. La ficha lo dice tal cual, con esas cifras.

**Y los sitios dejan de estar escondidos.** Las capas de interés turístico (50),
cultural (92), histórico (390), zonas recreativas (33) y recarga eléctrica (54)
solo asomaban dentro de «cerca de aquí»: había que tocar un punto para descubrir
que a 300 m hay un mirador, así que se podían encontrar por azar pero no buscar.
Ahora cada una tiene su interruptor con su icono en la barra lateral, se dibujan
en el mapa y se pinchan para ver la ficha completa. Los 390 recintos históricos
son polígonos y entran como su centro: a la escala en la que se mira la isla, un
recinto de 200 m² es un punto, y su superficie sigue estando en la ficha.

#### El segundo catálogo: los miradores y la red de carreteras

El Cabildo publica en dos sitios que no contienen lo mismo, y esto no está
documentado en ninguna parte: el catálogo CKAN de
`lapalmasmart-open.lapalma.es` sirve ficheros estáticos de 49 conjuntos, y
**opendatalapalma.es sirve un catálogo distinto**, de servicios ArcGIS vivos, con
100 capas. Hay cosas que solo están en uno de los dos.

- **Miradores (29)**: no existen en CKAN. Lo más cercano son las zonas
  recreativas, que son áreas de descanso, no vistas. La capa trae una sola
  columna —el nombre— y la ficha la completa con lo que sabe la aplicación:
  altitud del modelo de elevación y municipio por geometría, marcados aparte de
  lo que dice la fuente. El icono —dos montes y el arco de la vista— era el de
  interés turístico, que ha pasado a una estrella: era literalmente el dibujo de
  un mirador en la capa que no son los miradores.
- **Red de carreteras (61 tramos)**, en sustitución de las 53 vías interurbanas
  de CKAN. Son **las mismas 53** —comprobadas una a una por nomenclatura y
  denominación— más ocho que CKAN no publica porque su fichero es solo el de
  titularidad insular: la **carretera del Parque Nacional**, la del **aeropuerto**
  y seis municipales, entre ellas los accesos a El Tablado y a Juan Adalid.
- **Puntos de recarga (54)**: los dos catálogos publican exactamente los mismos
  54, los mismos nombres y los mismos 12 sin nombre. Se sigue leyendo de CKAN,
  que además trae `longitud`/`latitud` y el identificador del portal.

Las carreteras siguen yendo debajo de todo, porque son la referencia sobre la
que se leen las demás capas —sin ellas una parada de guagua flotaba sobre un
relieve sin una sola vía— pero ahora **se pinchan**. Y para eso hacen falta dos
capas: la que se ve, de 1 a 3 px según el zoom, y una gemela transparente de
14 px que recoge el clic, porque un trazo de un píxel no se acierta con el dedo
y engordar el visible convertiría el mapa del tiempo en un plano de carreteras.
Las carreteras se consultan las últimas: una parada de guagua encima de la LP-1
abre la parada, y hay un test que fija ese orden.

La ficha del tramo enseña las **dos longitudes** que publica el inventario, la
oficial y la del trazado dibujado, con la diferencia entre ambas. La LP-1 mide
102,4 km de inventario y 102,6 km de trazado: esos 137 m son del propio dato del
Cabildo, y esconderlos detrás de una sola cifra fingiría una precisión que no
tiene. La titularidad no es una columna de esa capa —CKAN podía publicarla
porque su fichero era todo insular—, así que se lee de la nomenclatura: un
código `LP-n` es una vía insular, y los ocho restantes llevan ahí a su titular
(«Municipal», «Parque Nacional», y «Aerpuerto», sin la o, tal como lo publica la
fuente).

### Los aforos, y el endpoint que no dice lo que parece

La red de aforos cuenta quién pasa por diecisiete cruces, carreteras y accesos a
senderos, separando **coches, motos, vehículos pesados, bicicletas y peatones**,
y en qué sentido va cada uno. Es, con diferencia, la red más viva del portal: la
que publica, publica todos los días.

**El nombre de su endpoint miente, y cuesta caro creerle.** `count_today` no es
el acumulado del día: es el último intervalo publicado, de unos cinco minutos.
Comprobado el 12 ago 2026 de dos maneras independientes:

- pidiéndolo dos veces seguidas, `CS04_peatones` pasó de **2/0 a las 22:12 a 0/0
  a las 22:17** — un acumulado no baja;
- a esa misma hora `CC09_coches` (entrada de Santa Cruz) daba **3/10**, mientras
  `count_historic` fechado ese mismo día daba **8.697/11.048**.

Tomarlo por el día habría puesto «13 coches» en la entrada de la capital a las
diez de la noche. Así que las cifras del día salen de `count_historic` —que sí
incluye el día en curso, acumulándose— y `count_today` se usa para lo único que
sabe: si el aparato está vivo **ahora** y a qué hora habló por última vez. En la
ficha van separados y rotulados, y la cifra grande lleva siempre «día en curso»
al lado, porque a las once de la mañana su barra es corta por la hora que es y
no porque haya pasado menos gente.

Dos detalles más del formato, los dos con test:

- **`paramfinish` es exclusivo.** Del 05 al 12 devuelve hasta el 11. Para
  incluir hoy hay que pedir hasta mañana.
- **Los peatones de carretera publican un solo sentido**: el otro llega a `null`
  en 97 de las 145 filas de la semana. Un `null` sumado como cero convierte un
  conteo de un sentido en un total de dos sin que se note, así que aquí lo que
  no se publica no se suma — y la ficha escribe «no se publica» en su sitio.

**El denominador honesto son tres cifras, no una.** El registro del Cabildo
tiene **133 contadores en 30 emplazamientos**; **84 contadores (20
emplazamientos)** publicaron algo en los últimos siete días, y **72 (17
emplazamientos)** estaban publicando el 12 ago 2026. Los tres números salen en
el panel lateral. El mapa dibuja los veinte que tienen datos en la ventana,
incluidos los tres que enmudecieron esa misma mañana —Las Ledas, Los Llanos y el
sendero del mirador de las Barandas—, que salen en hueco y con «sin datos hoy»:
esconderlos haría parecer que la isla se quedó sin tráfico justo ahí.

En `CS06` hay **dos senderos contados en el mismo punto** —Pico de las Nieves y
Virgen del Pino, con canales `_peatones1` y `_peatones2`—, y el inventario los
nombra igual a los dos. El nombre bueno es el del archivo diario; si ganara el
del inventario, dos senderos distintos pasarían a ser el mismo con la cifra
repetida. Hay un test que lo fija.

### Lo que cambiaría la aplicación de categoría

| Fuente | Qué habilita |
|---|---|
| **Evolución del punto interpolado**, no solo de la estación | El histórico ya está dentro, pero dibuja la serie de cada estación. Aplicar el motor a cada instante del archivo daría la curva de un punto cualquiera, y sobre todo **mediría la validación a lo largo de un ciclo diurno completo** en vez de sobre un instante — que es donde la capa de inversión hace de las suyas. |
| **Cruzar los aforos con el tiempo** | Los aforos ya están dentro (ver [la red de aforos](#los-aforos-y-el-endpoint-que-no-dice-lo-que-parece)), pero cada uno cuenta su sitio por separado. Cruzar los pasos diarios con la temperatura y la nubosidad de ese mismo día contestaría «¿va a estar lleno el sendero mañana?», que ninguna otra aplicación de la isla contesta. Hacen falta semanas de archivo propio o el histórico completo del Cabildo, no la ventana de ocho días que se pide ahora. |

### Capas estáticas listas para añadir (todas WGS84, ya descargables en build)

Las de turismo, miradores, cultura, historia, zonas recreativas, recarga y
carreteras ya no están en esta lista: están dentro, con interruptor propio. Lo
que queda:

| Conjunto | n | Interés |
|---|---:|---|
| `instalaciones-deportivas` | 117 | EIEL 2023. |
| `centros-sociosanitarios` / `servicios-atencion-social` | 26 / 36 | Con `tiene_uvi` y `numero_camas`. |
| `alumbrado-publico-de-la-palma` | **21.070** | Con `potencia_instalada_w` y `regulacion_flujo_luminoso`. Cruzado con la red de fotómetros da un mapa de contaminación lumínica real, que para una Reserva Starlight es una aplicación en sí misma. |

### Interesante pero con letra pequeña

- **Calidad del texto en `lugares-de-interes-cultural`.** El fichero trae la
  misma palabra escrita de cinco maneras: `Señora`, `Seaora`, `Seeora`,
  `Seoora`, `Selora` y `Se ora`. Se reparan solo las que caen dentro de la
  fórmula fija «Nuestra Señora», donde cualquier cosa que no sea una ñ es daño y
  no una variante. El resto —`Corazsn`, `Coraznn`, `FCtima`, y nombres cortados
  a media palabra como `Iglesia de San Andr` o `…de la Encarnaci`— **se deja
  como está**: el patrón cambia en cada aparición, parece daño de OCR en origen
  y no una conversión reversible, y adivinar produciría nombres inventados, que
  es peor que un nombre roto y visiblemente roto.
- **`agriparcel`** (140 parcelas) es la **única fuente con municipio real**, y su
  campo `refagroweatherobserved` es un emparejamiento parcela→estación hecho por
  el propio publicador: sirve de contraste independiente para nuestra lógica de
  proximidad. Las recomendaciones de riego, en cambio, solo existen para
  Fuencaliente y tres de sus cuatro campos numéricos son 0 en todas las filas.
- **Fotómetros históricos** (48.026 filas / semana) permitirían «dónde está el
  cielo más oscuro esta noche», con el campo `clouds` incluido. Pero **44 de 59
  llevan más de un mes sin transmitir**: la capa sería honesta solo si declara
  cuántos están vivos, como ya hace la aplicación.
- **Electricidad y agua** (19 contadores trifásicos R/S/T, 11 de agua) y
  **residuos** (310 contenedores monitorizados). Datos correctos, pero fuera de
  lo que esta aplicación promete.
- **Transparencia** —presupuestos, contratos, subvenciones, RPT— es tabular y no
  tiene nada que ver con el tiempo. Otra aplicación, no esta.

### Lo que no conviene añadir

La **calidad del aire** ya está, y así debe quedarse: como puntos, nunca como
superficie. Además su cobertura es pobre y desigual —EL PASO y SAN ANDRÉS Y
SAUCES no tienen ni una estación, y 7 de las 20 que reportan llevan más de un mes
sin actualizar—. Ampliarla daría sensación de cobertura donde no la hay.

---

### El mapa de viento

La capa **Viento animado** dibuja partículas que siguen el campo en tiempo real.
Es la única de la aplicación donde un modelo pinta sobre la isla, así que es la
que lleva más advertencias encima.

**De dónde sale cada punto del mapa.** De las 52 estaciones registradas, las que
publican velocidad **y** dirección a la vez son **23 de las 34 vivas** (medido el
12 ago 2026); las demás traen una de las dos o ninguna, y una velocidad sin
dirección no dice hacia dónde sopla. Cada estación pesa con una gaussiana de
3 km de escala, y por debajo del 1 % de peso deja de contar. El fondo lo pone
una rejilla de **54 puntos de Open-Meteo** —uno cada ~5 km, pedidos en una sola
petición, con la altitud del DEM propio en cada uno— resuelta por IDW.

Cada celda guarda `station`, de 0 a 1: qué parte de su valor sostienen las
estaciones. Con eso el panel dice **qué porcentaje de la isla lo sostiene el
modelo** —un 73 % en la medición del 12 ago— y el trazo de las partículas se
dibuja a la mitad de opacidad donde manda el modelo.

Ese porcentaje **se cuenta solo sobre tierra**. Contando el rectángulo entero
salía un 89 %, pero el rectángulo es bastante más grande que La Palma y el mar
no tiene ni estaciones ni a nadie preguntando qué viento hace: una cobertura que
promedia océano no describe la cobertura de nada.

**Todo se calcula en componentes u/v, nunca en grados.** La media aritmética de
350° y 10° da 180°, que es exactamente el viento contrario al real. Lo mismo
vale para las medias horarias del histórico, que promedian la dirección como
vector y descartan el tramo cuando el vector resultante es casi nulo — ahí no
hay una dirección media que signifique algo.

**La velocidad a la que corren las partículas está exagerada y no es un dato.**
Un viento real de 5 m/s tarda dos horas y media en cruzar los 45 km de la isla:
a escala, el mapa parecería congelado. La velocidad de verdad la dicen el color
y la cifra de cada estación. La exageración se ata al alto de la vista, así que
el movimiento se lee igual con la isla entera o con un solo barranco a la vista.

Se dibuja como capa personalizada de MapLibre con `gl.LINES` de 1 px y estela
explícita —las últimas 8 posiciones de cada partícula—, sin framebuffers
propios: la técnica clásica de acumular en una textura que se desvanece obliga
a cambiar el framebuffer activo en mitad del ciclo de dibujo del mapa y a
devolverlo exactamente como estaba.

---

### El histórico, y por qué no hay base de datos

El panel de cada estación despliega su **evolución de 24 h o 7 días**, con la
máxima y la mínima y la hora a la que ocurrieron — que es lo que un instante
suelto no puede contar.

**No se guarda nada.** El archivo ya vive en la API del Cabildo y un día pasado
no cambia nunca, así que una copia propia solo añadiría algo que se
desincroniza. Lo que hay es `/api/history?day=YYYY-MM-DD`, una función edge que
pide el día a la API y lo recorta.

El recorte no es opcional: `weatherobserved` devuelve **2,0 MB y ~5000 filas por
día** (1965 KB / 4914 filas el 5 de agosto, 2029 KB / 5065 el 9, ~3 s cada uno).
Una semana serían 14 MB al navegador por cada gráfica que alguien abra. Tras
quedarse con las cinco columnas que se dibujan y reescribir el instante como
minuto del día, **un día son 124 KB, y 28 KB si se piden medias horarias** —
16 veces menos.

Se pide **por días UTC completos, nunca por ventanas móviles**, y esa es la
decisión que sostiene lo demás: un día terminado se cachea 30 días en el CDN, así
que la gráfica de la semana son siete peticiones que casi siempre responde la
caché. Con «las últimas 24 h» cada visita generaría una URL distinta, la caché
no serviría de nada y el coste upstream se multiplicaría por visitante contra un
servicio público que ya se cae solo.

**El filtro por estación no existe en origen**: `paramname=CABLPA-ELCHARCO`
devuelve exactamente las mismas 4939 filas que sin él. Por eso se sirve el día
entero con todas las estaciones y el recorte a una lo hace el cliente — pedir
upstream una vez por estación multiplicaría la carga por 38.

Cuando una estación transmitió menos del 80 % del intervalo, la gráfica lo dice
con el porcentaje: una serie con agujeros dibuja una curva con la misma pinta
que una completa, y la forma no puede ser el único aviso.

---

## Licencias en tiempo de ejecución

La procedencia de cada byte importa, así que aquí está escrita.

En tiempo de ejecución se llama a **dos** servicios: la API del Cabildo y
Open-Meteo. Todo lo demás está **precalculado en tiempo de compilación** y
servido como fichero estático.

- **Open-Meteo sí se llama en runtime**, en dos sitios: las anclas por encima
  del techo de la red y el fondo del mapa de viento. Este apartado llegó a
  afirmar lo contrario —«no se llama nunca»— y era falso desde que existen las
  anclas; queda corregido aquí en vez de dejar la afirmación en pie.

  **La aplicación es gratuita, y esa es una decisión tomada, no un estado
  provisional**: no cobra, no tendrá suscripción y no mostrará publicidad. Con
  eso encaja en el plan gratuito, cuyas condiciones dicen textualmente *«You may
  only use the free API services for non-commercial purposes»* y enumeran entre
  los usos **comerciales** *«operating websites or apps that have subscriptions
  or display advertisements»*.

  Queda escrito porque es **la condición que sostiene el mapa de viento y las
  anclas de cumbre**, y porque quien lea esto dentro de un año necesita saber
  que no es una pregunta abierta. Si alguna vez se cambiara de idea, ese mismo
  día habría que contratar el plan Standard (29 €/mes, endpoint
  `customer-api.open-meteo.com`) o quitar las dos llamadas — no vale enterarse
  después. Los **datos** son CC BY 4.0 y su uso comercial sí es libre; la
  restricción va sobre el **servicio** gratuito.

  La capa de CO₂ ya lo dice por su lado, y por un motivo más serio: **no lleva
  publicidad ni muro de pago, y no los llevará.** Es información de seguridad
  sobre gas volcánico.

  Cuota del plan gratuito, para dimensionar: 10.000 llamadas/día y 300.000/mes.
  El viento gasta **una** petición por refresco —los 54 puntos de la rejilla
  viajan en una sola URL— y las anclas otra.

  Atribución obligatoria junto a los datos:
  `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`.

- **Nominatim y Overpass no se llaman nunca.** Su política de uso prohíbe el uso
  sistemático desde una aplicación. Los topónimos se extraen una sola vez con
  `scripts/prepare-data.ts` y se congelan en `public/gazetteer.json`, con su
  atribución ODbL.
- **Sin claves de API en el cliente.** El mapa base no usa Mapbox, Google ni
  ningún proveedor de teselas: se dibuja con el relieve sombreado del DEM local
  y los contornos que publica el propio Cabildo.

---

## Arquitectura

```
scripts/prepare-data.ts   Compilación. Se ejecuta una vez.
  ├── prepare-guagua.ts   GTFS de TILP → red de líneas, paradas y horarios
  ├── prepare-arcgis.ts   Servicios ArcGIS del visor: miradores y carreteras
  ├── public/dem/         118 teselas terrarium, z9–z12 (~34 m/px a z12)
  ├── public/layers/      GeoJSON del Cabildo; municipios reproyectado a WGS84
  └── public/gazetteer.json  789 topónimos extraídos de OSM

api/                      Funciones edge de Vercel
  ├── cda.ts              Proxy de la API del Cabildo, con caché y reintentos
  └── co2.ts              Proxy de la red DEMASE, sin caché de respaldo

src/lib/
  ├── interpolate.ts      El motor. Y `interpolate.test.ts`, su validación.
  ├── quality.ts          Filtro de calidad, censo de descartes
  ├── geo.ts              Haversine, UTM 28N → WGS84, point-in-polygon
  ├── dem.ts              Lectura del DEM y muestreo bilineal
  ├── grid.ts             Malla raster de ~200 m
  ├── counters/           Aforos: modelo del día, del pulso y del censo
  └── cabildo.ts          Cliente de la API, decodificación posicional
```

### Por qué hay un proxy

Los servidores del Cabildo **no envían cabeceras CORS** (comprobado el 12 de
agosto de 2026 con un `Origin` explícito), así que desde el navegador la llamada
directa es imposible. No es una preferencia de arquitectura.

De paso, el proxy concentra el tráfico en una petición cacheada por despliegue
en vez de una por visitante. La API del Cabildo es un servicio público pequeño
que ya se cae solo a ratos; no se le manda una estampida.

### El DEM tiene dos usos, y son las mismas teselas

Las teselas terrarium de `public/dem/` alimentan a la vez el lookup de altitud
del motor y la fuente `raster-dem` del sombreado de MapLibre. Descargar dos
modelos de elevación distintos para la misma isla sería tirar ancho de banda y
arriesgarse a que el relieve que se ve y el que se calcula no coincidan.

---

## La aplicación de iOS y Android

`mobile/` es una app de Expo que **no tiene motor propio**. Importa `../src` con
el alias `@core/*` —interpolación, control de calidad, paletas, textos, DEM,
«cerca de aquí» y el hook `useIslandData` son los mismos ficheros que compila
Vite para la web— y añade solo lo que un teléfono necesita y un navegador no.

```
mobile/
  App.tsx                  Fuentes, origen de los datos, y poco más
  metro.config.js          `@core` → ../src, y React fijado al del móvil
  src/
    theme.ts               Los tokens del diseño de iOS
    layers.ts              Las siete variables de la fila de chips
    overlays.ts            Las capas superpuestas y los seis catálogos de sitios
    config.ts              Origen de los datos, paso de la malla, vista inicial
    map/                   Mapa, pins y reparto de pins
    map/overlays/          Guaguas, sitios, carreteras, senderos, aforos, fuego
    map/icons.ts           Los iconos del catálogo, rasterizados con Skia
    components/            Cabecera, chips, FABs, hoja de capas, cristal
    detail/                Los bloques de la ficha del punto
    sheets/                Las fichas de las capas: parada, línea, sitio, aforo…
    screens/               MapScreen y DetailScreen
```

### Chips arriba, interruptores abajo

La fila de chips y la hoja de capas no son dos sitios para lo mismo. Los chips
son **excluyentes**: temperatura, humedad, rocío, viento, aire, CO₂ y cielo son
formas distintas de mirar la isla, y solo se mira una. Las capas superpuestas
—senderos, guaguas, carreteras, aforos, cámaras y los seis catálogos de sitios—
**se acumulan**, y en 393 px no caben al lado del mapa como en la barra lateral
del escritorio: van en una hoja que sube desde abajo, con un contador en el
botón para que apagarlas no sea una búsqueda.

Los avisos son los de la barra lateral, palabra por palabra, porque salen del
mismo `@core/i18n`: cuántos megas está bajando la red de guaguas, y que las
paradas no aparecen hasta cierto acercamiento.

### Los iconos se dibujan dos veces, con el mismo trazo

La web registra los iconos de sitios y de puntos de sendero como SVG —
`new Image()`, una `data:` url y `map.addImage()`—. En el móvil no hay quien
decodifique un SVG: ni el navegador, que no está, ni el cargador de imágenes de
React Native, que no sabe. Así que `map/icons.ts` los dibuja con Skia y los
escribe como PNG en la caché, y `<Images>` de MapLibre los carga de ahí.

Lo que **no** se duplica es el dibujo: el trazo y el color salen de `PLACES` y
de `poiGlyph()`/`poiColor()` en `@core`, los mismos que compone el SVG de la
web. El registro en el mapa —lo único atado a cada motor— vive aparte:
`components/MapIcons.ts` en la web, `map/icons.ts` en el móvil.

Los bitmaps se generan a ×3 y las capas piden un tercio del tamaño que pide la
web. MapLibre nativo mide un PNG suelto en puntos de pantalla, sin el
`pixelRatio` que la web sí puede declarar: a tamaño nominal se verían borrosos
en cualquier teléfono.

### Qué se comparte y qué no

Compartido, sin una sola línea duplicada: el motor entero y todo lo que cuelga
de él. Los tres puntos donde las plataformas divergen se resuelven **por
fichero, no por `if`**:

| Necesidad | Web | Móvil |
|---|---|---|
| Origen de los datos | `setDataOrigin(location.origin)` | `setDataOrigin(DATA_ORIGIN)` |
| Descargar el DEM | `dem-loader.ts` — `<canvas>` | `dem-loader.native.ts` — Skia |
| Pintar la malla | `grid-canvas.ts` — `<canvas>` | PNG de Skia a fichero |
| Iconos del catálogo | SVG y `map.addImage()` | PNG de Skia y `<Images>` |
| Declarar una capa | `map.addLayer(spec)` | `<GeoJSONSource><Layer/>` |
| Acertar una carretera | Capa gemela invisible de 14 px | Caja de toque de 44×44 |

El par `dem-loader.ts` / `dem-loader.native.ts` se elige solo: Metro prefiere el
sufijo `.native`, Vite ni lo ve. Quien importa `loadDem` no sabe en qué
plataforma está, y `dem.ts` —la decodificación terrarium y el muestreo
bilineal, que es lo que importa— es un único fichero para las dos.

El móvil **no lleva copia de los datos**. Pide `/api/cda`, `/api/co2`, `/dem`,
`/layers` y `/gazetteer.json` al mismo despliegue que sirve la web, así que
publicar la web actualiza también la app y no hay dos verdades. La malla se
calcula con paso 8 en vez de 6 —268 m por celda en lugar de 200— porque cada
celda es una estimación completa y aquí corren en el hilo de JavaScript de un
teléfono.

### El reparto de pins se calcula, no se mide

En el navegador se le pregunta al DOM dónde ha caído cada pin. En el móvil cada
pin es una vista nativa y preguntar 36 veces por fotograma sería cruzar el
puente 36 veces por fotograma, así que la posición sale de proyectar las
coordenadas con `lonToPixelX`/`latToPixelY` de `@core/lib/geo`, que es la misma
proyección que usa MapLibre. Esa cuenta solo vale con el norte arriba: por eso
la rotación y la inclinación del mapa están apagadas.

### Puesta en marcha

```bash
cd mobile
npm install
npx expo run:ios          # o run:android
```

No sirve Expo Go: MapLibre, Skia y Reanimated son módulos nativos y hace falta
una compilación de desarrollo. `ios/` y `android/` no están en el repositorio —
los regenera `expo prebuild` desde `app.json`.

---

## Trampas de esta API que ya están resueltas en el código

Documentadas aquí porque cuestan un día entero de depuración cada una:

- **`timeinstant` está en UTC**, sin sufijo de zona. Leerlo como hora canaria
  envejece toda la red una hora de golpe, y en el corte de 15 minutos del CO₂
  la vacía entera.
- **`paramstart` sin `paramfinish`** devuelve 0 filas con esquema válido en los
  endpoints históricos. Es indistinguible de un archivo vacío, y no lo es.
- **`municipality` es la cadena `"NA"`** en todas las estaciones. El municipio
  se calcula por point-in-polygon.
- **`weatherobserved` repite `precipitationintensity`** en los índices 17 y 31;
  el 31 es en realidad la precipitación diaria. Se decodifica por índice, nunca
  con `Object.fromEntries`, que descarta la segunda en silencio.
- **`hasfirealert` es la cadena `"True"`**, no un booleano. `if (r.hasfirealert)`
  deja la aplicación en alerta de incendio permanente.
- **`la_palma_municipios_240701` es el único GeoJSON en EPSG:32628.** Se
  reproyecta en compilación, sin `proj4`, con una transformación inversa exacta
  a 4 mm contra el KML del propio portal.
- **Dos estaciones tienen las coordenadas en el Atlántico** y una lectura
  congelada. Se validan las coordenadas contra la isla.
- **Hay dos estaciones distintas llamadas `CABLPA-ELCHARCO`**, a 2,4 km y 142 m
  la una de la otra. Se deduplica por `entityid`, nunca por nombre.
- **`atmosphericpressure` mezcla dos convenciones** —absoluta de estación y
  reducida al nivel del mar— sin decirlo, y a 726 m se llevan 86 hPa. Se
  distingue comparando cada lectura contra lo que marca hoy la propia red a
  nivel del mar, no contra la atmósfera estándar: con una ventana fija de
  ±15 hPa alrededor de 1013,25, CABLPA-SANTODOMINGO quedaba a 3,6 hPa de
  clasificarse al revés y una borrasca corriente la habría reducido dos veces.
  Con la referencia de la isla el margen más estrecho de la red es de 13 hPa.
- **`dailyevapotranspiration` mezcla dos convenciones también**, y esta sí sigue
  sin resolver: de las 37 estaciones frescas, 20 dan 0 clavado, las
  `LaPalma_WSAQPM_*` dan 1,4–2,06 (mm acumulados del día) y las `CABLPA-*` dan
  0,066–0,089, dos órdenes de magnitud por debajo. Se enseña por estación y en
  crudo; **no hay cifra de evapotranspiración insular que se pueda afirmar**
  hasta que el publicador documente la unidad.
- **`visibility`, `corrosion` y `corrosionindex` existen en el esquema pero no
  traen un solo dato fresco.** Están en la lista de 42 columnas y tientan; no
  sirven para nada.
- **`count_today` no es el día**, son los últimos cinco minutos, y
  `count_historic` sí incluye el día en curso; además su `timeinstant` es
  `DD-MM-YYYY` —el único endpoint al revés— y su `paramfinish` es exclusivo.
  Los tres detalles juntos están explicados en
  [los aforos](#los-aforos-y-el-endpoint-que-no-dice-lo-que-parece).

---

## Puesta en marcha

```bash
npm install
npm run prepare-data     # descarga DEM, capas y topónimos (una vez, ~2 min)
npm run dev
```

```bash
npm test                 # validación leave-one-out del motor
npm run build
```

Para refrescar solo una parte:

```bash
npm run prepare-data -- --only=dem        # dem | layers | gazetteer | snapshot
npm run prepare-data:snapshot             # nueva lectura congelada para los tests
```

El despliegue es un proyecto de Vercel sin variables de entorno: no hay ninguna
clave que configurar.

---

## Fuentes y licencias

- **Datos meteorológicos, aire, cielo, incendios y sensores** — Cabildo Insular
  de La Palma, Servicio de Transformación Digital (La Palma Smart Island).
  CC-BY 4.0. <https://www.opendatalapalma.es>
- **Límites municipales e insular** — Cabildo Insular de La Palma. ODC-BY.
- **Sitios, miradores y red de carreteras** — Cabildo Insular de La Palma.
  CC-BY 4.0. Los sitios y la recarga eléctrica salen del catálogo CKAN; los
  miradores y las carreteras, de los servicios ArcGIS del visor del Cabildo:
  <https://www.opendatalapalma.es/search?groupIds=c27000c1d7a84444bf4321b87e8d2223>
- **Aforos de tráfico y de senderos** — Cabildo Insular de La Palma, vertical
  `count` de la API (`count_locations`, `count_today`, `count_historic`).
  CC-BY 4.0.
- **Red de sensores de CO₂** — DEMASE, publicada a través del portal del
  Cabildo.
- **Transporte público** — GTFS de Transportes Insulares La Palma (TILP),
  publicado por el Cabildo. CC-BY 4.0. <https://www.tilp.es>
- **Topónimos** — © colaboradores de OpenStreetMap, ODbL 1.0.
- **Modelo de elevación y relieve** — Mapzen Terrain Tiles vía AWS Open Data,
  derivadas de NASA SRTM, NASADEM, USGS 3DEP y EU-DEM.

El **código** es MIT. Los **datos** conservan las licencias de arriba: quien
reutilice este repositorio mantiene las atribuciones. Ver [LICENSE](LICENSE).

---

## Autor

**Andrea Piani** — [www.andreapiani.com](https://www.andreapiani.com) ·
[andreapiani.dev@gmail.com](mailto:andreapiani.dev@gmail.com)

Aplicación en marcha: **[tiempo-palmero.vercel.app](https://tiempo-palmero.vercel.app)**

© 2026 Tiempo Palmero · Andrea Piani · NIE 02915190306-Z · El Paso, Santa Cruz de
Tenerife · Islas Canarias
