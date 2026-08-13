"""Cuánto se acerca la gente a cada celda.

POR QUÉ ESTO ES UN PREDICTOR Y NO UN ADORNO. Los incendios forestales de
España no los empieza el monte: los empieza alguien. En la estadística oficial
la fracción de causa natural —el rayo— es una minoría pequeña, y todo lo demás
sale de negligencias, quemas agrícolas, motores, colillas e intencionalidad. Un
modelo que solo mire combustible y pendiente aprende dónde el fuego *corre*, no
dónde *empieza*, y son dos mapas distintos.

La proximidad a una vía es la aproximación estándar a eso, y aquí sale gratis:
la aplicación ya lleva descargado el viario completo de OpenStreetMap —19.770
trazados, 3.373 km, de los que 2.225 son pistas agrícolas y forestales— y la
red de senderos del Cabildo. No hace falta ninguna fuente nueva.

CÓMO SE MIDE. Con una transformada de distancia sobre la propia malla: se marcan
las celdas por las que pasa una vía y se propaga la distancia con el algoritmo
de dos pasadas de Rosenfeld y Pfaltz (1966), en su versión chamfer 3-4, que
aproxima la distancia euclídea con un error acotado por debajo del 2 % — muy
por debajo del propio tamaño de celda, 201 m. Hacer la distancia exacta a la
geometría de 19.770 líneas para 114.432 celdas costaría mil veces más para
mover el resultado menos de lo que mide una celda.

LO QUE ESTA CIFRA NO ES. No es «accesibilidad» ni «tiempo de respuesta de los
bomberos». Es la distancia en línea recta a la vía más cercana de cualquier
clase, incluida una pista de tierra. Que una pista pase a 50 m no significa que
se llegue en cinco minutos.
"""

from __future__ import annotations

import json

import numpy as np

from cache import ROOT
from grid import Grid

#: Las capas de `public/layers/` que cuentan como «por aquí pasa gente». El
#: viario de OSM es el que manda —trae las pistas forestales, que las 61
#: carreteras del Cabildo no pueden tener—; los senderos entran porque en esta
#: isla llevan gente a sitios donde no llega ninguna rueda.
LAYERS = ("viario-osm.geojson", "carreteras.geojson", "senderos.geojson")

#: Tope de la distancia, en metros. Medido sobre la propia malla el 13 ago 2026,
#: la celda más aislada de La Palma está a **1.543 m** de la vía más próxima, así
#: que un tope de 2 km no recorta ni una sola celda: está para que el número no
#: crezca sin sentido el día que alguien quite una de las tres capas.
#:
#: Y la distribución dice algo que conviene tener delante al leer el modelo: la
#: **mediana es 0 m** —el 60,5 % de las celdas de la isla tienen una vía dentro—,
#: el percentil 90 son 402 m y el 99, 1.006 m. Esta isla no tiene monte remoto:
#: tiene 2.225 km de pistas agrícolas y forestales. Lo que este predictor
#: distingue no es «lejos» de «cerca», es el 10 % que de verdad queda apartado.
MAX_M = 2000.0


def distance_to_ways(grid: Grid) -> np.ndarray:
    """Metros hasta la vía o el sendero más cercano, celda a celda."""
    seed = np.zeros((grid.rows, grid.cols), dtype=bool)
    for name in LAYERS:
        path = ROOT / "public/layers" / name
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for feature in data.get("features") or []:
            for line in _lines(feature.get("geometry") or {}):
                _stamp(grid, seed, line)
    return _chamfer(seed, grid.cell_meters)


def _lines(geometry: dict) -> list[np.ndarray]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "LineString":
        parts = [coords]
    elif kind == "MultiLineString":
        parts = coords
    else:
        return []
    out = []
    for part in parts:
        arr = np.asarray(part, dtype=float)
        if arr.ndim == 2 and len(arr) >= 2:
            out.append(arr[:, :2])
    return out


def _stamp(grid: Grid, seed: np.ndarray, line: np.ndarray) -> None:
    """Marca las celdas por las que pasa la línea, densificando los tramos largos.

    Sin densificar, un tramo recto de 2 km entre dos vértices solo marcaría sus
    dos extremos y dejaría diez celdas de carretera declaradas como monte
    remoto. Se parte cada segmento en pasos de media celda.
    """
    i, j = grid.lonlat_to_cell(line[:, 0], line[:, 1])
    for k in range(len(i)):
        if k > 0:
            di, dj = i[k] - i[k - 1], j[k] - j[k - 1]
            n = int(max(abs(di), abs(dj)))
            if n > 1:
                for t in range(1, n):
                    _mark(seed, i[k - 1] + di * t // n, j[k - 1] + dj * t // n)
        _mark(seed, i[k], j[k])


def _mark(seed: np.ndarray, i: int, j: int) -> None:
    if 0 <= j < seed.shape[0] and 0 <= i < seed.shape[1]:
        seed[j, i] = True


def _chamfer(seed: np.ndarray, cell_m: float) -> np.ndarray:
    """Distancia chamfer 3-4 en dos pasadas, devuelta en metros."""
    big = 1 << 30
    d = np.where(seed, 0, big).astype(np.int64)
    rows, cols = d.shape

    for j in range(rows):
        row = d[j]
        up = d[j - 1] if j > 0 else None
        for i in range(cols):
            best = row[i]
            if best == 0:
                continue
            if i > 0:
                best = min(best, row[i - 1] + 3)
            if up is not None:
                best = min(best, up[i] + 3)
                if i > 0:
                    best = min(best, up[i - 1] + 4)
                if i + 1 < cols:
                    best = min(best, up[i + 1] + 4)
            row[i] = best

    for j in range(rows - 1, -1, -1):
        row = d[j]
        dn = d[j + 1] if j + 1 < rows else None
        for i in range(cols - 1, -1, -1):
            best = row[i]
            if best == 0:
                continue
            if i + 1 < cols:
                best = min(best, row[i + 1] + 3)
            if dn is not None:
                best = min(best, dn[i] + 3)
                if i + 1 < cols:
                    best = min(best, dn[i + 1] + 4)
                if i > 0:
                    best = min(best, dn[i - 1] + 4)
            row[i] = best

    return np.minimum(d.astype(np.float32) / 3.0 * cell_m, MAX_M)
