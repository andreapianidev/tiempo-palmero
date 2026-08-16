# La aplicación de iOS y Android

Expo sobre el mismo motor que la web, sin una sola línea de cálculo duplicada —
y por qué eso obliga a compilar el móvil en cada cambio.

> **⚠️ En alpha.** Hoy es una sola pantalla, la rotación y la inclinación del
> mapa están apagadas —así que no hay vista 3D ni escena atmosférica—, Android
> está bastante menos rodado que iOS, no hay compilación en TestFlight ni en
> Play, y no hay pruebas propias del móvil: lo único que lo protege es el
> `typecheck`. Es la parte más verde del proyecto, y donde más falta hacen
> manos — ver [CONTRIBUTING.md](../CONTRIBUTING.md).

← Volver al [README](../README.md)

---


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
