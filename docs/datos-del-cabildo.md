# Qué más publica el Cabildo, y qué falta por aprovechar

Los 49 conjuntos del portal: cuáles están integrados, cuáles faltan, cuáles
no merecen la pena y por qué. Hoja de ruta y bitácora a la vez.

← Volver al [README](../README.md)

---


El portal tiene **49 conjuntos de datos reales y 22 endpoints IoT**, y el visor
ArcGIS del Cabildo —que no es el mismo inventario— tiene **2.387 elementos**
más.

> **De dónde salen los 49, y por qué contarlos cuesta.** La API CKAN no está
> donde la documentación del portal la pone. `package_list` bajo la raíz
> —`lapalmasmart-open.lapalma.es/api/3/action/…`— devuelve **la portada en HTML**
> con 200, no un error, así que un contador escrito a ojo se queda callado en vez
> de fallar. El catálogo cuelga de su propia sección:
>
> ```bash
> curl -s https://lapalmasmart-open.lapalma.es/datosabiertos/catalogo/api/3/action/package_list
> ```
>
> Eso devuelve **51 nombres**, y los 49 salen de restar los dos que no son un
> conjunto de datos: **`admin_test`**, que es una prueba de la administración del
> portal, y **`catalogo_opendata_lapalma`**, que es el catálogo del catálogo.
> Recontado así el 22 de agosto de 2026 y sigue dando 49. Si algún día da otra
> cosa, esa cifra aparece en el README, en la portada de `web/` y aquí mismo. Esta aplicación usa hoy **veinte capas estáticas** —de las veintiuna que
descarga; la única que no se lee en runtime es el inventario de sensores de CO₂,
que llega en directo de DEMASE— más el resumen de cultivos y el agregado del
GTFS de guaguas. Lo que queda, ordenado por lo que aportaría de verdad:

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

### Las webcam, y el dataset que apunta a un servidor caído

El mismo catálogo ArcGIS publica **`webcam`**, 60 registros con la posición de
cada cámara de la isla y un campo `web` con el URL de su imagen. Es la capa que
más prometía y la que peor estaba. Medido URL por URL el 14 de agosto de 2026:

| | |
|---|---:|
| Registros en el dataset | 60 |
| Devuelven una imagen | **29** |
| De esos, congelados desde 2016–2020 | 4 |
| Los diez del propio Cabildo | **0** |

Los diez registros del Cabildo apuntan todos a `locserhom.ddns.net`, un dominio
dinámico que resuelve a 88.8.134.114 y no acepta conexiones: seis intentos, seis
tiempos de espera agotados en el puerto 443. El dataset no se toca desde marzo
de 2024.

Las cámaras no se han apagado: **se han mudado**. El Cabildo las sirve ahora
desde `polimer.lapalma.es`, el backend de su portal `webcam.lapalma.es`, en
JPEG de 2688×1520 por HTTPS. Barriendo el rango de identificadores y
contrastando con los rótulos del portal salen **13 imágenes en pie**, entre ellas
tres que el portal enseña y el dataset no. Dos de esos emplazamientos son torres
de vigilancia de incendios: Las Tricias cae a **39 m** de la cámara `WTER 01` de
la capa de incendios y San Antonio del Monte a **8 m** de `WTER 02`. No es la
térmica —esa no publica imagen— sino la panorámica en visible de la misma torre.

Por eso el catálogo de esta aplicación (`lib/webcams/catalog.ts`) **es estático
y no una consulta en vivo**: consumir el dataset tal cual sería pedirle a cada
visitante que descubra por su cuenta que dos tercios de la lista están muertos.
Las posiciones sí salen de él, que para eso sigue siendo la fuente buena: las
cámaras no se han movido de sitio, solo de servidor.

**La hora de la foto es el punto delicado**, y hay tres casos distintos en vez
de un «actualizado hace un momento» para todos:

- Las del observatorio y la del ayuntamiento **mandan `Last-Modified`**, así que
  la ficha enseña la hora real de la imagen. Como ninguna cámara manda cabeceras
  CORS, esa cabecera la lee `api/webcam`, que hace un HEAD y devuelve solo la
  fecha: **la imagen no pasa por el proxy**, porque son hasta 1,2 MB y el
  navegador puede pedírsela al origen él solo.
