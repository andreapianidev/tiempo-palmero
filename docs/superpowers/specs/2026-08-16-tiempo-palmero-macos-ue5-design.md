# Tiempo Palmero para macOS — gemelo 3D con Unreal Engine 5

> ## ⛔ DOCUMENTO OBSOLETO — no se sigue
>
> **Este plan no se ejecutó y su enfoque quedó descartado.** No hay versión de
> escritorio en este repositorio ni se ejecuta el core dentro de QuickJS: el
> andamiaje `desktop/` que este documento describe salió de aquí el 18 de agosto
> de 2026, junto con dos scripts de `package.json` que invocaban ficheros
> inexistentes. Tiempo Palmero es la aplicación web y el sitio, y nada más.
>
> Se conserva porque es un registro fechado de una decisión y de por qué se
> abandonó, no porque describa nada de lo que hay hoy.

- **Fecha**: 2026-08-16
- **Estado**: aprobado
- **Alcance**: app macOS (solo Apple Silicon) en el Mac App Store, construida con
  Unreal Engine 5.8, que replica la versión web con un gemelo digital 3D de La
  Palma renderizado por GPU (Lumen/Nanite) y pilotado por los mismos datos del
  Cabildo que ya mueven la web.

## Objetivo

Una versión de escritorio de Tiempo Palmero que nadie ha hecho todavía: el
primer gemelo digital meteorológico de La Palma sobre Unreal Engine 5. El mapa
plano de la web se convierte en una escena 3D viva — terreno real desde el DEM,
ortofoto drapeada, luz de Lumen, nubes volumétricas a su cota real, cortinas de
lluvia donde las estaciones llueven, mar con ola real, viento que canaliza por
los valles — **sin reescribir el motor**: el core TypeScript (`src/lib`) sigue
siendo la única fuente de verdad meteorológica y se ejecuta tal cual dentro de
la app.

## Contexto

- La web (`app.tiempopalmero.com`) es React + MapLibre GL con capas shader
  propias (sol, nubes, lluvia, terreno, mar, viento, vapor, sombras) y un motor
  de interpolación en `src/lib/interpolate.ts` (1.205 líneas).
- El escritorio será la segunda superficie que consuma ese core, y por tanto la
  única que puede romperse si el núcleo importa `maplibre-gl` en tiempo de
  ejecución. Lo vigila `mapStyle.portable.test.ts`.
- Reglas del repo (CLAUDE.md): todo cambio termina en producción, un archivo una
  responsabilidad, los umbrales se miden y no se relajan, las cifras en texto se
  verifican.

## Decisiones tomadas (con el usuario, 2026-08-16)

| Decisión | Elección | Por qué |
|---|---|---|
| Motor 3D | **Unreal Engine 5.8** | Máxima calidad visual en macOS (Lumen GI, Nanite, Niagara, nubes volumétricas). Gratis: proyecto libre, no comercial, open source. No reinventa la rueda. |
| Motore dati | **Core TS reusado, sin cambios** | `src/lib` se empaqueta con esbuild en un único bundle y se ejecuta dentro de la app. Los umbrales no se tocan: es el mismo archivo. |
| Puente JS | **QuickJS** (MIT, un archivo C) | JavaScriptCore solo existe en macOS; QuickJS permite el mismo código en Windows más adelante. Si un cálculo de rejilla fuera lento, se puede cambiar a JSC nativo detrás de la misma interfaz. |
| Cartografía V1 | **Todo desde el principio**: terreno DEM 3D + ortofoto + cartografía topo (calles, topónimos, curvas de nivel) | El usuario quiere la vista topo de la web en 3D desde la V1. |
| Scope V1 | Todo el perímetro de la web (sidebar completa, panel de punto, historias, guaguas, CO₂, webcams, contadores, fuego) | Replica 1:1 de la web. |
| Plataforma | Solo Apple Silicon (arm64), macOS mínimo 14.5 | Basado en los requisitos oficiales de UE 5.8 (Sonoma 14.5+). El equipo es un Mac M2: Nanite (beta en M2+) y Lumen software tracing funcionan. |
| UI | UMG replicando la sidebar/paneles de la web (misma paleta, mismas fuentes Barlow e IBM Plex Mono) | «Replicar la web idéntica» fue requisito del usuario. |
| Web | **No cambia**: UE5 no tiene target web; la web sigue con React+MapLibre+WebGL2 | UE4 tuvo HTML5 experimental; UE5 lo eliminó. |
| Windows | Mismo proyecto UE, fase posterior (QuickJS lo hace portátil) | El usuario preguntó; queda fuera de la V1 pero el diseño no lo bloquea. |
| Instalación | UE 5.8 vía Epic Games Launcher (binario), Xcode 27.0 ya instalado | Fase F0. Cuenta Apple Developer Program la abre el usuario ($99/año). |
| Bundle ID | `com.andreapiani.tiempopalmero` (igual que iOS) | Permite compra universal macOS+iOS si algún día interesa. |
| Licencia | Apache-2.0 (nuestro código y proyecto UE). El motor UE no se distribuye en el repo | Práctica estándar con proyectos UE públicos. |

