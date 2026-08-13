"""El mapa de cultivos del Cabildo, traducido a modelos de combustible.

PARA QUÉ. La cartografía de modelos de combustible de Canarias cubre lo
forestal, 53.935 ha de las 70.666 que mide La Palma. El 24 % que falta es
agricultura, y dejarlo sin clasificar sería dejar sin puntuar justo la mitad
baja de la isla — que es donde vive la gente y donde empiezan casi todos los
incendios.

QUÉ MAPA. `Agricultura/FeatureServer/0` del visor ArcGIS del Cabildo, el mismo
que ya usa la ficha de parcela de la aplicación: **217.137 polígonos, 70.666
ha**, levantado por el Gobierno de Canarias entre 2002 y 2008. Medido contra la
API el 13 ago 2026, agrupando por familia:

  | familia | parcelas | ha | % isla |
  |---|---:|---:|---:|
  | Monte | 41.755 | 32.374 | 45,8 % |
  | Erial | 55.001 | 15.329 | 21,7 % |
  | Cultivo abandonado | 74.749 | 12.671 | 17,9 % |
  | Cultivo en explotación | 37.264 | 5.672 | 8,0 % |
  | Urbano y viales | 4.798 | 3.343 | 4,7 % |
  | Pastizal y tagasaste | 3.567 | 1.277 | 1,8 % |

**El 85,4 % de La Palma es monte, erial o cultivo abandonado.** Ése es el
problema de los incendios de esta isla en una tabla: lo que arde no es un
bosque lejano, es el terreno que dejó de trabajarse pegado a las casas.

LA EQUIVALENCIA A MODELOS NFFL no es un peligro asignado a dedo: es la lectura
literal de la definición de Anderson (1982) aplicada a lo que describe cada
clase del mapa. Un cultivo regado no tiene combustible disponible; una huerta
abandonada de esta isla, a los pocos años, es pasto con matorral disperso.
Cuánto arde cada modelo lo sigue midiendo el clasificador.

Y EL AÑO PESA MÁS AQUÍ QUE EN NINGÚN OTRO SITIO. Un mapa de 2008 llamando
platanera a lo que hoy es lava, o cultivo a lo que hoy lleva quince años sin
tocarse, se equivoca *hacia abajo*: el abandono agrícola solo ha ido a más. La
capa lo dice donde se enseña.
"""

from __future__ import annotations

import re

#: Código `CULTIVO` → familia. Todo lo que no está aquí es cultivo en
#: explotación, que es el valor por defecto correcto: si el mapa dice que en
#: 2008 alguien trabajaba esa parcela, lo que hay es un cultivo.
_FAMILY_BY_CODE = {
    "16": "monte",
    "17": "erial",
    "36": "abandonado",  # huerta abandonada
    "35": "abandonado",  # huerta en no cultivo
    "39": "abandonado",  # almendro abandonado
    "14": "pasto",  # pastizal
    "71": "pasto",  # tagasaste
    "171": "urbano",
}


def crop_fuel_class(cultivo: str | None) -> str:
    """La familia de un valor crudo de `CULTIVO`.

    El campo trae prefijos de letra —`T39`, `V36`, `C21`, `T105`— que son
    variantes de la misma clase y se quitan. Hay **cuatro parcelas** en las que
    el prefijo y la descripción no concuerdan (`T14` viene descrito como
    «Cereales y Leguminosas» y `T19` como «Pastizal», al revés que los códigos
    14 y 19 sin prefijo). Son 1,6 ha de 70.666, el 0,002 % de la isla: se
    clasifican por el número y queda escrito aquí, en vez de montar una tabla
    de excepciones por cuatro polígonos.
    """
    if not cultivo:
        return "desconocido"
    code = re.sub(r"^[A-Za-z]+", "", cultivo.strip())
    if not code.isdigit():
        return "desconocido"
    return _FAMILY_BY_CODE.get(code, "cultivo")
