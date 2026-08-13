# El entrenamiento del índice experimental de incendio

Todo lo caro pasa aquí, una vez, y a mano. La aplicación no ejecuta nada de
esto: consume los dos ficheros de `public/fire/`, que están versionados.

```bash
python3 -m venv .venv-ml
.venv-ml/bin/pip install -r scripts/ml/requirements.txt
.venv-ml/bin/python scripts/ml/run.py
```

La primera vez tarda unos minutos —descarga cartografía de cuatro servidores,
218 páginas de ArcGIS entre ellas— y las siguientes, segundos: todo queda en
`scripts/ml/cache/`, que no se versiona porque es reproducible desde las URLs, y
las URLs sí están en el código.

Lo que `run.py` imprime está pensado para leerse y contrastarse con el README
del proyecto: son las cifras medidas que la interfaz y la documentación tienen
que estar diciendo.

## Qué escribe

| fichero | qué es |
|---|---|
| `public/fire/static.png` | 298 × 384, un píxel por celda de 201 m. R = modelo de combustible, G = distancia a la vía ÷ 8, B = pendiente en grados |
| `public/fire/model.json` | 150 árboles, la calibración del peligro, las métricas de validación y las fuentes |
| `src/lib/fire/__fixtures__/model-cells.json` | 40 celdas con sus entradas y el resultado de scikit-learn, para que el test de vitest exija que el navegador saque lo mismo |

## Los módulos

| fichero | responsabilidad |
|---|---|
| `cache.py` | descargas con caché en disco |
| `grid.py` | la malla —la misma que la del mapa—, UTM 28N → WGS84 y el rasterizador de polígonos |
| `dem.py` | el DEM de `public/dem/` leído en Python; pendiente y orientación por Horn |
| `fuel.py` | modelos NFFL de Canarias, con el mapa de cultivos rellenando la agricultura |
| `crops.py` | la equivalencia de las clases de cultivo a modelos NFFL |
| `perimeters.py` | los cinco perímetros quemados, de EFFIS y del Cabildo |
| `access.py` | distancia a la vía más cercana, por transformada chamfer |
| `weather.py` | el archivo de reanálisis de Open-Meteo |
| `moisture.py` | el índice de Fosberg, gemelo de `src/lib/fire/moisture.ts` |
| `train.py` | el clasificador, la validación dejando un incendio fuera y la exportación de los árboles |
| `export.py` | el PNG, el JSON y el fixture |
| `sweep.py` | la comparación de familias de modelo, que se corre aparte |
| `run.py` | el orquestador |

## Lo que está escrito dos veces, y por qué

`moisture.py` y `dem.py` repiten en Python lo que `src/lib/fire/moisture.ts` y
`src/lib/fire/terrain.ts` hacen en TypeScript. Es el precio de tener el
entrenamiento fuera del navegador, y no se lleva bien solo: el fixture de 40
celdas obliga a que las dos mitades saquen el mismo número hasta la sexta
decimal, y si alguien toca un coeficiente en un lado, el test del otro falla.

## Si se reentrena

`run.py` regenera los tres ficheros de una vez, así que el PNG, el JSON y el
fixture nunca se desincronizan. Después:

```bash
npm test          # el fixture nuevo tiene que seguir cuadrando
npm run build
```

Y hay que repasar las cifras del README del proyecto y de
`src/components/sidebar/FireRisk.tsx`: las de la interfaz salen del JSON y se
actualizan solas, pero las de la prosa —los AUC, el reparto de combustible, las
hectáreas— están escritas y hay que volver a medirlas.
