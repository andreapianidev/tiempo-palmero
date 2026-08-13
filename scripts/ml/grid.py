"""La malla sobre la que se entrena y se pinta, y la geometría para llenarla.

LA MALLA ES LA MISMA QUE LA DEL MAPA, y eso no es una comodidad: es la
condición para que el modelo entrenado aquí signifique algo allí. `grid.ts`
recorre el retículo del modelo de elevación submuestreado de 6 en 6 píxeles y
toma el centro de cada celda; este fichero hace exactamente esa cuenta, con los
mismos redondeos. Si las dos divergen, el mapa pinta en la celda de al lado y
nadie se entera, porque el resultado sigue teniendo la forma de la isla.

Del manifiesto real de `public/dem/` (z12, 7 × 9 teselas de 256 px):
1792 × 2304 píxeles de DEM a 33,54 m, que de 6 en 6 dan **298 × 384 celdas de
201 m**. De ésas, 17.556 caen en tierra — 709 km² contra los 708 km² que mide
la isla.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np

from cache import ROOT

TILE_SIZE = 256
#: Píxeles de DEM por celda. Es `SLOPE_STEP_PX` de `src/lib/fire/terrain.ts` y
#: el `step` por defecto de `rasterizeGrid`, y los tres tienen que valer 6.
STEP = 6
#: Por debajo de esto es mar. Es `SEA_LEVEL_M` de `src/lib/dem.ts`.
SEA_LEVEL_M = 1.5


@dataclass(frozen=True)
class Grid:
    zoom: int
    origin_x: int
    origin_y: int
    dem_width: int
    dem_height: int
    cols: int
    rows: int
    meters_per_pixel: float

    @property
    def cell_meters(self) -> float:
        return STEP * self.meters_per_pixel

    def cell_centers(self) -> tuple[np.ndarray, np.ndarray]:
        """Longitud y latitud del centro de cada celda, en malla `rows × cols`."""
        px = self.origin_x + np.arange(self.cols) * STEP + STEP / 2
        py = self.origin_y + np.arange(self.rows) * STEP + STEP / 2
        lon = pixel_x_to_lon(px, self.zoom)
        lat = pixel_y_to_lat(py, self.zoom)
        return np.broadcast_to(lon, (self.rows, self.cols)), np.broadcast_to(
            lat[:, None], (self.rows, self.cols)
        )

    def lonlat_to_cell(self, lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Columna y fila de la celda que contiene cada punto. Puede salirse de la malla."""
        i = (lon_to_pixel_x(lon, self.zoom) - self.origin_x) / STEP
        j = (lat_to_pixel_y(lat, self.zoom) - self.origin_y) / STEP
        return np.floor(i).astype(np.int64), np.floor(j).astype(np.int64)


def load_grid() -> Grid:
    manifest = json.loads((ROOT / "public/dem/manifest.json").read_text())
    return Grid(
        zoom=manifest["zoom"],
        origin_x=manifest["x0"] * manifest["tileSize"],
        origin_y=manifest["y0"] * manifest["tileSize"],
        dem_width=manifest["cols"] * manifest["tileSize"],
        dem_height=manifest["rows"] * manifest["tileSize"],
        cols=(manifest["cols"] * manifest["tileSize"]) // STEP,
        rows=(manifest["rows"] * manifest["tileSize"]) // STEP,
        meters_per_pixel=manifest["metersPerPixel"],
    )


# --- Web Mercator, idéntico a `src/lib/geo.ts` -------------------------------


def lon_to_pixel_x(lon, z: int):
    return ((np.asarray(lon, dtype=float) + 180) / 360) * TILE_SIZE * 2**z


def lat_to_pixel_y(lat, z: int):
    r = np.radians(np.asarray(lat, dtype=float))
    y = np.log(np.tan(r) + 1 / np.cos(r))
    return ((1 - y / math.pi) / 2) * TILE_SIZE * 2**z


def pixel_x_to_lon(px, z: int):
    return (np.asarray(px, dtype=float) / (TILE_SIZE * 2**z)) * 360 - 180


def pixel_y_to_lat(py, z: int):
    n = math.pi * (1 - (2 * np.asarray(py, dtype=float)) / (TILE_SIZE * 2**z))
    return np.degrees(np.arctan(np.sinh(n)))


# --- UTM 28N → WGS84 ---------------------------------------------------------
# La cartografía de combustible del Gobierno de Canarias viene en EPSG:32628,
# igual que los límites municipales del Cabildo. Es la misma transformación
# inversa que `utm28nToWgs84` en `src/lib/geo.ts`, con las mismas constantes.

_A = 6378137.0
_F = 1 / 298.257223563
_K0 = 0.9996
_E2 = _F * (2 - _F)
_EP2 = _E2 / (1 - _E2)