- Las del Cabildo **no la mandan** —nginx con `no-store`— pero llevan la fecha y
  la hora **impresas dentro del JPEG**. La ficha remite a ese rótulo.
- Si no hay ninguna de las dos cosas, se dice solo cuándo la hemos descargado
  nosotros, etiquetado como tal. Lo que nunca se hace es presentar la hora de
  descarga como hora de la imagen: una panorámica puede llevar dos horas
  congelada y descargarse ahora mismo.

### La cadencia, y por qué medirla mal cuesta cámaras vivas

Ninguna declara cada cuánto publica, así que hubo que cronometrarlas — y el
primer par de intentos dio veredictos falsos, los dos en la misma dirección:
marcar como muertas cámaras que funcionaban.

| Ventana | Veredicto sobre las 12 del Cabildo |
|---|---|
| 15 min, 2 lecturas | 6 «paradas» |
| 30 min, 3 lecturas | 2 «paradas» |
| 54 min, 4 lecturas | 3 «paradas» |
| **2 h 30, 9 lecturas + reloj impreso** | **1 parada de verdad** |

Lo que aparecía al alargar la ventana es que **tres cámaras del Cabildo
publican cada dos horas exactas**. No aproximadamente: el reloj impreso de Las
Tricias pasó de `11:56:31` a `13:56:32` y a `15:56:32`; el de San Antonio del
Monte, de `15:05:11` a `17:05:10`; el de Tirimaga, de `14:09:22` a `16:09:23`.
El resto renueva en minutos.

Podar con una ventana más corta que la cámara más lenta es tirar cámaras vivas
creyendo que se limpia, y es el error caro de los dos: una cámara lenta
etiquetada como muerta desaparece y nadie vuelve a mirarla. Por eso
`scripts/checks/webcams.ts` usa por defecto **cinco lecturas repartidas en tres
horas**, y por eso las tres de dos horas están en la capa con su cadencia
declarada en la ficha —`slowMinutes` en el catálogo— en vez de fuera.

Fuera se quedó **una sola**, y respondía `200 image/jpeg` con toda puntualidad:
el segundo ángulo de Las Tricias (`99876586`) devolvió los mismos bytes en las
nueve lecturas entre las 13:37 y las 16:06 UTC, con el reloj impreso clavado en
las `09:59:30`. Contestar no es estar vivo, y ésa es toda la moraleja.

#### Y al final el reloj impreso sí se lee

Durante un rato el control se apoyó solo en «¿cambia la imagen?», porque los
relojes impresos **no son homogéneos**: unos escriben `DD-MM-AAAA` y otros
`MM-DD-AAAA`, unos van en hora insular y otros en UTC, y ninguno está
sincronizado con nada —el del Mirador de El Time se leyó seis minutos atrasado
a las 13:37 UTC y nueve adelantado a las 16:36 del mismo día—. Pero rendirse ahí
costaba tres horas de espera por cada comprobación.

Se leen. El rótulo no es texto con antialias: es una **fuente de mapa de bits de
7×10 escalada ×4**, idéntica píxel a píxel en todas las capturas, así que
comparar contra plantillas es exacto donde un OCR sería aproximado — y no añade
ninguna dependencia. `scripts/checks/stamp.ts` busca la franja del rótulo por su
firma (bloques de tinta a paso constante), la binariza con Otsu sobre el propio
recuadro, y compara cada glifo con las doce plantillas de
`stamp-font.ts`. Nueve de las doce cámaras del Cabildo se leen con **cero por
ciento de error** en los caracteres de la fecha; en las otras tres el rótulo cae
sobre hierba al sol o sobre laurisilva y el contraste no da.

Las dos ambigüedades no se resuelven inventando: se devuelven **todas** las
interpretaciones posibles y se usa la **edad mínima**. Si hasta la lectura más
favorable dice que la foto tiene cinco horas, está muerta, y ninguna cámara viva
puede caer por el margen de una hora entre husos.

