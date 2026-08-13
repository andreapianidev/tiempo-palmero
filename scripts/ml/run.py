"""El entrenamiento entero, de las descargas al PNG.

    python3 -m venv .venv-ml
    .venv-ml/bin/pip install -r scripts/ml/requirements.txt
    .venv-ml/bin/python scripts/ml/run.py

Tarda unos minutos la primera vez —descarga cartografía de cuatro servidores— y
segundos las siguientes, porque todo queda en `scripts/ml/cache/`. No hace falta
para construir ni para desplegar la aplicación: lo que ésta consume son los dos
ficheros de `public/fire/`, que están versionados.

Todo lo que este script imprime está pensado para leerse y pegarse en el README:
son las cifras medidas que la interfaz y la documentación tienen que decir.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import export
import train
from access import distance_to_ways
from dem import cell_elevation, land_mask, load_heights, relief
from fuel import UNKNOWN, fuel_grid
from grid import load_grid
from moisture import fosberg
from perimeters import fires
from weather import RAIN_DAY_MM, archive, series

#: Los puntos que se le piden al archivo meteorológico. Diez repartidos por la
#: isla, que el modelo colapsa en seis celdas de ~11 km — y esas seis son toda
#: la resolución que tiene esta parte.
CLIMATE_POINTS = [
    (28.85, -17.90), (28.78, -17.75), (28.75, -17.95), (28.68, -17.77), (28.60, -17.92),
    (28.52, -17.84), (28.45, -17.85), (28.72, -17.88), (28.62, -17.78), (28.55, -17.90),
]

#: El día en que arrancó cada incendio.
#:
#: Los de EFFIS lo traen en `FIREDATE`. Los dos del Cabildo no traen fecha
#: ninguna —son volcados de CAD— y se han sacado del archivo de detecciones
#: térmicas de la NASA (FIRMS, MODIS y VIIRS sobre el recuadro de la isla): en
#: 2009 el racimo va del 31 de julio al 2 de agosto y en 2012 del 4 al 5 de
#: agosto, así que el arranque es el primer día de cada racimo. Es una
#: derivación, no un dato publicado, y por eso va escrito aquí.
FIRE_START = {2009: "2009-07-31", 2012: "2012-08-04"}

CLIMATE_FROM = "2001-01-01"
CLIMATE_TO = "2024-12-31"


def main() -> None:
    grid = load_grid()
    print(f"malla {grid.cols} × {grid.rows} celdas de {grid.cell_meters:.0f} m")

    heights = load_heights(grid)
    elevation = cell_elevation(grid, heights)
    land = land_mask(elevation)
    slope, southness, westness = relief(grid, heights)
    area_km2 = int(land.sum()) * grid.cell_meters**2 / 1e6
    print(f"tierra: {int(land.sum())} celdas = {area_km2:.0f} km² (la isla mide 708)")

    fuel = fuel_grid(grid)
    distance = distance_to_ways(grid)

    # Se cuantizan ANTES de entrenar, a lo que el PNG va a poder guardar. Así
    # el ajuste ve exactamente los mismos números que va a leer el navegador y
    # el PNG es la única fuente de verdad. Ver `export.quantize`.
    distance, slope = export.quantize(distance, slope)

    unknown = int((land & (fuel == UNKNOWN)).sum())
    print(f"combustible sin clasificar: {unknown} celdas ({unknown / int(land.sum()) * 100:.1f} % de la isla)")
    for model in sorted(set(fuel[land].tolist())):
        n = int((land & (fuel == model)).sum())
        print(f"   modelo {model:3d}: {n:6d} celdas  {n * grid.cell_meters ** 2 / 1e4:8.0f} ha")

    # --- Etiquetas ---------------------------------------------------------
    fire_list = fires(grid)
    masks, labels = [], []
    burned = np.zeros_like(land)
    print("\nincendios con perímetro publicado:")
    for f in fire_list:
        m = f["mask"] & land
        masks.append(m)
        labels.append(f["label"])
        burned |= m
        ha = int(m.sum()) * grid.cell_meters**2 / 1e4
        print(
            f"   {f['year']}  {int(m.sum()):5d} celdas = {ha:7.0f} ha"
            f"  (la fuente declara {f['declared_ha']:.0f})  {f['source']}"
        )
    print(f"   quemado alguna vez: {int(burned.sum())} celdas, {int(burned.sum()) / int(land.sum()) * 100:.1f} % de la isla")

    # --- Ajuste ------------------------------------------------------------
    usable = land & (fuel != UNKNOWN) if train.DROP_UNKNOWN_FUEL else land
    feats = train.standardize(
        train.build_features(fuel, slope, southness, westness, elevation, distance, usable)
    )
    y = burned[usable]

    fold_masks = [m[usable] for m in masks]
    folds = train.leave_one_fire_out(feats, fold_masks, labels)
    aucs = [f["auc"] for f in folds]
    print("\nvalidación dejando un incendio fuera:")
    for f in folds:
        print(f"   {f['fire'][:44]:46} AUC {f['auc']:.3f}  ({f['heldCells']} celdas)")
    print(f"   media {np.mean(aucs):.3f}   peor {min(aucs):.3f}   mejor {max(aucs):.3f}")

    shuffled = train.shuffled_auc(feats, y)
    print(f"   repartiendo celdas al azar saldría {shuffled:.3f} — la cifra que NO se publica")

    families = train.compare_families(feats, fold_masks, labels)
    print("\npor qué esta familia de modelo y no otra:")
    for fam in families:
        print(f"   {fam['family']:24} AUC media {fam['aucMean']:.3f}   peor pliegue {fam['aucWorst']:.3f}")

    model = train.fit_final(feats, y)
    trees = train.export_trees(model, feats)
    imps = train.importances(model, feats)
    print(f"\n{len(trees['trees'])} árboles, {sum(len(t['f']) for t in trees['trees'])} nodos")
    print("importancia de cada predictor:")
    for row in imps:
        if row["importance"] >= 0.001:
            print(f"   {row['name']:14} {row['importance']:.3f}")

    probability = np.full(land.shape, np.nan)
    probability[usable] = model.predict_proba(feats.x)[:, 1]

    # --- La escala del peligro meteorológico, medida ------------------------
    danger = calibrate_danger(fire_list)

    # --- Exportación -------------------------------------------------------
    png_bytes = export.write_png(fuel, distance, slope, land)
    lon, lat = grid.cell_centers()
    payload = {
        "grid": {
            "cols": grid.cols,
            "rows": grid.rows,
            "cellMeters": round(grid.cell_meters, 2),
            "zoom": grid.zoom,
            "originX": grid.origin_x,
            "originY": grid.origin_y,
            "step": 6,
        },
        "distanceStepM": export.DISTANCE_STEP_M,
        "model": trees,
        "importances": imps,
        "baseline": {
            "median": round(float(np.nanmedian(probability[usable])), 4),
            "p90": round(float(np.nanpercentile(probability[usable], 90)), 4),
            "max": round(float(np.nanmax(probability[usable])), 4),
        },
        "validation": {
            "method": "dejando un incendio entero fuera, cinco pliegues",
            "folds": folds,
            "aucMean": round(float(np.mean(aucs)), 4),
            "aucWorst": round(float(min(aucs)), 4),
            "aucBest": round(float(max(aucs)), 4),
            "aucShuffled": round(shuffled, 4),
            "families": families,
        },
        "training": {
            "cells": int(usable.sum()),
            "burnedCells": int(burned.sum()),
            "burnedShare": round(float(burned.sum() / usable.sum()), 4),
            "fires": [
                {
                    "year": f["year"],
                    "label": f["label"],
                    "date": f["date"] or FIRE_START.get(f["year"]),
                    "declaredHa": f["declared_ha"],
                    "source": f["source"],
                }
                for f in fire_list
            ],
        },
        "danger": danger,
        "sources": [
            "Modelos de combustible de Canarias (Gobierno de Canarias), hoja de La Palma",
            "Mapa de cultivos 2002–2008 (Gobierno de Canarias) vía el visor ArcGIS del Cabildo",
            "Perímetros de incendio 2009 y 2012, Cabildo Insular de La Palma",
            "Áreas quemadas de Copernicus EFFIS (2016, 2020, 2023)",
            "Viario de OpenStreetMap y red de senderos del Cabildo",
            "Modelo de elevación Mapzen terrarium",
            "Archivo de reanálisis de Open-Meteo (ERA5)",
        ],
    }
    json_bytes = export.write_model(payload)

    fixture = export.sample_fixture(
        {
            "lon": lon,
            "lat": lat,
            "fuel": fuel.astype(float),
            "distance": distance,
            "slope": slope,
            "southness": southness,
            "westness": westness,
            "elevation": elevation,
            "probability": probability,
        },
        usable,
    )
    fixture_path = export.ROOT / "src/lib/fire/__fixtures__/model-cells.json"
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    import json as _json

    fixture_path.write_text(_json.dumps(fixture, indent=2) + "\n")

    print(f"\npublic/fire/static.png  {png_bytes / 1024:.0f} KB")
    print(f"public/fire/model.json  {json_bytes / 1024:.1f} KB")
    print(f"fixture de {len(fixture)} celdas para el test de TypeScript")
    print(
        f"probabilidad: mediana {np.nanmedian(probability[usable]):.3f}"
        f"  p90 {np.nanpercentile(probability[usable], 90):.3f}"
        f"  máx {np.nanmax(probability[usable]):.3f}"
    )


def calibrate_danger(fire_list: list[dict]) -> dict:
    """Qué tiempo hacía los días en que arrancó cada incendio, contra 24 años.

    NO ES UN AJUSTE, Y LA DIFERENCIA IMPORTA. Cinco días no dan para ajustar
    nada: dan para situarlos. Se calcula el índice de Fosberg y los días sin
    llover de **todos** los días de 2001 a 2024 sobre la isla, se construye la
    distribución empírica de los dos, y se mira en qué percentil cayó cada uno
    de los cinco arranques. La escala del peligro meteorológico es esa
    distribución, así que no hay ni un umbral elegido: el mapa dice «hoy está
    en el percentil 93 de los últimos 24 años», que es una frase comprobable.

    Los dos ingredientes van juntos porque describen cosas distintas. Fosberg es
    el instante —cuánta agua tiene ahora mismo la hojarasca y cuánto viento
    hace—; los días sin llover son la memoria. Un día de calima sobre suelo
    empapado y un día corriente al final de un verano sin lluvia son peligrosos
    por motivos que no se sustituyen entre sí.
    """
    entries = archive(CLIMATE_POINTS, CLIMATE_FROM, CLIMATE_TO)
    cells: dict[tuple[float, float], list[dict]] = {}
    for entry in entries:
        cells.setdefault((round(entry["latitude"], 4), round(entry["longitude"], 4)), series(entry))

    fos: dict[str, float] = {}
    dry: dict[str, float] = {}
    for rows in cells.values():
        last_rain: str | None = None
        for row in rows:
            value = fosberg(
                row["temperature_2m_max"],
                row["relative_humidity_2m_min"],
                row["wind_speed_10m_max"],
            )
            if value is not None:
                # De toda la isla se queda el peor punto del día: un incendio
                # necesita un sitio, no una media.
                fos[row["day"]] = max(fos.get(row["day"], 0.0), value)

            if last_rain is not None:
                days = (np.datetime64(row["day"]) - np.datetime64(last_rain)).astype(int)
                dry[row["day"]] = max(dry.get(row["day"], 0.0), float(days))
            if (row["precipitation_sum"] or 0) >= RAIN_DAY_MM:
                last_rain = row["day"]

    fos_values = np.array(sorted(fos.values()))
    dry_values = np.array(sorted(dry.values()))
    print(f"\nclima: {len(cells)} celdas del archivo, {len(fos)} días de {CLIMATE_FROM} a {CLIMATE_TO}")

    starts = []
    for f in fire_list:
        day = (f["date"] or FIRE_START.get(f["year"]) or "")[:10]
        v, d = fos.get(day), dry.get(day)
        if v is None:
            continue
        pf = float((fos_values < v).mean() * 100)
        pd = float((dry_values < d).mean() * 100) if d is not None else None
        starts.append(
            {
                "fire": f["label"],
                "day": day,
                "fosberg": round(v, 1),
                "fosbergPercentile": round(pf, 1),
                "daysSinceRain": None if d is None else int(d),
                "drynessPercentile": None if pd is None else round(pd, 1),
            }
        )
        print(
            f"   {f['label'][:36]:38} {day}  Fosberg {v:5.1f} (p{pf:4.1f})"
            f"  {'—' if d is None else f'{int(d):3d} días secos'} (p{'  — ' if pd is None else f'{pd:4.1f}'})"
        )

    if not starts:
        return {"fireDays": []}

    worst = min(s["fosbergPercentile"] for s in starts)
    print(f"   el arranque MENOS extremo de los cinco estuvo en el percentil {worst:.1f} de Fosberg")

    def curve(values: np.ndarray) -> list[float]:
        """La distribución empírica en 21 puntos, de 0 a 100 de cinco en cinco.

        Veintiún números bastan para reconstruir el percentil de cualquier valor
        por interpolación con un error por debajo de un punto, y caben en el
        JSON sin que se note. Guardar la serie entera —8.700 días— para eso
        sería mandarle al navegador 24 años de clima para contestar una
        pregunta que se responde con una tabla.
        """
        return [round(float(np.percentile(values, q)), 3) for q in range(0, 101, 5)]

    return {
        "climateDays": len(fos),
        "climateFrom": CLIMATE_FROM,
        "climateTo": CLIMATE_TO,
        "climateCells": len(cells),
        "fireDays": starts,
        "fosbergCurve": curve(fos_values),
        "drynessCurve": curve(dry_values),
        "lowestFireDayPercentile": round(worst, 1),
    }


if __name__ == "__main__":
    main()
