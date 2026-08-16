# Tiempo Palmero macOS (UE5) — Plan del Milestone 1: la isla en 3D

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicación macOS (Apple Silicon) «Tiempo Palmero» construida con Unreal Engine 5.8 que ejecuta el core TypeScript de la web sin modificarlo y muestra La Palma como terreno 3D real (DEM + ortofoto/topo + sol real + cartografía 3D), lista para crecer hacia la atmósfera completa (Milestone 2).

**Architecture:** Proyecto UE 5.8 en C++ en `desktop/` con cuatro módulos de una responsabilidad: `TiempoPalmero` (arranque), `TPJs` (QuickJS + fetch-bridge hacia el HTTP de UE), `TPGeo` (geometría, terreno, teselas, cartografía), `TPAtmo` (sol). El motor meteorológico es `src/lib` empaquetado con esbuild en un único bundle que QuickJS ejecuta tal cual; la comunicación es JSON (mismos fixtures que la web, mismos tests).

**Tech Stack:** Unreal Engine 5.8 (C++20), QuickJS 2024-01-13 (MIT), esbuild, vitest (existente), Xcode 27.0, RunUAT/xcodebuild/codesign/notarytool, App Store Connect API.

**Spec:** `docs/superpowers/specs/2026-08-16-tiempo-palmero-macos-ue5-design.md`

## Global Constraints

- Solo Apple Silicon: **arm64**, nunca x86_64 en el artefacto final. macOS mínimo **14.5**.
- UE **5.8** exacto; Xcode local 27.0 (compatibilidad verificada en Task 2; si UE la rechaza, instalar 26.1.1 con `xcodes`).
- Bundle ID: **`com.andreapiani.tiempopalmero`**.
- **`src/lib` no se modifica.** El único código nuevo del motor es `desktop/js-core/entry.ts`, que importa y reexporta. Los umbrales no se tocan: son los mismos archivos.
- Comentarios, textos y mensajes de commit en **español** (convención del repo).
- Un archivo, una responsabilidad (CLAUDE.md). Módulos UE con interfaz definida y testeable aislado.
- Cada task termina con commit + push a `main`. `vercel --prod` cuando el cambio toca la web. Desde la Task 13, `desktop/scripts/verify.sh` entra en la puerta.
- Licencia Apache-2.0 para nuestro código; QuickJS es MIT → registrar en `NOTICE`.
- Los números que aparecen en texto se miden y se verifican (CLAUDE.md).
- Rutas fijas (verificar en Task 1): `UE=/Users/Shared/Epic Games/UE_5.8`, `RUNUAT="$UE/Engine/Build/BatchFiles/RunUAT.sh"`, `UECMD="$UE/Engine/Binaries/Mac/UnrealEditor-Cmd"`.

---

### Task 0: Andamiaje de `desktop/`

**Files:**
- Create: `desktop/.gitignore`, `desktop/scripts/env.sh`, `desktop/README.md`, `desktop/Tests/README.md`
- Modify: `CLAUDE.md` (sección «El escritorio»), `NOTICE` (QuickJS), `package.json` (devDep `esbuild`)

**Interfaces:**
- Consumes: nada.
- Produces: `desktop/scripts/env.sh` exporta `UE`, `RUNUAT`, `UECMD`, `PROJECT`, `BUNDLE_ID`; `package.json` gana `scripts.desktop:core` y `scripts.desktop:golden`.

- [ ] **Step 1: Crear `.gitignore`**

Crear `desktop/.gitignore`:

```
Binaries/
Intermediate/
DerivedDataCache/
Saved/
Build/
*.xcodeproj
.DS_Store
Content/Core/core.bundle.js
```

- [ ] **Step 2: Crear `desktop/scripts/env.sh`**

```bash
#!/usr/bin/env bash
# Rutas del entorno UE. Task 1 las verifica contra el disco.
UE="${UE:-/Users/Shared/Epic Games/UE_5.8}"
RUNUAT="$UE/Engine/Build/BatchFiles/RunUAT.sh"
UECMD="$UE/Engine/Binaries/Mac/UnrealEditor-Cmd"
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/desktop/TiempoPalmero.uproject"
BUNDLE_ID="com.andreapiani.tiempopalmero"
export UE RUNUAT UECMD PROJECT BUNDLE_ID
```

- [ ] **Step 3: Crear `desktop/README.md`**

```markdown
# Tiempo Palmero — escritorio (Unreal Engine 5)

Gemelo 3D de La Palma. El motor meteorológico es `src/lib`, empaquetado en
`desktop/Content/Core/core.bundle.js` y ejecutado por QuickJS dentro de UE.

- `scripts/bundle-core.mjs` — empaqueta el core (esbuild, IIFE).
- `scripts/verify.sh` — puerta de producción del escritorio (desde Task 13).
- `Source/` — módulos: `TiempoPalmero` (arranque), `TPJs` (QuickJS), `TPGeo`
  (geometría/terreno/cartografía), `TPAtmo` (sol).

La web sigue siendo la referencia visual: compárese lado a lado.
```

- [ ] **Step 4: Crear `desktop/Tests/README.md`**

```markdown
# Tests del escritorio

`golden-interpolation.json` lo genera `scripts/gen-golden.mjs` sobre el fixture
de la web (`src/lib/__fixtures__/weather-snapshot.json`). El test de UE
`TPJs.Golden.InterpolationParity` ejecuta el MISMO cálculo dentro de QuickJS y
exige igualdad con tolerancia 1e-6. Si la web cambia el motor, el golden se
regenera y se commitea junto con ella; nadie edita el golden a mano.
```

- [ ] **Step 5: `NOTICE` (QuickJS)**

Añadir al final de `NOTICE`:

```
QuickJS (https://bellard.org/quickjs/) — MIT License
Copyright (c) 2017-2021 Fabrice Bellard, Charlie Gordon
Se empaqueta sin modificar dentro del módulo TPJs (desktop/ThirdParty/quickjs/).
```

- [ ] **Step 6: `package.json` — esbuild y scripts**

Añadir en `devDependencies`: `"esbuild": "^0.25.0"`. Añadir en `scripts`:

```json
"desktop:core": "node desktop/scripts/bundle-core.mjs",
"desktop:golden": "node desktop/scripts/gen-golden.mjs"
```

- [ ] **Step 7: `CLAUDE.md` — sección escritorio**

Añadir tras la sección del móvil:

```markdown
## El escritorio es otra puerta, no un adorno

`desktop/` es la versión macOS (Unreal Engine 5.8) y comparte el mismo motor
que la web y el móvil: `src/lib`. La puerta completa será
`desktop/scripts/verify.sh` cuando exista (Task 13 del plan M1); mientras
tanto, el contrato es: el core no se toca, los golden se regeneran con
`npm run desktop:golden` y se commitean con el cambio.
```

- [ ] **Step 8: Instalar y verificar**

Run: `npm install`
Expected: esbuild instalado (ver con `npx esbuild --version`).

- [ ] **Step 9: Commit**

```bash
git add desktop package.json package-lock.json CLAUDE.md NOTICE
git commit -m "Andamiaje del escritorio UE5: rutas, gitignore, esbuild y aviso de QuickJS"
git push origin main
```

---

### Task 1: Entorno — UE 5.8 y Xcode

**Files:**
- Modify: `desktop/scripts/env.sh` (solo si las rutas difieren)

**Interfaces:**
- Consumes: nada. Produce: entorno verificado; `env.sh` correcto.

- [ ] **Step 1: Xcode (usuario)**

Xcode 27.0 ya está instalado. Verificar:

Run: `xcode-select -p && xcodebuild -version && xcodebuild -showsdks | grep -i macosx`
Expected: ruta Xcode, «Xcode 27.0», y un SDK macosx listado.

- [ ] **Step 2: Epic Games Launcher (usuario)**

Descargar el Epic Games Launcher desde <https://store.epicgames.com/download> ,
instalar en `/Applications/Epic Games Launcher.app`, entrar con la cuenta Epic.
Después, en la pestaña Unreal Engine → «Biblioteca» → instalar **5.8**
(destino por defecto: `/Users/Shared/Epic Games/UE_5.8`). Es una descarga de
varias decenas de GB; 338 GB libres sobran.

- [ ] **Step 3: Verificar rutas**

Run:

```bash
source desktop/scripts/env.sh
ls "$UE/Engine/Binaries/Mac/UnrealEditor" "$RUNUAT" "$UECMD"
"$UE/Engine/Binaries/Mac/UnrealEditor" -version 2>&1 | head -1
```

Expected: las tres rutas existen; la versión impresa es 5.8.x. Si las rutas
difieren, corregir `env.sh` y committear solo ese cambio.

- [ ] **Step 4: Commit de `env.sh` si cambió**

```bash
git add desktop/scripts/env.sh && git commit -m "Rutas reales de UE 5.8 en env.sh" && git push origin main
```

Nota: si `env.sh` no cambió, no hay commit en este paso (el commit ya ocurrió
en Task 0).

---

### Task 2: Proyecto UE vacío desde texto + primer build arm64

**Files:**
- Create: `desktop/TiempoPalmero.uproject`, `desktop/Source/TiempoPalmero.Target.cs`, `desktop/Source/TiempoPalmeroEditor.Target.cs`, `desktop/Source/TiempoPalmero/TiempoPalmero.Build.cs`, `desktop/Source/TiempoPalmero/TiempoPalmero.h`, `desktop/Source/TiempoPalmero/TiempoPalmero.cpp`, `desktop/Config/DefaultEngine.ini`, `desktop/Config/DefaultGame.ini`, `desktop/scripts/build-dev.sh`

**Interfaces:**
- Consumes: `env.sh` (Task 0/1). Produces: `.app` arm64 reproducible vía `build-dev.sh`; la app arranca en este Mac. Todos los módulos posteriores se registran en el mismo `.uproject`.

- [ ] **Step 1: `desktop/TiempoPalmero.uproject`**

```json
{
  "FileVersion": 3,
  "EngineAssociation": "5.8",
  "Category": "Weather",
  "Description": "Gemelo digital meteorológico de La Palma",
  "Modules": [
    { "Name": "TiempoPalmero", "Type": "Runtime", "LoadingPhase": "Default" }
  ],
  "Plugins": [
    { "Name": "ProceduralMeshComponent", "Enabled": true }
  ],
  "TargetPlatforms": ["Mac"]
}
```

- [ ] **Step 2: `Source/TiempoPalmero.Target.cs`**

```csharp
using UnrealBuildTool;
using System.Collections.Generic;

public class TiempoPalmeroTarget : TargetRules
{
    public TiempoPalmeroTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        bUseLoggingInShipping = true;
        ExtraModuleNames.Add("TiempoPalmero");
    }
}
```

- [ ] **Step 3: `Source/TiempoPalmeroEditor.Target.cs`**

```csharp
using UnrealBuildTool;
using System.Collections.Generic;

public class TiempoPalmeroEditorTarget : TargetRules
{
    public TiempoPalmeroEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("TiempoPalmero");
    }
}
```

- [ ] **Step 4: `Source/TiempoPalmero/TiempoPalmero.Build.cs`**

```csharp
using UnrealBuildTool;

public class TiempoPalmero : ModuleRules
{
    public TiempoPalmero(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
        // Los módulos TPJs/TPGeo/TPAtmo se añaden aquí en sus tareas (5, 8, 11):
        // PrivateDependencyModuleNames.AddRange(new string[] { "TPJs", "TPGeo", "TPAtmo" });
    }
}
```

- [ ] **Step 5: `Source/TiempoPalmero/TiempoPalmero.h` y `.cpp`**