El resultado es que el control ya no espera tres horas por sistema. De las 26
vistas, **22 se resuelven con una sola petición** —doce por `Last-Modified`,
nueve por el reloj impreso, dos marcadas por su cadena TLS— y la ventana larga
la esperan solo las cuatro que no se han podido fechar.

Quedan fuera, y la sección del panel lo dice: las diez del servidor caído, las
que solo funcionan de noche (Mercator, las all-sky de MAGIC), las congeladas
desde junio o julio, y las de alojamientos y particulares —que funcionan, pero
no tienen licencia de reutilización ni publican coordenadas—. Las que entran del
Cabildo sí la tienen: su «Aviso Legal» autoriza la reutilización comercial y no
comercial citando la fuente.

### Faros, antenas de TDT y la cobertura móvil de 2013 (agosto 2026)

Tres capas del catálogo ArcGIS del portal, que es un inventario distinto del
CKAN y tiene cosas que el otro no:

- **Faros** (4). La fuente publica *solo* el municipio: ni nombre, ni alcance,
  ni característica de la luz. La ficha se titula por municipio en vez de
  inventarse «Faro de Fuencaliente», que además serían dos.
- **Antenas de telecomunicaciones** (100). Es la capa que el portal enseña como
  «Localización de antenas y cobertura de señal TDT». Medido el 13 ago 2026:
  33 de telefonía móvil, **32 de televisión**, 14 de enlace, 11 de la red Tetra
  de emergencias y 10 de radio. De cobertura no publica ningún polígono — el
  visor del Cabildo la dibuja como imagen, no como dato — así que aquí entran
  los emplazamientos y **no se dibuja ninguna mancha de cobertura de TDT**,
  que sería inventarla.
- **Cobertura móvil**, como variable del mapa y con el año dentro del nombre:
  «Cobertura móvil (2013)». Son 669 medidas de nivel de señal GSM tomadas
  recorriendo la isla, y **las 669 son de noviembre o diciembre de 2013**
  (comprobado fila a fila; una trae el año tecleado al revés, «2103-11»). No
  hay ninguna posterior. Se enseña porque las sombras que dibuja son de relieve
  y siguen ahí, pero no dice qué cobertura hay hoy: en 2013 no había 4G
  desplegado, no existía el 5G y la erupción de 2021 se llevó parte de la red
  del oeste. El año viaja en la etiqueta de la variable y no en una nota al
  pie, porque en un chip plegado o en una captura de pantalla la nota al pie no
  se ve.

Los tres campos que solo existen donde alguien midió —el CO₂ y la cobertura—
comparten implementación en `src/lib/masked-field.ts`: cada celda toma la
medida **más cercana** y solo hasta un radio (80 m el CO₂, 600 m la cobertura).
Nada se promedia. En el CO₂ porque promediar 400 y 69 301 ppm dibuja una pluma
que no existe y baja un dato de seguridad; en la cobertura porque la señal la
corta el relieve y una media rellenaría justo las sombras de radio, que son lo
único que interesa saber.

### El mar de nubes, la cumbre y los senderos (agosto 2026)

Tres funciones que responden a la pregunta que se hace todo el mundo en esta
isla antes de salir de casa: **¿dónde acaba la nube?**

