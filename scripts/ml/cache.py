"""Descargas con caché en disco.

Este entrenamiento baja unos 40 MB de seis servidores distintos, y varios de
ellos son lentos o se caen a ratos. Sin caché, cualquier ajuste en el modelo
—que es lo que uno hace veinte veces seguidas— vuelve a pedirlo todo, y encima
maltrata servicios públicos gratuitos.

Lo descargado vive en `scripts/ml/cache/`, que NO se versiona: es reproducible
desde las URLs, y las URLs sí están en el código.
"""

from __future__ import annotations

import hashlib
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / "cache"

#: Los servicios de esta lista son públicos y gratuitos. Se identifica quién
#: llama, como pide la política de uso de Nominatim y de Overpass, y como es
#: cortesía elemental con los demás.
UA = "tiempo-palmero/1.0 (+https://tiempo-palmero.vercel.app) modelo experimental de incendios"


def fetch(url: str, name: str | None = None, tries: int = 4, timeout: int = 300) -> bytes:
    """Baja `url` una vez y la guarda. Las veces siguientes la lee del disco."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = name or (
        hashlib.sha1(url.encode()).hexdigest()[:16] + "-" + Path(urllib.parse.urlparse(url).path).name
    )
    path = CACHE / key
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()

    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as res:
                body = res.read()
            path.write_bytes(body)
            return body
        except Exception as exc:  # noqa: BLE001 — se reintenta y se relanza al final
            last = exc
            if attempt < tries - 1:
                time.sleep(3 + attempt * 4)
    raise RuntimeError(f"no se pudo descargar {url}: {last}")


def esri_query(service: str, layer: int = 0, **params: str) -> dict:
    """Una consulta al visor ArcGIS del Cabildo, en GeoJSON y en WGS84.

    `outSR=4326` no es opcional: las capas del Cabildo están en EPSG:32628 o en
    EPSG:4083 según cuál, y pedirlas ya reproyectadas evita tener que saber en
    cuál está cada una — que es justo el tipo de detalle que se olvida.
    """
    import json

    q = {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
        **params,
    }
    url = (
        "https://services.arcgis.com/hkQNLKNeDVYBjvFE/arcgis/rest/services/"
        f"{service}/FeatureServer/{layer}/query?" + urllib.parse.urlencode(q)
    )
    # El nombre del fichero de caché sale de un hash ESTABLE. Con `hash()` de
    # Python cambia en cada proceso —lleva sal desde la 3.3— y la caché no
    # acertaría nunca: 218 páginas de ArcGIS descargadas otra vez en cada
    # ejecución, que es justo lo que este módulo existe para evitar.
    digest = hashlib.sha1(url.encode()).hexdigest()[:12]
    return json.loads(fetch(url, name=f"esri-{service}-{layer}-{digest}.json"))
