# Arquitectura

Cómo está montado: el proxy, las teselas, el relieve, la vista 3D, el océano,
lo que se guarda entre visitas — y las trampas de esta API que costaron un día
de depuración cada una.

← Volver al [README](../README.md)

---


```
scripts/prepare-data.ts   Compilación. Se ejecuta una vez.
  ├── prepare-guagua.ts   GTFS de TILP → red de líneas, paradas y horarios
  ├── prepare-arcgis.ts   Servicios ArcGIS del visor: miradores y carreteras
  ├── prepare-osm-roads.ts  Viario completo de OSM vía Overpass (19.770 trazados)
  ├── prepare-tdt.ts      Cobertura simulada de TDT: 49 imágenes del KMZ → un PNG
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
  ├── webcams/            Catálogo depurado de webcams, con su procedencia
  ├── settings/           Lo elegido, que dura: cajón por plataforma y validación
  └── cabildo.ts          Cliente de la API, decodificación posicional
```

### Por qué hay un proxy

Los servidores del Cabildo **no envían cabeceras CORS** (comprobado el 12 de
agosto de 2026 con un `Origin` explícito), así que desde el navegador la llamada
directa es imposible. No es una preferencia de arquitectura.

De paso, el proxy concentra el tráfico en una petición cacheada por despliegue
en vez de una por visitante. La API del Cabildo es un servicio público pequeño
que ya se cae solo a ratos; no se le manda una estampida.

### El DEM tiene tres usos, y son las mismas teselas

Las teselas terrarium de `public/dem/` alimentan el lookup de altitud del motor,
la fuente `raster-dem` del sombreado de MapLibre y —desde la vista 3D— la
geometría del terreno. Descargar dos modelos de elevación distintos para la
misma isla sería tirar ancho de banda y arriesgarse a que el relieve que se ve y
el que se calcula no coincidan.

**El fondo del mar se aplana a cero al generarlas.** Las teselas de Mapzen traen
batimetría, pero solo en los zooms bajos, y eso las hace incoherentes entre sí.
Medido el 13 de agosto de 2026 sobre lo descargado, antes del recorte: z9 bajaba
a **−4533,7 m** con el 95,2 % de sus píxeles por debajo de −100 m, z10 a
−4356,6 m con el 93,3 %, y z11 y z12 se quedaban en −32,2 y −26,9 m, con el
0,0 %. En el mapa plano no se notaba —el mar se pinta opaco encima—, pero con la
cámara inclinada la isla se levantaba sobre un cono submarino de 4,5 km que se
desvanecía en cuanto uno se acercaba. Un relieve que cambia de forma al hacer
zoom no es un relieve. Ninguna cota de tierra cambia: `SEA_LEVEL_M` ya da por
mar todo lo que esté por debajo de 1,5 m.

El talud es real y es lo más llamativo de esta isla —sube 6,9 km desde el
fondo—, pero no se puede enseñar mientras solo exista en dos de los cuatro
niveles.

### El relieve lo dibuja el `hillshade` de MapLibre, y no un shader propio

Lo dibujó un shader propio durante un día: cuatro luces con pesos, oclusión del
cielo y realce de textura sobre una superficie bicúbica, todo calculado tesela a
tesela con las mismas teselas terrarium de `public/dem/`. Medido, ganaba donde
decía ganar —en el 32 % de la isla que mira entre el este y el suroeste, el
negro sin forma pasaba del 5,67 % al 0,33 %—, y **se ha quitado igualmente**,
porque su transparencia era el problema:

- El color de la tierra lo pone otra vez `island-fill`, el **polígono del
  Cabildo**, con la línea de costa oficial. El sombreado propio lo ponía un
  raster cuya opacidad era una curva de nivel del DEM, y una curva de nivel
  sacada de una malla de 33,5 m no es una costa. Medido sobre las 63 teselas de
  z12: el **72,9 %** de los píxeles de mar del primer anillo —34 m de la
  orilla— se encendían por encima de 1,25× el fondo, con opacidad media 0,32.
  Un halo alrededor de la isla entera.
- Y más allá de ese anillo, **1,52 km²** de mar encendido a manchas, el 98-100 %
  de ellos píxeles cuyo **propio dato del DEM es positivo**: las teselas
  terrarium, en la orilla, no distinguen tierra de bajío. Eso no se arregla
  moviendo el umbral, porque no es un umbral mal puesto: es el dato.

