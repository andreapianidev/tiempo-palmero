# Tiempo Palmero — reglas del repositorio

## Cada cambio termina en producción

Regla fija, sin preguntar y sin excepciones por «es un cambio pequeño»: **toda
modificación se commitea, se sube a `main` y se despliega a producción en la
misma sesión en que se hace.** Un arreglo que se queda en el working tree no
existe para quien abre la aplicación.

El orden:

```bash
npm test && npm run build      # los umbrales del motor NO se relajan
git add -A && git commit
git push origin main           # main es la rama de producción
vercel --prod                  # despliegue, proyecto tiempo-palmero
```

Después, comprobar que el despliegue está `Ready` y que la URL de producción
responde. Si el trabajo se hizo en una rama, se mergea a `main` antes de
desplegar; no se deja nada colgando en una rama.

## Este repositorio es la web, y solo la web

**Aquí no entra código nativo.** Ni iOS, ni Android, ni empaquetadores de app.
Que la web se vea en un teléfono es cosa de `src/components/mobile/`, que es su
carcasa responsive en HTML: ese directorio SÍ es de este repositorio y no se
toca al hablar de «quitar el móvil».

## La aplicación de macOS tampoco está aquí

Es un gemelo digital en 3D de la isla hecho con **Unity 6 HDRP**, y vive en su
propio repositorio: <https://github.com/andreapianidev/tiempo-palmero-unity>.

Hubo aquí un intento anterior con Unreal Engine 5 —un directorio `desktop/` con
el núcleo empaquetado para QuickJS— que nunca pasó del andamiaje y salió en
agosto de 2026. Con él se fueron `npm run desktop:core` y `npm run
desktop:golden`, dos scripts que llevaban tiempo invocando ficheros
inexistentes.

**LO QUE HAY QUE SABER ANTES DE TOCAR `src/lib`.** Ese repositorio lleva una
COPIA de este `src/lib`, no una referencia: no hay alias, no hay paquete
publicado y no hay nada que avise cuando una de las dos se mueve. De ahí salen
dos obligaciones:

1. **Un arreglo del motor aquí NO llega allí solo.** Si el cambio toca la
   interpolación, el control de calidad o cualquier umbral, o se lleva a mano al
   otro repositorio o quedan dos aplicaciones diciendo dos temperaturas
   distintas para el mismo punto de la misma isla.
2. **`src/lib` tiene que seguir funcionando sin navegador**, porque allí no hay
   DOM y aquí tampoco lo hay en `scripts/` ni durante `npm test`. En concreto:
   nada de lo que cuelga de `mapStyle.ts` puede importar `maplibre-gl` en tiempo
   de ejecución. Lo vigila `mapStyle.portable.test.ts`, y por eso la caché de
   teselas registra su protocolo en `tiles/protocol.ts` y no en el estilo.

## Nada de archivos monolíticos

**Un archivo, una responsabilidad.** Cuando a un archivo hay que añadirle algo
que no es lo que ese archivo ya hacía, lo que se crea es un archivo nuevo, no
un apartado más. Vale para componentes, para módulos de `lib/` y para las hojas
de estilo.

Señales de que toca partir, en orden de importancia:

1. **El archivo hace dos cosas que se explican con un «y».** «El panel lateral
   dibuja los controles **y** el estado del modelo **y** busca topónimos» son
   tres archivos, y así está ahora: `sidebar/` es un directorio con
   `Section`, `PlaceSearch`, `VariablePicker`, `LayerSwitches` y `ModelStatus`,
   más un `index.tsx` que solo es el armazón.
2. **Pasa de ~250 líneas.** No es una prohibición: `interpolate.ts` tiene 1.205
   y se queda como está, porque es un único dominio —el motor— y partirlo
   separaría pasos que solo se entienden juntos. Pero pasar de 250 obliga a
   justificar por qué sigue siendo una sola cosa, y hoy hay 27 ficheros que lo
   pasan. El que peor lo justifica es `MapView.tsx`: 1.510 líneas, 31
   `useEffect`, y catorce secciones que el propio fichero se marca con una
   raya —inicialización, vista 3D, fondo, malla, viento, evaporación, capas
   GeoJSON, guaguas, sitios y carreteras, marcadores, topónimos, punto
   consultado, ubicación, mando a distancia—. Catorce rayas que uno mismo se
   dibuja para no perderse dentro de un fichero son la señal del punto 1
   escrita a mano. Es el siguiente que toca partir.
3. **Para tocar una parte hay que leer el resto.** Si cambiar el buscador
   obliga a desplazarse por la tabla del modelo, ya está mal repartido.

El panel lateral es el sitio donde esto más se va a notar: va a crecer con
ambiente, agricultura, aforos y energía. Cada bloque nuevo es **un archivo
nuevo dentro de `src/components/sidebar/` y una `<Section>` plegable**, nunca
cien líneas más en `index.tsx`.

## Un umbral se mide, no se elige

Todo número que decida si un dato se enseña o se descarta —los de `BOUNDS`, los
de `sensor-health.ts`, el σ del rechazo de outliers— sale de **medirlo contra un
fixture real**, y el comentario que tiene al lado dice qué separa: cuánto marca
el caso patológico y cuánto el caso sano más extremo del archivo. Un umbral sin
esa cifra al lado es una corazonada.

Y la prueba que importa nunca es «¿caza el fallo?», sino **«¿caza el fallo sin
borrar un dato bueno?»**. Los dos lados pesan igual en el test. La invasión de
aire sahariano del 13 de agosto de 2026 hizo saltar a una estación 6 °C en
quince minutos: cualquier detector que la marque como averiada está mal, por
mucho que también cace la avería de verdad. Cuando se toque un umbral, se vuelve
a medir la distancia a las dos orillas.

## Los números que aparecen en texto se verifican

El README, los comentarios y las cadenas de la interfaz están llenos de cifras
concretas (cuántas estaciones publican qué, RMSE, gradientes). Cuando un cambio
toca una de esas cifras hay que **medirla de nuevo** —contra el fixture o contra
la API en vivo— y actualizarla en todos los sitios donde aparezca, en vez de
dejar en pie una afirmación que ya no es cierta.
