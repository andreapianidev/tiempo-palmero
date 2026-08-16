# El motor de interpolación

Los seis pasos que convierten 52 estaciones en una estimación para
cualquier punto de la isla, y las decisiones que los sostienen.

← Volver al [README](../README.md)

---


`src/lib/interpolate.ts`. Seis pasos, en este orden:

| # | Paso | Qué hace |
|---|------|----------|
| 1 | **Filtro** | Descarta lecturas de más de 2 h, nulas, implausibles o con coordenadas fuera de la isla. Deduplica por `entityid`, nunca por nombre. |
| 2 | **Ajuste** | Regresión OLS de la variable sobre la altitud. El gradiente se **mide**, no se asume: el 12 ago 2026 salió 4,6 °C/km, no los 6,5 del manual. |
| 3 | **Rechazo** | Descarta residuos por encima de 2,5 escalas robustas y reajusta, hasta estabilizar. **Se suspende cuando la recta no explica nada** (R² < 0,20) y no se aplica a la estación cuyo desvío es el de siempre: ver más abajo. |
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

**El rechazo se calla cuando la recta no se sostiene, y perdona al sitio
raro que siempre fue raro.** Es el arreglo más importante de esta tanda y salió
de una queja concreta: una estación a 676 m marcando 29,6 °C aparecía en la
aplicación como «excluida por el control de calidad, se desvía 3,1σ del ajuste
altitudinal», cuando estaba midiendo bien una entrada de aire sahariano.

Al medirlo, el problema era mayor de lo que parecía. El rechazo compara cada
estación con la recta `valor = a + b · altitud`; cuando esa recta explica la
varianza, separarse de ella es sospechoso, pero cuando no la explica, el residuo
es prácticamente «valor − media de la isla» y «3σ del ajuste» solo quiere decir
«eres la más cálida» — que en un día de calima o de föhn es justo la que mejor
está midiendo. **Medido sobre la red en vivo el 13 ago 2026: R² = 0,000 y un
gradiente de +0,21 °C/km** —la temperatura subiendo con la altura— sobre 35
estaciones de 12 a 1561 m, con 30 °C en el oeste y 20 °C en el este a la misma
cota. Partido por familias de sensores sale igual de plano: 0,000 en las
CABLPA, 0,013 en las MTD, 0,001 en el resto. No era una familia estropeada: era
la isla partida en dos masas de aire.

Rehaciendo la decisión hora a hora sobre las 48 h anteriores
(`scripts/checks/qc-replay.ts`), ya con las averiadas fuera: el ajuste de
temperatura **no llegaba al umbral en 29 de 49 horas**, y la regla vieja excluía
**109 veces** repartidas en 31 horas. La más acusada, 28 horas, era LasTricias
— la misma estación que `sensor-health.ts` pone como ejemplo de sitio sano.
Con el arreglo: **ninguna**. En humedad, de 148 exclusiones a 19.

El arreglo son dos piezas:

- **Umbral de R².** Por debajo de 0,20 no se excluye a nadie por el ajuste. No
  es una amnistía: el valor imposible lo sigue cazando `BOUNDS`, y la serie
  imposible `sensor-health.ts`, que es el único juez que no depende de que la
  recta del día se sostenga. Sobre el fixture —una mañana de agosto normal,
  R² ≈ 0,65— el rechazo sigue funcionando igual y sigue mejorando el RMSE un
  43,7 %.
- **Testigo de costumbre.** `sensor-health.ts` ya sabía que hay sitios que viven
  lejos de la recta sin estar averiados —«LasTricias marca +5,7 °C hora tras
  hora porque es un sitio abrigado»— y por eso juzga la *dispersión* del desvío
  y no su tamaño. Ese conocimiento no salía de allí: el motor volvía a mirar el
  mismo +5,7 y la echaba. Ahora el desvío habitual de cada estación, medido
  sobre 48 h de archivo, puede indultarla. Tampoco es una amnistía: si hoy no se
  parece a sí misma, cae igual, y sin bastantes horas de archivo no hay indulto.

Y la ficha cambió de tono. Decía «Excluida por el control de calidad» y daba las
sigmas como veredicto sobre el sensor; ahora dice «Fuera del ajuste de esta
pasada» y explica que un sitio abrigado o el borde de una calima se separan de
la recta midiendo bien. Cuando el R² se cae, el panel del modelo lo dice con
todas las letras en vez de dejar un «0,001» suelto en una tabla.

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

### El diagnóstico temporal

