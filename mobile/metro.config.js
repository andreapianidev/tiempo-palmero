/**
 * Metro con el núcleo de la web dentro.
 *
 * La app móvil NO tiene copia del motor: `@core/...` apunta a `../src`, el
 * mismo directorio que compila Vite para tiempo-palmero.es. Interpolación,
 * calidad de la red, paletas, textos y el DEM son literalmente los mismos
 * ficheros, y un arreglo en el modelo llega a las tres plataformas a la vez.
 *
 * Dos ajustes lo sostienen:
 *
 * - `watchFolders` incluye `../src`, o Metro no vería sus cambios en caliente.
 * - `resolveRequest` fija React al del móvil. La raíz del repositorio tiene su
 *   propio `node_modules` con React 18 para la web, y un fichero de `../src`
 *   que pida `react` lo encontraría ahí antes que aquí: el bundle acabaría con
 *   dos Reacts, que es un fallo silencioso y carísimo de encontrar. Se hace con
 *   una lista corta en vez de apagar la búsqueda jerárquica entera, porque
 *   varias dependencias de Expo viven anidadas dentro de otros paquetes y sin
 *   jerarquía dejan de resolverse.
 */

const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')
const coreRoot = path.join(repoRoot, 'src')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [coreRoot]

config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')]
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@core': coreRoot,
}

/** Lo único que el núcleo compartido importa y también existe en la web. */
const PINNED = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'])
const anchor = path.join(projectRoot, 'index.ts')

const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest
  if (PINNED.has(moduleName)) {
    return resolve({ ...context, originModulePath: anchor }, moduleName, platform)
  }
  return resolve(context, moduleName, platform)
}

module.exports = config