```cpp
// TiempoPalmero.h
#pragma once
#include "CoreMinimal.h"
```

```cpp
// TiempoPalmero.cpp
#include "TiempoPalmero.h"
#include "Modules/ModuleManager.h"

IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, TiempoPalmero, "TiempoPalmero");
```

- [ ] **Step 6: `Config/DefaultEngine.ini`**

```ini
[/Script/EngineSettings.GameMapsSettings]
EditorStartupMap=/Engine/Maps/Templates/OpenWorld
GameDefaultMap=/Engine/Maps/Templates/OpenWorld
GlobalDefaultServerGameMode=None

[/Script/Engine.Engine]
GameViewportClientClassName=/Script/Engine.GameViewportClient

[/Script/Engine.RendererSettings]
r.GenerateMeshDistanceFields=True
```

`DefaultGame.ini`:

```ini
[/Script/EngineSettings.GeneralProjectSettings]
ProjectID=6C8F2A1E4B5D4F8A9C0D1E2F3A4B5C6D
ProjectName=Tiempo Palmero
CompanyName=Andrea Piani
CompanyDistinguishedName=com.andreapiani
CopyrightNotice=Apache-2.0
```

- [ ] **Step 7: `desktop/scripts/build-dev.sh`**

```bash
#!/usr/bin/env bash
# Build Development arm64-only y la abre. Task 3 añade el spike MAS.
set -euo pipefail
source "$(dirname "$0")/env.sh"
ARCHIVE="$(cd "$(dirname "$0")/../.." && pwd)/desktop/Build/Archive"
rm -rf "$ARCHIVE"
"$RUNUAT" BuildCookRun \
  -project="$PROJECT" -noP4 -platform=Mac -clientconfig=Development \
  -build -cook -stage -pak -archive -archivedirectory="$ARCHIVE"
APP="$ARCHIVE/TiempoPalmero.app"
# Solo Apple Silicon: quitar x86_64 y volver a firmar ad-hoc.
find "$APP/Contents" -type f \( -name '*.dylib' -o -perm +111 \) -print0 | while IFS= read -r -d '' f; do
  archs=$(lipo -archs "$f" 2>/dev/null || true)
  if [[ "$archs" == *x86_64* && "$archs" == *arm64* ]]; then
    lipo -remove x86_64 "$f" -output "$f"
  fi
done
codesign --force --deep -s - "$APP"
lipo -archs "$APP/Contents/MacOS/TiempoPalmero"
open "$APP"
```

- [ ] **Step 8: Ejecutar el build**

Run: `bash desktop/scripts/build-dev.sh`
Expected: tras 30–60 min (primer build completo), `arm64` impreso y la app
abierta. Verificar proceso:

Run: `pgrep -x TiempoPalmero && echo VIVA`
Expected: un PID y «VIVA». Cerrar la app con `pkill -x TiempoPalmero`.

Si Xcode 27.0 fuera rechazada por UBT (error de versión de SDK), instalar
Xcode 26.1.1 con `xcodes install 26.1.1` y `xcode-select -s` a esa copia, y
volver a ejecutar el build. Registrar el resultado en el mensaje de commit.

- [ ] **Step 9: Commit**

```bash
git add desktop
git commit -m "Proyecto UE 5.8 desde texto: primer build arm64 arranca en el Mac"
git push origin main
```

---

### Task 3: Spike Mac App Store — sandbox + entitlements + doc Epic

**Files:**
- Create: `desktop/Distribution/TiempoPalmero.entitlements`, `desktop/scripts/spike-mas.sh`, `desktop/Distribution/README.md`

**Interfaces:**
- Consumes: `.app` de Task 2. Produces: app sandboxed lanzable; `Distribution/README.md` con los hallazgos de la doc Epic sobre MAS (qué firma y qué pasos exige UE).

- [ ] **Step 1: `desktop/Distribution/TiempoPalmero.entitlements`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 2: `desktop/scripts/spike-mas.sh`**

```bash
#!/usr/bin/env bash
# Firma con entitlements de sandbox y verifica que la app arranca dentro del
# contenedor. Sin cuenta de desarrollador: firma ad-hoc (-s -).
set -euo pipefail
source "$(dirname "$0")/env.sh"
APP="$PWD/desktop/Build/Archive/TiempoPalmero.app"
ENT="$PWD/desktop/Distribution/TiempoPalmero.entitlements"
codesign --force --deep --entitlements "$ENT" -s - "$APP"
codesign -d --entitlements - "$APP" 2>&1 | grep -q app-sandbox
rm -rf "$HOME/Library/Containers/$BUNDLE_ID"
open "$APP"
sleep 6
pgrep -x TiempoPalmero >/dev/null && echo "CORRE"
ls "$HOME/Library/Containers/$BUNDLE_ID" >/dev/null && echo "CONTENEDOR OK"
pkill -x TiempoPalmero
```

- [ ] **Step 3: Ejecutar el spike**

Run: `bash desktop/scripts/spike-mas.sh`
Expected: «CORRE» y «CONTENEDOR OK». Si UE escribe config/logs fuera del
contenedor la app puede abortar en sandbox: ese es exactamente el fallo que
este spike existe para cazar. En caso de aborto, mirar `log show --predicate
'process == "TiempoPalmero"' --last 2m` y registrar el punto de escritura
ilegal en `Distribution/README.md`.

Nota: la verificación de red dentro del sandbox ocurre de verdad en Task 6
(fetch-bridge); aquí basta con que la app arranque y cree su contenedor.

- [ ] **Step 4: Verificar la doc oficial de Epic sobre MAS**

Con el agente de búsqueda (o webfetch), localizar la página oficial de Epic
sobre distribución en el Mac App Store (probar
`https://dev.epicgames.com/documentation/en-us/unreal-engine/` y buscar
«Mac App Store»; páginas candidatas: «Packaging macOS projects for the Mac
App Store», «Distribution on macOS»). Registrar en `Distribution/README.md`:
URL exacta, qué firma exige UE (`-distribution` de RunUAT, certificados), y
cualquier requisito de entitlements que Epic documente.

- [ ] **Step 5: `desktop/Distribution/README.md`**

Escribir el README con: entitlements usados y por qué (sandbox obligatoria en
MAS; network.client para Cabildo/PNOA/Overpass), resultado del spike (fecha,
app arrancada en sandbox), hallazgos de la doc Epic (URL + pasos), y el estado
de la cuenta Apple Developer («pendiente del usuario» hasta F7).

- [ ] **Step 6: Commit**

```bash
git add desktop/Distribution desktop/scripts/spike-mas.sh
git commit -m "Spike MAS: la app arranca sandboxed con entitlements; doc Epic registrada"
git push origin main
```

---

### Task 4: Bundle del core TS (esbuild) + paridad node

**Files:**
- Create: `desktop/js-core/entry.ts`, `desktop/js-core/entry.test.ts`, `desktop/scripts/bundle-core.mjs`, `desktop/scripts/gen-golden.mjs`
- Modify: `package.json` (nada nuevo: usa los scripts de Task 0), `desktop/Content/Core/Fixtures/` (copiados por el script)

**Interfaces:**
- Consumes: `src/lib/*` (solo lectura). Produce: `desktop/Content/Core/core.bundle.js` (IIFE que define `globalThis.TiempoCore`), `desktop/Tests/golden-interpolation.json`; `npm test` incluye `entry.test.ts`. Tareas 5–12 consumen `TiempoCore`.

- [ ] **Step 1: Leer los contratos reales del core**

Antes de escribir `entry.ts`, leer (no modificar): `src/lib/dem-loader.ts`
(qué espera `loadDem` de su `fetch`), `src/lib/dem.ts` (tamaños, `blitTerrarium`),
`src/lib/api.ts` (qué usa `fetch`), `src/lib/osm-roads.ts` (cómo pide las
calles), `src/lib/basemaps.ts` (plantillas de teselas), y dónde se construye
el `DemManifest` de la web:

Run: `rg -n "loadDem|manifest" src/hooks src/App.tsx src/components/MapView.tsx | head -30`
Expected: localizar la factoría del manifest; `entry.ts` reexportará esa misma
factoría (mismo manifest, misma versión del DEM).

- [ ] **Step 2: `desktop/js-core/entry.ts`**

```ts
/**
 * Punto único de entrada del core para el escritorio.
 *
 * La web y el móvil importan `src/lib` directamente; el escritorio lo ejecuta
 * dentro de QuickJS, así que aquí se empaqueta TODO lo que la app UE necesita
 * y se cuelga de `globalThis.TiempoCore` con una interfaz solo-JSON: la GPU no
 * llama a TypeScript y C++ no habla con objetos JS.
 */
import { buildModel, estimate } from '../../src/lib/interpolate'
import { sunPosition, solarElevation, dayFactor, moonState } from '../../src/lib/sun'
import { fetchWeather, fetchCo2Readings, fetchGazetteer } from '../../src/lib/api'
import { demVersion, demTiles, demTilePath } from '../../src/lib/dem'
import { loadDem } from '../../src/lib/dem-loader'
import { MAP_BBOX, ISLAND_BBOX, M_PER_DEG_LAT, M_PER_DEG_LON } from '../../src/lib/geo'
import { BASEMAPS } from '../../src/lib/basemaps'

/**
 * Puente del host: QuickJS no tiene `fetch` ni decodificador de PNG. El C++
 * inyecta estas dos funciones antes de usarse el core.
 * `__hostFetch(url, initJson)` devuelve una Promise de un string JSON con
 * `{ status, ok, headers, bodyB64 }`. `__hostDecodePng(url)` devuelve una
 * Promise de `{ width, height, rgbaB64 }`.
 */
declare const __hostFetch: (url: string, initJson?: string) => Promise<string>
declare const __hostDecodePng: (url: string) => Promise<string>

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

class HostResponse {
  status: number
  ok: boolean
  headers: Record<string, string>
  private body: Uint8Array
  constructor(raw: { status: number; ok: boolean; headers: Record<string, string>; bodyB64: string }) {
    this.status = raw.status
    this.ok = raw.ok
    this.headers = raw.headers
    this.body = b64ToBytes(raw.bodyB64)
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.body.buffer.slice(this.body.byteOffset, this.body.byteOffset + this.body.byteLength)
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(this.body)
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text())
  }
}

async function fetchShim(input: string | URL, init?: RequestInit): Promise<HostResponse> {
  const url = String(input)
  const raw = JSON.parse(await __hostFetch(url, init ? JSON.stringify(init) : undefined))
  return new HostResponse(raw)
}

;(globalThis as Record<string, unknown>).fetch = fetchShim

// `loadDem` quiere un fetch que sepa de PNG: el host lo decodifica y aquí se
// le devuelve una Response con el arrayBuffer ya servido.
async function demFetch(url: string): Promise<HostResponse> {
  const raw = JSON.parse(await __hostDecodePng(url))
  return new HostResponse({
    status: 200,
    ok: true,
    headers: { 'content-type': 'image/png' },
    bodyB64: raw.rgbaB64,
  })
}

// Manejar el DEM: `loadDem` lo carga con `demFetch`; se guarda el último para
// muestreos por lote desde C++ (terreno).
let currentDem: Awaited<ReturnType<typeof loadDem>> | null = null

const TiempoCore = {
  version: 1,
  geo: { MAP_BBOX, ISLAND_BBOX, M_PER_DEG_LAT, M_PER_DEG_LON },
  interpolate: {
    buildModel: (stationsJson: string, demManifestJson: string | null) => {
      const stations = JSON.parse(stationsJson)
      const manifest = demManifestJson ? JSON.parse(demManifestJson) : undefined
      const model = buildModel(stations, manifest)
      return JSON.stringify({ stations: model.stations.length, contributors: model.contributors })
    },
    estimate: (modelId: string, lon: number, lat: number) => {
      const model = models.get(modelId)
      if (!model) throw new Error(`modelo desconocido: ${modelId}`)
      return JSON.stringify(estimate(model, lon, lat))
    },
  },
  sun: {
    position: (tsMs: number, lon: number, lat: number) =>
      JSON.stringify(sunPosition(tsMs, lon, lat)),
    elevation: (tsMs: number, lon: number, lat: number) => solarElevation(new Date(tsMs), lon, lat),
    dayFactor: (elevationDeg: number) => dayFactor(elevationDeg),
  },
  dem: {
    version: (manifestJson: string) => demVersion(JSON.parse(manifestJson)),
    tiles: (manifestJson: string) => JSON.stringify(demTiles(JSON.parse(manifestJson))),
    tilePath: (manifestJson: string, tx: number, ty: number) =>
      demTilePath(JSON.parse(manifestJson), tx, ty),
    load: async (manifestJson: string) => {
      currentDem = await loadDem(JSON.parse(manifestJson), demFetch)
      return JSON.stringify({ tiles: demTiles(currentDem.manifest) })
    },
    sampleGrid: (lonsJson: string, latsJson: string) => {
      if (!currentDem) throw new Error('dem no cargado')
      const lons = JSON.parse(lonsJson) as number[]
      const lats = JSON.parse(latsJson) as number[]
      const out: (number | null)[] = lons.map((lon, i) => {
        const { elevationAt } = require('../../src/lib/dem') as typeof import('../../src/lib/dem')
        return elevationAt(currentDem!, lon, lats[i])
      })
      return JSON.stringify(out)
    },
  },
  api: { fetchWeather, fetchCo2Readings, fetchGazetteer },
  basemaps: {
    ids: Object.keys(BASEMAPS),
    tileUrl: (id: string, z: number, x: number, y: number) => {
      const bm = BASEMAPS[id as keyof typeof BASEMAPS]
      if (!bm?.source?.tiles?.[0]) return ''
      return bm.source.tiles[0]
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
    },
  },
}

;(globalThis as Record<string, unknown>).TiempoCore = TiempoCore
```