El rechazo de outliers de arriba mira **un instante**: compara cada estación con
el gradiente que marcan las demás ahora mismo. Eso atrapa al sensor que publica
70 °C, y no atrapa al que publica 24,83 °C —una cifra impecable— diez horas
después de haber pasado la noche a 3 °C a 1560 m en agosto. `sensor-health.ts`
mira la serie.

**Lo difícil no es cazar la avería, es cazarla sin borrar el tiempo real.** La
madrugada del 13 de agosto de 2026 entró aire sahariano en La Palma y la
estación 0401 saltó de 19,6 °C y 82 % a 25,5 °C y 34 % en quince minutos, con
El Paso, LasTricias y WSAQPM_5 confirmándolo a la misma hora con hardware
distinto. Un umbral mal puesto habría borrado del mapa justo el episodio que la
gente abre la aplicación para mirar.

Cuatro reglas, con los umbrales medidos sobre las 37 estaciones del 11 al 13 de
agosto de 2026 (`__fixtures__/sensor-health-window.json`):

| Regla | Umbral | La averiada | La sana más extrema |
|---|---|---|---|
| Salto entre lecturas seguidas | 12 °C | **16,2 °C** (0408) | 8,1 °C (0381, borde del frente) |
| Lecturas idénticas seguidas | 24 | **203** (Ecofinca Nogales) | 10 (WSAQPM_3, redondea) |
| Dispersión del desvío insular | 4 °C | **4,77 °C** (0408) | 3,18 °C (Cumbre Nueva) |
| Fuera de la envolvente física | `BOUNDS` | **70 °C** | — |

La tercera merece explicación: el desvío de una estación respecto al gradiente
de la isla es una característica **del sitio** y tiene que ser estable.
LasTricias marca +5,7 °C hora tras hora, el desvío más grande del archivo, y
está perfectamente sana — es un sitio abrigado. Lo que no puede pasar es que ese
desvío se mueva. Por eso se mide su dispersión y no su mediana.

**La ventana son 48 horas por una medida, no por prudencia.** La avería de la
0408 es intermitente: en las últimas 24 h su salto máximo es de 9,8 °C contra
los 8,1 °C de una sana, y su dispersión 1,36 contra 3,15 — indistinguibles. A 36
h tampoco llega. A 48 h separa con holgura. Bajar esa ventana es volver a no ver
la avería.

Sobre las 37 estaciones del archivo el diagnóstico marca **exactamente dos**, y
un test lo fija: cualquier cambio que condene a una tercera falla.

Una estación diagnosticada **sale del ajuste** —del gradiente, de la banda y del
RMSE, que si no describirían un modelo hecho en parte con datos falsos— pero no
sale del mapa. Su pin enseña la estimación del modelo en su punto, con tilde
delante (`~24,6°`), borde discontinuo y la explicación en el panel lateral.

**Por qué no una media histórica.** Era la otra opción evidente y es la
equivocada. Una climatología acierta los días normales, que son justo los días
en que no hace falta. El 13 de agosto la cumbre de Garafía estaba a unos 25 °C
por la invasión sahariana; la media de agosto en ese punto ronda los 18. El
«respaldo» habría separado la cifra de la realidad casi ocho grados, y
precisamente durante el episodio extremo.

### Gráficas en cualquier punto, no solo donde hay sensor

El motor no depende de que el instante sea «ahora»: dándole las lecturas de las
03:00 de ayer devuelve la estimación de las 03:00 de ayer. `history-field.ts`
rehace el modelo **entero** en cada instante de la ventana —48 ajustes completos
para 24 h a paso de 30 min, unos 30 ms— y de ahí sale la curva de un punto donde
no hay ni ha habido nunca una estación.

Se rehace el ajuste en cada instante a propósito: el gradiente de La Palma no es
una constante, se mueve con la inversión a lo largo del día y con el episodio a
lo largo de la semana. Reutilizar un solo ajuste sería más barato y estaría mal
justo en las horas interesantes.

Validado como se valida el presente, dejando fuera una estación y reconstruyendo
su sitio a lo largo de 24 h, sobre las 34 sanas del 12 de agosto de 2026:

| | RMSE |
|---|---|
| Mediana de las 34 | **1,61 °C** |
| Mejor (WSAQPM_9, 422 m) | 0,39 °C |
| Peor (LasTricias, 1177 m) | 7,32 °C |

El peor caso dice algo verdadero y conviene no esconderlo: LasTricias es el
sitio con +5,7 °C de desvío propio, y al excluirla el modelo no tiene forma de
saber que ese microclima existe. La curva de un punto sin sensor acierta el
régimen de la isla, no las particularidades que solo un sensor allí puede
medir — y por eso se dibuja con trazo discontinuo, banda de incertidumbre y una
nota que lo dice.

---