El `hillshade` de MapLibre ya estaba debajo como red de seguridad —para el caso
de no tener WebGL2 o de que el shader no compilara— así que quitar la capa de
encima es volver exactamente al relieve anterior, con la costa recortada por el
contorno del Cabildo y la isla en el rango oscuro de siempre.

Queda pendiente, y es la vía para recuperar aquellas cuatro luces: recortar el
sombreado con la **máscara del polígono del Cabildo** que ya se construye para
el océano (`lib/ocean/land-mask.ts`, 1024² a 34 m por texel) en vez de con la
cota del modelo. Mientras eso no esté, el relieve es el de la casa.

### A GRAFCAN se le piden los píxeles que la pantalla va a enseñar

Las dos cartografías canarias se pedían en teselas de 512 px y se dibujaban en
un cuadro de 512 CSS px, que en cualquier pantalla de las de hoy son 1024
píxeles físicos: el navegador ampliaba cada tesela al doble antes de enseñarla.
De ahí la carta topográfica lechosa.

Que el servicio dibuja más fino —y no amplía— está medido. Tesela z16 sobre Los
Llanos de Aridane, misma bbox, energía media del laplaciano en niveles de 0–255:

| | 512 pedidos | 1024 pedidos | 512 ampliado a 1024 |
|---|---|---|---|
| Topográfico MT20 | 49,2 | 37,7 | **17,4** |
| Ortofoto | 52,2 | 38,6 | **18,1** |

Las dos columnas que se comparan son las dos formas de llenar los mismos 1024
píxeles: el servidor pone **2,17×** (MT20) y **2,13×** (ortofoto) el detalle fino
que pone el interpolador del navegador. El coste son 86,7 → 295 kB y 91,9 → 305
kB por tesela, **con el mismo número de peticiones**, que es lo que le importa a
un servicio. El tope es la densidad 2: a 2048 la ortofoto todavía trae detalle
real —el vuelo está a 25 cm— pero la tesela pasa a pesar 1,07 MB, y la licencia
de GRAFCAN dice «se prohíbe la descarga masiva de información». Quien tenga una
pantalla de densidad 1 sigue recibiendo 512.

**El enfoque se probó y se tiró.** La idea era pasar cada tesela por una máscara
de enfoque antes de enseñarla. La pregunta buena no es «¿se ve más nítido?»
—siempre se ve— sino «¿se parece más a lo que el servicio dibuja cuando se le
pide de verdad esa escala?». Comparando contra la tesela de 2048 reducida, el
error cuadrático medio sube con cada punto de enfoque y no tiene mínimo: 41,1 →
55,2 en la carta y 61,4 → 87,2 en la ortofoto (×1000, enfoque de 0 a 1). Se
repitió en el caso donde tendría algo que recuperar —una tesela ampliada— y
también sube. El enfoque añade contraste que la cartografía real no tiene.

**Lo que sí se hace es repartir los tonos que ya están**, con las propiedades
`raster-*` de MapLibre, que son uniformes de su propio shader y cuestan cero. El
presupuesto es 0,5 % de píxeles dañados —los que no estaban pegados al 0 o al 1
y acaban pegados, contados canal a canal—. La carta topográfica **no se toca**:
su negro está en 0,004 y su blanco en 1,000, ya ocupa todo el recorrido, y su
problema era la resolución. A la ortofoto se le quita la calima: su negro por
canal está en 0,039, un velo aditivo del Atlántico, y quitarlo cuesta un 0,35 %
de daño y devuelve el croma medio de 0,149 a 0,173 sin tocar la saturación.
Cabía subir más color —con +0,30 el daño seguía por debajo del presupuesto—,
pero ahí ya no se recupera lo que el velo quitó, se pinta encima.

### Las teselas que se quedan

GRAFCAN **no manda ninguna cabecera de caché**. Ni `cache-control`, ni `etag`,
ni `last-modified`, ni `expires`, ni `age`: ninguna de las cinco, comprobado
servicio por servicio el 18 de agosto de 2026 con
`scripts/checks/grafcan-cache.ts`. Eso no es un descuido menor. Sin frescura
declarada el navegador no puede guardar nada por su cuenta —la heurística del
RFC 9111 se calcula sobre el `last-modified`, y no hay—, y sin validador tampoco
puede preguntar «¿sigue valiendo?»: no hay petición condicional que hacer. Así
que **cada tesela que sale de la vista y vuelve se descarga entera otra vez**, y
cada recarga de la página empieza de cero.