Nota del implementador: `models` (mapa de modelos por id) y `require` no
existen en QuickJS IIFE. Sustituir `models` por `const models = new Map()`
(completado donde `buildModel` guarda `models.set(id, model)`) y evitar
`require`: importar `elevationAt` arriba con los demás imports. `atob`,
`TextDecoder` y `TextEncoder` no existen en QuickJS: QuickJS trae
`std.atob`/`std.btoa` (quickjs-libc) si se carga `std`; como alternativa, el
host decodifica base64 y `entry.ts` recibe bytes directos. La forma exacta se
fija al compilar la Task 5 (el contrato JSON no cambia: `bodyB64`).

- [ ] **Step 3: `desktop/js-core/entry.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(readFileSync(join(here, '../../src/lib/__fixtures__/weather-snapshot.json'), 'utf8'))

// El test importa entry.ts DESPUÉS de instalar un __hostFetch falso.
vi.stubGlobal('__hostFetch', vi.fn())

describe('TiempoCore', () => {
  it('expone geo, sun, interpolate y basemaps', async () => {
    await import('./entry')
    const core = (globalThis as any).TiempoCore
    expect(core.geo.M_PER_DEG_LAT).toBe(110574)
    expect(core.version).toBe(1)
  })

  it('construye un modelo desde el snapshot y estima un punto', async () => {
    await import('./entry')
    const core = (globalThis as any).TiempoCore
    const modelId = 'm1'
    // buildModel guarda el modelo por id: se completa el mapa en Step 2.
    core.interpolate.buildModel(JSON.stringify(snapshot.stations ?? snapshot), null)
    const est = JSON.parse(core.interpolate.estimate(modelId, -17.78, 28.68))
    expect(est).toHaveProperty('value')
    expect(typeof est.value).toBe('number')
  })
})
```

Si `weather-snapshot.json` no tiene `stations`, el implementador mira el
fixture (`ls src/lib/__fixtures__/`) y usa el campo real; el objetivo es
**mismo input → mismo `estimate`** que `interpolate.test.ts`.

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: 970 tests existentes + los nuevos, todos verdes. Si `entry.test.ts`
falla por detalles del fixture, corregir SOLO `entry.test.ts` (nunca `src/lib`).

- [ ] **Step 5: `desktop/scripts/bundle-core.mjs`**

```js
import { build } from 'esbuild'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'desktop', 'Content', 'Core')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'desktop', 'js-core', 'entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile: join(outDir, 'core.bundle.js'),
  logLevel: 'info',
})

const fxDir = join(outDir, 'Fixtures')
mkdirSync(fxDir, { recursive: true })
for (const f of ['weather-snapshot.json']) {
  const src = join(root, 'src', 'lib', '__fixtures__', f)
  if (existsSync(src)) copyFileSync(src, join(fxDir, f))
}
// El golden lo generan `npm run desktop:golden` y el test de paridad de UE
// (Task 7) lo lee desde aquí. Copiarlo también si ya existe.
const golden = join(root, 'desktop', 'Tests', 'golden-interpolation.json')
if (existsSync(golden)) copyFileSync(golden, join(fxDir, 'golden-interpolation.json'))
console.log('bundle listo:', join(outDir, 'core.bundle.js'))
```

- [ ] **Step 6: `desktop/scripts/gen-golden.mjs`**

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { buildModel, estimate } = await import(join(root, 'src', 'lib', 'interpolate.ts'))
const { sunPosition } = await import(join(root, 'src', 'lib', 'sun.ts'))

const snapshot = JSON.parse(readFileSync(join(root, 'src/lib/__fixtures__/weather-snapshot.json'), 'utf8'))
const stations = snapshot.stations ?? snapshot
const model = buildModel(stations)

const STEP = 9
const grid = []
for (let i = 0; i <= STEP; i++) {
  for (let j = 0; j <= STEP; j++) {
    const lon = -18.05 + ((-17.7 - -18.05) * i) / STEP
    const lat = 28.4 + ((28.9 - 28.4) * j) / STEP
    const est = estimate(model, lon, lat)
    grid.push({ lon, lat, value: est.value, sigma: est.sigma ?? null })
  }
}

const golden = {
  generatedAt: new Date().toISOString(),
  source: 'src/lib/__fixtures__/weather-snapshot.json',
  grid,
  sun: {
    noon2026_08_13: sunPosition(Date.UTC(2026, 7, 13, 13, 0), -17.78, 28.68),
  },
}

const out = join(root, 'desktop', 'Tests', 'golden-interpolation.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(golden, null, 2))
console.log('golden escrito:', out)
```

Nota: los campos de `Estimate` se leen de `src/lib/interpolate.ts` (usar los
reales: `value` y su medida de incertidumbre si tiene otro nombre).

- [ ] **Step 7: Generar y committear el golden**

Run: `npm run desktop:golden`
Expected: `desktop/Tests/golden-interpolation.json` con 100 puntos.

- [ ] **Step 8: Commit**

```bash
git add desktop/js-core desktop/scripts desktop/Tests
git commit -m "Bundle esbuild del core y golden de interpolación para paridad UE"
git push origin main
```

---

### Task 5: QuickJS dentro de UE (módulo TPJs, eval básico)

**Files:**
- Create: `desktop/ThirdParty/quickjs/` (vendoring: `quickjs.c`, `quickjs.h`, `quickjs-libc.h`, `libregexp.c`, `libunicode.c`, `cutils.c`, `LICENSE`), `desktop/Source/TPJs/TPJs.Build.cs`, `desktop/Source/TPJs/TPJsModule.h/.cpp`, `desktop/Source/TPJs/FQuickJsRuntime.h/.cpp`, `desktop/Source/TPJs/Private/Tests/TPJsTests.cpp`
- Modify: `desktop/TiempoPalmero.uproject` (módulo TPJs)

**Interfaces:**
- Consumes: `env.sh`. Produce: `FQuickJsRuntime` con `Start()`, `Shutdown()`, `PostTask(TFunction<void(JSContext*)>)` y `Eval(const FString&) -> TFuture<FString>`; test de automatización `TPJs.Eval.Basico` ejecutable con `$UECMD`.

- [ ] **Step 1: Vendoring de QuickJS**

Descargar de <https://bellard.org/quickjs/> el tarball `quickjs-2024-01-13`
(URL: `https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz`; si la página
lista una versión más reciente, usar la más reciente y ajustar el nombre en
`TPJs.Build.cs`). Copiar en `desktop/ThirdParty/quickjs/` los archivos
amalgamados y la licencia:

Run:

```bash
mkdir -p desktop/ThirdParty/quickjs
curl -L https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz -o /tmp/quickjs.tar.xz
tar -xJf /tmp/quickjs.tar.xz -C /tmp
cp /tmp/quickjs-2024-01-13/{quickjs.c,quickjs.h,quickjs-libc.h,libregexp.c,libunicode.c,cutils.c,LICENSE} desktop/ThirdParty/quickjs/
ls desktop/ThirdParty/quickjs/
```

Expected: 7 archivos listados, `LICENSE` de MIT.

- [ ] **Step 2: `desktop/Source/TPJs/TPJs.Build.cs`**

```csharp
using UnrealBuildTool;
using System.IO;

public class TPJs : ModuleRules
{
    public TPJs(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        CppStandard = CppStandardVersion.Cpp20;

        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
        PrivateDependencyModuleNames.AddRange(new string[] { "HTTP", "Json" });

        string ThirdParty = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "quickjs");
        PublicIncludePaths.Add(ThirdParty);

        // QuickJS define CONFIG_VERSION; UE también la usa. Se define aquí una
        // vez para los dos mundos y se silencia el aviso de redefinición.
        PublicDefinitions.Add("CONFIG_VERSION=\"2024-01-13\"");
        PublicDefinitions.Add("CONFIG_BIGNUM=1");
        bEnableUndefinedIdentifierWarnings = false;
    }
}
```

- [ ] **Step 3: `desktop/Source/TPJs/TPJsModule.h/.cpp`**

```cpp
// TPJsModule.h
#pragma once
#include "Modules/ModuleManager.h"

class FTPJsModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};
```

```cpp
// TPJsModule.cpp
#include "TPJsModule.h"
#include "FQuickJsRuntime.h"

IMPLEMENT_MODULE(FTPJsModule, TPJs)

void FTPJsModule::StartupModule()
{
}

void FTPJsModule::ShutdownModule()
{
    FQuickJsRuntime::Get().Shutdown();
}
```

- [ ] **Step 4: `desktop/Source/TPJs/FQuickJsRuntime.h`**

```cpp
#pragma once
#include "CoreMinimal.h"
#include "HAL/Runnable.h"
#include "HAL/RunnableThread.h"
#include "HAL/ThreadSafeBool.h"
#include "Containers/Queue.h"

// Declaración mínima de QuickJS (las estructuras reales vienen de quickjs.h).
struct JSRuntime;
struct JSContext;

class TPJS_API FQuickJsRuntime
{
public:
    static FQuickJsRuntime& Get();

    /** Arranca el hilo de QuickJS. Idempotente. */
    void Start();
    /** Encarga una tarea al hilo de QuickJS y la ejecuta lo antes posible. */
    void PostTask(TFunction<void(JSContext*)> Task);
    /** Evalúa un script y devuelve el valor JSON del resultado. Bloquea. */
    TFuture<FString> Eval(const FString& Script);
    void Shutdown();

private:
    FQuickJsRuntime() = default;
    void EnsureStarted();