def utm28n_to_wgs84(east, north, zone: int = 28):
    east = np.asarray(east, dtype=float)
    north = np.asarray(north, dtype=float)
    x = east - 500000.0
    m = north / _K0
    e1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
    mu = m / (_A * (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * np.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * np.sin(4 * mu)
        + (151 * e1**3 / 96) * np.sin(6 * mu)
        + (1097 * e1**4 / 512) * np.sin(8 * mu)
    )
    c1 = _EP2 * np.cos(phi1) ** 2
    t1 = np.tan(phi1) ** 2
    n1 = _A / np.sqrt(1 - _E2 * np.sin(phi1) ** 2)
    r1 = _A * (1 - _E2) / (1 - _E2 * np.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * _K0)
    lat = phi1 - (n1 * np.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * _EP2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * _EP2 - 3 * c1**2) * d**6 / 720
    )
    lon = (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * _EP2 + 24 * t1**2) * d**5 / 120
    ) / np.cos(phi1)
    return np.degrees(lon) + (zone * 6 - 183), np.degrees(lat)


# --- Rasterización de polígonos ---------------------------------------------


def rasterize(
    grid: Grid,
    rings_by_value: list[tuple[float, list[np.ndarray]]],
    out: np.ndarray | None = None,
    fill: float = 0,
) -> np.ndarray:
    """Pinta polígonos en la malla, celda a celda, por su centro.

    `rings_by_value` es una lista de `(valor, anillos)`, donde cada anillo es un
    array `(n, 2)` de `[lon, lat]`. Los anillos de un mismo polígono se
    combinan con la regla par-impar, que es la que trata los huecos como
    huecos.

    **Por el centro de la celda y no por superficie mayoritaria.** Es lo mismo
    que hace `rasterizeGrid` para la altitud, y lo que importa es que sea lo
    mismo: una celda de 201 m sobre un mosaico de parcelas de 30 m siempre va a
    tener que elegir, y elegir distinto en el entrenamiento y en el mapa es
    peor que elegir mal en los dos.
    """
    if out is None:
        out = np.full((grid.rows, grid.cols), fill, dtype=float)

    lon_grid, lat_grid = grid.cell_centers()
    lon_row = lon_grid[0]  # la longitud solo depende de la columna
    lat_col = lat_grid[:, 0]  # y la latitud solo de la fila

    for value, rings in rings_by_value:
        if not rings:
            continue
        allpts = np.concatenate(rings)
        w, e = allpts[:, 0].min(), allpts[:, 0].max()
        s, n = allpts[:, 1].min(), allpts[:, 1].max()

        i0, i1 = np.searchsorted(lon_row, [w, e])
        # `lat_col` va de norte a sur, o sea decreciente: se busca al revés.
        j0, j1 = np.searchsorted(-lat_col, [-n, -s])
        i0, j0 = max(0, i0 - 1), max(0, j0 - 1)
        i1, j1 = min(grid.cols, i1 + 1), min(grid.rows, j1 + 1)
        if i0 >= i1 or j0 >= j1:
            continue

        xs = lon_row[i0:i1]
        ys = lat_col[j0:j1]
        gx, gy = np.meshgrid(xs, ys)
        inside = np.zeros(gx.shape, dtype=bool)
        for ring in rings:
            inside ^= _points_in_ring(gx, gy, ring)
        if inside.any():
            block = out[j0:j1, i0:i1]
            block[inside] = value
            out[j0:j1, i0:i1] = block

    return out


def _points_in_ring(gx: np.ndarray, gy: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Par-impar vectorizado, el mismo algoritmo que `pointInPolygon` en `geo.ts`."""
    x, y = ring[:, 0], ring[:, 1]
    xj, yj = np.roll(x, 1), np.roll(y, 1)
    inside = np.zeros(gx.shape, dtype=bool)
    for k in range(len(x)):
        xi, yi, xk, yk = x[k], y[k], xj[k], yj[k]
        if yi == yk:
            continue
        crosses = (yi > gy) != (yk > gy)
        if not crosses.any():
            continue
        cut = (xk - xi) * (gy - yi) / (yk - yi) + xi
        inside ^= crosses & (gx < cut)
    return inside


def geojson_rings(geometry: dict) -> list[np.ndarray]:
    """Todos los anillos de un Polygon o MultiPolygon, como arrays `(n, 2)`."""
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    polys = [coords] if kind == "Polygon" else coords if kind == "MultiPolygon" else []
    out: list[np.ndarray] = []
    for poly in polys:
        for ring in poly:
            arr = np.asarray(ring, dtype=float)
            if arr.ndim == 2 and arr.shape[0] >= 3:
                out.append(arr[:, :2])
    return out