## Arquitectura

```
┌─ desktop/  (proyecto UE 5.8, C++) ─────────────────────────────────┐
│  TPJs    → QuickJS: ejecuta core.bundle.js (el src/lib de la web)  │
│             fetch-bridge → HTTP de UE (Cabildo, PNOA, Overpass,    │
│             Open-Meteo, GTFS, webcams)                             │
│  TPGeo   → lat/lon→mundo (plano tangente local, centro de la isla) │
│             malla de terreno desde el DEM, tiles orto/topo como    │
│             texturas, calles como splines drapeadas, topónimos,    │
│             curvas de nivel desde el DEM                           │
│  TPAtmo  → sol (DirectionalLight + SkyAtmosphere pilotados por     │
│             sun.ts y el arco de la trayectoria solar en 3D), nubes │
│             volumétricas a su piso real, lluvia Niagara solo donde │
│             llueve, mar (single-layer water con ola/marea reales), │
│             viento Niagara desde el campo interpolado, calima      │
│             (scattering teñido por los datos de polvo)             │
│  TPUI    → UMG: réplica 1:1 de la sidebar (secciones, buscador de  │
│             topónimos, selector de variables, capas, estado del    │
│             modelo), panel de punto, historias, gráficas           │
│  TPApp   → orquestación, ajustes (en el contenedor sandbox),       │
│             ciclo de vida                                           │
└─────────────────────────────────────────────────────────────────────┘
         ▲ protocolo JSON (mismos fixtures que la web, mismos tests)
         │
  src/lib ──esbuild──► desktop/Content/Core/core.bundle.js  (ÚNICO motor)
```

Reglas de los módulos: cada uno de `desktop/Source/*` hace una sola cosa
(CLAUDE.md), se comunica por interfaces definidas (mensajes JSON con el core,
interfaces C++ entre módulos) y se prueba aislado.

## Flujo de datos

1. Arranque: `TPApp` arranca QuickJS y carga `core.bundle.js`, inyectando
   `fetch` como puente hacia el módulo HTTP de UE (requisito sandbox:
   `com.apple.security.network.client`).
2. El core pide estaciones (API del Cabildo), interpola los campos activos
   (temperatura, viento, lluvia, nubosidad por pisos…) y devuelve JSON.
3. `TPGeo` construye la escena: malla del DEM, ortofoto/topo, calles,
   topónimos. `TPAtmo` consume los campos: sol, nubes, lluvia, mar, viento.
4. Clic sobre el terreno → el core calcula el tiempo del punto → `TPUI` muestra
   el panel. Las gráficas de historia usan las mismas series que la web.
5. Los datos se refrescan con el mismo calendario de la web (mismo core, misma
   cadencia, mismas fuentes).

## Hechos verificados (fuente: documentación oficial de Epic, 2026-08-16)

- UE 5.8 requiere macOS Sonoma 14.5+ para correr el motor y Xcode 26.0+ para
  desarrollo; Xcode 26.4 es incompatible (equipo local: macOS 27.0, Xcode
  27.0, Mac M2, 338 GB libres).
- En Apple Silicon: Lumen **software** ray tracing soportado (M1+); Lumen
  hardware RT y MegaLights **no** soportados en macOS; Nanite soportado en
  M2+ (beta).