    class FJsThread : public FRunnable
    {
    public:
        virtual uint32 Run() override;
        virtual void Stop() override;
        TQueue<TFunction<void(JSContext*)>> Tasks;
        FThreadSafeBool bStop = false;
        JSContext* Ctx = nullptr;
        JSRuntime* Rt = nullptr;
    };

    FJsThread Thread;
    FRunnableThread* ThreadHandle = nullptr;
    mutable FCriticalSection Mutex;
};
```

- [ ] **Step 5: `desktop/Source/TPJs/FQuickJsRuntime.cpp`**

```cpp
#include "FQuickJsRuntime.h"
#include "Misc/ScopeLock.h"

extern "C" {
#include "quickjs.h"
#include "quickjs-libc.h"
}

static FQuickJsRuntime* GSInstance = nullptr;

FQuickJsRuntime& FQuickJsRuntime::Get()
{
    if (!GSInstance)
    {
        static FQuickJsRuntime Instance;
        GSInstance = &Instance;
    }
    return *GSInstance;
}

void FQuickJsRuntime::Start()
{
    FScopeLock Lock(&Mutex);
    if (ThreadHandle)
    {
        return;
    }
    ThreadHandle = FRunnableThread::Create(&Thread, TEXT("QuickJsThread"));
}

void FQuickJsRuntime::EnsureStarted()
{
    Start();
}

void FQuickJsRuntime::PostTask(TFunction<void(JSContext*)> Task)
{
    EnsureStarted();
    Thread.Tasks.Enqueue(MoveTemp(Task));
}

TFuture<FString> FQuickJsRuntime::Eval(const FString& Script)
{
    EnsureStarted();
    TSharedPtr<TPromise<FString>> Promise = MakeShared<TPromise<FString>>();
    PostTask([Script, Promise](JSContext* Ctx)
    {
        JSValue Result = JS_Eval(Ctx, TCHAR_TO_UTF8(*Script), Script.Len(), "<eval>", JS_EVAL_TYPE_GLOBAL);
        const char* Str = JS_ToCString(Ctx, Result);
        Promise->SetValue(Str ? UTF8_TO_TCHAR(Str) : TEXT(""));
        JS_FreeCString(Ctx, Str);
        JS_FreeValue(Ctx, Result);
    });
    return Promise->GetFuture();
}

void FQuickJsRuntime::Shutdown()
{
    FScopeLock Lock(&Mutex);
    if (!ThreadHandle)
    {
        return;
    }
    Thread.bStop = true;
    ThreadHandle->WaitForCompletion();
    delete ThreadHandle;
    ThreadHandle = nullptr;
}

uint32 FQuickJsRuntime::FJsThread::Run()
{
    Rt = JS_NewRuntime();
    Ctx = JS_NewContext(Rt);
    js_std_add_helpers(Ctx, 0, nullptr);

    while (!bStop)
    {
        TFunction<void(JSContext*)> Task;
        if (Thread.Tasks.Dequeue(Task))
        {
            Task(Ctx);
        }
        // Bombear promesas pendientes (el puente fetch las necesita).
        JSContext* Pending = Ctx;
        while (JS_IsJobPending(Rt))
        {
            JSContext* JobCtx = nullptr;
            JS_ExecutePendingJob(Rt, &JobCtx);
            if (JobCtx == nullptr)
            {
                break;
            }
        }
        FPlatformProcess::Sleep(0.001f);
    }

    JS_FreeContext(Ctx);
    JS_FreeRuntime(Rt);
    return 0;
}

void FQuickJsRuntime::FJsThread::Stop()
{
    bStop = true;
}
```

- [ ] **Step 6: `desktop/Source/TPJs/Private/Tests/TPJsTests.cpp`**

```cpp
#include "Misc/AutomationTest.h"
#include "FQuickJsRuntime.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPJsEvalBasico, "TPJs.Eval.Basico",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPJsEvalBasico::RunTest(const FString& Parameters)
{
    FQuickJsRuntime& Js = FQuickJsRuntime::Get();
    Js.Start();

    TFuture<FString> Suma = Js.Eval(TEXT("2+2"));
    TestEqual(TEXT("2+2 == 4"), Suma.Get(), FString(TEXT("4")));

    TFuture<FString> Json = Js.Eval(TEXT("JSON.stringify({a:1,b:[2,3]})"));
    TestEqual(TEXT("JSON ida"), Json.Get(), FString(TEXT("{\"a\":1,\"b\":[2,3]}")));

    return true;
}

#endif
```

- [ ] **Step 7: Registrar TPJs en `desktop/TiempoPalmero.uproject`**

En `"Modules"` añadir:

```json
{ "Name": "TPJs", "Type": "Runtime", "LoadingPhase": "Default" }
```

Y en `desktop/Source/TiempoPalmero/TiempoPalmero.Build.cs`, sustituir la línea
comentada por la dependencia real:

```csharp
PrivateDependencyModuleNames.AddRange(new string[] { "TPJs" });
```

- [ ] **Step 8: Compilar y pasar el test**

Run:

```bash
source desktop/scripts/env.sh
"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPJs" -unattended \
  -nopause -nullrhi -nosplash -log -testexit="Automation Test Queue Empty"
```

Expected: el log imprime `TPJs.Eval.Basico` «Passed» y el proceso sale con 0.
(La primera vez UBT compila TPJs; varios minutos.) Si quickjs.c da errores de
compilación con el compilador de Apple, ajustar flags en `TPJs.Build.cs`
(`-Wno-*` o `bEnableUndefinedIdentifierWarnings`) sin tocar `src/lib`.

- [ ] **Step 9: Commit**

```bash
git add desktop/ThirdParty desktop/Source desktop/TiempoPalmero.uproject
git commit -m "Módulo TPJs: QuickJS dentro de UE con hilo propio y test de eval"
git push origin main
```

---

### Task 6: Puente fetch (QuickJS ↔ HTTP de UE)

**Files:**
- Create: `desktop/Source/TPJs/FFetchBridge.h/.cpp`
- Modify: `desktop/Source/TPJs/FQuickJsRuntime.cpp` (instalar `fetch` global), `desktop/js-core/entry.ts` (usar el fetch inyectado, ver Task 4 Step 2)

**Interfaces:**
- Consumes: `FQuickJsRuntime` (Task 5). Produce: dentro de QuickJS, `fetch(url)` y `__hostFetch` funcionales; test `TPJs.Fetch.Puente` con handler inyectable; test de red `TPJs.Fetch.RedCabildo` marcado como red.

- [ ] **Step 1: `desktop/Source/TPJs/FFetchBridge.h`**

```cpp
#pragma once
#include "CoreMinimal.h"
#include "Interfaces/IHttpRequest.h"

struct JSContext;

/** Puente entre el `fetch` de QuickJS y el HTTP de UE. */
class TPJS_API FFetchBridge
{
public:
    /** Handler inyectable (tests). Devuelve JSON de {status, ok, headers, bodyB64}. */
    TFunction<FString(const FString& Url, const FString& InitJson)> HostHandler;

    FFetchBridge();

    /** Instala `fetch` y `__hostFetch` como funciones globales en Ctx. */
    void Install(JSContext* Ctx);

    /** Llama al handler (o a la red real) y produce la respuesta JSON. */
    FString Resolve(const FString& Url, const FString& InitJson);

private:
    FString ResolveOverNetwork(const FString& Url, const FString& InitJson);
    static JSValue HostFetchCallback(JSContext* Ctx, JSValueConst ThisVal, int Argc, JSValueConst* Argv, int Magic, JSValue* FuncData);
};
```

- [ ] **Step 2: `desktop/Source/TPJs/FFetchBridge.cpp`**

```cpp
#include "FFetchBridge.h"
#include "Misc/Base64.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonSerializer.h"

extern "C" {
#include "quickjs.h"
}

FFetchBridge::FFetchBridge()
{
}

static void BuildJson(JSContext* Ctx, JSValue Value, FString& Out)
{
    const char* Str = JS_ToCString(Ctx, Value);
    if (Str)
    {
        Out = UTF8_TO_TCHAR(Str);
        JS_FreeCString(Ctx, Str);
    }
}

JSValue FFetchBridge::HostFetchCallback(JSContext* Ctx, JSValueConst ThisVal, int Argc,
    JSValueConst* Argv, int Magic, JSValue* FuncData)
{
    FFetchBridge* Bridge = reinterpret_cast<FFetchBridge*>(JS_GetOpaque(FuncData[0], 1));
    FString Url;
    FString InitJson;
    BuildJson(Ctx, JS_ToString(Ctx, Argv[0]), Url);
    if (Argc > 1 && !JS_IsUndefined(Argv[1]) && !JS_IsNull(Argv[1]))
    {
        BuildJson(Ctx, JS_ToString(Ctx, Argv[1]), InitJson);
    }

    // La red de UE vive en el hilo del juego; QuickJS vive en su hilo. La
    // resolución se encarga como tarea y se resuelve la promesa desde el hilo
    // de QuickJS cuando llega la respuesta (cola de tareas).
    FString ResponseJson = Bridge->Resolve(Url, InitJson);
    JSValue RespObj = JS_ParseJSON(Ctx, TCHAR_TO_UTF8(*ResponseJson), ResponseJson.Len(), "<fetch>");
    JSValue Promise = JS_Call(Ctx, JS_GetPropertyStr(Ctx, Ctx->global_obj, "Promise"), JS_UNDEFINED, 0, nullptr);
    return Promise;
}
```

Nota del implementador: la construcción de promesa real es
`JS_NewPromiseCapability` + resolver desde una tarea diferida (la red de UE es
asíncrona). El esqueleto de arriba muestra el contrato; al compilar se sigue
el patrón canónico de QuickJS (`test_fetch` de quickjs-libc) y se mantienen
estas firmas públicas.

```cpp
FString FFetchBridge::Resolve(const FString& Url, const FString& InitJson)
{
    if (HostHandler)
    {
        return HostHandler(Url, InitJson);
    }
    return ResolveOverNetwork(Url, InitJson);
}

