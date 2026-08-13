"""Lo que el navegador se lleva: un PNG y un JSON.

DOS FICHEROS Y NADA MÁS. La aplicación no carga scikit-learn ni ejecuta el
modelo: aplica trece multiplicaciones y una sigmoide. Todo lo caro —descargar
cartografía de seis servidores, rasterizar 217.137 parcelas, ajustar y
validar— pasa aquí, una vez, y queda congelado en el repositorio. Es el mismo
trato que este proyecto le da al DEM, al viario de OpenStreetMap y al GTFS de
las guaguas.

**`public/fire/static.png`** — 298 × 384, un píxel por celda de 201 m, en el
mismo retículo que la malla del mapa:

  | canal | qué guarda | precisión |
  |---|---|---|
  | R | modelo de combustible NFFL, 0–9; **255 sin clasificar** | exacta |
  | G | distancia a la vía más cercana ÷ 8 | 8 m, tope 2.000 m |
  | B | pendiente en grados, 0–90 | 1° |

Se guarda opaco a propósito. El canal alfa parece el sitio natural para un
cuarto dato y no lo es: al leer un PNG por `<canvas>` el navegador puede
devolver el color premultiplicado, y con alfa < 255 los otros tres canales
vuelven alterados. Con alfa 255 la lectura es exacta.

Lo que **no** va en el PNG es todo lo que el navegador ya sabe: altitud,
pendiente y orientación salen del DEM que la aplicación tiene cargado. Se
guarda la pendiente igualmente —cuesta 30 KB— porque es la comprobación de que
el relieve que vio el entrenamiento y el que ve el mapa son el mismo.

**`public/fire/model.json`** — coeficientes, tipificación, métricas de
validación, fuentes y fechas. Lleva dentro las cifras que la interfaz enseña,
para que nadie las escriba a mano en un componente.
"""

from __future__ import annotations

import json
from datetime import date

import numpy as np
from PIL import Image

from cache import ROOT
from fuel import UNKNOWN

OUT_DIR = ROOT / "public/fire"

#: Metros por escalón del canal de distancia. 8 m sobre celdas de 201 m es
#: precisión de sobra: el término entra en el modelo en logaritmo, donde 8 m
#: mueven la cuarta cifra decimal.
DISTANCE_STEP_M = 8
#: Tope del canal: 250 × 8 = 2.000 m, y la celda más aislada de la isla está a
#: 1.543 m, así que no recorta nada.
DISTANCE_MAX_STEPS = 250


def quantize(distance: np.ndarray, slope: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Los valores tal como van a salir del PNG, no como entraron.

    ESTO SE APLICA ANTES DE ENTRENAR, y es la diferencia entre un modelo
    correcto y uno que casi lo es. El PNG guarda la distancia en escalones de
    8 m y la pendiente en grados enteros; si el ajuste ve 16,49° y el navegador
    lee 16, los umbrales de los árboles quedan calibrados sobre unos valores y
    se aplican sobre otros. Con 1.050 nodos, unos cuantos caen justo en el
    escalón, y el mapa sale distinto del modelo que se validó — poco, y sin que
    falle nada.

    Cuantizar primero cuesta algo de resolución al ajuste y a cambio hace que
    el PNG sea la única fuente de verdad. Es el mismo trato que el resto del
    proyecto le da al DEM: se entrena contra lo que se va a servir.
    """
    steps = np.clip(np.round(distance / DISTANCE_STEP_M), 0, DISTANCE_MAX_STEPS)
    return steps * DISTANCE_STEP_M, np.clip(np.round(slope), 0, 90).astype(np.float32)


def write_png(
    fuel: np.ndarray, distance: np.ndarray, slope: np.ndarray, land: np.ndarray
) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows, cols = fuel.shape
    rgb = np.zeros((rows, cols, 3), dtype=np.uint8)

    # El mar se guarda como «sin clasificar» y no como «sin combustible»: si
    # alguna vez la máscara de tierra y este fichero discreparan, el resultado
    # sería una celda sin dato —que la aplicación no pinta— y no una celda
    # tranquila, que sí pintaría.
    rgb[:, :, 0] = np.where(land, fuel, UNKNOWN).astype(np.uint8)
    steps = np.clip(np.round(distance / DISTANCE_STEP_M), 0, DISTANCE_MAX_STEPS)
    rgb[:, :, 1] = np.where(land, steps, 0).astype(np.uint8)
    rgb[:, :, 2] = np.where(land, np.clip(np.round(slope), 0, 90), 0).astype(np.uint8)

    path = OUT_DIR / "static.png"
    Image.fromarray(rgb, mode="RGB").save(path, optimize=True)
    return path.stat().st_size


def write_model(payload: dict) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"generated": date.today().isoformat(), **payload}
    path = OUT_DIR / "model.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return path.stat().st_size


def sample_fixture(grids: dict[str, np.ndarray], mask: np.ndarray, n: int = 40) -> list[dict]:
    """Celdas sueltas con sus entradas crudas y su resultado, para el otro lado.

    El modelo se ajusta en Python y se aplica en TypeScript. Que las dos
    implementaciones coincidan no se puede dar por supuesto: basta una columna
    en distinto orden, una tipificación olvidada o un signo de orientación al
    revés para que el mapa salga plausible y equivocado, sin que falle nada. Así
    que se congelan unas cuantas celdas repartidas por la isla —con las
    entradas EN CRUDO, tal como el navegador las va a tener— y un test de vitest
    exige que el navegador saque exactamente la misma probabilidad.

    La muestra se toma con paso fijo sobre las celdas de tierra ordenadas, no al
    azar: así el fichero no cambia entre ejecuciones y su diff se puede leer.
    """
    idx = np.flatnonzero(mask.ravel())
    take = idx[:: max(1, len(idx) // n)][:n]
    cols = mask.shape[1]
    flat = {k: v.ravel() for k, v in grids.items()}
    out = []
    for cell in take:
        j, i = divmod(int(cell), cols)
        row = {"row": j, "col": i}
        for name, values in flat.items():
            # El resultado se guarda con más cifras que las entradas. Éstas se
            # redondean a 6 porque son lo que el navegador va a tener de todos
            # modos; aquélla es lo que se compara, y con 6 el propio redondeo
            # —±5·10⁻⁷— es mayor que la tolerancia con la que interesa exigir
            # la coincidencia. El test fallaría por el fixture, no por el
            # código, que es la peor clase de test rojo.
            row[name] = round(float(values[cell]), 9 if name == "probability" else 6)
        out.append(row)
    return out