**El mar de nubes ya se cuenta, y no cuesta ni una petición.** La inversión del
alisio la localizaba el motor desde hace tiempo —criterio de Torres, Cuevas,
Guerra y Carreño (2002); ver [la sección de la
inversión](motor.md#la-inversión-del-alisio-se-diagnostica-no-se-supone)— pero sólo la
usaba por dentro para no extrapolar a través de ella. Ahora se publica en el
panel, con dos guardas que no son opcionales:

- **Una inversión no es un mar de nubes.** Se le exige además `cloud_cover_low`
  del mismo sondeo y la misma pasada. El 13 ago 2026 el modelo daba una
  inversión de manual sobre el centro de la isla —de 1081 a 1573 m, la
  temperatura SUBE de 19,8 a 21,2 °C y la humedad cae del 71 al 21 %— con la
  nubosidad baja **a cero**. Sin esa guarda, la aplicación habría anunciado
  niebla en Tijarafe bajo un cielo raso.
- **La cota es una banda, no una línea.** Los niveles de presión que encierran
  el tramo crítico (900 y 850 hPa) están a ~493 m entre sí, más que el espesor
  del propio fenómeno. Todo lo que se enseña lleva su `± resolución` al lado, y
  la cota de sol se redondea **hacia arriba** desde el techo más el margen: es
  la primera altitud en la que la afirmación se sostiene entera.

**La cumbre tiene por fin una medida de verdad.** La red del Cabildo se acaba
entre 1200 y 1700 m según qué estaciones estén vivas, y todo lo que la
aplicación decía por encima lo ponía un modelo. El **TNG** publica en
`tngweb.tng.iac.es/api/meteo/weather` la meteorología de su estación a **2387
m**: 18 campos con `value`, `timestamp`, `level` y —esto es lo valioso— un flag
`outdated` por campo. Se pasa por un proxy porque el origen no manda ninguna
cabecera CORS (comprobado el 13 ago 2026), se cachea 5 minutos y **se respeta
el flag a rajatabla**: el 12 ago 2026 el `seeing` llevaba cuatro días parado y
los otros ocho campos eran de hace un minuto, así que el seeing sale apagado y
con su fecha. Hay además dos lecturas que no da ninguna otra fuente de la isla:
el **seeing** en segundos de arco —la turbulencia que decide si la noche sirve
para observar— y un contador de **polvo** en cinco canales, que es el mejor
detector de calima disponible. El fondo limpio del Roque estaba en 0,16 µg/m³.

Es un observatorio de investigación, no un servicio público de datos: si calla,
la sección desaparece y nada más se entera.

**Los 49 senderos llevan aviso, y ninguna fuente nueva.** Los 640,7 km de
trazado ya estaban descargados; lo que se hace ahora es recorrerlos con el
mismo campo que pinta el mapa, un punto cada 200 m (~3.200 puntos, una cuarta
parte de lo que ya cuesta la malla), y comparar con una tabla de umbrales. Tres
cosas que esta función dice en voz alta porque callarlas la haría peligrosa:

- **No es el estado del sendero.** Los cierres por derrumbe u obra los publica
  el Cabildo, y la sección enlaza allí.
- **No hay aviso de lluvia.** Las 37 estaciones frescas publican
  `dailyprecipitation` y **las 37 publican cero**; además la lluvia es de las
  variables que esta aplicación no interpola nunca. Un sendero sin avisos puede
  estar empapado.
- **El viento se declara mestizo.** Sólo 24 de 37 estaciones lo publican y 21
  dan algo distinto de cero, así que en una cresta el aviso lo pone casi todo el
  modelo — y el porcentaje se enseña al lado de la cifra.

El dataset **no trae nombres**: ni el GeoJSON de CKAN ni el Feature Service de
ArcGIS tienen columna de nombre. Así que no se inventa ninguno. Se reconstruye
la nomenclatura de las señales desde el código (`GR1301` → `GR 130.1`,
`PRLP0600` → `PR LP 6`) y se completa con los municipios de los dos extremos,
sacados de la geometría contra los límites municipales que la app ya carga. Y
se clava en `id_sendero`, nunca en `codigo`: el inventario tiene dos `PRLP1310`
y dos `PRLP1700`, y un mapa por código perdería dos senderos sin avisar.

### El déficit de presión de vapor

Cuarta variable del mapa, derivada como el punto de rocío y por la misma razón:
se calcula de la temperatura y la humedad, así que no puede contradecirlas.

Existe porque **la humedad relativa esconde lo que la planta siente**: 80 % a
12 °C son 0,28 kPa de déficit y 80 % a 28 °C son 0,76 —casi el triple de
demanda con el mismo número en pantalla—, y sobre una isla que a la misma hora
tiene 26 °C en la costa y 12 °C en la cumbre eso no es un matiz. Los cortes de
la paleta (0,4 y 1,6 kPa) son práctica de horticultura protegida, no umbrales
medidos en La Palma, y la interfaz lo dice donde los usa.

Al añadirla salió a la luz que la misma tabla de variables estaba escrita en
cinco sitios —paleta en `App.tsx`, otra vez en `MapScreen.tsx` del móvil,
unidades en `PointPanel.tsx`, etiquetas cortas en `layers.ts` y la lista de
chips en `VariablePicker.tsx`—, así que ahora vive una sola vez en
`lib/variables.ts` y el compilador exige completarla. Una prueba comprueba que
el orden cubre todas las claves del catálogo: si alguien añade una variable y se
olvida, la web la pintaría y el móvil no.

### Agricultura: la sed del día y el mapa de 2008

**La ETo no puede salir de las estaciones del Cabildo.** Medido el 12 ago 2026
sobre las 37 frescas: `dailyevapotranspiration` llega en 37 pero **sólo 16
traen algo distinto de cero**, con valores de 0,09–0,20 que son pasos
instantáneos y no totales del día; y `solarradiation` la publican **5
estaciones**, así que no hay Penman-Monteith que reconstruir. Sale por tanto de
`et0_fao_evapotranspiration` de Open-Meteo, pedida en los **mismos 54 puntos**
que ya usa el campo de viento y con la cota real del DEM en cada uno —6,99 mm a
50 m, 5,43 a 870 y 4,97 a 2114, medidos el 13 ago 2026—. El muestreo corrige por
altitud igual que el resto del motor: sin eso, un punto de cumbre se llevaría la
ETo de la costa que tiene debajo, un 40 % más alta.

Con el cultivo de la parcela sale `ETc = ETo × Kc` y, restando la lluvia, lo que
falta por reponer. **Hasta ahí llega y ahí se para**: la eficiencia del sistema
de riego, el agua guardada en el suelo y la fracción de lavado dependen de la
finca y no están en ningún dato publicado. Los Kc son los de media estación de
la tabla 12 de FAO-56 —una sola cifra por cultivo, porque la fase la marca la
fecha de plantación de cada parcela y eso no lo publica nadie—.

**El mapa de cultivos existe, y es de 2008.** No está en CKAN: vive en el
Feature Service `Agricultura/FeatureServer/0` del visor ArcGIS, con **217.137
parcelas** y 71 códigos de cultivo. Su propia descripción dice que lo levantó el
Gobierno de Canarias «entre el año 2002 y … 2008», y en medio está el Tajogaite.
Medido contra la API el 13 ago 2026: **40.387 parcelas y 6.873,6 ha en cultivo**,
de 70.666 ha catalogadas —el resto es monte (32.374 ha), erial (15.329) y huerta
abandonada (11.679)—. Los Llanos de Aridane encabeza con 1.061,5 ha, de las que
810 son platanera; Tazacorte tiene 732,7 ha y **728,8 son platanera**.

Servir esos polígonos es imposible: 35 MB en crudo, 10 MB simplificados a ~11 m,
las dos cifras medidas. Así que el trato es el mismo que ya se le da a «cerca de
aquí»: **un resumen por municipio congelado en el build (4,2 KB)** y **la
parcela concreta pedida en vivo** al pinchar el mapa (0,8 s medidos). Cada ficha
lleva el año pegado.

De la red hidráulica sí se descarga todo, porque cabe: **433 puntos** de
captación y almacenamiento —12 balsas con su capacidad, 150 nacientes, 84 pozos
y 187 galerías, con cota, paraje y estado— y **133 trazados** de los canales
LP-I, LP-II y LP-III. `MASAS_AGUA_SUBTERRANEA` se deja fuera a propósito:
publica un esquema de 29 columnas y **cero filas**, y una capa vacía en el
conmutador es una promesa incumplida cada vez que alguien la enciende.

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

#### El viario que el Cabildo no publica

Las 61 carreteras son las 61 carreteras, y no pretenden ser otra cosa. Debajo de
ellas la isla salía **vacía**: en las medianías de Tijarafe, en Puntagorda o en
cualquier lomo, las paradas de guagua y los sensores flotaban sobre un relieve
sin una sola calle por la que se llega hasta ellos. A 500 m de la parada de
Plaza El Jesús, en Tijarafe, el mapa dibujaba **cero vías**; con esta capa
dibuja **65**.

Esa parte la pone OpenStreetMap, y como todo lo que viene de ahí se extrae **una
sola vez en tiempo de compilación** (`scripts/prepare-osm-roads.ts`): la usage
policy de Overpass prohíbe el uso sistemático desde una aplicación, así que en
runtime esto es un fichero estático más, con su atribución dentro.

| Nivel | Qué es | Trazados | km | Desde |
|---|---|---:|---:|---|
| Principal | La red que cruza la isla: LP-1, LP-2, LP-3 y enlaces | 2.303 | 531,6 | z0 |
| Local | Calles de pueblo, `unclassified`, `tertiary`, peatonales | 3.464 | 615,9 | z11 |
| Pistas y accesos | `track` (tierra, discontinua) y `service` | 14.003 | 2.225,5 | z13 |

Tres decisiones que no son de gusto:

- **No entran los senderos.** `path`, `footway`, `steps` y `cycleway` son 6.570
  trazados más que aquí serían ruido y que además duplicarían la capa de
  senderos, que ya está, viene del Cabildo y trae nombre y avisos.
- **Las pistas aparecen a partir de z13**, y son 14.003 de los 19.770: a zoom de
  isla entera pintan una telaraña gris encima del tiempo, que es justo lo
  contrario de lo que esta aplicación enseña. El panel lo dice mientras no se
  llega —el mismo aviso que ya tenían las paradas de guagua.
- **No se pincha.** La ficha de una carretera —código, recorrido, titularidad,
  las dos longitudes— sale del dato del Cabildo, que es quien la publica. Una
  capa de toque de 19.770 líneas se comería el clic de las estaciones, las
  paradas y los puntos de interés.

El fichero son 5,2 MB (837 KB por el cable) y se descarga **solo al encender el
interruptor**. Sale de 20,4 MB de Overpass: los trazados se adelgazan con
Douglas-Peucker a **1e-5 grados**, que a esta latitud son **1,11 m como mucho**,
medio píxel a z16 (2,10 m por píxel) y un píxel justo a z17 (1,05 m) —el zoom
máximo de la aplicación desde el 16 de agosto de 2026—.
Eso quita el 32 % de los vértices sin que se vea. El umbral está medido, no
elegido: a 5e-5 (5,5 m, 2,6 px) las curvas de las medianías empiezan a verse
recortadas.

#### La cobertura de TDT que estaba en un KMZ

La pregunta «¿llega la tele aquí?» tiene respuesta publicada, pero no donde se
la busca. El catálogo CKAN no la tiene. La capa `Telecomunicaciones` del visor
trae los **100 emplazamientos de antena** —33 de telefonía móvil, 32 de
televisión, 14 de enlace, 11 de la red Tetra de emergencias y 10 de radio— y
ninguna geometría de cobertura. Lo que sí existe es un **KMZ**,
`Simulaciones_Rep_TDT.kmz`, colgado del portal del Cabildo en ArcGIS Online
desde abril de 2018: dentro hay **49 simulaciones de propagación**, una por
sector de repetidor, cada una como una imagen georreferenciada.

Se funden en build (`scripts/prepare-osm-roads.ts` tiene un hermano,
`prepare-tdt.ts`) en un solo PNG de 28 KB con celdas de **92 m** —la resolución
de la más fina de las 49, subirla no inventaría detalle—, y con el número de
sectores que alcanzan cada celda guardado en el canal alfa, en tres escalones.
Por eso la ficha de un punto puede decir «la alcanzan 3 repetidores o más»
leyendo **el mismo píxel** que el mapa pinta: no hay dos fuentes que puedan
contradecirse.

| | |
|---|---:|
| Superficie de la isla con simulación | **51,6 %** |
| Celdas de tierra que alcanza 1 repetidor | 33.720 |
| …2 repetidores | 11.823 |
| …3 o más | 3.924 |
| Celdas de mar recortadas | 43.143 |

El recorte a la costa es una decisión, y se dice: la simulación pinta también
mar abierto, donde no hay a quién dar señal. El límite insular es el mismo
fichero del Cabildo que dibuja la isla, y la comprobación de que el recorte cae
donde debe es aritmética: las 95.801 celdas de tierra que salen son **711 km²**,
y La Palma tiene 708.

**Lo que este dato NO dice**, y la interfaz lo repite en la leyenda, en la ficha
del punto y en la pantalla de fuentes: no es una medida, es de 2018, y simula
los repetidores, no el centro emisor principal. Quedar fuera de la mancha **no**
significa que allí no llegue la señal. Lo que sí se ve en ella son las sombras
de radio del relieve: la Caldera de Taburiente sale hueca, y en los barrancos
del noreste el dibujo es un peine.

Un detalle que obligó a escribir más código del previsto: a 92 m, un «no» de una
sola celda engaña. El casco de **Villa de Mazo** y el puerto de **Tazacorte**
caen los dos en un agujero de UNA celda con cobertura simulada a tres o cuatro
celdas de distancia. Así que la ficha mira también alrededor —tres celdas, 276
m— y distingue «aquí no, pero sí a menos de 300 m» de «fuera de las 49
simulaciones». Son dos frases distintas porque son dos cosas distintas.

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

**Las partículas corren a la velocidad medida, con el tiempo acelerado.** Un
viento real de 5 m/s tarda dos horas y media en cruzar los 45 km de la isla: a
escala real el mapa parecería congelado. La única licencia es esa aceleración
—unas **550 veces** con la isla entera en pantalla, proporcionalmente menos al
acercarse—, y es la misma para todas las partículas del fotograma: **una estela
que corre el doble lleva el doble de viento**. La estela es la exposición de los
últimos 0,56 s de trayectoria, apuntada por reloj y no por fotograma, así que
mide lo mismo en una pantalla de 60 Hz que en una de 120.

Hasta el 13 ago 2026 no era así: el desplazamiento pasaba por una compresión
`v^0.6` que subía un 90 % el viento flojo para que el interior no se viera
parado, y con ella dos estelas que corrían igual podían ser 4 y 9 m/s. La
legibilidad del viento flojo se resuelve ahora donde no cuesta mentir: alargando
la exposición de la estela (10 px a 2 m/s, 71 px a 14 m/s, en una ventana de
900 px con la isla a la vista).

#### El viento en tres dimensiones

Con el relieve encendido, el viento estuvo un tiempo APAGADO, y por una razón
honesta: MapLibre no proyecta las capas personalizadas sobre el terreno, así que
las partículas —calculadas a cota cero— cruzaban las montañas por dentro. Ya no.

Cada vértice lleva su propia cota, sacada del mismo modelo de elevación que
sombrea el mapa y que pone las altitudes del motor —ya está en memoria, así que
esto **no descarga nada**—, convertida a la Z conforme que espera la matriz de
una capa `renderingMode: '3d'`. La conversión es exactamente la de
`MercatorCoordinate.fromLngLat`, y hay un test que las compara vértice a vértice
en cinco altitudes y tres latitudes: si algún día se separaran, las estelas se
dibujarían a una altura que no es la del terreno y **nadie vería un error**, sólo
viento flotando.

Tres decisiones que hacen que se vea como se ve:

- **La cota se lee dos veces por partícula y fotograma.** La estela apunta la
  posición de ANTES de moverse y la cabeza se dibuja en la de DESPUÉS: con una
  sola lectura, la cabeza iba a la altura del sitio del que venía, y a 600
  aumentos eso son 100 m de terreno por fotograma —sobre una ladera de Cumbre
  Nueva, 50 m de error vertical—. Cada punto de la estela guarda la cota de SU
  sitio, y por eso la estela se pega a la ladera en vez de quedarse horizontal.
- **La montaña tapa el viento que hay detrás.** La capa comparte el búfer de
  profundidad con el relieve (`LEQUAL`, que lo pone MapLibre) pero **no escribe**
  en él: las estelas son translúcidas y se cruzan entre ellas, y si escribieran,
  la primera que pasa por un píxel taparía a las de detrás aunque fuera casi
  transparente. Se lee el estado real de GL antes de tocarlo y se devuelve como
  estaba, porque MapLibre lleva su propia caché de estado y dejársela cambiada
  le rompe el dibujo a la capa siguiente.
- **La velocidad se mide por el zoom, no por el rectángulo de la vista.** Se
  cambió temiendo que `getBounds()` creciera con la inclinación y disparase la
  velocidad de las partículas al girar la cámara. **Medido: eso no pasa.**
  `getBounds()` de MapLibre 4.7 devuelve lo mismo a 0°, 45°, 65° y 70°, y la
  cuenta nueva da 0,99× de la vieja a todos los zooms probados. El cambio se
  queda porque no depende de un comportamiento que la documentación no fija —una
  vista inclinada ve más terreno del que ese rectángulo declara— pero **no
  arregló ningún defecto visible**, y queda escrito para que nadie lo cite como
  si lo hubiera hecho.

El margen de dibujo sobre el suelo son **60 m**, y no es una afirmación sobre a
qué altura sopla el viento —el campo es de superficie y las estaciones miden a un
par de metros—: es que **la malla del terreno que pinta MapLibre no es el DEM del
que se leen las cotas**. Medido en 1.761 puntos de tierra (malla menos DEM, en
metros; positivo = la superficie dibujada queda por encima de la cota leída):

| mín | p10 | mediana | p90 | p99 | máx |
|---:|---:|---:|---:|---:|---:|
| −255,9 | −67,9 | **+4,4** | **+61,2** | +137,6 | +190 |

No depende del zoom —repetido a 9,6, 11, 12,5 y 13,5, idéntico—: es el suavizado
de la malla sobre las aristas de esta isla. De ahí el 60: es el p90 del lado
positivo, o sea que en nueve de cada diez puntos la estela queda por encima de la
superficie dibujada, y en el décimo se hunde y la esconde la prueba de
profundidad —en crestas, que es donde el relieve ya tapa de todas formas—.
Subirlo a 140 taparía el p99, pero en la mitad de la isla, donde la malla queda
por DEBAJO del DEM hasta 256 m, la estela volaría separada del suelo: el error
contrario, y se ve mucho más. Se estira con la exageración, para que a 1,5×
sigan pegadas.

La alternativa exacta —preguntarle a MapLibre la cota **dibujada** de cada
vértice— se descartó con el cronómetro: `queryTerrainElevation` cuesta 1,01 µs
por llamada, y 8.400 por fotograma son **8,5 ms de los 16** que hay. Medio
presupuesto de fotograma para ganar unos metros que a la escala de esta isla son
uno o dos píxeles.

Medido el 13 ago 2026 en una ventana de 1500×950 a ×2: **60 fps** con el viento
encendido, en plano y en 3D, con la escena a 1 y a 1,5×. Las 8.400 consultas de
cota por fotograma no se notan porque el DEM es un `Float32Array` en memoria.

**El contraste se decide mirando el fondo, píxel a píxel.** Un trazo claro con
halo oscuro se lee sobre el relieve sombreado y desaparece sobre la carta
topográfica de GRAFCAN, que es papel casi blanco; y no basta con distinguir
fondo claro de fondo oscuro, porque la malla de temperatura pinta encima
naranjas claros (`#e0854a`, luminancia 0,60) y azules oscuros (`#3b4b8c`, 0,31)
en la misma pantalla. Antes de dibujar, la capa copia a una textura el mapa ya
pintado debajo de ella —`copyTexSubImage2D`, cada 80 ms, sin leer nada de vuelta
a la CPU— y cada fragmento invierte su tinta según la luminancia que tiene
detrás: sobre lo claro, trazo oscuro con halo blanco; sobre lo oscuro, al revés.
El tono —que es el que dice la velocidad— no cambia en ningún caso.

Se dibuja como capa personalizada de MapLibre con `gl.LINES` de 1 px y estela
explícita —las últimas 14 posiciones de cada partícula—, sin framebuffers
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

---