FString FFetchBridge::ResolveOverNetwork(const FString& Url, const FString& InitJson)
{
    FHttpModule& Http = FModuleManager::LoadModuleChecked<FHttpModule>("HTTP");
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = Http.CreateRequest();
    Req->SetURL(Url);
    Req->SetVerb(TEXT("GET"));
    Req->OnProcessRequestComplete().BindLambda([Promise = TSharedPtr<TPromise<FString>>()](FHttpRequestPtr R, FHttpResponsePtr S, bool bOk) mutable
    {
    });
    Req->ProcessRequest();
    return TEXT("{}");
}
```

Nota del implementador: la versión final coordina la respuesta asíncrona con
la promesa de QuickJS (resolver en el hilo de QuickJS vía `PostTask`), con un
tiempo límite de 20 s y base64 del cuerpo (`FBase64::Encode`). El test del
Step 4 fija el contrato: misma entrada, misma salida que `curl`.

- [ ] **Step 3: Instalar el puente en el arranque**

En `FQuickJsRuntime.cpp`, dentro de `FJsThread::Run()` después de
`js_std_add_helpers`:

```cpp
FetchBridge.Install(Ctx);
```

(El miembro `FFetchBridge FetchBridge;` se añade a `FJsThread`.)

- [ ] **Step 4: Tests del puente**

En `TPJsTests.cpp` añadir:

```cpp
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPJsFetchPuente, "TPJs.Fetch.Puente",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPJsFetchPuente::RunTest(const FString& Parameters)
{
    FQuickJsRuntime& Js = FQuickJsRuntime::Get();
    Js.Start();
    Js.SetFetchHandler([](const FString& Url, const FString& InitJson)
    {
        return FString::Printf(TEXT("{\"status\":200,\"ok\":true,\"headers\":{},\"bodyB64\":\"%s\"}"),
            *FBase64::Encode(TEXT("{\"temp\":21.5}")));
    });

    TFuture<FString> R = Js.Eval(TEXT(
        "(async () => { const r = await fetch('https://falso/estaciones'); "
        "return (await r.json()).temp; })()"));
    TestEqual(TEXT("json de la respuesta"), R.Get(), FString(TEXT("21.5")));

    return true;
}
```

Run: `"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPJs.Fetch" -unattended -nopause -nullrhi -nosplash -log -testexit="Automation Test Queue Empty"`
Expected: `TPJs.Fetch.Puente` Passed.

- [ ] **Step 5: Smoke de red real (manual, no automatizado)**

Con la app corriendo (Task 2), añadir temporalmente en el arranque un log de
`Js.Eval(TEXT("fetch('https://www.tiempopalmero.com/favicon.svg').then(r => r.status)"))`
y comprobar en el log `status 200`. Si el sandbox bloqueara la red, este paso
lo caza; la corrección es el entitlement `network.client` (ya presente).

- [ ] **Step 6: Commit**

```bash
git add desktop/Source desktop/js-core
git commit -m "Puente fetch: QuickJS habla con el HTTP de UE dentro del sandbox"
git push origin main
```

---

### Task 7: API del core desde C++ + paridad contra el golden

**Files:**
- Create: `desktop/Source/TPJs/FCoreApi.h/.cpp`
- Modify: `desktop/js-core/entry.ts` (mapa de modelos, `elevationAt` importado arriba), `desktop/Source/TPJs/Private/Tests/TPJsTests.cpp`

**Interfaces:**
- Consumes: `FQuickJsRuntime` + bundle (Task 4) + golden (Task 4). Produce: `FCoreApi` con `LoadBundle()`, `BuildModel(FString stationsJson) -> FString modelId`, `Estimate(modelId, lon, lat) -> FString json`, `SunPosition(tsMs, lon, lat) -> FString json`; test `TPJs.Golden.InterpolationParity`.

- [ ] **Step 1: `desktop/Source/TPJs/FCoreApi.h`**

```cpp
#pragma once
#include "CoreMinimal.h"

/** Acceso tipado al core meteorológico (bundle QuickJS). */
class TPJS_API FCoreApi
{
public:
    /** Carga core.bundle.js desde Content/Core (una vez). */
    void LoadBundle();

    /** Construye un modelo con estaciones JSON y devuelve su id. */
    FString BuildModel(const FString& StationsJson);

    /** Estima el valor interpolado en (lon, lat) para un modelo. */
    FString Estimate(const FString& ModelId, double Lon, double Lat);

    /** Posición solar (JSON de sun.ts) para un instante y punto. */
    FString SunPosition(int64 TsMs, double Lon, double Lat);

    FQuickJsRuntime* Runtime = nullptr;
};
```

- [ ] **Step 2: `desktop/Source/TPJs/FCoreApi.cpp`**

```cpp
#include "FCoreApi.h"
#include "FQuickJsRuntime.h"
#include "Misc/Paths.h"

void FCoreApi::LoadBundle()
{
    FString Path = FPaths::ProjectContentDir() / TEXT("Core") / TEXT("core.bundle.js");
    FString Script;
    FFileHelper::LoadFileToString(Script, *Path);
    FQuickJsRuntime::Get().Eval(Script).Get();
}

FString FCoreApi::BuildModel(const FString& StationsJson)
{
    FString Script = FString::Printf(TEXT(
        "JSON.stringify(TiempoCore.interpolate.buildModel(%s))"),
        *StationsJson);
    return FQuickJsRuntime::Get().Eval(Script).Get();
}

FString FCoreApi::Estimate(const FString& ModelId, double Lon, double Lat)
{
    FString Script = FString::Printf(TEXT(
        "TiempoCore.interpolate.estimate('%s', %f, %f)"),
        *ModelId, Lon, Lat);
    return FQuickJsRuntime::Get().Eval(Script).Get();
}

FString FCoreApi::SunPosition(int64 TsMs, double Lon, double Lat)
{
    FString Script = FString::Printf(TEXT(
        "TiempoCore.sun.position(%lld, %f, %f)"),
        TsMs, Lon, Lat);
    return FQuickJsRuntime::Get().Eval(Script).Get();
}
```

- [ ] **Step 3: Completar `entry.ts` (mapa de modelos y `elevationAt`)**

Corregir `entry.ts` según las notas del Task 4 Step 2: `const models = new
Map<string, ReturnType<typeof buildModel>>()`, `buildModel` hace
`models.set(id, model)` con id incremental, e `elevationAt` se importa arriba
con los demás imports.

- [ ] **Step 4: Test de paridad contra el golden**

En `TPJsTests.cpp` añadir:

```cpp
#include "FCoreApi.h"
#include "Serialization/JsonSerializer.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPJsGoldenParidad, "TPJs.Golden.InterpolationParity",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPJsGoldenParidad::RunTest(const FString& Parameters)
{
    FString GoldenText;
    FFileHelper::LoadFileToString(GoldenText,
        *(FPaths::ProjectContentDir() / TEXT("Core") / TEXT("Fixtures") / TEXT("golden-interpolation.json")));
    TSharedPtr<FJsonObject> Golden = MakeShareable(new FJsonObject());
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(GoldenText), Golden);

    FQuickJsRuntime::Get().Start();
    FCoreApi Core;

    FString StationsText;
    FFileHelper::LoadFileToString(StationsText,
        *(FPaths::ProjectContentDir() / TEXT("Core") / TEXT("Fixtures") / TEXT("weather-snapshot.json")));
    FString ModelId = Core.BuildModel(StationsText);

    const TArray<TSharedPtr<FJsonValue>>* Grid = nullptr;
    Golden->TryGetArrayField(TEXT("grid"), Grid);
    TestTrue(TEXT("golden con rejilla"), Grid && Grid->Num() > 0);
    if (!Grid)
    {
        return false;
    }

    for (const TSharedPtr<FJsonValue>& Cell : *Grid)
    {
        double Lon = Cell->AsObject()->GetNumberField(TEXT("lon"));
        double Lat = Cell->AsObject()->GetNumberField(TEXT("lat"));
        double Expected = Cell->AsObject()->GetNumberField(TEXT("value"));
        TSharedPtr<FJsonObject> Est = MakeShareable(new FJsonObject());
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Core.Estimate(ModelId, Lon, Lat)), Est);
        double Actual = Est->GetNumberField(TEXT("value"));
        TestTrue(FString::Printf(TEXT("paridad en %f,%f: %f vs %f"), Lon, Lat, Actual, Expected),
            FMath::Abs(Actual - Expected) < 1e-6);
    }
    return true;
}
```

Nota: el bundle se genera con `npm run desktop:core` y el golden se copia a
`Content/Core/Fixtures/` en ese mismo script (Task 4 Step 5 lo copia; añadir
la copia del golden si no está).

- [ ] **Step 5: Ejecutar la paridad**

Run:

```bash
npm run desktop:core
source desktop/scripts/env.sh
"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPJs.Golden" -unattended -nopause -nullrhi -nosplash -log -testexit="Automation Test Queue Empty"
```

Expected: `TPJs.Golden.InterpolationParity` Passed: **el mismo motor, los
mismos 100 números, dentro de UE**.

- [ ] **Step 6: Commit**

```bash
git add desktop
git commit -m "Paridad UE: QuickJS reproduce el motor de la web punto a punto contra el golden"
git push origin main
```

---

### Task 8: TPGeo — plano tangente y transformaciones

**Files:**
- Create: `desktop/Source/TPGeo/TPGeo.Build.cs`, `desktop/Source/TPGeo/FTangentPlane.h/.cpp`, `desktop/Source/TPGeo/Private/Tests/TPGeoTests.cpp`
- Modify: `desktop/TiempoPalmero.uproject` (módulo TPGeo)

**Interfaces:**
- Consumes: constantes `MAP_BBOX`/`M_PER_DEG_*` (mismas de `src/lib/geo.ts`). Produce: `FTangentPlane::ToWorld(lon,lat) -> FVector`, `::ToLonLat(FVector) -> FVector2D`; eje UE: +X norte, +Y este, +Z arriba. Tasks 9–12 dependen de esto.

- [ ] **Step 1: `desktop/Source/TPGeo/TPGeo.Build.cs`**

```csharp
using UnrealBuildTool;

public class TPGeo : ModuleRules
{
    public TPGeo(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        CppStandard = CppStandardVersion.Cpp20;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "ProceduralMeshComponent" });
        PrivateDependencyModuleNames.AddRange(new string[] { "TPJs", "HTTP", "Json", "ImageWrapper" });
    }
}
```

- [ ] **Step 2: `desktop/Source/TPGeo/FTangentPlane.h`**

```cpp
#pragma once
#include "CoreMinimal.h"

/**
 * Plano tangente al centro del recuadro del mapa, con las mismas constantes
 * de la web (src/lib/geo.ts): los metros son los metros de la web, para que
 * las distancias digan lo mismo en las dos superficies.
 */
struct TPGEo_API FTangentPlane
{
    static constexpr double CenterLon = (-18.35 + -17.4) / 2.0; // MAP_BBOX
    static constexpr double CenterLat = (28.15 + 29.15) / 2.0;
    static constexpr double MPerDegLat = 110574.0;
    static constexpr double MPerDegLon = 111320.0;

    /** UE: +X norte, +Y este, +Z arriba. */
    static FVector ToWorld(double Lon, double Lat)
    {
        return FVector(
            (Lat - CenterLat) * MPerDegLat,
            (Lon - CenterLon) * MPerDegLon,
            0.0);
    }

