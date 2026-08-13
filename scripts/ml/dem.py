"""El modelo de elevación de `public/dem/`, y lo que se deriva de él.

Las 63 teselas terrarium ya están en el repositorio: las descarga
`scripts/prepare-data.ts` y las usa el navegador para el sombreado, la vista 3D
y la cota de cada punto. Aquí se leen otra vez, en Python, para que el
entrenamiento vea EXACTAMENTE el mismo relieve que ve la aplicación. Ni un
metro de diferencia, y ninguna descarga nueva.

La pendiente y la orientación son la traducción literal de
`src/lib/fire/terrain.ts` —Horn (1981) sobre la ventana de 3×3, paso de 201 m,
el vecino de mar sustituido por la cota del propio punto—. Que estén escritas
dos veces es el precio de tener el entrenamiento en Python y el mapa en el
navegador; que digan lo mismo lo comprueba `run.py` contra el fichero de
control que deja `scripts/checks/relief-check.ts`.
"""

from __future__ import annotations

import json

import numpy as np
from PIL import Image

from cache import ROOT
from grid import STEP, SEA_LEVEL_M, Grid


def load_heights(grid: Grid) -> np.ndarray:
    """Cotas en metros, malla `dem_height × dem_width`, decodificadas de terrarium."""
    manifest = json.loads((ROOT / "public/dem/manifest.json").read_text())
    out = np.zeros((grid.dem_height, grid.dem_width), dtype=np.float32)
    tile = manifest["tileSize"]
    for r in range(manifest["rows"]):
        for c in range(manifest["cols"]):
            tx = manifest["x0"] + c
            ty = manifest["y0"] + r
            path = ROOT / f"public/dem/{manifest['zoom']}/{tx}/{ty}.png"
            px = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
            # h = R*256 + G + B/256 - 32768, la codificación terrarium
            h = px[:, :, 0] * 256 + px[:, :, 1] + px[:, :, 2] / 256 - 32768
            out[r * tile : r * tile + h.shape[0], c * tile : c * tile + h.shape[1]] = h
    return out


def cell_elevation(grid: Grid, heights: np.ndarray) -> np.ndarray:
    """La cota de cada celda, tomada como la toma `rasterizeGrid`: en su centro."""
    js = np.minimum(np.arange(grid.rows) * STEP + (STEP >> 1), grid.dem_height - 1)
    ist = np.minimum(np.arange(grid.cols) * STEP + (STEP >> 1), grid.dem_width - 1)
    return heights[np.ix_(js, ist)].astype(np.float32)


def relief(grid: Grid, heights: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Pendiente en grados, y cuánto mira al sur y al oeste, celda a celda.

    Devuelve `(slope_deg, southness, westness)`. En terreno llano —que en esta
    isla no existe: 0 celdas de 17.556 por debajo de 0,1°— la orientación es 0
    en los dos ejes, que es lo que corresponde a «no mira a ningún sitio».
    """
    js = np.minimum(np.arange(grid.rows) * STEP + (STEP >> 1), grid.dem_height - 1)
    ist = np.minimum(np.arange(grid.cols) * STEP + (STEP >> 1), grid.dem_width - 1)

    center = heights[np.ix_(js, ist)].astype(np.float64)

    # El vecino que cae en el mar —o fuera del propio modelo— no inclina la
    # ladera: se sustituye por la cota del punto. Sin esto, cualquier costa sale
    # como un acantilado de la altura del pueblo que tiene detrás. Es la misma
    # regla que `at()` en `src/lib/fire/terrain.ts`, incluido el borde del DEM.
    def land(dj: int, di: int) -> np.ndarray:
        jj = js + dj * STEP
        ii = ist + di * STEP
        ok_j = (jj >= 0) & (jj < grid.dem_height)
        ok_i = (ii >= 0) & (ii < grid.dem_width)
        v = heights[np.ix_(np.clip(jj, 0, grid.dem_height - 1), np.clip(ii, 0, grid.dem_width - 1))]
        v = v.astype(np.float64)
        inside = ok_j[:, None] & ok_i[None, :]
        return np.where(inside & (v > SEA_LEVEL_M), v, center)

    z1, z2, z3 = land(-1, -1), land(-1, 0), land(-1, 1)
    z4, z6 = land(0, -1), land(0, 1)
    z7, z8, z9 = land(1, -1), land(1, 0), land(1, 1)

    spacing = grid.cell_meters
    dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * spacing)
    dzdy = (z1 + 2 * z2 + z3 - (z7 + 2 * z8 + z9)) / (8 * spacing)

    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    aspect = np.degrees(np.arctan2(-dzdx, -dzdy))
    aspect = np.where(aspect < 0, aspect + 360, aspect)

    from_south = np.radians(aspect - 180)
    flat = (slope < 0.1) | (center <= SEA_LEVEL_M)
    southness = np.where(flat, 0.0, np.cos(from_south))
    westness = np.where(flat, 0.0, np.sin(from_south))
    slope = np.where(center <= SEA_LEVEL_M, 0.0, slope)

    return slope.astype(np.float32), southness.astype(np.float32), westness.astype(np.float32)


def land_mask(elevation: np.ndarray) -> np.ndarray:
    """Qué celdas son isla. Todo lo demás no se entrena, no se puntúa y no se pinta."""
    return elevation > SEA_LEVEL_M
