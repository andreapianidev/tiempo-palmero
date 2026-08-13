"""El combustible: qué hay en cada celda y cuánto arde eso.

DOS FUENTES, Y NO SE MEZCLAN AL AZAR.

**1. Los modelos de combustible de Canarias.** El Gobierno de Canarias publica
cartografía de modelos de combustible ya recortada a cada isla, y la de La
Palma trae 14.153 polígonos con el modelo estándar de Rothermel/NFFL (1–9) a
25 m de resolución. Es cartografía hecha *para modelizar incendios*: no es un
mapa de vegetación que haya que traducir, ya viene traducido. Es la fuente
buena y manda siempre que existe.

Lo que NO cubre es la agricultura: sumando sus clases salen 53.935 ha de las
70.666 que mide la isla, así que un 24 % del territorio se queda sin modelo.

**2. El mapa de cultivos del Cabildo** (`src/lib/fire/fuel.ts`) rellena ese
hueco, y solo ese hueco. Es de 2002–2008 y es lo único que hay, pero para lo
que se le pide —distinguir la platanera regada de la huerta abandonada— es
justo el mapa que se levantó para eso.

QUÉ SIGNIFICAN LOS MODELOS NFFL, en la clasificación de Anderson (1982),
«Aids to determining fuel models for estimating fire behavior», USDA Forest
Service, que es la que usa esta cartografía:

  1 pasto fino, seco y bajo · 2 pasto con matorral disperso ·
  4 matorral alto y denso · 5 matorral bajo y verde ·
  6 matorral con hojarasca · 7 matorral inflamable bajo arbolado ·
  8 hojarasca compacta bajo arbolado denso · 9 hojarasca ligera y esponjosa,
  que en La Palma es el pinar canario · 0 sin combustible (roca, agua, urbano)

**Ninguno de esos números es un peligro y aquí no se convierte en uno.** El
modelo aprende un coeficiente por clase de los incendios que de verdad hubo. La
tentación —«el 7 arde más que el 5»— es cierta en el manual y no dice nada de
cuánto: eso es exactamente lo que se mide.
"""

from __future__ import annotations

import io
import zipfile

import numpy as np
import shapefile  # pyshp

from cache import fetch, esri_query
from grid import Grid, geojson_rings, rasterize, utm28n_to_wgs84

FUEL_ZIP = (
    "https://www.gobiernodecanarias.org/medioambiente/descargas/"
    "Biodiversidad/modelos_combustibles/LA%20PALMA.zip"
)
SHP_STEM = "MODELOS COMBUSTIBLE_LP_SHAPE/lp_mc_gen_sieve"

#: Los modelos NFFL que trae la cartografía de La Palma, en el orden en que se
#: guardan. El 3 (pasto alto) no aparece en esta isla, y el hueco se deja para
#: que el índice de cada modelo siga siendo su número.
NFFL_PRESENT = (0, 1, 2, 4, 5, 6, 7, 8, 9)

NFFL_LABEL = {
    0: "Sin combustible",
    1: "Pasto fino y bajo",
    2: "Pasto con matorral disperso",
    3: "Pasto alto",
    4: "Matorral alto y denso",
    5: "Matorral bajo",
    6: "Matorral con hojarasca",
    7: "Matorral bajo arbolado",
    8: "Hojarasca compacta",
    9: "Hojarasca de pinar",
}

#: Con qué modelo NFFL se rellena cada clase del mapa de cultivos donde la
#: cartografía forestal no llega. No es una equivalencia inventada: es la lectura
#: literal de la definición de Anderson aplicada a lo que describe cada clase.
#: La huerta abandonada de esta isla, a los pocos años, es pasto con matorral
#: disperso; la platanera regada no es combustible.
CROP_TO_NFFL = {
    "monte": 7,
    "erial": 2,
    "abandonado": 2,
    "pasto": 1,
    "cultivo": 0,
    "urbano": 0,
    "desconocido": 0,
}

#: Sin clasificar. Se guarda como 255 y no como 0 a propósito: «no lo sé» y «no
#: hay combustible» son cosas distintas, y colapsarlas pinta de verde seguro
#: todo lo que la cartografía no llegó a mirar.
UNKNOWN = 255


def fuel_grid(grid: Grid) -> np.ndarray:
    """Modelo NFFL de cada celda. `UNKNOWN` donde no lo sabe ninguna de las dos fuentes."""
    out = np.full((grid.rows, grid.cols), float(UNKNOWN))
    _paint_crops(grid, out)  # primero el relleno...
    _paint_fuel_models(grid, out)  # ...y encima la cartografía buena
    return out.astype(np.uint8)


def _paint_fuel_models(grid: Grid, out: np.ndarray) -> None:
    raw = fetch(FUEL_ZIP, name="lp-modelos-combustible.zip")
    zf = zipfile.ZipFile(io.BytesIO(raw))
    base = next(n for n in zf.namelist() if n.endswith(f"{SHP_STEM}.shp"))
    stem = base[: -len(".shp")]
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(stem + ".shp")),
        shx=io.BytesIO(zf.read(stem + ".shx")),
        dbf=io.BytesIO(zf.read(stem + ".dbf")),
    )
    field = [f[0] for f in reader.fields[1:]].index("mc")

    batch: list[tuple[float, list[np.ndarray]]] = []
    for shape, record in zip(reader.shapes(), reader.records()):
        pts = np.asarray(shape.points, dtype=float)
        if len(pts) < 3:
            continue
        lon, lat = utm28n_to_wgs84(pts[:, 0], pts[:, 1])
        ll = np.column_stack([lon, lat])
        parts = list(shape.parts) + [len(pts)]
        rings = [ll[parts[k] : parts[k + 1]] for k in range(len(parts) - 1)]
        rings = [r for r in rings if len(r) >= 3]
        if rings:
            batch.append((float(record[field]), rings))
    rasterize(grid, batch, out=out)


def _paint_crops(grid: Grid, out: np.ndarray) -> None:
    """El mapa de cultivos, traducido a modelos NFFL, como relleno de fondo."""
    from crops import crop_fuel_class  # importación tardía: es una tabla, no un módulo pesado

    offset = 0
    batch: list[tuple[float, list[np.ndarray]]] = []
    while True:
        page = esri_query(
            "Agricultura",
            0,
            outFields="CULTIVO",
            maxAllowableOffset="0.0005",
            resultOffset=str(offset),
            resultRecordCount="1000",
        )
        feats = page.get("features") or []
        if not feats:
            break
        for f in feats:
            rings = geojson_rings(f.get("geometry") or {})
            if not rings:
                continue
            nffl = CROP_TO_NFFL[crop_fuel_class((f.get("properties") or {}).get("CULTIVO"))]
            batch.append((float(nffl), rings))
        offset += len(feats)
        if len(feats) < 1000:
            break
    rasterize(grid, batch, out=out)