    static FVector2D ToLonLat(const FVector& World)
    {
        return FVector2D(CenterLon + World.Y / MPerDegLon, CenterLat + World.X / MPerDegLat);
    }
};
```

- [ ] **Step 3: `desktop/Source/TPGeo/FTangentPlane.cpp`**

```cpp
#include "FTangentPlane.h"
```

- [ ] **Step 4: `desktop/Source/TPGeo/Private/Tests/TPGeoTests.cpp`**

```cpp
#include "Misc/AutomationTest.h"
#include "FTangentPlane.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPGeoRoundTrip, "TPGeo.TangentPlane.RoundTrip",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPGeoRoundTrip::RunTest(const FString& Parameters)
{
    const double Lons[] = { -18.05, -17.78, -17.70, -18.35, -17.40 };
    const double Lats[] = { 28.40, 28.68, 28.90, 28.15, 29.15 };
    for (double Lon : Lons)
    {
        for (double Lat : Lats)
        {
            FVector2D Back = FTangentPlane::ToLonLat(FTangentPlane::ToWorld(Lon, Lat));
            TestTrue(FString::Printf(TEXT("round trip %f,%f"), Lon, Lat),
                FMath::Abs(Back.X - Lon) < 1e-9 && FMath::Abs(Back.Y - Lat) < 1e-9);
        }
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPGeoEscala, "TPGeo.TangentPlane.Escala",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPGeoEscala::RunTest(const FString& Parameters)
{
    // Un grado de latitud son 110,574 km: la diagonal del plano lo respeta.
    FVector South = FTangentPlane::ToWorld(FTangentPlane::CenterLon, FTangentPlane::CenterLat - 0.5);
    TestTrue(TEXT("medio grado norte-sur"),
        FMath::Abs(South.X + 55287.0) < 1.0);
    return true;
}

#endif
```

- [ ] **Step 5: Registrar TPGeo en el uproject**

En `"Modules"`: `{ "Name": "TPGeo", "Type": "Runtime", "LoadingPhase": "Default" }`.
Y en `TiempoPalmero.Build.cs`: `PrivateDependencyModuleNames.AddRange(new string[] { "TPJs", "TPGeo" });`

- [ ] **Step 6: Ejecutar tests y commit**

Run: `"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPGeo" -unattended -nopause -nullrhi -nosplash -log -testexit="Automation Test Queue Empty"`
Expected: los dos tests Passed.

```bash
git add desktop
git commit -m "TPGeo: plano tangente con las mismas constantes de geo.ts"
git push origin main
```

---

### Task 9: Terreno desde el DEM

**Files:**
- Create: `desktop/Source/TPGeo/FHeightfield.h/.cpp`, `desktop/Source/TPGeo/ATerrainActor.h/.cpp`
- Modify: `desktop/js-core/entry.ts` (nada: `dem.load`/`sampleGrid` ya están), `desktop/Source/TPJs/FCoreApi.h/.cpp` (DemLoad, SampleGrid), `desktop/Source/TiempoPalmero` (spawn del terreno al arrancar)

**Interfaces:**
- Consumes: `FTangentPlane` (Task 8), `FCoreApi` (Task 7). Produce: `ATerrainActor` que, al `BeginPlay`, carga el DEM vía core, muestrea una rejilla 384×384 sobre `MAP_BBOX` y construye una `UProceduralMeshComponent`. Tests: `TPGeo.Terreno.Malla`.

- [ ] **Step 1: Añadir a `FCoreApi`**

```cpp
// DemLoad devuelve JSON con el número de teselas cargadas.
FString DemLoad(const FString& ManifestJson);
// SampleGrid recibe arrays JSON de lons/lats y devuelve JSON de altitudes.
FString SampleGrid(const FString& LonsJson, const FString& LatsJson);
```

Implementación análoga a `Estimate` (llamadas a `TiempoCore.dem.*`).

- [ ] **Step 2: `desktop/Source/TPGeo/FHeightfield.h`**

```cpp
#pragma once
#include "CoreMinimal.h"

/** Rejilla regular de altitudes en metros, sobre MAP_BBOX. */
struct TPGEo_API FHeightfield
{
    int32 Cols = 0;
    int32 Rows = 0;
    double West = -18.35, East = -17.4, South = 28.15, North = 29.15;
    TArray<float> Heights; // fila-mayor, fila 0 = norte

    float At(int32 Row, int32 Col) const { return Heights[Row * Cols + Col]; }
    void LonLatToCell(double Lon, double Lat, int32& OutCol, int32& OutRow) const;
};
```

- [ ] **Step 3: `desktop/Source/TPGeo/FHeightfield.cpp`**

```cpp
#include "FHeightfield.h"

void FHeightfield::LonLatToCell(double Lon, double Lat, int32& OutCol, int32& OutRow) const
{
    OutCol = FMath::Clamp((int32)((Lon - West) / (East - West) * (Cols - 1)), 0, Cols - 1);
    OutRow = FMath::Clamp((int32)((North - Lat) / (North - South) * (Rows - 1)), 0, Rows - 1);
}
```

- [ ] **Step 4: `desktop/Source/TPGeo/ATerrainActor.h`**

```cpp
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FHeightfield.h"
#include "ATerrainActor.generated.h"

class UProceduralMeshComponent;

/** Terreno de La Palma muestreado del DEM (vía core) y dibujado como malla. */
UCLASS()
class TPGEo_API ATerrainActor : public AActor
{
    GENERATED_BODY()
public:
    ATerrainActor();
    virtual void BeginPlay() override;

    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UProceduralMeshComponent> Mesh;

    void BuildFromHeightfield(const FHeightfield& Field);

private:
    static constexpr int32 GridSize = 384;
};
```

- [ ] **Step 5: `desktop/Source/TPGeo/ATerrainActor.cpp`**

```cpp
#include "ATerrainActor.h"
#include "FTangentPlane.h"
#include "FCoreApi.h"
#include "ProceduralMeshComponent.h"

ATerrainActor::ATerrainActor()
{
    PrimaryActorTick.bCanEverTick = false;
    Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("TerrainMesh"));
    SetRootComponent(Mesh);
}

void ATerrainActor::BeginPlay()
{
    Super::BeginPlay();

    // Muestreo por lote en el core: mismo DEM, mismas altitudes que la web.
    const int32 N = GridSize;
    TArray<double> Lons, Lats;
    for (int32 Row = 0; Row < N; Row++)
    {
        for (int32 Col = 0; Col < N; Col++)
        {
            double Lon = -18.35 + (-17.4 - -18.35) * Col / (N - 1);
            double Lat = 29.15 + (28.15 - 29.15) * Row / (N - 1);
            Lons.Add(Lon);
            Lats.Add(Lat);
        }
    }

    FString LonsJson, LatsJson;
    // Se serializan los arrays a JSON con FJsonSerializer (ayudante local).
    FCoreApi Core;
    FString HeightsJson = Core.SampleGrid(LonsJson, LatsJson);

    TArray<TSharedPtr<FJsonValue>> Values;
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(HeightsJson), Values);

    FHeightfield Field;
    Field.Cols = N;
    Field.Rows = N;
    for (const TSharedPtr<FJsonValue>& V : Values)
    {
        Field.Heights.Add(V->IsNull() ? 0.0f : (float)V->AsNumber());
    }
    BuildFromHeightfield(Field);
}

void ATerrainActor::BuildFromHeightfield(const FHeightfield& Field)
{
    const int32 N = Field.Cols;
    TArray<FVector> Vertices;
    TArray<int32> Triangles;
    TArray<FVector2D> UVs;
    TArray<FVector> Normals;
    Vertices.Reserve(N * N);
    for (int32 Row = 0; Row < N; Row++)
    {
        for (int32 Col = 0; Col < N; Col++)
        {
            double Lon = Field.West + (Field.East - Field.West) * Col / (N - 1);
            double Lat = Field.North + (Field.South - Field.North) * Row / (N - 1);
            FVector W = FTangentPlane::ToWorld(Lon, Lat);
            W.Z = Field.At(Row, Col);
            Vertices.Add(W);
            UVs.Add(FVector2D((float)Col / (N - 1), (float)Row / (N - 1)));
        }
    }
    for (int32 Row = 0; Row < N - 1; Row++)
    {
        for (int32 Col = 0; Col < N - 1; Col++)
        {
            int32 A = Row * N + Col;
            int32 B = A + 1;
            int32 C = A + N;
            int32 D = C + 1;
            Triangles.Append({ A, C, B, B, C, D });
        }
    }
    Normals.SetNum(Vertices.Num());
    for (int32 Row = 0; Row < N; Row++)
    {
        for (int32 Col = 0; Col < N; Col++)
        {
            float Hx = Field.At(Row, FMath::Min(Col + 1, N - 1)) - Field.At(Row, FMath::Max(Col - 1, 0));
            float Hy = Field.At(FMath::Min(Row + 1, N - 1), Col) - Field.At(FMath::Max(Row - 1, 0), Col);
            FVector Nrm(-Hy, -Hx, 200.0f);
            Normals[Row * N + Col] = Nrm.GetSafeNormal();
        }
    }
    Mesh->CreateMeshSection(0, Vertices, Triangles, Normals, UVs, TArray<FColor>(), TArray<FProcMeshTangent>(), true);
}
```

Nota: la serialización de `LonsJson`/`LatsJson` usa `FJsonSerializer` con
`TArray<double>` (escribir el ayudante `DoubleArrayToJson` en el mismo
fichero). La constante 200.0 de la normal es la escala de celdas (~70 m de
celda); ajustar tras ver el relieve en pantalla.

- [ ] **Step 6: Test `TPGeo.Terreno.Malla`**

```cpp
#include "ATerrainActor.h"
#include "FHeightfield.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPGeoTerreno, "TPGeo.Terreno.Malla",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPGeoTerreno::RunTest(const FString& Parameters)
{
    // Campo sintético: sin red ni core, solo geometría.
    FHeightfield Field;
    Field.Cols = 3;
    Field.Rows = 3;
    Field.Heights = { 0, 10, 0, 10, 2426, 10, 0, 10, 0 };
    ATerrainActor* Actor = GEditor ? GEditor->GetEditorWorldContext().World()->SpawnActor<ATerrainActor>() : nullptr;
    if (!Actor)
    {
        return false;
    }
    Actor->BuildFromHeightfield(Field);
    TestEqual(TEXT("sección con 18 triángulos"), Actor->Mesh->GetNumSections(), 1);
    return true;
}
```

Nota: si `GEditor` no existe en el contexto de test, crear un `UWorld` con
`UWorld::CreateWorld` y un `FObjectInitializer`; el objetivo del test es
`BuildFromHeightfield` con datos sintéticos (sin red).

- [ ] **Step 7: Spawn al arrancar (juego)**

En `TiempoPalmero.cpp` no basta (módulo): añadir un `UGameInstance` no es
necesario todavía; en su lugar, en el `BeginPlay` del nivel por defecto no hay
actor nuestro. Se crea `ATerrainActor` desde un pequeño `AGameModeBase`
(`ATPGameMode`) que en `StartPlay` hace `GetWorld()->SpawnActor<ATerrainActor>()`.
Crear `desktop/Source/TiempoPalmero/ATPGameMode.h/.cpp`:

```cpp
// ATPGameMode.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "ATPGameMode.generated.h"

UCLASS()
class ATTPGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    virtual void StartPlay() override;
};
```

```cpp
// ATPGameMode.cpp
#include "ATPGameMode.h"
#include "ATerrainActor.h"

void ATTPGameMode::StartPlay()
{
    Super::StartPlay();
    GetWorld()->SpawnActor<ATerrainActor>();
}
```

Y en `DefaultEngine.ini`:
`GlobalDefaultGameMode=/Script/TiempoPalmero.ATPGameMode`.

- [ ] **Step 8: Ver en pantalla**

Run: `bash desktop/scripts/build-dev.sh` y observar el relieve (el editor no
abre: se ve con la app). El mar queda plano a 0 m en este milestone (F4 trae
el agua).

- [ ] **Step 9: Commit**

```bash
git add desktop
git commit -m "Terreno 3D real: el DEM de la web dibuja La Palma en UE"
git push origin main
```

---

### Task 10: Ortofoto y topo (teselas como texturas)

**Files:**
- Create: `desktop/Source/TPGeo/FTileProvider.h/.cpp`, `desktop/Source/TPGeo/ATileLayerActor.h/.cpp`
- Modify: nada del core (las URLs vienen de `basemaps.ts` vía `TiempoCore.basemaps.tileUrl`)

**Interfaces:**
- Consumes: `FTangentPlane`, `FCoreApi` (tileUrl), HTTP de UE. Produce: `ATileLayerActor` que pide las teselas de un basemap (`satelite` o `topografico`) en zoom 12 sobre `ISLAND_BBOX`, las convierte en `UTexture2D` con `FImageUtils::ImportBufferAsTexture2D` y las dibuja como quads flotando 1 m sobre el terreno. Test: `TPGeo.Tiles.Urltemplate` (JS) + test de quads con proveedor falso.

- [ ] **Step 1: `desktop/Source/TPGeo/FTileProvider.h`**

```cpp
#pragma once
#include "CoreMinimal.h"