Lo que eso cuesta, medido con el mismo script sobre 30 teselas de 1024 px
repartidas en cinco niveles de zoom y tres sitios de la isla: **mediana 556 ms,
p90 1183 ms, máximo 2269 ms**. Y esa tabla salió un día bueno — una sonda hora y
media antes, contra el mismo servicio, se comió **12 873 ms** en una sola tesela
de la Caldera. Cada tesela de tierra pesa 230 kB de mediana (67 kB la más
liviana, 373 kB la más pesada), así que una pantalla a z16 son unos 2,8 MB que
hoy se piden tantas veces como se pase por encima.

Desde agosto de 2026 se guardan en **IndexedDB**, con `TILE_TTL_MS` de 30 días.
Ni `localStorage`, que solo admite texto y se llena a los 5 MB —una pantalla de
ortofoto—, ni la Cache Storage API, que sería el sitio natural para respuestas
HTTP pero no sabe decir cuánto ocupa ni cuándo se usó cada cosa: purgar por
tamaño obligaría a abrir cada respuesta para medirla, o sea a leer los 150 MB
que se están intentando recortar. Por eso hay **dos almacenes**, `meta` y
`body`: el inventario se recorre entero y son unos bytes por tesela; las
imágenes se leen de una en una y solo cuando se piden.

El techo son **150 MB**, y sale de contar las teselas que tocan tierra contra la
línea de costa del Cabildo: la isla entera cabe en 54 teselas a z13 (12,4 MB),
188 a z14 (43,2 MB) y 690 a z15 (158,7 MB). Con 150 MB entran los dos fondos
completos a z13 y z14 —111 MB— y quedan 39 MB para el detalle que uno mire de
verdad. La isla completa a z15 no cabe, y es a propósito: son 159 MB de un solo
fondo, y nadie los mira enteros. Además nunca se pasa de **la cuarta parte de la
cuota** que declare `navigator.storage.estimate()`, porque esto no es espacio
nuestro: es el disco de quien abre la página.

Los 30 días no son redondeo. Al otro lado hay la Ortofoto Territorial
**2024-2025**, un producto anual, y un topográfico que se revisa por hojas y por
años: releerlo doce veces al año es de sobra. Y no es infinito por lo que enseñó
`demVersion` en `dem.ts`, donde una tesela corregida no le llegaba nunca a quien
ya tenía la anterior y el arreglo se veía bien en incógnito y roto en la ventana
de siempre. Aquí ese remedio no existe —GRAFCAN no publica ninguna versión que
colgar de la URL—, así que lo único que impide repetir aquel fallo es que la
copia caduque sola.

**Cómo se engancha, sin tocar el núcleo.** MapLibre permite registrar un
protocolo propio, y `tiles/protocol.ts` registra `palmero://`: al declarar la
fuente, `MapView` antepone ese prefijo a la plantilla de GRAFCAN y desde ahí
cada petición pasa por la caché. La vuelta tiene su detalle: se devuelve un
`ImageBitmap` ya decodificado y no el `ArrayBuffer`, porque MapLibre envuelve
los búferes en un `Blob` con el tipo `image/png` escrito a fuego y con JPEG eso
solo funciona mientras los navegadores sigan olfateando los bytes en vez de
creerse la etiqueta.

El prefijo lo pone `MapView` y **no `basemaps.ts`**, que es la parte que importa:
ese fichero lo comparte el escritorio de UE5, donde no hay ni IndexedDB ni
MapLibre y una URL con un protocolo desconocido no la sabría resolver nadie. Por
lo mismo, de los seis ficheros de `src/lib/tiles/` solo `protocol.ts` menciona
`maplibre-gl`; lo vigila `mapStyle.portable.test.ts`.

**Y lo que se pide por delante, que es poco a propósito.** La licencia de
GRAFCAN dice «se prohíbe la descarga masiva de información», así que la precarga
son dos casos contados y ninguno recorre la isla:

- **Al encender un fondo externo por primera vez**, 17 teselas de z9 a z11 que
  cubren La Palma entera: 838 kB la ortofoto, 1154 kB el topográfico, medidos.
  Con ellas MapLibre tiene una tesela padre que ampliar en cuanto se pulsa el
  selector, en vez de un hueco, y eso vale hasta z14 largo. El z12 se queda
  fuera porque son 35 teselas más y **triplican la factura** (3,3 y 4,7 MB) para
  un nivel que el ampliado del z11 ya tapa. Y solo al encenderlo: la promesa de
  que quien no toque el selector no gasta ni una petición fuera de casa sigue en
  pie.
- **Al pararse el mapa después de un arrastre**, las teselas del borde por el
  que se venía saliendo, con un tope de 8. No el anillo entero, que serían 18:
  se pide la dirección en la que el usuario ya iba, no un colchón por si acaso.
  Son 1,8 MB en el peor caso y solo la primera vez que se pasa por ahí.

Con dos peticiones en paralelo como mucho —MapLibre se reserva hasta 16 para lo
que está en pantalla, y la precarga no puede quitarle sitio a lo que sí se está
mirando—, saltándose lo que ya esté guardado, y sin pedir nada si
`navigator.connection` dice `saveData` o una red por debajo de 4G.

El balance para GRAFCAN es a la baja, y por eso esto es defendible además de
útil: se le piden 17 teselas de más una vez cada 30 días por fondo, y se le
dejan de pedir todas las que hoy se repiten en cada recarga, en cada vuelta
atrás y en cada cambio de fondo.

**Y está medido de punta a punta, no razonado.** `scripts/checks/tile-cache.ts`
abre la aplicación en un Chromium de verdad con la ortofoto encendida y cuenta lo
que sale por el cable. El 18 de agosto de 2026, sobre la vista inicial:

| | peticiones a GRAFCAN | en IndexedDB |
|---|---:|---:|
| primera visita | 23 | 23 teselas, 223 kB |
| recarga | **0** | 23 teselas, 223 kB |

Los ceros de la segunda fila son la prueba que no se puede hacer desde Node: si
el precargador escribiera las URL con un decimal distinto del que escribe
MapLibre por dentro, lo guardado no le serviría a quien lo pide y la recarga
volvería a pedirlo todo — sin fallar, sin avisar y pidiéndole a GRAFCAN el doble.

La primera pasada de esa comprobación **salió mal, y por eso existe
`tiles/inflight.ts`**: eran 25 peticiones con dos repetidas byte a byte. Al
encender la ortofoto, el precargador pide la vista de lejos y MapLibre pide a la
vez las teselas de la pantalla, que a zoom 9,6 son del mismo z10; ninguno de los
dos había terminado de guardar cuando el otro preguntó al inventario, así que
los dos salieron a la red. Ahora las descargas simultáneas de la misma tesela se
juntan en una, y quien cancela se desengancha sin cortársela al otro.

Y la segunda cosa que destapó, esta contra la web ya desplegada: **una tesela
cancelada se estaba marcando como rota**. MapLibre distingue «ya no hace falta»
de «ha fallado» comparando `error.message === 'AbortError'` —el mensaje, no el
`name`—, y el `DOMException` que produce `AbortController.abort()` trae de
mensaje «signal is aborted without reason». No casaba, así que cada tesela que
salía de la vista antes de llegar quedaba en estado `errored`: no se volvía a
pedir y dejaba un hueco, además de un error en consola. La corrección es una
línea —rechazar con `new Error('AbortError')`, que es literalmente lo que usa
MapLibre por dentro— y una prueba que la sujeta, porque equivocarla no da
ningún síntoma que se pueda buscar.

### Las capas del Cabildo no bloquean la segunda visita

Las teselas de GRAFCAN son un extremo —nadie las cachea, así que las cacheamos
nosotros— y `public/layers/` es el otro: **ahí ya estaba casi todo bien**, y
conviene dejar escrito por qué, porque la corazonada decía lo contrario.

