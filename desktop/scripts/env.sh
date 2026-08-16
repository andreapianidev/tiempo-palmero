#!/usr/bin/env bash
# Rutas del entorno UE. Task 1 las verifica contra el disco.
UE="${UE:-/Users/Shared/Epic Games/UE_5.8}"
RUNUAT="$UE/Engine/Build/BatchFiles/RunUAT.sh"
UECMD="$UE/Engine/Binaries/Mac/UnrealEditor-Cmd"
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/desktop/TiempoPalmero.uproject"
BUNDLE_ID="com.andreapiani.tiempopalmero"
export UE RUNUAT UECMD PROJECT BUNDLE_ID
