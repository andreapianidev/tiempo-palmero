"""El índice de Fosberg, otra vez.

Es la traducción literal de `src/lib/fire/moisture.ts`, donde está explicado de
dónde sale cada coeficiente y qué se afirma de él. Está escrito dos veces por
la misma razón que la pendiente: el entrenamiento vive en Python y el mapa en
el navegador, y las dos mitades tienen que decir el mismo número.

Que lo digan no se supone: `run.py` deja en
`src/lib/fire/__fixtures__/climate-days.json` una muestra de días reales con el
valor calculado aquí, y un test de vitest exige que la versión de TypeScript
saque el mismo. Si alguien toca un coeficiente en un lado, el otro lado falla.
"""

from __future__ import annotations

import math

MPH_PER_MS = 2.236936


def equilibrium_moisture(temperature_c: float | None, relative_humidity: float | None) -> float | None:
    """Humedad de equilibrio del combustible fino muerto, en % de peso seco."""
    if temperature_c is None or relative_humidity is None:
        return None
    if not math.isfinite(temperature_c) or not math.isfinite(relative_humidity):
        return None
    h = min(100.0, max(0.0, float(relative_humidity)))
    t = float(temperature_c) * 1.8 + 32  # Simard trabaja en Fahrenheit

    if h < 10:
        m = 0.03229 + 0.281073 * h - 0.000578 * h * t
    elif h <= 50:
        m = 2.22749 + 0.160107 * h - 0.014784 * t
    else:
        m = 21.0606 + 0.005565 * h * h - 0.00035 * h * t - 0.483199 * h
    return min(35.0, max(0.0, m))


def fosberg(
    temperature_c: float | None, relative_humidity: float | None, wind_ms: float | None
) -> float | None:
    """Índice meteorológico de incendios de Fosberg, de 0 a 100."""
    m = equilibrium_moisture(temperature_c, relative_humidity)
    if m is None or wind_ms is None or not math.isfinite(wind_ms):
        return None
    x = m / 30
    eta = 1 - 2 * x + 1.5 * x * x - 0.5 * x * x * x
    u = max(0.0, float(wind_ms)) * MPH_PER_MS
    return min(100.0, (eta * math.sqrt(1 + u * u)) / 0.3002)