Un arranque en frío se trae **16 ficheros y 1685 kB** por el cable
(comprimidos; medido contra producción el 18 ago 2026 con
`performance.getEntriesByType('resource')`). Casi todo son tres:
`municipios.geojson` 617 kB, `senderos.geojson` 427 kB y `limite-insular.geojson`
405 kB. Con `max-age=86400`, la sospecha era que eso se volvía a bajar cada día.
**No se bajaba.** Vercel sirve esos ficheros con `etag` y `last-modified`, así
que pasado el día el navegador manda una petición condicional y recibe un **304
sin cuerpo**. Lo medido: recarga dentro del día, **0 kB y 139 ms**; al día
siguiente, 12 revalidaciones en paralelo, **232–246 ms de reloj y 0 bytes**.

O sea que lo que costaba no eran megabytes, eran **240 ms de espera bloqueante
una vez al día** — y en el camino crítico, porque hasta que `limite-insular` no
se revalida no hay isla que dibujar. Eso se arregla con una palabra:

```
public, max-age=86400, stale-while-revalidate=2592000
```

Con `stale-while-revalidate` el navegador sirve su copia **al instante** y
revalida por detrás, así que el visitante que vuelve al día siguiente ya no
espera nada y en la visita siguiente tiene lo nuevo. Los 30 días de ventana son
la vida útil razonable de una cartografía que solo cambia cuando alguien ejecuta
`prepare-data`, y no cubren nada que varíe con el tiempo: bajo `/layers/` no hay
ni una lectura: `sensores-co2.geojson` es el inventario de sensores, no sus
medidas, y `cultivos-resumen.json` es un levantamiento de 2008. Soportado desde
Chrome 75, Firefox 68, Edge 79 y **Safari 14** — comprobado contra los datos de
compatibilidad de MDN, no supuesto.

**Y lo que se decidió NO hacer, que aquí cuenta igual.** La idea de colgar una
versión de cada URL y servirlas `immutable` —lo que ya hace el DEM con
`demVersion`— se midió y se descartó: con `stale-while-revalidate` ya no queda
espera que ahorrar, y a cambio traía un complemento de Vite, un registro de
versiones, siete sitios que tocar y el riesgo de repetir exactamente el fallo
que `demVersion` existe para evitar —un fichero `immutable` sin versión es un
fichero que no se corrige en un año—. Tampoco se unificaron los tres `fetch` de
`limite-insular.geojson` que hay en el arranque (`mapStyle`, `useIslandData` y
`useOcean`): parecían caros y son **14 ms de parseo repetido** en total, medidos
con `JSON.parse` sobre los ficheros de verdad. Se quedan como están.

### Las líneas cambian de color con el fondo, conservando su jerarquía

Los colores de las carreteras, los senderos, las guaguas y los canales se
eligieron mirando el relieve, que es un fondo oscuro. Sobre la carta topográfica
—papel de luminancia mediana 0,808— una carretera de `rgba(214,201,183)` al 42 %
es un gris claro sobre un blanco: existe y no se ve.

La solución no es una segunda paleta escrita a mano. Se mide qué **relación de
contraste** consigue cada tinta sobre el relieve, con la definición de la WCAG y
sobre color linealizado, y se busca en cualquier otro fondo el color del mismo
tono que consigue esa misma relación. Sobre el relieve la cuenta se resuelve
sola y devuelve los colores de siempre bit a bit —hay un test que lo comprueba—;
sobre la carta, el gris cálido se vuelve oscuro en vez de desaparecer.

Lo que importa es que la **jerarquía se traslada entera**: el viario de OSM son
19.770 trazados contra 61 carreteras insulares y tiene que seguir estando por
debajo. No se sube todo a un mínimo legible; se mueve la escala completa. Hay un
test que lo exige capa por capa.

Lo que esto **no** arregla: una mediana describe un fondo liso, y la ortofoto no
lo es —de cerca, su variación local mediana es 0,0695, y el relieve es el más
liso de los tres—. Sobre un invernadero blanco y un malpaís negro separados por diez
metros no hay un solo color que funcione en los dos; hace falta que cada línea
lleve su propio halo debajo, que es una capa más por cada capa de línea. Queda
pendiente y los números para hacerlo ya están medidos. La capa de viento sí lo
resuelve, porque es una capa personalizada y puede leer el fondo ya pintado (ver
más arriba).

### La vista 3D

Un modo aparte que se enciende en el panel, no una capa más: no añade nada al
mapa, cambia la cámara. Se apoya entera en teselas que ya estaban en memoria por
el sombreado, así que encenderla **no cuesta ni una descarga**.

