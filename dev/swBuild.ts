/**
 * Compila el service worker y lo deja en `/sw.js`.
 *
 * POR QUÉ NO LO HACE VITE SOLO. Vite empaqueta la aplicación y le pone a cada
 * fichero el hash de su contenido en el nombre, que es justo lo que un service
 * worker no puede tener: su URL es su identidad —el navegador la vuelve a pedir
 * y compara byte a byte para saber si hay versión nueva— y tiene que estar en
 * la raíz para gobernar todo el sitio. Así que se compila aparte, con esbuild,
 * que ya está aquí para otras cosas.
 *
 * POR QUÉ NO `vite-plugin-pwa`. Porque hace esto mismo y trae Workbox detrás:
 * 
 * el proyecto entero tiene tres dependencias de ejecución, y lo que hay que
 * guardar y lo que no aquí no es una configuración genérica sino una decisión
 * por ruta que está escrita y probada en `src/sw/policy.ts`.
 *
 * LA LISTA DE PRECARGA SALE DEL PROPIO EMPAQUETADO, no de un patrón escrito a
 * mano: los nombres llevan hash y cambian en cada compilación, así que una
 * lista escrita a mano estaría mal desde el primer despliegue.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { build } from 'esbuild'
import type { Plugin } from 'vite'
import { BRANDING } from '../src/sw/policy'

export function serviceWorker(): Plugin {
  // La raíz la dice Vite y no `import.meta.dirname`: al cargar la
  // configuración, Vite la empaqueta en un fichero temporal, y una ruta
  // relativa al fichero fuente puede acabar apuntando a otro sitio.
  let root = process.cwd()

  return {
    name: 'tiempo-palmero:sw',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    async generateBundle(_options, bundle) {
      const app = Object.keys(bundle)
        .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
        .map((file) => `/${file}`)
        .sort()

      // `/` y no `/index.html`: es la URL con la que se abre la aplicación y con
      // la que la buscará el respaldo sin red.
      const precache = ['/', ...app, ...BRANDING]

      // El sello sale de la propia lista, que ya lleva los hashes del contenido:
      // dos compilaciones iguales dan el mismo `sw.js` —y el navegador no
      // reinstala nada— y una compilación con un byte distinto lo cambia.
      const stamp = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)

      const out = await build({
        entryPoints: [join(root, 'src/sw/sw.ts')],
        bundle: true,
        format: 'iife',
        target: 'es2022',
        minify: true,
        write: false,
        define: {
          __BUILD__: JSON.stringify(stamp),
          __PRECACHE__: JSON.stringify(precache),
        },
      })

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: out.outputFiles[0].text })
    },
  }
}