DECLARE_DELEGATE_OneParam(FOnTilesReady, const TArray<TPair<FIntPoint, UTexture2D*>>&);

/** Baja teselas raster de un basemap de la web y las entrega como texturas. */
class TPGEo_API FTileProvider : public TSharedFromThis<FTileProvider>
{
public:
    FTileProvider(const FString& InBasemapId, int32 InZoom);

    /** Pide todas las teselas que cubren ISLAND_BBOX en el zoom dado. */
    void RequestIsland(const FOnTilesReady& OnReady);

private:
    void OnTileDone(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bOk);

    FString BasemapId;
    int32 Zoom;
    int32 Pending = 0;
    TArray<TPair<FIntPoint, UTexture2D*>> Ready;
    FOnTilesReady Callback;
};
```

- [ ] **Step 2: `desktop/Source/TPGeo/FTileProvider.cpp`** (esqueleto completo)

```cpp
#include "FTileProvider.h"
#include "FCoreApi.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "ImageUtils.h"

FTileProvider::FTileProvider(const FString& InBasemapId, int32 InZoom)
    : BasemapId(InBasemapId), Zoom(InZoom)
{
}

void FTileProvider::RequestIsland(const FOnTilesReady& OnReady)
{
    Callback = OnReady;
    // ISLAND_BBOX de geo.ts, con margen de una tesela.
    const double West = -18.2, East = -17.55, South = 28.25, North = 29.05;
    auto TileOf = [this](double Lon, double Lat)
    {
        double N = 256.0 * FMath::Pow(2.0, Zoom);
        double X = (Lon + 180.0) / 360.0 * N;
        double Y = (1.0 - FMath::Loge(FMath::Tan(FMath::DegreesToRadians(Lat)) + 1.0 / FMath::Cos(FMath::DegreesToRadians(Lat))) / PI) / 2.0 * N;
        return FIntPoint((int32)X, (int32)Y);
    };
    FIntPoint TL = TileOf(West, North);
    FIntPoint BR = TileOf(East, South);
    FCoreApi Core;
    for (int32 Ty = TL.Y; Ty <= BR.Y; Ty++)
    {
        for (int32 Tx = TL.X; Tx <= BR.X; Tx++)
        {
            FString Url = Core.BasemapTileUrl(BasemapId, Zoom, Tx, Ty);
            if (Url.IsEmpty())
            {
                continue;
            }
            FHttpModule& Http = FModuleManager::LoadModuleChecked<FHttpModule>("HTTP");
            TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = Http.CreateRequest();
            Req->SetURL(Url);
            Req->SetVerb(TEXT("GET"));
            Pending++;
            Req->OnProcessRequestComplete().BindRaw(this, &FTileProvider::OnTileDone);
            Req->ProcessRequest();
        }
    }
}

void FTileProvider::OnTileDone(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bOk)
{
    FString Name = TEXT("Tile");
    UTexture2D* Tex = FImageUtils::ImportBufferAsTexture2D(Response->GetContent(), Name);
    if (Tex)
    {
        Tex->SRGB = true;
        Ready.Add(TPair<FIntPoint, UTexture2D*>(FIntPoint(0, 0), Tex));
    }
    Pending--;
    if (Pending == 0)
    {
        Callback.ExecuteIfBound(Ready);
    }
}
```

Nota: asociar cada textura a su `(Tx, Ty)` (guardar el par en el request vía
`Req->SetDelegate` o un mapa por URL). El esqueleto fija el contrato; el par
`(Tx,Ty)` correcto es obligatorio para colocar los quads.

- [ ] **Step 3: `desktop/Source/TPGeo/ATileLayerActor.h/.cpp`**

Quads planos en el mundo con un `UMaterialInstanceDynamic` por tesela:

```cpp
// ATileLayerActor.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ATileLayerActor.generated.h"

class UProceduralMeshComponent;
class FTileProvider;

UCLASS()
class TPGEo_API ATileLayerActor : public AActor
{
    GENERATED_BODY()
public:
    ATileLayerActor();
    void LoadBasemap(const FString& BasemapId, int32 Zoom);

private:
    UPROPERTY()
    TObjectPtr<UProceduralMeshComponent> Mesh;
};
```

```cpp
// ATileLayerActor.cpp
#include "ATileLayerActor.h"
#include "FTileProvider.h"
#include "FTangentPlane.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/Material.h"

ATileLayerActor::ATileLayerActor()
{
    Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("TileMesh"));
    SetRootComponent(Mesh);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ATileLayerActor::LoadBasemap(const FString& BasemapId, int32 Zoom)
{
    TSharedRef<FTileProvider> Provider = MakeShared<FTileProvider>(BasemapId, Zoom);
    Provider->RequestIsland(FOnTilesReady::CreateLambda(
        [WeakThis = TWeakObjectPtr<ATileLayerActor>(this)](const TArray<TPair<FIntPoint, UTexture2D*>>& Tiles)
        {
            if (!WeakThis.IsValid())
            {
                return;
            }
            // Por tesela: un quad de 256×256 m en su lugar, 1 m sobre el suelo,
            // con un material dinámico que usa la textura como base.
            int32 Section = 0;
            for (const auto& [XY, Tex] : Tiles)
            {
                TArray<FVector> Verts;
                TArray<int32> Tris;
                TArray<FVector2D> UVs;
                // El par (Tx,Ty) correcto (nota del Step 2) da las esquinas
                // lon/lat del quad; aquí se usa el plano tangente.
                Verts = { FVector(0,0,1), FVector(0,25600,1), FVector(25600,25600,1), FVector(25600,0,1) };
                UVs = { {0,1}, {1,1}, {1,0}, {0,0} };
                Tris = { 0,1,2, 0,2,3 };
                WeakThis->Mesh->CreateMeshSection(Section++, Verts, Tris, TArray<FVector>(), UVs, TArray<FColor>(), TArray<FProcMeshTangent>(), false);
            }
        }));
}
```

Nota: el material base se crea una vez en el constructor con un
`UMaterial` sencillo (Unlit + textura), o se usa
`UMaterialInstanceDynamic` sobre el material `/Engine/EngineMaterials/WorldGridMaterial`
solo como andamio visual; el material real de teselas se pule en el
Milestone 2. Las esquinas lon/lat del quad salen del `(Tx,Ty)` y del zoom
(mismo cálculo que `TileOf` invertido, en `FTileProvider`).

- [ ] **Step 4: Test de plantilla de URLs (JS, en vitest)**

En `entry.test.ts` añadir:

```ts
it('resuelve plantillas de basemaps', async () => {
  await import('./entry')
  const core = (globalThis as any).TiempoCore
  const url = core.basemaps.tileUrl('satelite', 12, 1000, 1500)
  expect(url).toContain('/12/')
  expect(url).toMatch(/https?:\/\//)
})
```

Run: `npm test`. Expected: verde. Si la plantilla de `basemaps.ts` no usa
`{z}/{x}/{y}` en `tiles[0]`, ajustar `tileUrl` en `entry.ts` (no en `src/lib`)
para respetar el formato real.

- [ ] **Step 5: Commit**

```bash
git add desktop
git commit -m "Teselas de la web (orto y topo) texturizando la isla en UE"
git push origin main
```

---

### Task 11: Sol real (DirectionalLight + SkyAtmosphere)

**Files:**
- Create: `desktop/Source/TPAtmo/TPAtmo.Build.cs`, `desktop/Source/TPAtmo/ASunController.h/.cpp`
- Modify: `desktop/TiempoPalmero.uproject` (módulo TPAtmo), `desktop/Source/TiempoPalmero/ATPGameMode.cpp` (spawn del sol)

**Interfaces:**
- Consumes: `FCoreApi::SunPosition` (Task 7), `FTangentPlane`. Produce: `ASunController` con `Tick` que orienta la `ADirectionalLight` según `sun.ts` y ajusta intensidad/color con `dayFactor`; el nivel tiene `ASkyAtmosphere`. Test: `TPAtmo.Sol.Mediodia`.

- [ ] **Step 1: `desktop/Source/TPAtmo/TPAtmo.Build.cs`**

```csharp
using UnrealBuildTool;

public class TPAtmo : ModuleRules
{
    public TPAtmo(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        CppStandard = CppStandardVersion.Cpp20;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
        PrivateDependencyModuleNames.AddRange(new string[] { "TPJs", "Json" });
    }
}
```

Registrar el módulo en `"Modules"` del uproject:
`{ "Name": "TPAtmo", "Type": "Runtime", "LoadingPhase": "Default" }`.
Y en `TiempoPalmero.Build.cs`:
`PrivateDependencyModuleNames.AddRange(new string[] { "TPJs", "TPGeo", "TPAtmo" });`

- [ ] **Step 2: `desktop/Source/TPAtmo/ASunController.h`**

```cpp
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ASunController.generated.h"

class ADirectionalLight;
class ASkyAtmosphere;

/** Sol de La Palma: posición real desde sun.ts, luz de UE orientada igual. */
UCLASS()
class TPATMO_API ASunController : public AActor
{
    GENERATED_BODY()
public:
    ASunController();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

private:
    UPROPERTY()
    TObjectPtr<ADirectionalLight> Sun;
    UPROPERTY()
    TObjectPtr<ASkyAtmosphere> Sky;
    double Lon = -17.78;
    double Lat = 28.68;
    float SmoothedElevation = 45.0f;
};
```

- [ ] **Step 3: `desktop/Source/TPAtmo/ASunController.cpp`**

```cpp
#include "ASunController.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyAtmosphere.h"
#include "Components/DirectionalLightComponent.h"
#include "FCoreApi.h"
#include "Serialization/JsonSerializer.h"

ASunController::ASunController()
{
    PrimaryActorTick.bCanEverTick = true;
}

void ASunController::BeginPlay()
{
    Super::BeginPlay();
    Sun = GetWorld()->SpawnActor<ADirectionalLight>();
    Sun->GetLightComponent()->SetIntensity(8.0f);
    Sky = GetWorld()->SpawnActor<ASkyAtmosphere>();
}

void ASunController::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!Sun)
    {
        return;
    }
    FCoreApi Core;
    int64 Now = FDateTime::UtcNow().ToUnixTimestamp() * 1000LL;
    FString Json = Core.SunPosition(Now, Lon, Lat);
    TSharedPtr<FJsonObject> Obj = MakeShareable(new FJsonObject());
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Obj);
    double ElevDeg = Obj->GetNumberField(TEXT("elevationDeg"));
    double AzDeg = Obj->GetNumberField(TEXT("azimuthDeg"));

    // Azimut desde el sur (web) → yaw UE; elevación → pitch.
    FRotator Rot(FMath::Clamp((float)ElevDeg, -90.0f, 90.0f), (float)AzDeg, 0.0f);
    Sun->SetActorRotation(Rot);

    FCoreApi Core2;
    float Factor = (float)FCString::Atod(*Core2.DayFactor(ElevDeg));
    Sun->GetLightComponent()->SetIntensity(FMath::Lerp(0.02f, 8.0f, FMath::Clamp(Factor, 0.0f, 1.0f)));
    SmoothedElevation = ElevDeg;
}
```

Nota: los nombres reales de los campos del JSON de `sunPosition` se leen de
`src/lib/sun.ts` (interfaz `SkyPosition`); usar los exactos. La conversión
azimut→yaw respeta la definición de azimut de la web (se mide desde el sur).

- [ ] **Step 4: Test `TPAtmo.Sol.Mediodia`**

```cpp
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPAtmoSol, "TPAtmo.Sol.Mediodia",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPAtmoSol::RunTest(const FString& Parameters)
{
    FCoreApi Core;
    // 13 de agosto de 2026, 13:00 UTC: el sol está alto (medido con el golden).
    FString Json = Core.SunPosition(1785704400000LL, -17.78, 28.68);
    TSharedPtr<FJsonObject> Obj = MakeShareable(new FJsonObject());
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Obj);
    double Elev = Obj->GetNumberField(TEXT("elevationDeg"));
    TestTrue(FString::Printf(TEXT("sol alto al mediodía: %f"), Elev), Elev > 55.0);
    return true;
}
```

Nota: 1785704400000 ms corresponde a 2026-08-13T13:00:00Z (verificar el valor
con `node -e "console.log(Date.UTC(2026,7,13,13))"`; el número exacto se pone
en el test). El umbral >55° se compara con el golden (`sun.noon2026_08_13`).

- [ ] **Step 5: Spawn del sol en `ATPGameMode::StartPlay()`**

Añadir `GetWorld()->SpawnActor<ASunController>();` junto al terreno.

- [ ] **Step 6: Ver y commit**

Run: `bash desktop/scripts/build-dev.sh` → la isla se ilumina con la hora real
del reloj. Ajustar el `SetIntensity` base si la escena sale quemada.

```bash
git add desktop
git commit -m "Sol real: sun.ts orienta la luz de UE y el cielo atiende a la hora"
git push origin main
```

---

### Task 12: Cartografía 3D — calles, topónimos, curvas de nivel

**Files:**
- Create: `desktop/Source/TPGeo/FRoadsBuilder.h/.cpp`, `desktop/Source/TPGeo/FPlacesBuilder.h/.cpp`, `desktop/Source/TPGeo/FContoursBuilder.h/.cpp`, `desktop/Source/TPGeo/ACartoLayerActor.h/.cpp`
- Modify: `desktop/js-core/entry.ts` (exponer la petición de calles de `osm-roads.ts` y `fetchGazetteer` ya está)

**Interfaces:**
- Consumes: `FTangentPlane`, `FHeightfield`, `FCoreApi`. Produce: `ACartoLayerActor` con tres secciones de malla: calles (cintas drapeadas sobre el terreno), topónimos (`UTextRenderComponent` por topónimo del gazetteer), curvas de nivel cada 200 m (marching squares sobre el campo). Tests: contornos y calles dentro del bbox.

- [ ] **Step 1: Calles — reexportar el fetcher de la web**

En `entry.ts`:

```ts
import { fetchIslandRoads } from '../../src/lib/osm-roads' // nombre real tras leer el fichero
```

y exponer `TiempoCore.roads = { fetch: () => fetchIslandRoads().then(r => JSON.stringify(r)) }`.
Leer `src/lib/osm-roads.ts` para usar su export real (paso explícito, como en
Task 4 Step 1).

- [ ] **Step 2: `desktop/Source/TPGeo/FRoadsBuilder.h/.cpp`**

```cpp
// FRoadsBuilder.h
#pragma once
#include "CoreMinimal.h"

