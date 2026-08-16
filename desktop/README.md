# Tiempo Palmero — escritorio (Unreal Engine 5)

Gemelo 3D de La Palma. El motor meteorológico es `src/lib`, empaquetado en
`desktop/Content/Core/core.bundle.js` y ejecutado por QuickJS dentro de UE.

- `scripts/bundle-core.mjs` — empaqueta el core (esbuild, IIFE).
- `scripts/verify.sh` — puerta de producción del escritorio (desde Task 13).
- `Source/` — módulos: `TiempoPalmero` (arranque), `TPJs` (QuickJS), `TPGeo`
  (geometría/terreno/cartografía), `TPAtmo` (sol).

La web sigue siendo la referencia visual: compárese lado a lado.
