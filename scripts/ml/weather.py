"""El tiempo que hacía, para saber qué tiene de extraordinario el de hoy.

PARA QUÉ. El clasificador espacial dice **dónde** se quema esta isla. No dice
nada de **cuándo**, porque los cinco incendios que lo entrenan son cinco días, y
con cinco días no se ajusta un modelo meteorológico: se ajusta un recuerdo.

Lo que sí se puede hacer con cinco días es **medirlos** contra el clima de un
cuarto de siglo y averiguar en qué percentil estaban. Eso no es entrenar, es
contar, y es lo que fija la escala del peligro meteorológico sin inventarse
ningún umbral. Es la misma disciplina que el resto del repositorio: la cifra que
decide sale de medirla contra el archivo, y al lado va escrito cuánto marca el
caso extremo y cuánto el corriente.

DE DÓNDE. Del archivo de reanálisis de Open-Meteo, que llega de 1940 a hoy, es
gratuito y no pide clave. Es **un modelo**, con la resolución que tiene: sobre
La Palma resuelve seis celdas de unos 11 km. No describe un barranco; describe
el régimen del día sobre la isla, que es justo lo que aquí se le pide.

QUÉ SE PIDE, y por qué esas cuatro variables: temperatura máxima, humedad
relativa mínima y racha máxima de viento son los tres ingredientes del índice
de Fosberg en su momento peor del día, y la precipitación es lo que reinicia la
sequía. No hay una quinta.
"""

from __future__ import annotations

import json
import urllib.parse

from cache import fetch

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"

DAILY = (
    "temperature_2m_max",
    "relative_humidity_2m_min",
    "wind_speed_10m_max",
    "precipitation_sum",
)

#: Cuánta lluvia cuenta como lluvia. Es `RAIN_DAY_MM` de
#: `src/lib/fire/drought.ts`, donde está la medición que lo fija en 1 mm: con
#: 0,1 mm el sur de la isla sale con los mismos días secos que el centro cuando
#: lleva el doble, y con 5 mm el noroeste pierde una lluvia real.
RAIN_DAY_MM = 1.0


def archive(points: list[tuple[float, float]], start: str, end: str) -> list[dict]:
    """Serie diaria en varios puntos, de una sola petición.

    El archivo admite listas de coordenadas separadas por comas y contesta un
    array con un objeto por punto. Devuelve la latitud y la longitud del
    **centro de la celda que le tocó**, no las que se le pidieron, y ahí es donde
    se ve la resolución real: diez puntos repartidos por La Palma caen en seis
    celdas distintas.
    """
    q = {
        "latitude": ",".join(f"{la:.4f}" for la, _ in points),
        "longitude": ",".join(f"{lo:.4f}" for _, lo in points),
        "start_date": start,
        "end_date": end,
        "daily": ",".join(DAILY),
        "timezone": "UTC",
        "wind_speed_unit": "ms",
    }
    url = ARCHIVE + "?" + urllib.parse.urlencode(q)
    body = json.loads(fetch(url, name=f"openmeteo-{start}-{end}-{len(points)}pt.json", timeout=600))
    return body if isinstance(body, list) else [body]


def series(entry: dict) -> list[dict]:
    """Un archivo de Open-Meteo, convertido en filas con sus cuatro columnas."""
    d = entry.get("daily") or {}
    days = d.get("time") or []
    out = []
    for i, day in enumerate(days):
        row = {"day": day}
        ok = True
        for name in DAILY:
            v = (d.get(name) or [None] * len(days))[i]
            row[name] = v
            if v is None:
                ok = False
        # Un día incompleto no es un día tranquilo: se descarta entero. Con una
        # de las tres variables a `None`, Fosberg no existe, y rellenarla con la
        # media del mes sería fabricar clima.
        if ok:
            out.append(row)
    return out