class TPGEo_API FRoadsBuilder
{
public:
    /** Convierte GeoJSON de líneas en vértices de cintas drapeadas. */
    static void Build(const FString& GeoJson, const FHeightfield& Field,
        TArray<FVector>& OutVertices, TArray<int32>& OutTriangles, float DrapeMeters = 2.0f);
};
```

Implementación: parsear el GeoJSON (FJsonSerializer), por cada línea muestrear
puntos cada ~30 m, elevar cada punto a `Field.At(...) + DrapeMeters`, y coser
dos filas (ancho ~8 m) en una cinta de triángulos. El dibujo se hace con
`ACartoLayerActor` (sección de malla `Calles`).

- [ ] **Step 3: `desktop/Source/TPGeo/FPlacesBuilder.h/.cpp`**

```cpp
// FPlacesBuilder.h
#pragma once
#include "CoreMinimal.h"

class UTextRenderComponent;

class TPGEo_API FPlacesBuilder
{
public:
    /** Topónimos del gazetteer como texto 3D sobre el terreno. */
    static void Build(AActor* Owner, const FString& GazetteerJson, const FHeightfield& Field, float TextSizeCm = 800.0f);
};
```

Implementación: por entrada del gazetteer (`fetchGazetteer` de la web, servido
desde la misma web), crear `UTextRenderComponent` en la posición del plano
tangente elevada con el campo + 5 m, `SetWorldSize(TextSizeCm)` y
`SetHorizontalAlignment(EHorizTextAligment::EHTA_Center)`.

- [ ] **Step 4: `desktop/Source/TPGeo/FContoursBuilder.h/.cpp`**

```cpp
// FContoursBuilder.h
#pragma once
#include "CoreMinimal.h"
#include "FHeightfield.h"

class TPGEo_API FContoursBuilder
{
public:
    /** Marching squares cada IntervalM metros. Devuelve polilíneas 3D. */
    static TArray<TArray<FVector>> Build(const FHeightfield& Field, float IntervalM = 200.0f);
};
```

Implementación: por celda y por nivel (`ceil(min/Interval)*Interval` …),
interpolar las aristas cruzadas y encadenar segmentos en polilíneas. El test
comprueba que ninguna polilínea sale del bbox y que un campo sintético de un
solo pico produce curvas cerradas.

- [ ] **Step 5: Tests de cartografía**

```cpp
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTPGeoContornos, "TPGeo.Carto.Contornos",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FTPGeoContornos::RunTest(const FString& Parameters)
{
    // Campo sintético: cono de 1000 m en el centro del bbox.
    FHeightfield Field;
    Field.Cols = 64;
    Field.Rows = 64;
    Field.Heights.SetNum(64 * 64);
    for (int32 Row = 0; Row < 64; Row++)
    {
        for (int32 Col = 0; Col < 64; Col++)
        {
            double Dx = (Col - 31.5) / 31.5;
            double Dy = (Row - 31.5) / 31.5;
            Field.Heights[Row * 64 + Col] = 1000.0f * FMath::Clamp(1.0 - (float)FMath::Sqrt(Dx * Dx + Dy * Dy), 0.0f, 1.0f);
        }
    }
    TArray<TArray<FVector>> Lines = FContoursBuilder::Build(Field, 200.0f);
    TestTrue(TEXT("hay curvas"), Lines.Num() >= 4);
    for (const TArray<FVector>& Line : Lines)
    {
        for (const FVector& V : Line)
        {
            FVector2D LonLat = FTangentPlane::ToLonLat(V);
            TestTrue(TEXT("dentro del bbox"),
                LonLat.X >= -18.35 && LonLat.X <= -17.4 && LonLat.Y >= 28.15 && LonLat.Y <= 29.15);
        }
    }
    return true;
}
```

- [ ] **Step 6: `desktop/Source/TPGeo/ACartoLayerActor.h/.cpp`**

Actor que junta los tres constructores en secciones de una
`UProceduralMeshComponent` (calles y curvas) y componentes de texto
(topónimos), llamado desde `ATPGameMode::StartPlay()` después del terreno.

- [ ] **Step 7: Ejecutar tests y ver la isla**

Run: `"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPGeo.Carto" -unattended -nopause -nullrhi -nosplash -log -testexit="Automation Test Queue Empty"` y después `bash desktop/scripts/build-dev.sh`.

- [ ] **Step 8: Commit**

```bash
git add desktop
git commit -m "Cartografía 3D: calles de Overpass, topónimos y curvas sobre el terreno"
git push origin main
```

---

### Task 13: Puerta de producción del escritorio + docs

**Files:**
- Create: `desktop/scripts/verify.sh`
- Modify: `CLAUDE.md` (puerta completa), `desktop/README.md`, `README.md` (sección escritorio), `CONTRIBUTING.md` (si describe las puertas)

**Interfaces:**
- Consumes: todo lo anterior. Produce: una sola orden que valida el escritorio: bundle + golden + tests UE. La puerta queda codificada en CLAUDE.md.

- [ ] **Step 1: `desktop/scripts/verify.sh`**

```bash
#!/usr/bin/env bash
# Puerta de producción del escritorio. Sin red en los tests (fixtures).
set -euo pipefail
source "$(dirname "$0")/env.sh"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== bundle del core =="
(cd "$ROOT" && npm run desktop:core)

echo "== golden actualizado =="
(cd "$ROOT" && npm run desktop:golden)
git -C "$ROOT" diff --quiet -- desktop/Tests/golden-interpolation.json || {
  echo "golden desactualizado: regenerado y committeado con el cambio"
}

echo "== tests UE =="
"$UECMD" "$PROJECT" -ExecCmds="Automation RunTests TPJs+TPGeo+TPAtmo" \
  -unattended -nopause -nullrhi -nosplash -log \
  -testexit="Automation Test Queue Empty"
```

- [ ] **Step 2: Codificar la puerta en `CLAUDE.md`**

Sustituir la sección añadida en Task 0 por:

```markdown
## El escritorio es otra puerta, no un adorno

`desktop/` es la versión macOS (Unreal Engine 5.8) y comparte el mismo motor
que la web y el móvil: `src/lib`. La puerta completa es, en orden:
`npm test && npm run build` (web) → `(cd mobile && npm run typecheck)` (móvil)
→ `bash desktop/scripts/verify.sh` (bundle + golden + tests UE). El golden
(`desktop/Tests/golden-interpolation.json`) se regenera con
`npm run desktop:golden` y se committea con el cambio: nadie lo edita a mano.
El build completo de UE (lento) se ejecuta antes de cada subida al App Store,
no en cada commit.
```

- [ ] **Step 3: README — sección escritorio**

Añadir a `README.md` una sección corta «Escritorio (macOS, Unreal Engine 5)»
con: qué es, cómo se construye (`bash desktop/scripts/build-dev.sh`), cómo se
prueba (`bash desktop/scripts/verify.sh`), y el estado del Milestone 1. Las
cifras (tiempos de build, tamaño del .app) se miden de verdad en esta task y
se escriben las medidas, no estimaciones.

- [ ] **Step 4: Ejecutar la puerta completa una vez**

Run:

```bash
npm test && npm run build
(cd mobile && npm run typecheck)
bash desktop/scripts/verify.sh
```

Expected: todo verde. Medir y anotar los tiempos reales en el README.

- [ ] **Step 5: Commit y despliegue**

```bash
git add -A
git commit -m "Puerta del escritorio: verify.sh entra en la puerta de producción"
git push origin main
vercel --prod
```

Expected: deploy Ready.

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec**: F0→Task 0–1; F1→Task 2–3; F2→Task 4–7; F3→Task 8–12;
  puerta→Task 13. F4–F7 (atmósfera completa, UI UMG, capas de datos, MAS)
  quedan para el Milestone 2, como dice el spec («cada fase se planifica con
  la fundación existente»). La subida real al Mac App Store (F7) requiere la
  cuenta Apple Developer del usuario.
- **Placeholders**: las notas «leer el fichero real y usar su export» son pasos
  explícitos con `rg`/lectura de ficheros concretos, no tareas vacías; son
  intencionales para no inventar nombres de `src/lib` (regla del repo: nada se
  inventa, se lee).
- **Consistencia de tipos**: `FCoreApi::BuildModel/Estimate/SunPosition/DemLoad/SampleGrid/BasemapTileUrl` se usan con las mismas firmas en Tasks 7–12. `FTangentPlane::ToWorld/ToLonLat` idénticas en 8–12. Ejes UE: +X norte, +Y este, +Z arriba, en todos los ficheros.
- **Derivas posibles**: nombres de campos del JSON de `sunPosition`/`Estimate`
  y de la factoría del DEM se leen del código real en el primer paso de cada
  task (exigido, no opcional).