- UE 5.8 se distribuye como binario universal para macOS vía Epic Games
  Launcher.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **UE + Mac App Store sandbox** (config/logs fuera del contenedor, entitlements): el riesgo n.º 1 | Fase F1 (spike) antes de escribir el grueso: proyecto vacío → build CLI → sandbox → notarizar → instalar y arrancar. La doc oficial de Epic sobre distribución MAS se verifica en ese spike. |
| Rendimiento del motor en QuickJS (rejilla grande) | Los cálculos son bajo demanda; caché + warm-up. Plan B: JavaScriptCore nativo en macOS detrás de la misma interfaz (Windows sigue con QuickJS). |
| UI web → UMG idéntica es mucho trabajo manual | Sistema de estilo (paleta, fuentes, espaciados) como widgets base; portar por secciones con comparación lado a lado (F5). |
| Primer build de UE muy lento | Un solo build completo en la puerta de producción; compilación incremental día a día. |
| Nanite beta en M2 | Si da problemas: mesh estática clásica + LOD; Lumen no depende de Nanite. |
| Xcode 27.0 local es más nuevo que la gama probada por Epic (26.x; la 26.4 es incompatible) | Se verifica en F0/F1 con el build de prueba; si UE 5.8 lo rechaza, se instala la Xcode recomendada (26.1.1) con la herramienta `xcodes` en paralelo. |
| Deriva entre web y desktop | El core es el mismo archivo; los tests de paridad usan los mismos `__fixtures__`; la puerta de producción incluye las tres superficies. |

## Fases

| Fase | Contenido | Prova de que está hecho |
|---|---|---|
| **F0** | Instalar UE 5.8 (Epic Launcher, login del usuario), abrir cuenta Apple Developer ($99/año, la abre el usuario), certificados, variables de entorno | `ue5` responde; certificado de desarrollo creado |
| **F1** | Spike: proyecto UE vacío → `RunUAT BuildCookRun` (arm64-only) → entitlements sandbox → codesign → `notarytool` + staple → la app arranca en este Mac. Verificar doc Epic de distribución MAS | App instalada y abierta desde /Applications |
| **F2** | Bundle TS core con esbuild (`core.bundle.js`), módulo `TPJs` (QuickJS + fetch-bridge), smoke test de interpolación contra fixture | Mismo resultado que `src/lib` en vitest, ejecutado dentro de UE |
| **F3** | `TPGeo`: plano tangente, malla DEM, tiles ortofoto/topo, calles, topónimos, curvas | La isla en 3D comparada lado a lado con la vista satélite de la web |
| **F4** | `TPAtmo`: sol + arco solar, nubes volumétricas por pisos, lluvia, mar, viento, calima | Escena viva pilotada por fixtures reales (incluida la calima del 13-ago-2026) |
| **F5** | `TPUI`: sidebar completa, panel de punto, historias, gráficas | Screenshot lado a lado con la web |
| **F6** | Capas de datos: estaciones, CO₂, webcams, guaguas, contadores, fuego | Todas las secciones de la web funcionando en la app |
| **F7** | i18n, ajustes, pulido, subida al Mac App Store (App Store Connect API vía JWT), README/CLAUDE.md actualizados | Tiempo Palmero en vivo en el Mac App Store |

## Pruebas y puerta de producción

- **Core TS**: los tests vitest existentes no cambian. El bundle se genera con
  el mismo código que testean.
- **C++/UE**: UE Automation Tests por CLI (`UnrealEditor-Cmd -ExecCmds=Automation
  RunTests`), contra los mismos `__fixtures__` de la web.
- **Puerta de producción ampliada**: `npm test && npm run build` +
  `(cd mobile && npm run typecheck)` + `desktop/scripts/verify.sh` (build UE +
  tests de automatización). Commit → push a `main` → despliegue web (vercel) +
  subida MAS cuando toque. Los umbrales del motor no se relajan: no hay nada
  que relajar porque el motor es el mismo archivo.

## Fuera de alcance (V1)

- Windows (el diseño no lo bloquea: QuickJS + UE son portátiles).
- Compra universal macOS+iOS (el bundle ID lo permite, no lo promete).
- Realidad aumentada, widgets, notificaciones push.
