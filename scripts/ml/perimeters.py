"""Lo que de verdad se ha quemado en La Palma, que es de donde aprende el modelo.

CINCO INCENDIOS. No cincuenta, ni quinientos: **cinco**, y de ahí sale casi
toda la incertidumbre de este trabajo. Están todos los grandes del siglo XXI
para los que existe perímetro publicado:

  | año | fuente | superficie declarada |
  |---|---|---|
  | 2009 | Cabildo, `Perimetro_incendio_2009` (17 polígonos) | 4.023 ha |
  | 2012 | Cabildo, `Perimetro_incendio_2012` | 3.180 ha |
  | 2016 | Copernicus EFFIS (El Paso, 3–7 ago) | 4.629 ha |
  | 2020 | Copernicus EFFIS (Garafía, 21–23 ago) | 1.200 ha |
  | 2023 | Copernicus EFFIS (Tijarafe, 15 jul) | 2.925 ha |

POR QUÉ CADA UNO DE SU FUENTE. EFFIS solo tiene perímetros de La Palma desde
2016 —comprobado consultando año por año el 13 ago 2026—, así que 2009 y 2012
solo existen en el visor del Cabildo. Y para 2016 hay los dos: se toma el de
EFFIS porque el del Cabildo es un volcado de CAD sin un solo campo útil (`Layer`,
`Color`, `Entity`), mientras que el de EFFIS trae fecha de inicio y de control.

QUÉ SE DEJA FUERA, y por qué:

 - **El incendio de 2024** que EFFIS registra en El Paso: 5 ha, o sea *una
   celda* de la malla de 201 m. No aporta información espacial, aporta ruido.
 - **El de 2005**, del que hay 38 detecciones de satélite pero ningún
   perímetro. Sin polígono no hay superficie quemada que aprender.
 - **El Tajogaite.** No es un incendio. Se dice aquí porque en los datos de
   satélite es abrumadoramente lo más grande que le ha pasado a esta isla:
   16.835 de las 17.989 detecciones térmicas de FIRMS sobre La Palma son la
   erupción y la lava enfriándose. Este módulo no usa FIRMS —usa perímetros—,
   así que el problema no le llega; queda escrito porque cualquiera que amplíe
   esto con detecciones tiene que saberlo antes de entrenar nada.

CINCO INCENDIOS SON POCOS Y ESO NO SE DISIMULA. Las 15.957 ha quemadas dan
miles de celdas, pero esas celdas no son independientes entre sí: pertenecen a
cinco episodios. Por eso la validación deja **un incendio entero fuera** cada
vez (`train.py`) en lugar de repartir celdas al azar, que daría un AUC
excelente y falso.
"""

from __future__ import annotations

import json
import urllib.parse

import numpy as np

from cache import fetch, esri_query
from grid import Grid, geojson_rings, rasterize

EFFIS_WFS = "https://maps.effis.emergency.copernicus.eu/effis"

#: Superficie mínima para que un incendio entre en el entrenamiento, en ha.
#:
#: No es un número elegido: en este archivo no hay término medio. Rasterizados
#: sobre la malla de 201 m, los cinco incendios que se usan dan 301, 725, 780,
#: 990 y 1.153 celdas; el de 2024 da **una sola celda**. Una celda no enseña
#: nada sobre dónde se quema una ladera —no tiene ni pendiente ni vecinos, es un
#: punto— y sí mete una fila con peso propio en la regresión. El corte está en
#: 100 ha, o sea 25 celdas, que deja fuera exactamente ese caso y ningún otro.
MIN_FIRE_HA = 100.0


def _effis_burned(bbox: str = "28.40,-18.05,28.90,-17.70") -> list[dict]:
    """Perímetros quemados de EFFIS sobre La Palma.

    ⚠️ **El `bbox` va en `lat,lon`**, no en `lon,lat`. Es WFS 1.1.0 con
    EPSG:4326, y en esa combinación el orden de ejes es el del código EPSG, o
    sea latitud primero. Con `lon,lat` el servicio contesta 200 con una
    `FeatureCollection` **vacía**: no hay error, no hay aviso, y parece que en
    La Palma no se ha quemado nunca nada.
    """
    q = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": "modis.ba.poly",
        "srsname": "EPSG:4326",
        "bbox": f"{bbox},EPSG:4326",
        "outputformat": "application/json; subtype=geojson",
    }
    raw = fetch(EFFIS_WFS + "?" + urllib.parse.urlencode(q), name="effis-ba-lapalma.json")
    return json.loads(raw).get("features") or []


def fires(grid: Grid) -> list[dict]:
    """Un registro por incendio, con su máscara de celdas quemadas.

    Cada uno trae `year`, `label`, `date`, `source`, `declared_ha` y `mask`.
    `declared_ha` es la superficie que declara la fuente, y **no** la que sale
    de contar celdas: la primera es el dato publicado y la segunda es lo que
    esta malla es capaz de resolver. Enseñar la segunda como si fuera la primera
    sería redondear un incendio a la resolución de un mapa.
    """
    out: list[dict] = []

    # --- Cabildo: 2009 y 2012 ---
    for year, service in (("2009", "Perimetro_incendio_2009"), ("2012", "Perimetro_incendio_2012")):
        data = esri_query(service, 0)
        rings: list[np.ndarray] = []
        for f in data.get("features") or []:
            rings.extend(geojson_rings(f.get("geometry") or {}))
        if not rings:
            continue
        mask = rasterize(grid, [(1.0, rings)], out=np.zeros((grid.rows, grid.cols))) > 0
        out.append(
            {
                "year": int(year),
                "label": f"Incendio de {year}",
                "date": None,
                "source": f"Cabildo Insular · {service}",
                "declared_ha": 4023 if year == "2009" else 3180,
                "mask": mask,
            }
        )

    # --- EFFIS: 2016, 2020 y 2023 ---
    for f in _effis_burned():
        p = f.get("properties") or {}
        date = str(p.get("FIREDATE") or "")[:10]
        year = int(date[:4]) if date[:4].isdigit() else 0
        area = float(p.get("AREA_HA") or 0)
        if area < MIN_FIRE_HA:
            continue
        rings = geojson_rings(f.get("geometry") or {})
        if not rings:
            continue
        mask = rasterize(grid, [(1.0, rings)], out=np.zeros((grid.rows, grid.cols))) > 0
        out.append(
            {
                "year": year,
                "label": f"Incendio de {year} ({p.get('COMMUNE')})",
                "date": date,
                "source": "Copernicus EFFIS",
                "declared_ha": area,
                "mask": mask,
            }
        )

    out.sort(key=lambda r: r["year"])
    return out
