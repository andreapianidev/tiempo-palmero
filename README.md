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
- [Licencias en tiempo de ejecución](#licencias-en-tiempo-de-ejecución) — por qué
  no se llama a Open-Meteo, Nominatim ni Overpass
- [Arquitectura](#arquitectura)
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
- **El viento y la precipitación no se interpolan.** Los barrancos encauzan el
  viento y la vertiente noreste recibe múltiplos de la suroeste a igual
  altitud. Se muestra la estación más cercana, declarada como tal, con su
  distancia y su desnivel.
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
aplicación usa hoy seis capas y un endpoint en directo. Lo que queda, ordenado
por lo que aportaría de verdad:

### Ya integrado (agosto 2026)

El panel del punto responde a «¿qué hay aquí?», no solo «¿qué tiempo hace?»:
senderos y sus puntos de interés, zonas recreativas y refugios, lugares de
interés turístico, cultural e histórico, puntos de recarga eléctrica y paradas
de guagua. Las capas se cargan **bajo demanda** —son 10 MB en total y la mayoría
de las visitas no llegan a tocar el mapa— y la lista se recorta a las ocho más
cercanas, con el resto plegado.

**Las guaguas se muestran sin horarios, a propósito.** El GTFS que publica el
Cabildo tiene todos los calendarios de servicio caducados el **25 de diciembre
de 2025**, sin una sola excepción con fecha de 2026 (comprobado el 12 ago 2026).
El sitio de TILP está peor: su único documento de líneas es un PDF de septiembre
de 2020. Google Maps sí tiene horarios porque TILP se los cede por acuerdo
privado, pero esos datos no son redistribuibles y usarlos exigiría una clave de
Google en tiempo de ejecución, que es justo lo que esta aplicación no tiene.

Así que se enseña lo que sobrevive a la caducidad —**qué líneas paran en cada
parada**, extraído del propio GTFS en tiempo de compilación— y se dice
explícitamente que los horarios no están disponibles, con la fecha y un enlace a
TILP. Un horario caducado leído como vigente es una guagua perdida, y en esta
isla eso no es un detalle.

### Lo que cambiaría la aplicación de categoría

| Fuente | Qué habilita |
|---|---|
| `weatherobserved` — histórico crudo, **35.274 filas / semana** | Gráficas de 24 h y 7 días por estación, máximas y mínimas del día, y **evolución del punto interpolado en el tiempo**. También multiplicaría la validación: hoy los criterios se miden sobre un instante, y con histórico se medirían sobre un ciclo diurno completo, que es donde la capa de inversión hace de las suyas. |
| **Campos ya presentes que no se muestran** en `weatherobserved_lastdata` | `uv` (índice UV — en Canarias no es un adorno), `solarradiation`, `atmosphericpressure` (interpolable con corrección barométrica, ~1 hPa cada 8 m), `illuminance`, `dailyevapotranspiration`, `visibility`, `feellikestemperature`. La presión es la tercera variable que de verdad admite interpolación y no está. |
| `count_today` / `count_historic` — **77 aforos, la única red 100 % viva** | Aforos de senderos y tráfico. Cruzado con el tiempo responde a «¿va a estar lleno el sendero mañana?», que ninguna otra app de la isla contesta. Y es la red más sana del portal, sin una sola estación muerta. |

### Capas estáticas listas para añadir (todas WGS84, ya descargables en build)

| Conjunto | n | Interés |
|---|---:|---|
| `zonas-recreativas-de-la-palma` | 33 | El conjunto con más atributos del portal (22 claves): refugios, zonas de acampada, `permisos`, `capacidad_personas`. Encaja directamente con senderos y tiempo. |
| `lugares-de-interes-turistico-de-titularidad-insular` | 50 | Los «Imprescindibles», con accesibilidad y ficha. |
| `lugares-de-interes-historico-de-la-palma` | 390 | Polígonos, con superficie. |
| `lugares-de-interes-cultural-de-la-palma` | 92 | Museos, iglesias, centros. |
| `transporte-publico-…-guagua` | 913 paradas + **GTFS** | Llegar al punto consultado en guagua. El GTFS es de especificación estándar. |
| `puntos-de-recarga-de-vehiculos-electricos` | 54 | Ojo: incluye previstos, no solo operativos (`prioridad` los separa). |
| `vias-interurbanas` + Feature Server de ArcGIS | 53 | Red de carreteras, con capa viva. |
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

## Licencias en tiempo de ejecución

La aplicación es comercial, así que la procedencia de cada byte importa.

**En tiempo de ejecución, la única fuente de datos es la API del Cabildo.**

Lo que viene de terceros está **precalculado en tiempo de compilación** y
servido como fichero estático:

- **Open-Meteo no se llama nunca.** Su API gratuita es explícitamente solo para
  uso no comercial. Las altitudes salen del DEM propio.
- **Nominatim y Overpass tampoco.** Su política de uso prohíbe el uso
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
- **Red de sensores de CO₂** — DEMASE, publicada a través del portal del
  Cabildo.
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