MapLibre proyecta sobre el terreno las capas `background`, `fill`, `line`,
`raster` y `hillshade`, y eso cubre todo lo que dibuja esta aplicación: la malla
interpolada es una fuente `image` con capa `raster` y se pega al relieve sola.
El viento es la excepción —es una capa personalizada, y esas no se proyectan—,
así que se resuelve por su cuenta: ver [el viento en tres
dimensiones](datos-del-cabildo.md#el-viento-en-tres-dimensiones).

La **exageración vertical** es lo único de esta vista que puede mentir, así que
por defecto es 1 —la isla como es— y el tope es 1,5×, con el multiplicador
escrito en el propio botón. Medido sobre el DEM: la pendiente máxima píxel a
píxel es del 362,7 %, o sea **74,6°**, que son las paredes de la Caldera de
Taburiente. A 1,5× se dibujan a 79,6°, y a 2× a 82,1° — una pared vertical donde
no la hay. Por eso 2× no está en el selector.

En plano la cámara queda bloqueada a `pitch` 0. MapLibre trae el arrastre con el
botón derecho activado de fábrica y hasta ahora eso permitía inclinar la vista
sin querer y sin relieve debajo, que no es una vista: es un accidente.

### El océano

Un mar que se comporta como el de fuera: dos trenes de olas superpuestos sobre
la batimetría real, con la marea a su altura y el sol donde de verdad está. Se
enciende en el panel, está apagado al llegar —lo primero que esta aplicación
tiene que enseñar es el dato— y funciona igual sobre los tres fondos.

**No es una animación decorativa: es un modelo con fuentes.**

| Qué | De dónde | Qué es |
|---|---|---|
| Mar de fondo y mar de viento (altura, período, dirección) | Open-Meteo Marine (MFWAM/ECMWF), 8 puntos en anillo | modelo |
| Marea, temperatura del agua, corriente | la misma pasada | modelo |
| Viento que riza la superficie | estaciones del Cabildo, modelo donde no llegan | **medido** donde hay estación |
| Profundidad | EMODnet Bathymetry, 1/16′ (102 × 116 m) | **medido**, congelado en build |
| Línea de costa | límite insular del Cabildo, 73.605 vértices a 2,2 m de paso | **el mismo fichero que dibuja el contorno** |
| Luz del sol y de la luna | geometría (NOAA / Meeus) | calculado |
| Cuánta luz llega de verdad | radiación solar de las estaciones | **medido** |
| Cuánto difunde el cielo | PM10 de las estaciones de calidad del aire | **medido** |

**Ocho puntos y no uno.** La isla mide 2.426 m y hace sombra al oleaje igual que
se la hace al viento. Leído del servicio el 13 de agosto de 2026 a las 17:00
UTC, con el mismo mar de fondo del nordeste para todos: mar de viento de 0,96 m
por el norte, 0,22 m por el nordeste, **0,02 m al suroeste**. Dos órdenes de
magnitud entre barlovento y sotavento, en el mismo instante y a 40 km. Un
océano dibujado con un solo número contradiría al mapa de viento que tiene al
lado.

**La rejilla no tiene niveles de detalle porque no le hacen falta.** Es una
*projected grid* (Johanson, 2004): una malla regular **en la pantalla**, de la
que cada vértice lanza un rayo hasta el plano del agua. Los triángulos salen
pequeños donde el mar está cerca y kilométricos donde está lejos, exactamente
en la proporción en que se ven, y los búferes no se tocan nunca: entre
fotogramas solo cambian dos matrices. Esas matrices se invierten en **doble**
precisión, porque en Mercator normalizado la isla entera ocupa 0,0026 unidades y
un píxel al máximo acercamiento son 1,5·10⁻⁸.

**La física está medida, no elegida** (`lib/ocean/sea-state.ts`, con sus
pruebas):

- dispersión con la aproximación explícita de Guo (2002), comprobada contra los
  dos casos exactos: error nulo en aguas profundas y 0,9 % en someras;
- asomeramiento por conservación del flujo de energía — una mar de fondo de 8 s
  crece un 13 % a 3 m de agua y un 44 % a 1 m, y pasa por el mínimo teórico de
  0,913 que predice la teoría lineal;
- rotura en H/d = 0,78 (McCowan): con el estado real de aquel día, 1,3 m y
  5,5 s, la rompiente cae a **1,8 m de fondo**;
- borreguillos con W = 3,84·10⁻⁶·U^3,41 (Monahan y O'Muircheartaigh, 1980):
  0,09 % del mar a 5 m/s, 1,84 % a 12 y 10,5 % a 20. El exponente 3,41 es lo que
  hace que el mar cambie de carácter de golpe;
- ninguna ola pasa del límite de Stokes (H/L = 1/7), venga lo que venga del
  modelo.

**Lo que no se ve pero decide cómo se ve.** El brillo del sol va multiplicado por
Fresnel, como cualquier otro reflejo, y no sumado por encima: sumado —que es lo
habitual en los sombreadores de videojuego— el mar visto desde arriba salía con
una mancha blanca reventada de varios kilómetros, medida en pantalla a 2,3 veces
el blanco. Y el plano del agua va **en la marea y en nada más**: con la
vista 3D, MapLibre dibuja una malla de terreno que cubre toda la pantalla con el
fondo marino aplanado a cero, así que a marea baja —hasta 1,18 m, medido sobre
744 horas frente a Tazacorte— el mar quedaría por debajo y la prueba de
profundidad lo descartaría entero. Lo que le falta para alcanzar esa lámina lo
paga el empujón por el rayo del sesgo de profundidad, con su techo de tres
metros de cota: antes se resolvía levantando el plano dos metros, y eso se
pagaba en horizontal —L/tg(θ): 23 m con la vista a 5° y 115 m a 1°, justo sobre
la costa baja de El Remo y La Bombilla.

**Rendimiento.** Tres niveles de calidad que apagan lo que cuesta y no se echa
de menos, en este orden: la refracción del fondo (una copia de pantalla por
fotograma), las escalas de rizado (lecturas de textura por píxel) y la densidad
de la rejilla. Se elige solo mirando cuántos píxeles hay que pintar. Los
sombreadores se validan sin navegador con el compilador de referencia de Khronos
(`npx tsx scripts/checks/glsl.ts`), porque un error de GLSL no lo caza ni
TypeScript ni vitest: lo único que pasa es que el mar no aparece.

### Por qué la 3D no se frena con el océano encendido

El mar añade una capa personalizada que se dibuja en cada fotograma, así que
conviene decir de dónde NO viene el coste. La vista 3D tenía un frenazo propio,
anterior a todo esto, y ya está resuelto en `lib/occlusion.ts`: MapLibre le hacía
a **cada marcador** su comprobación de si había montaña delante, y la hacía con
un `gl.readPixels` de un píxel, que obliga a la CPU a esperar a la GPU. Medido
en un MacBook Air M2 con Chromium y ANGLE/Metal, el mismo gesto de seis segundos
en los dos modos: en 2D, 57 fps y ni una llamada; en 3D orbitando, 35,6 fps y
2.044 lecturas que se comían 1.609 ms — el 27 % del tiempo de reloj parado. Esa
pregunta la contesta ahora el modelo de elevación que ya está en memoria.

El océano no vuelve a pagar nada de eso: no lee el búfer de profundidad ni una
vez. Lo único que copia por fotograma es la pantalla ya dibujada, y solo si la
refracción está encendida —una copia dentro de la GPU, sin devolver nada a la
CPU—, que es justo la primera cosa que se apaga al bajar de calidad.

### La misma web, en un teléfono

Por debajo de 720 px de ancho la web deja de montar la barra lateral y el panel
flotante, y monta lo que se espera de un teléfono: cabecera sobre el mapa, una
tira de variables que se desplaza, tres botones redondos y **una hoja que asoma
por abajo y nunca se cierra**. Vive en `src/components/mobile/` y el escritorio no
cambia en nada.

Lo que **no** se duplica es la ficha. Dentro de la hoja van el mismo
`PointPanel` y el mismo `DetailPanel` que flotan a la derecha en una pantalla
ancha, pasados como hijos: si el panel del punto aprende algo, lo aprende en las
dos disposiciones el mismo día. Lo único propio del móvil es el armazón —la
hoja, sus tres alturas y la cabecera que asoma— y la tabla que decide qué dice
esa cabecera para cada cosa que se puede tocar (`head.ts`).

Las tres alturas están en `snaps.ts`, aparte y con pruebas: reposo (solo la
cabecera), media pantalla y pegada al borde de arriba. La de reposo es la de
arranque y la hoja no baja de ahí, porque la cifra del punto que se está mirando
tiene que seguir en pantalla mientras se mueve el mapa.

**Al abrir se pregunta la ubicación una vez**, en cuanto hay DEM y modelo —antes
no: sin altitud no hay corrección altimétrica y sin modelo no hay nada que
estimar— y lo que se hace con ella es dejarla escrita en esa cabecera. No se
vuela hacia ella y la hoja no sube: quien abre la app ve la isla entera y, en
una línea, qué temperatura hace donde está. Con el botón sí se vuela, porque ahí
sí se ha pedido. Sin ubicación no se pierde nada: se dice en la línea de estado
y la app sigue igual.

El umbral de 720 px está escrito **una sola vez**, en `useIsMobile()`. La hoja
de estilos no lo repite: cuelga de la clase `.app-mobile` que pone ese hook, y
así no hay ninguna franja de anchos en la que JavaScript monte una disposición
y el CSS pinte la otra.

### Lo elegido dura

Hasta agosto de 2026 no duraba nada. Cada interruptor vivía en un `useState` con
su valor de fábrica escrito al lado, así que recargar la página —o que el
teléfono matara la app en segundo plano, o desplegar una versión nueva— devolvía
la isla al estado de la primera visita. Quien miraba siempre el punto de rocío,
con el fondo de satélite y el mar encendido, lo volvía a encender cada vez.

Ahora se guardan **todos** los ajustes: las capas, los sitios, la variable, el
fondo, la vista 3D con su exageración, el océano con sus tres opciones, la
escena atmosférica, la luz solar y sus sombras, y qué secciones del panel están
desplegadas. Van a `localStorage`, y la lectura es **síncrona**, que no es un
detalle de implementación: hidratar después del primer render obliga a pintar la
malla en temperatura y corregirla al fotograma siguiente, y ese salto se ve. Por
eso `settings/backend.ts` es un fichero aparte de `settings/store.ts`: la lógica
de qué se guarda es una sola, y lo único que cambia de una plataforma a otra es
quién sabe abrir el cajón. En la web es `localStorage`; el escritorio, que no lo
tiene, pondrá el suyo al lado sin tocar `store.ts`.

Lo que **no** se guarda es el estado de la sesión: el punto consultado, la ficha
abierta, la ubicación, si el zoom da ya para ver las paradas. Son respuestas a
algo que se acaba de preguntar, no preferencias.

Dos consecuencias que conviene tener escritas, porque son facturas reales y no
efectos secundarios inesperados:

- **Las capas pesadas se vuelven a pedir en cada arranque.** La red de guaguas
  son 1,5 MB y el viario de OSM 5,2 MB, y no se descargan hasta que su
  interruptor se enciende; dejarlo encendido significa pedirlos otra vez mañana.
  Lo mismo con la ETo de la sección de agricultura. Es lo que se pidió al dejar
  el interruptor puesto, pero en red móvil se nota.
- **La calidad del océano deja de medirse sola.** `autoQuality()` mira los
  píxeles de la pantalla y el equipo, y solo corre la primera vez; después manda
  la guardada, porque el ajuste no distingue una calidad medida de una elegida a
  mano. Quien enchufe el mismo portátil a un monitor de 4K arranca con la
  calidad que se midió sin él, y lo corrige en un toque desde el panel.

Nada de lo guardado se cree a ciegas. Lo que sale del disco lo escribió una
versión anterior de la aplicación, así que se valida entero contra el catálogo
vivo (`lib/settings/revive.ts`): **lo que no se reconoce se sustituye por el
valor de fábrica y lo demás se conserva**. Una capa retirada no puede llevarse
por delante las ocho que siguen encendidas, una capa añadida esta semana no
puede impedir leer lo guardado el mes pasado, y una calidad de océano renombrada
no puede apagarle el mar a quien lo tenía puesto. Los tres casos, con su
contrario al lado, están en `revive.test.ts` y `store.test.ts`.

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
  [los aforos](datos-del-cabildo.md#los-aforos-y-el-endpoint-que-no-dice-lo-que-parece).

---
