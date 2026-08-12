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
2. **Pasa de ~250 líneas.** No es una prohibición: `interpolate.ts` tiene 677 y
   se queda como está, porque es un único dominio —el motor— y partirlo
   separaría pasos que solo se entienden juntos. Pero pasar de 250 obliga a
   justificar por qué sigue siendo una sola cosa.
3. **Para tocar una parte hay que leer el resto.** Si cambiar el buscador
   obliga a desplazarse por la tabla del modelo, ya está mal repartido.

El panel lateral es el sitio donde esto más se va a notar: va a crecer con
ambiente, agricultura, aforos y energía. Cada bloque nuevo es **un archivo
nuevo dentro de `src/components/sidebar/` y una `<Section>` plegable**, nunca
cien líneas más en `index.tsx`.

## Los números que aparecen en texto se verifican

El README, los comentarios y las cadenas de la interfaz están llenos de cifras
concretas (cuántas estaciones publican qué, RMSE, gradientes). Cuando un cambio
toca una de esas cifras hay que **medirla de nuevo** —contra el fixture o contra
la API en vivo— y actualizarla en todos los sitios donde aparezca, en vez de
dejar en pie una afirmación que ya no es cierta.
