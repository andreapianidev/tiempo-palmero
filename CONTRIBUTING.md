# Colaborar en Tiempo Palmero

Esto lo escribe una persona sola, y hay una clase de ayuda que vale más que
cualquier otra: **la de quien vive en la isla**.

← Volver al [README](README.md)

---

## Lo que más falta no es código: es saber si el número es verdad

La aplicación estima el tiempo en puntos donde no hay ningún sensor. El motor se
valida contra sí mismo —escondiendo cada estación por turno y comprobando cuánto
se equivoca al reconstruirla—, y eso mide una cosa: si el modelo es coherente
con la red. **No mide si acierta en tu barrio.**

Para eso hace falta alguien que esté ahí y mire por la ventana. Si vives en
Garafía, en Puntagorda, en Barlovento, en Tijarafe, en Fuencaliente o en
cualquier sitio donde la red del Cabildo no llega bien, la ayuda concreta es
esta:

> Abre [tiempo-palmero.vercel.app](https://tiempo-palmero.vercel.app), toca tu
> pueblo, y **abre un issue diciendo en qué se equivoca**. La hora, el sitio, lo
> que marcaba la pantalla y lo que había de verdad. «A las 8:30 en Las Tricias
> decía 19° y despejado, y había niebla cerrada y no se veía el barranco.»

Eso es un dato que no está en ninguna API, y es exactamente lo que separa un
modelo elegante de un modelo que sirve. Los sitios por encima de los 800 m y los
de la vertiente noreste son los que más lo necesitan, porque ahí la inversión
del alisio hace lo que quiere y la red tiene agujeros.

**Otras cosas de conocimiento local que valen igual:**

- **Topónimos que faltan.** El buscador sale de OpenStreetMap y se deja fuera
  caseríos, lomos, barrancos y fincas que todo el mundo usa para orientarse. Si
  buscas un sitio y no aparece, dilo.
- **Estaciones que están donde no dicen.** Dos estaciones del catálogo tienen
  coordenadas que caen **en el Atlántico**, y hay dos con el mismo nombre a
  2,4 km y 142 m de desnivel. Si conoces dónde está físicamente un sensor, esa
  información no la tiene nadie más.
- **Webcam y cámaras.** El dataset apunta a servidores caídos y a cámaras que se
  mudaron de URL. Si sabes de una que funciona y no está, o de una que sale y ya
  no existe, es un arreglo de un minuto.
- **Senderos y pistas.** El viario sale de OpenStreetMap; una pista mal trazada o
  un sendero cerrado se corrigen allí y llegan aquí en la siguiente compilación.

No hace falta saber programar para ninguna de estas. Un issue en castellano,
contando lo que viste, es una contribución de pleno derecho.

---

## La aplicación de iOS y Android está en alpha

**Es la parte más verde del proyecto y la que más manos necesita.** Hoy es una
sola pantalla —el mapa, con sus fichas y sus hojas— sobre el mismo motor que la
web, sin una línea de cálculo duplicada. Funciona, pero le falta bastante de lo
que la web ya hace.

Lo que está flojo, dicho sin adornos:

- **Una sola pantalla.** No hay navegación: todo cuelga de `MapScreen`.
- **La rotación y la inclinación del mapa están apagadas**, así que no hay vista
  3D, ni relieve, ni escena atmosférica.
- **Android está menos rodado que iOS.** El directorio `ios/` se ha usado más;
  `android/` se regenera con `expo prebuild` y ha recibido bastante menos cariño.
- **No hay compilación en las tiendas.** Ni TestFlight ni Play. Se compila en
  local.
- **No hay pruebas propias del móvil.** Lo único que lo protege hoy es el
  `typecheck`, que sí es obligatorio (ver más abajo).

Si te mueves con React Native o Expo, aquí hay trabajo de sobra y muy visible.
El detalle de cómo está montado está en [docs/movil.md](docs/movil.md).

### Ponerlo en marcha

```bash
git clone https://github.com/andreapianidev/tiempo-palmero.git
cd tiempo-palmero
npm install
npm run dev                 # la web, en localhost:5173

cd mobile
npm install
npx expo run:ios            # o run:android
```

**Expo Go no sirve**: MapLibre, Skia y Reanimated son módulos nativos y hace
falta una compilación de desarrollo. `ios/` y `android/` no están versionados —
los regenera `expo prebuild` desde `app.json`.

---

## Tres reglas que no se saltan

Son las mismas que se aplica el repositorio a sí mismo, y están en
[CLAUDE.md](CLAUDE.md). Si un cambio las incumple, no entra, por bueno que sea.

**1. Un umbral se mide, no se elige.** Cualquier número que decida si un dato se
enseña o se descarta sale de medirlo contra un caso real, y lleva al lado el
comentario que dice qué separa: cuánto marca el caso patológico y cuánto el caso
sano más extremo. Y la prueba no es «¿caza el fallo?», sino **«¿caza el fallo sin
borrar un dato bueno?»**. Una invasión de aire sahariano hizo subir una estación
6 °C en quince minutos: cualquier detector que marque eso como avería está mal,
por mucho que también cace la avería de verdad.

**2. El móvil compila, y no es opcional.** `mobile/` importa `../src` con el
alias `@core/*`. Cambiar la firma de un hook rompe la app aunque la web compile y
los tests pasen — ya ocurrió, y vivió varios commits sin que nada lo delatara.
Antes de abrir un PR:

```bash
npm test && npm run build
(cd mobile && npm run typecheck)
```

**3. Nada de archivos monolíticos.** Cuando a un fichero hay que añadirle algo
que no es lo que ese fichero ya hacía, se crea un fichero nuevo. Pasar de ~250
líneas obliga a justificar por qué sigue siendo una sola cosa.

---

## Y una cuarta, que es la del proyecto entero

**Nunca se enseña un número sin decir de qué está hecho.** Si añades una
variable, una capa o una fuente, tiene que llevar consigo su margen, su
antigüedad real y su denominador de verdad —«35 de 52 estaciones activas», no
«52 estaciones»—. Si una capa dibuja más de lo que mide, va a la sección
**Experimental**, detrás de su aviso, no entre las variables normales.

Es la razón de ser de la aplicación. Una estimación honesta con su error al lado
vale; una cifra bonita sin procedencia, no.

---

## Licencia de lo que aportes

El proyecto es **[Apache 2.0](LICENSE)** con atribución vía [NOTICE](NOTICE).
Al abrir un PR aceptas que tu aportación se distribuya bajo esa misma licencia.
Los datos conservan las suyas —del Cabildo Insular, de OpenStreetMap, de
GRAFCAN, de Copernicus— y no las cubre ni las sustituye la licencia del código.

---

## Dónde escribir

- **Issues**: <https://github.com/andreapianidev/tiempo-palmero/issues> — para
  errores del modelo, topónimos que faltan, ideas y todo lo de arriba.
- **Correo**: [andreapiani.dev@gmail.com](mailto:andreapiani.dev@gmail.com), si
  prefieres no abrir un issue público.

En castellano, en italiano o en inglés, da igual. Y si eres de la isla y solo
quieres contar que el número de tu pueblo no cuadra, con eso basta: es la
contribución que más falta hace.
