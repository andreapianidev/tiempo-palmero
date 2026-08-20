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

## Tampoco hay versión de escritorio

Este repositorio es la web. Hubo aquí un intento de escritorio con Unreal
Engine 5 —un directorio `desktop/` con el núcleo empaquetado para QuickJS— que
nunca pasó del andamiaje y salió en agosto de 2026. Con él se fueron `npm run
desktop:core` y `npm run desktop:golden`, dos scripts que llevaban tiempo
invocando ficheros inexistentes.

**`src/lib` tiene que funcionar sin navegador.** No es una precaución teórica ni
depende de que exista otra aplicación: `scripts/` y `npm test` corren en Node,
donde no hay DOM. En concreto, nada de lo que cuelga de `mapStyle.ts` puede
importar `maplibre-gl` en tiempo de ejecución. Lo vigila
`mapStyle.portable.test.ts`, y por eso la caché de teselas registra su protocolo
en `tiles/protocol.ts` y no en el estilo.

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
   justificar por qué sigue siendo una sola cosa, y hoy hay **42 ficheros** que
   lo pasan.

   `MapView.tsx` era el ejemplo de esta regla y ya está partido: llegó a **2.203
   líneas y 53 `useEffect`** —casi el doble en un mes— y hoy son **787 y 39**.
   Lo que salió vive en `src/components/map/`, y lo que decidió los cortes no
   fue el tamaño sino el punto 1: los tipos (`types.ts`), crear el mapa
   (`useMapSetup.ts`), los marcadores del DOM (`useDomMarkers.ts`), repartir el
   sitio en pantalla (`useDeclutter.ts`) y la escena del cielo
   (`useSkyScene.ts`) son cinco cosas que se explicaban con un «y».

   **DOS REGLAS QUE SALIERON DE HACERLO**, y que valen para el próximo:

   - **Los efectos se mueven en bloque contiguo, sin reordenar.** React los
     ejecuta en el orden en que se declaran, y ese orden es funcionalidad: el
     de las nubes tiene que correr antes que el del mar, que refleja esas
     nubes. Agrupar «todo lo del cielo» saltándose lo que hay en medio habría
     sido un cambio de comportamiento disfrazado de refactor.
   - **Una prueba que lee el código fuente hay que moverla con él.**
     `markers.test.ts` comprueba que toda colección de marcadores entra en el
     reparto leyendo el texto de `MapView.tsx`; al partirlo se quedó buscando
     un `declutterImpl` que ya no estaba. Falló, que es lo que tenía que hacer.
     Ahora cruza los dos ficheros y comprueba además que ninguna ref se quede
     sin pasar al gancho.

   Detrás van `App.tsx` (1.197) y `sidebar/index.tsx` (660), que crecen por el
   mismo motivo: son los dos sitios por los que pasa todo lo nuevo.
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
